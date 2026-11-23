CREATE SEQUENCE public.orcamentos_codigo_seq START WITH 1;

CREATE FUNCTION public.next_orcamento_codigo()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_value BIGINT;
BEGIN
  next_value := nextval('public.orcamentos_codigo_seq');
  RETURN 'ORC-' || lpad(next_value::text, greatest(4, length(next_value::text)), '0');
END;
$$;

REVOKE ALL ON SEQUENCE public.orcamentos_codigo_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_orcamento_codigo() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('interno', 'externo')),
  setor TEXT NOT NULL,
  fornecedor TEXT,
  descricao TEXT NOT NULL,
  itens JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(itens) = 'array'),
  valor_total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
  anexo_url TEXT,
  anexo_nome TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'aguardando_aprovacao', 'aprovado', 'reprovado', 'revisao')),
  criado_por UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  aprovado_por UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  aprovado_em TIMESTAMPTZ,
  motivo_decisao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orcamentos_decision_fields_check CHECK (
    (status = 'aprovado' AND aprovado_por IS NOT NULL AND aprovado_em IS NOT NULL)
    OR (status <> 'aprovado' AND aprovado_por IS NULL AND aprovado_em IS NULL)
  ),
  CONSTRAINT orcamentos_decision_reason_check CHECK (
    status NOT IN ('reprovado', 'revisao')
    OR (motivo_decisao IS NOT NULL AND btrim(motivo_decisao) <> '')
  ),
  CONSTRAINT orcamentos_submitted_items_check CHECK (
    status = 'rascunho' OR jsonb_array_length(itens) > 0
  )
);

COMMENT ON COLUMN public.orcamentos.anexo_url IS 'Caminho privado do objeto no bucket orcamentos-anexos.';

CREATE INDEX orcamentos_criado_por_created_at_idx
  ON public.orcamentos (criado_por, created_at DESC);
CREATE INDEX orcamentos_status_created_at_idx
  ON public.orcamentos (status, created_at DESC);
CREATE INDEX orcamentos_ticket_id_idx
  ON public.orcamentos (ticket_id)
  WHERE ticket_id IS NOT NULL;

CREATE TRIGGER update_orcamentos_updated_at
  BEFORE UPDATE ON public.orcamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.assign_orcamento_codigo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.codigo := public.next_orcamento_codigo();
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_orcamento_codigo
  BEFORE INSERT ON public.orcamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_orcamento_codigo();

CREATE FUNCTION public.set_orcamento_decision_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'aprovado' THEN
    NEW.aprovado_por := auth.uid();
    NEW.aprovado_em := now();
  ELSE
    NEW.aprovado_por := NULL;
    NEW.aprovado_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_orcamento_decision_metadata
  BEFORE UPDATE ON public.orcamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_orcamento_decision_metadata();

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.orcamentos TO authenticated;

CREATE POLICY "Agents can view their own budgets and admins can view all"
  ON public.orcamentos FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      criado_por = auth.uid()
      AND (
        public.has_role(auth.uid(), 'agente_ti'::app_role)
        OR public.has_role(auth.uid(), 'agente_manutencao'::app_role)
      )
    )
  );

CREATE POLICY "Agents can create their own budgets"
  ON public.orcamentos FOR INSERT
  TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (
      public.has_role(auth.uid(), 'agente_ti'::app_role)
      OR public.has_role(auth.uid(), 'agente_manutencao'::app_role)
    )
    AND status IN ('rascunho', 'aguardando_aprovacao')
    AND aprovado_por IS NULL
    AND aprovado_em IS NULL
    AND motivo_decisao IS NULL
  );

CREATE POLICY "Agents can update their own drafts"
  ON public.orcamentos FOR UPDATE
  TO authenticated
  USING (
    criado_por = auth.uid()
    AND status = 'rascunho'
    AND (
      public.has_role(auth.uid(), 'agente_ti'::app_role)
      OR public.has_role(auth.uid(), 'agente_manutencao'::app_role)
    )
  )
  WITH CHECK (
    criado_por = auth.uid()
    AND status IN ('rascunho', 'aguardando_aprovacao')
    AND aprovado_por IS NULL
    AND aprovado_em IS NULL
    AND motivo_decisao IS NULL
    AND (
      public.has_role(auth.uid(), 'agente_ti'::app_role)
      OR public.has_role(auth.uid(), 'agente_manutencao'::app_role)
    )
  );

