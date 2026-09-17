-- Controle patrimonial integrado ao Help Desk.
-- Mantem o dominio separado das tabelas do Patriguard e reutiliza auth.users/profiles.

CREATE TYPE public.asset_access_level AS ENUM ('consulta', 'operador', 'gestor');
CREATE TYPE public.asset_movement_type AS ENUM (
  'transferencia_responsavel',
  'transferencia_setor',
  'transferencia_local',
  'emprestimo',
  'devolucao',
  'envio_manutencao',
  'retorno_manutencao',
  'baixa',
  'descarte',
  'extravio'
);
CREATE TYPE public.asset_movement_status AS ENUM ('pendente', 'aprovada', 'concluida', 'cancelada');
CREATE TYPE public.asset_term_status AS ENUM ('pendente', 'aceito', 'cancelado');

CREATE TABLE public.asset_module_access (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_level public.asset_access_level NOT NULL DEFAULT 'consulta',
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE public.asset_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE UNIQUE INDEX asset_statuses_single_default_idx
  ON public.asset_statuses (is_default)
  WHERE is_default = true;

CREATE TABLE public.asset_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.asset_categories(id) ON DELETE SET NULL,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  invoice_number TEXT,
  purchase_date DATE,
  purchase_value NUMERIC(14,2) CHECK (purchase_value IS NULL OR purchase_value >= 0),
  warranty_until DATE,
  department TEXT,
  location_id UUID REFERENCES public.asset_locations(id) ON DELETE SET NULL,
  responsible_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  responsible_name TEXT,
  status_id UUID REFERENCES public.asset_statuses(id) ON DELETE RESTRICT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_code)
);

CREATE TABLE public.asset_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE RESTRICT,
  movement_type public.asset_movement_type NOT NULL,
  status public.asset_movement_status NOT NULL DEFAULT 'pendente',
  from_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  to_responsible_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_responsible_name TEXT,
  to_department TEXT,
  to_location_id UUID REFERENCES public.asset_locations(id) ON DELETE SET NULL,
  to_status_id UUID REFERENCES public.asset_statuses(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.asset_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processando' CHECK (status IN ('processando', 'concluido', 'falhou')),
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.asset_import_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES public.asset_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  message TEXT NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.asset_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE RESTRICT,
  movement_id UUID REFERENCES public.asset_movements(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'responsabilidade', 'transferencia', 'emprestimo', 'devolucao',
    'envio_manutencao', 'retorno_manutencao', 'baixa', 'descarte'
  )),
  document_snapshot JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  status public.asset_term_status NOT NULL DEFAULT 'pendente',
  responsible_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  responsible_name TEXT,
  issued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  acceptance_user_agent TEXT,
  cancelled_at TIMESTAMPTZ
);

CREATE TABLE public.asset_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  description TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tickets
  ADD COLUMN asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  ADD COLUMN asset_diagnosis TEXT,
  ADD COLUMN asset_estimated_cost NUMERIC(14,2) CHECK (asset_estimated_cost IS NULL OR asset_estimated_cost >= 0),
  ADD COLUMN asset_final_cost NUMERIC(14,2) CHECK (asset_final_cost IS NULL OR asset_final_cost >= 0),
  ADD COLUMN asset_returned_at TIMESTAMPTZ;

