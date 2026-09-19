-- Importacao patrimonial assistida e diagnostico interno sanitizado.

ALTER TABLE public.asset_import_jobs
  ADD COLUMN IF NOT EXISTS source_sheet TEXT,
  ADD COLUMN IF NOT EXISTS column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours');

ALTER TABLE public.asset_import_jobs DROP CONSTRAINT IF EXISTS asset_import_jobs_status_check;
ALTER TABLE public.asset_import_jobs ADD CONSTRAINT asset_import_jobs_status_check
  CHECK (status IN ('validando', 'validado', 'processando', 'concluido', 'falhou', 'expirado'));

CREATE TABLE IF NOT EXISTS public.asset_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES public.asset_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors TEXT[] NOT NULL DEFAULT '{}',
  warnings TEXT[] NOT NULL DEFAULT '{}',
  row_status TEXT NOT NULL DEFAULT 'valid' CHECK (row_status IN ('valid', 'warning', 'error', 'imported')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (import_job_id, row_number)
);

CREATE INDEX IF NOT EXISTS asset_import_rows_job_idx
  ON public.asset_import_rows(import_job_id, row_number);

ALTER TABLE public.asset_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asset_import_rows_manager" ON public.asset_import_rows
FOR ALL TO authenticated
USING (public.can_manage_assets(auth.uid())) WITH CHECK (public.can_manage_assets(auth.uid()));

CREATE TABLE IF NOT EXISTS public.application_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL,
  message TEXT NOT NULL,
  route TEXT,
  app_version TEXT,
  browser TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS application_error_logs_open_fingerprint_idx
  ON public.application_error_logs(fingerprint)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS application_error_logs_last_seen_idx
  ON public.application_error_logs(last_seen_at DESC);