CREATE POLICY "Agents can update their own revision requests"
  ON public.orcamentos FOR UPDATE
  TO authenticated
  USING (
    criado_por = auth.uid()
    AND status = 'revisao'
    AND (
      public.has_role(auth.uid(), 'agente_ti'::app_role)
      OR public.has_role(auth.uid(), 'agente_manutencao'::app_role)
    )
  )
  WITH CHECK (
    criado_por = auth.uid()
    AND status IN ('revisao', 'aguardando_aprovacao')
    AND aprovado_por IS NULL
    AND aprovado_em IS NULL
    AND (
      status = 'aguardando_aprovacao'
      OR (motivo_decisao IS NOT NULL AND btrim(motivo_decisao) <> '')
    )
    AND (
      public.has_role(auth.uid(), 'agente_ti'::app_role)
      OR public.has_role(auth.uid(), 'agente_manutencao'::app_role)
    )
  );

CREATE POLICY "Admins can decide pending budgets"
  ON public.orcamentos FOR UPDATE
  TO authenticated
  USING (
    status = 'aguardando_aprovacao'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    status IN ('aprovado', 'reprovado', 'revisao')
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'orcamentos-anexos',
  'orcamentos-anexos',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Budget owners and admins can read budget attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'orcamentos-anexos'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        (storage.foldername(name))[1] = auth.uid()::text
        AND (
          public.has_role(auth.uid(), 'agente_ti'::app_role)
          OR public.has_role(auth.uid(), 'agente_manutencao'::app_role)
        )
      )
    )
  );

CREATE POLICY "Agents can upload their own budget attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'orcamentos-anexos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      public.has_role(auth.uid(), 'agente_ti'::app_role)
      OR public.has_role(auth.uid(), 'agente_manutencao'::app_role)
    )
  );

CREATE POLICY "Budget owners and admins can update budget attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'orcamentos-anexos'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        (storage.foldername(name))[1] = auth.uid()::text
        AND (
          public.has_role(auth.uid(), 'agente_ti'::app_role)
          OR public.has_role(auth.uid(), 'agente_manutencao'::app_role)
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'orcamentos-anexos'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        (storage.foldername(name))[1] = auth.uid()::text
        AND (
          public.has_role(auth.uid(), 'agente_ti'::app_role)
          OR public.has_role(auth.uid(), 'agente_manutencao'::app_role)
        )
      )
    )
  );

CREATE POLICY "Budget owners and admins can delete budget attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'orcamentos-anexos'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        (storage.foldername(name))[1] = auth.uid()::text
        AND (
          public.has_role(auth.uid(), 'agente_ti'::app_role)
          OR public.has_role(auth.uid(), 'agente_manutencao'::app_role)
        )
      )
    )
  );

CREATE FUNCTION public.log_orcamento_ticket_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id UUID;
  history_message TEXT;
BEGIN
  IF NEW.ticket_id IS NULL THEN
    RETURN NEW;
  END IF;

  actor_id := COALESCE(auth.uid(), NEW.aprovado_por, NEW.criado_por);

  IF TG_OP = 'INSERT' THEN
    history_message := 'Orçamento ' || NEW.codigo || CASE
      WHEN NEW.status = 'rascunho' THEN ' criado como rascunho.'
      ELSE ' enviado para aprovação.'
    END;
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    history_message := CASE NEW.status
      WHEN 'aguardando_aprovacao' THEN 'Orçamento ' || NEW.codigo || ' enviado para aprovação.'
      WHEN 'aprovado' THEN 'Orçamento ' || NEW.codigo || ' aprovado.'
      WHEN 'reprovado' THEN 'Orçamento ' || NEW.codigo || ' reprovado.'
      WHEN 'revisao' THEN 'Revisão solicitada para o orçamento ' || NEW.codigo || '.'
      ELSE 'Orçamento ' || NEW.codigo || ' atualizado.'
    END;

    IF nullif(btrim(NEW.motivo_decisao), '') IS NOT NULL THEN
      history_message := history_message || ' Motivo: ' || btrim(NEW.motivo_decisao);
    END IF;
  ELSIF OLD.ticket_id IS DISTINCT FROM NEW.ticket_id THEN
    history_message := 'Orçamento ' || NEW.codigo || ' vinculado a este chamado.';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.interactions (ticket_id, autor_id, mensagem, tipo)
  VALUES (NEW.ticket_id, actor_id, history_message, 'mudanca_status');

  RETURN NEW;
END;
$$;

CREATE TRIGGER log_orcamento_ticket_history
  AFTER INSERT OR UPDATE ON public.orcamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.log_orcamento_ticket_history();

ALTER PUBLICATION supabase_realtime ADD TABLE public.orcamentos;