CREATE INDEX assets_status_idx ON public.assets(status_id) WHERE active = true;
CREATE INDEX assets_department_idx ON public.assets(department) WHERE active = true;
CREATE INDEX assets_responsible_idx ON public.assets(responsible_user_id) WHERE active = true;
CREATE INDEX assets_category_idx ON public.assets(category_id) WHERE active = true;
CREATE INDEX asset_movements_asset_idx ON public.asset_movements(asset_id, created_at DESC);
CREATE INDEX asset_audit_entity_idx ON public.asset_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX asset_terms_asset_idx ON public.asset_terms(asset_id, issued_at DESC);
CREATE INDEX tickets_asset_idx ON public.tickets(asset_id) WHERE asset_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_asset_access_level(_user_id UUID)
RETURNS public.asset_access_level
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(_user_id, 'admin') THEN
    RETURN 'gestor';
  END IF;

  RETURN (
    SELECT access_level
    FROM public.asset_module_access
    WHERE user_id = _user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_asset_module_access(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR EXISTS (
    SELECT 1 FROM public.asset_module_access WHERE user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_operate_assets(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR EXISTS (
    SELECT 1 FROM public.asset_module_access
    WHERE user_id = _user_id AND access_level IN ('operador', 'gestor')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_assets(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR EXISTS (
    SELECT 1 FROM public.asset_module_access
    WHERE user_id = _user_id AND access_level = 'gestor'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_asset(_asset public.assets, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_asset_module_access(_user_id)
    OR _asset.responsible_user_id = _user_id
    OR (
      _asset.department IS NOT NULL
      AND _asset.department = (SELECT setor FROM public.profiles WHERE id = _user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.log_asset_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.asset_audit_logs (
    user_id, action, entity_type, entity_id, description, before_data, after_data
  ) VALUES (
    COALESCE(auth.uid(), NEW.updated_by, NEW.created_by),
    lower(TG_OP),
    'asset',
    COALESCE(NEW.id, OLD.id),
    CASE TG_OP
      WHEN 'INSERT' THEN 'Patrimonio cadastrado'
      WHEN 'UPDATE' THEN 'Patrimonio atualizado'
      ELSE 'Patrimonio alterado'
    END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_assets_changes
AFTER INSERT OR UPDATE ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.log_asset_change();

CREATE TRIGGER update_asset_access_updated_at
BEFORE UPDATE ON public.asset_module_access
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_asset_categories_updated_at
BEFORE UPDATE ON public.asset_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_asset_statuses_updated_at
BEFORE UPDATE ON public.asset_statuses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_asset_locations_updated_at
BEFORE UPDATE ON public.asset_locations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assets_updated_at
BEFORE UPDATE ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_asset_movements_updated_at
BEFORE UPDATE ON public.asset_movements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.approve_asset_movement(_movement_id UUID)
RETURNS public.asset_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  movement public.asset_movements;
  target_status_id UUID;
BEGIN
  IF NOT public.can_manage_assets(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissao para aprovar movimentacoes';
  END IF;

  SELECT * INTO movement
  FROM public.asset_movements
  WHERE id = _movement_id
  FOR UPDATE;

  IF movement.id IS NULL THEN
    RAISE EXCEPTION 'Movimentacao nao encontrada';
  END IF;

  IF movement.status <> 'pendente' THEN
    RAISE EXCEPTION 'A movimentacao nao esta pendente';
  END IF;

  IF movement.requested_by = auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'O solicitante nao pode aprovar a propria movimentacao';
  END IF;

  target_status_id := movement.to_status_id;
  IF target_status_id IS NULL AND movement.movement_type = 'envio_manutencao' THEN
    SELECT id INTO target_status_id FROM public.asset_statuses WHERE name = 'Em manutencao' LIMIT 1;
  ELSIF target_status_id IS NULL AND movement.movement_type = 'retorno_manutencao' THEN
    SELECT id INTO target_status_id FROM public.asset_statuses WHERE name IN ('Em uso', 'Disponivel') ORDER BY sort_order LIMIT 1;
  END IF;

  UPDATE public.assets
  SET
    responsible_user_id = COALESCE(movement.to_responsible_user_id, responsible_user_id),
    responsible_name = COALESCE(movement.to_responsible_name, responsible_name),
    department = COALESCE(movement.to_department, department),
    location_id = COALESCE(movement.to_location_id, location_id),
    status_id = COALESCE(target_status_id, status_id),
    updated_by = auth.uid()
  WHERE id = movement.asset_id;

  UPDATE public.asset_movements
  SET status = 'concluida', approved_by = auth.uid(), approved_at = now(), completed_at = now()
  WHERE id = _movement_id
  RETURNING * INTO movement;

  INSERT INTO public.asset_audit_logs (
    user_id, action, entity_type, entity_id, description, before_data, after_data
  ) VALUES (
    auth.uid(), 'movement_approved', 'asset_movement', movement.id,
    'Movimentacao aprovada e aplicada ao patrimonio', movement.from_snapshot, to_jsonb(movement)
  );

  RETURN movement;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_asset_term(_term_id UUID, _user_agent TEXT DEFAULT NULL)
RETURNS public.asset_terms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  term public.asset_terms;
BEGIN
  SELECT * INTO term FROM public.asset_terms WHERE id = _term_id FOR UPDATE;
  IF term.id IS NULL THEN RAISE EXCEPTION 'Termo nao encontrado'; END IF;
  IF term.status <> 'pendente' THEN RAISE EXCEPTION 'Termo nao esta pendente'; END IF;
  IF term.responsible_user_id IS DISTINCT FROM auth.uid() AND NOT public.can_manage_assets(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissao para aceitar este termo';
  END IF;

  UPDATE public.asset_terms
  SET status = 'aceito', accepted_by = auth.uid(), accepted_at = now(), acceptance_user_agent = left(_user_agent, 500)
  WHERE id = _term_id
  RETURNING * INTO term;
  RETURN term;
END;
$$;

ALTER TABLE public.asset_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_access_admin_manage" ON public.asset_module_access
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "asset_access_self_read" ON public.asset_module_access
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "asset_categories_read" ON public.asset_categories
FOR SELECT TO authenticated USING (public.has_asset_module_access(auth.uid()));
CREATE POLICY "asset_categories_manage" ON public.asset_categories
FOR ALL TO authenticated
USING (public.can_manage_assets(auth.uid())) WITH CHECK (public.can_manage_assets(auth.uid()));

CREATE POLICY "asset_statuses_read" ON public.asset_statuses
FOR SELECT TO authenticated USING (public.has_asset_module_access(auth.uid()));
CREATE POLICY "asset_statuses_manage" ON public.asset_statuses
FOR ALL TO authenticated
USING (public.can_manage_assets(auth.uid())) WITH CHECK (public.can_manage_assets(auth.uid()));

CREATE POLICY "asset_locations_read" ON public.asset_locations
FOR SELECT TO authenticated USING (public.has_asset_module_access(auth.uid()));
CREATE POLICY "asset_locations_manage" ON public.asset_locations
FOR ALL TO authenticated
USING (public.can_manage_assets(auth.uid())) WITH CHECK (public.can_manage_assets(auth.uid()));

CREATE POLICY "assets_authorized_read" ON public.assets
FOR SELECT TO authenticated USING (public.can_view_asset(assets, auth.uid()));
CREATE POLICY "assets_operator_insert" ON public.assets
FOR INSERT TO authenticated WITH CHECK (public.can_operate_assets(auth.uid()));
CREATE POLICY "assets_operator_update" ON public.assets
FOR UPDATE TO authenticated
USING (public.can_operate_assets(auth.uid())) WITH CHECK (public.can_operate_assets(auth.uid()));

CREATE POLICY "asset_movements_read" ON public.asset_movements
FOR SELECT TO authenticated
USING (
  public.has_asset_module_access(auth.uid())
  OR requested_by = auth.uid()
  OR to_responsible_user_id = auth.uid()
);
CREATE POLICY "asset_movements_operator_insert" ON public.asset_movements
FOR INSERT TO authenticated
WITH CHECK (public.can_operate_assets(auth.uid()) AND requested_by = auth.uid());
CREATE POLICY "asset_movements_manager_update" ON public.asset_movements
FOR UPDATE TO authenticated
USING (public.can_manage_assets(auth.uid())) WITH CHECK (public.can_manage_assets(auth.uid()));

CREATE POLICY "asset_import_jobs_manager" ON public.asset_import_jobs
FOR ALL TO authenticated
USING (public.can_manage_assets(auth.uid())) WITH CHECK (public.can_manage_assets(auth.uid()));
CREATE POLICY "asset_import_errors_manager" ON public.asset_import_errors
FOR ALL TO authenticated
USING (public.can_manage_assets(auth.uid())) WITH CHECK (public.can_manage_assets(auth.uid()));

CREATE POLICY "asset_terms_authorized_read" ON public.asset_terms
FOR SELECT TO authenticated
USING (
  public.has_asset_module_access(auth.uid())
  OR responsible_user_id = auth.uid()
  OR issued_by = auth.uid()
);
CREATE POLICY "asset_terms_operator_insert" ON public.asset_terms
FOR INSERT TO authenticated WITH CHECK (public.can_operate_assets(auth.uid()));
CREATE POLICY "asset_terms_manager_update" ON public.asset_terms
FOR UPDATE TO authenticated
USING (public.can_manage_assets(auth.uid()) OR responsible_user_id = auth.uid())
WITH CHECK (public.can_manage_assets(auth.uid()) OR responsible_user_id = auth.uid());

CREATE POLICY "asset_audit_authorized_read" ON public.asset_audit_logs
FOR SELECT TO authenticated USING (public.has_asset_module_access(auth.uid()));
CREATE POLICY "asset_audit_system_insert" ON public.asset_audit_logs
FOR INSERT TO authenticated WITH CHECK (public.can_operate_assets(auth.uid()));

CREATE POLICY "tickets_asset_module_read" ON public.tickets
FOR SELECT TO authenticated
USING (asset_id IS NOT NULL AND public.has_asset_module_access(auth.uid()));

INSERT INTO public.asset_categories (name, sort_order) VALUES
  ('TI', 10), ('Mobiliario', 20), ('Equipamentos eletronicos', 30), ('Ferramentas', 40), ('Outro', 50);

INSERT INTO public.asset_statuses (name, color, is_default, is_terminal, sort_order) VALUES
  ('Disponivel', '#16a34a', true, false, 10),
  ('Em uso', '#2563eb', false, false, 20),
  ('Emprestado', '#7c3aed', false, false, 30),
  ('Em manutencao', '#ea580c', false, false, 40),
  ('Extraviado', '#dc2626', false, false, 50),
  ('Baixado', '#64748b', false, true, 60),
  ('Descartado', '#475569', false, true, 70);

INSERT INTO public.asset_locations (name, description) VALUES
  ('Almoxarifado', 'Estoque e guarda de bens'),
  ('Matriz', 'Sede principal do Grupo Astrotur');

GRANT EXECUTE ON FUNCTION public.get_asset_access_level(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_asset_module_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_operate_assets(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_assets(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_asset_movement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_asset_term(UUID, TEXT) TO authenticated;