ALTER TABLE public.application_error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "application_errors_admin_read" ON public.application_error_logs
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "application_errors_admin_update" ON public.application_error_logs
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.commit_asset_import(
  _job_id UUID,
  _resolutions JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.asset_import_jobs%ROWTYPE;
  staged public.asset_import_rows%ROWTYPE;
  data JSONB;
  category_id UUID;
  status_id UUID;
  location_id UUID;
  responsible_id UUID;
  default_status_id UUID;
  imported_count INTEGER := 0;
  resolution JSONB;
BEGIN
  IF NOT public.can_manage_assets(auth.uid()) THEN
    RAISE EXCEPTION 'Permissao de gestor necessaria';
  END IF;

  SELECT * INTO job FROM public.asset_import_jobs
  WHERE id = _job_id AND imported_by = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Importacao nao encontrada'; END IF;
  IF job.status <> 'validado' THEN RAISE EXCEPTION 'Importacao nao esta pronta para confirmacao'; END IF;
  IF job.expires_at < now() THEN
    UPDATE public.asset_import_jobs SET status = 'expirado', completed_at = now() WHERE id = _job_id;
    RAISE EXCEPTION 'A validacao expirou; envie o arquivo novamente';
  END IF;
  IF EXISTS (SELECT 1 FROM public.asset_import_rows WHERE import_job_id = _job_id AND row_status = 'error') THEN
    RAISE EXCEPTION 'Corrija as linhas invalidas antes de confirmar';
  END IF;

  UPDATE public.asset_import_jobs SET status = 'processando' WHERE id = _job_id;
  SELECT id INTO default_status_id FROM public.asset_statuses WHERE is_default = true LIMIT 1;

  FOR staged IN SELECT * FROM public.asset_import_rows WHERE import_job_id = _job_id ORDER BY row_number LOOP
    data := staged.normalized_data;

    IF EXISTS (SELECT 1 FROM public.assets WHERE lower(asset_code) = lower(data->>'asset_code')) THEN
      RAISE EXCEPTION 'Codigo duplicado detectado na confirmacao: %', data->>'asset_code';
    END IF;

    category_id := NULLIF(data->>'category_id', '')::uuid;
    IF category_id IS NULL AND COALESCE(data->>'category_key', '') <> '' THEN
      resolution := _resolutions->'categories'->(data->>'category_key');
      IF resolution->>'mode' = 'existing' THEN
        category_id := NULLIF(resolution->>'id', '')::uuid;
      ELSIF resolution->>'mode' = 'create' THEN
        INSERT INTO public.asset_categories(name, sort_order)
        VALUES (left(COALESCE(resolution->>'name', data->>'category'), 120), 999)
        ON CONFLICT (name) DO UPDATE SET active = true
        RETURNING id INTO category_id;
      ELSE
        RAISE EXCEPTION 'Categoria sem resolucao: %', data->>'category';
      END IF;
    END IF;

    location_id := NULLIF(data->>'location_id', '')::uuid;
    IF location_id IS NULL AND COALESCE(data->>'location_key', '') <> '' THEN
      resolution := _resolutions->'locations'->(data->>'location_key');
      IF resolution->>'mode' = 'existing' THEN
        location_id := NULLIF(resolution->>'id', '')::uuid;
      ELSIF resolution->>'mode' = 'create' THEN
        INSERT INTO public.asset_locations(name)
        VALUES (left(COALESCE(resolution->>'name', data->>'location'), 120))
        ON CONFLICT (name) DO UPDATE SET active = true
        RETURNING id INTO location_id;
      ELSE
        RAISE EXCEPTION 'Localizacao sem resolucao: %', data->>'location';
      END IF;
    END IF;

    status_id := NULLIF(data->>'status_id', '')::uuid;
    IF status_id IS NULL AND COALESCE(data->>'status_key', '') <> '' THEN
      resolution := _resolutions->'statuses'->(data->>'status_key');
      IF resolution->>'mode' = 'existing' THEN
        status_id := NULLIF(resolution->>'id', '')::uuid;
      ELSIF resolution->>'mode' = 'create' THEN
        INSERT INTO public.asset_statuses(name, color, is_terminal, sort_order)
        VALUES (
          left(COALESCE(resolution->>'name', data->>'status'), 120),
          CASE WHEN COALESCE(resolution->>'color', '') ~ '^#[0-9a-fA-F]{6}$' THEN resolution->>'color' ELSE '#64748b' END,
          COALESCE((resolution->>'is_terminal')::boolean, false),
          999
        )
        ON CONFLICT (name) DO UPDATE SET active = true
        RETURNING id INTO status_id;
      ELSE
        RAISE EXCEPTION 'Status sem resolucao: %', data->>'status';
      END IF;
    END IF;
    status_id := COALESCE(status_id, default_status_id);

    responsible_id := NULL;
    IF COALESCE(data->>'responsible_email', '') <> '' THEN
      SELECT id INTO responsible_id FROM public.profiles
      WHERE lower(email) = lower(data->>'responsible_email') AND active = true
      LIMIT 1;
    END IF;

    INSERT INTO public.assets (
      asset_code, name, description, category_id, brand, model, serial_number,
      invoice_number, purchase_date, purchase_value, warranty_until, department,
      location_id, responsible_user_id, responsible_name, status_id, notes,
      created_by, updated_by
    ) VALUES (
      data->>'asset_code', data->>'name', NULLIF(data->>'description', ''), category_id,
      NULLIF(data->>'brand', ''), NULLIF(data->>'model', ''), NULLIF(data->>'serial_number', ''),
      NULLIF(data->>'invoice_number', ''), NULLIF(data->>'purchase_date', '')::date,
      NULLIF(data->>'purchase_value', '')::numeric, NULLIF(data->>'warranty_until', '')::date,
      NULLIF(data->>'department', ''), location_id, responsible_id,
      NULLIF(data->>'responsible_name', ''), status_id, NULLIF(data->>'notes', ''),
      auth.uid(), auth.uid()
    );

    UPDATE public.asset_import_rows SET row_status = 'imported' WHERE id = staged.id;
    imported_count := imported_count + 1;
  END LOOP;

  UPDATE public.asset_import_jobs
  SET status = 'concluido', imported_rows = imported_count, completed_at = now()
  WHERE id = _job_id;

  INSERT INTO public.asset_audit_logs(user_id, action, entity_type, entity_id, description, after_data)
  VALUES (auth.uid(), 'import', 'asset_import_job', _job_id, 'Importacao patrimonial confirmada', jsonb_build_object('imported_rows', imported_count));

  RETURN jsonb_build_object('jobId', _job_id, 'imported', imported_count, 'total', job.total_rows);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.asset_import_jobs SET status = 'falhou', completed_at = now() WHERE id = _job_id;
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_asset_import(UUID, JSONB) TO authenticated;
