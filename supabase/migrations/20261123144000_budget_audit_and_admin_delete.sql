CREATE TABLE public.orcamentos_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL,
  orcamento_codigo TEXT NOT NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  acao TEXT NOT NULL CHECK (acao IN ('criado', 'editado', 'enviado', 'aprovado', 'reprovado', 'revisao', 'excluido')),
  usuario_id UUID,
  motivo TEXT,
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.orcamentos_historico.orcamento_id IS
  'Preserva o identificador do orçamento mesmo após sua exclusão.';
COMMENT ON COLUMN public.orcamentos_historico.usuario_id IS
  'Preserva o identificador do autor mesmo após a remoção de sua conta.';

CREATE INDEX orcamentos_historico_orcamento_idx
  ON public.orcamentos_historico (orcamento_id, created_at DESC);
CREATE INDEX orcamentos_historico_ticket_idx
  ON public.orcamentos_historico (ticket_id, created_at DESC)
  WHERE ticket_id IS NOT NULL;
CREATE INDEX orcamentos_historico_created_at_idx
  ON public.orcamentos_historico (created_at DESC);

ALTER TABLE public.orcamentos_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orcamentos_historico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.orcamentos_historico TO authenticated;

CREATE POLICY "Management users can read budget history"
  ON public.orcamentos_historico FOR SELECT
  TO authenticated
  USING (public.has_management_report_access(auth.uid()));

CREATE OR REPLACE FUNCTION public.audit_orcamento_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  budget_id UUID;
  budget_code TEXT;
  linked_ticket_id UUID;
  actor_id UUID;
  audit_action TEXT;
  audit_reason TEXT;
  audit_details JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    budget_id := NEW.id;
    budget_code := NEW.codigo;
    linked_ticket_id := NEW.ticket_id;
    actor_id := COALESCE(auth.uid(), NEW.criado_por);
    audit_action := CASE WHEN NEW.status = 'aguardando_aprovacao' THEN 'enviado' ELSE 'criado' END;
    audit_reason := NULLIF(btrim(NEW.motivo_decisao), '');
    audit_details := jsonb_build_object('antes', NULL, 'depois', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    budget_id := NEW.id;
    budget_code := NEW.codigo;
    linked_ticket_id := NEW.ticket_id;
    actor_id := COALESCE(auth.uid(), NEW.aprovado_por, NEW.criado_por);
    audit_action := CASE
      WHEN OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'aguardando_aprovacao' THEN 'enviado'
      WHEN OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'aprovado' THEN 'aprovado'
      WHEN OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'reprovado' THEN 'reprovado'
      WHEN OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'revisao' THEN 'revisao'
      ELSE 'editado'
    END;
    audit_reason := NULLIF(btrim(NEW.motivo_decisao), '');
    audit_details := jsonb_build_object('antes', to_jsonb(OLD), 'depois', to_jsonb(NEW));
  ELSE
    budget_id := OLD.id;
    budget_code := OLD.codigo;
    linked_ticket_id := OLD.ticket_id;
    actor_id := COALESCE(auth.uid(), OLD.aprovado_por, OLD.criado_por);
    audit_action := 'excluido';
    audit_reason := NULLIF(btrim(current_setting('app.orcamento_delete_reason', true)), '');
    IF audit_reason IS NULL THEN
      RAISE EXCEPTION 'A exclusão do orçamento exige um motivo.'
        USING ERRCODE = '22023';
    END IF;
    audit_details := jsonb_build_object('antes', to_jsonb(OLD), 'depois', NULL);
  END IF;

  INSERT INTO public.orcamentos_historico (
    orcamento_id,
    orcamento_codigo,
    ticket_id,
    acao,
    usuario_id,
    motivo,
    detalhes
  )
  VALUES (
    budget_id,
    budget_code,
    linked_ticket_id,
    audit_action,
    actor_id,
    audit_reason,
    audit_details
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_orcamento_changes() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_orcamento_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.orcamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_orcamento_changes();

CREATE OR REPLACE FUNCTION public.log_orcamento_deletion_to_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id UUID;
  delete_reason TEXT;
BEGIN
  IF OLD.ticket_id IS NULL THEN
    RETURN OLD;
  END IF;

  actor_id := COALESCE(auth.uid(), OLD.aprovado_por, OLD.criado_por);
  delete_reason := NULLIF(btrim(current_setting('app.orcamento_delete_reason', true)), '');

  INSERT INTO public.interactions (ticket_id, autor_id, mensagem, tipo)
  VALUES (
    OLD.ticket_id,
    actor_id,
    format('Orçamento %s excluído. Motivo: %s', OLD.codigo, delete_reason),
    'mudanca_status'
  );

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.log_orcamento_deletion_to_ticket() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER log_orcamento_deletion_to_ticket
  AFTER DELETE ON public.orcamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.log_orcamento_deletion_to_ticket();

GRANT DELETE ON TABLE public.orcamentos TO authenticated;

CREATE POLICY "Admins can delete budgets"
  ON public.orcamentos FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.delete_orcamento(_orcamento_id UUID, _motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem excluir orçamentos.'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'O motivo da exclusão é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.orcamento_delete_reason', btrim(_motivo), true);

  DELETE FROM public.orcamentos
  WHERE id = _orcamento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_orcamento(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_orcamento(UUID, TEXT) TO authenticated;
