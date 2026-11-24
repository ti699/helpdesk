CREATE OR REPLACE FUNCTION public.record_ticket_other_department_feedback(
  _ticket_id UUID,
  _requester_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ticket_row public.tickets%ROWTYPE;
BEGIN
  SELECT *
  INTO ticket_row
  FROM public.tickets
  WHERE id = _ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket não encontrado';
  END IF;

  IF ticket_row.solicitante_id <> _requester_id THEN
    RAISE EXCEPTION 'Somente o solicitante pode avaliar este ticket';
  END IF;

  IF ticket_row.status NOT IN ('resolvido', 'fechado') THEN
    RAISE EXCEPTION 'A avaliação só pode ser registrada para tickets resolvidos ou fechados';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.feedbacks
    WHERE ticket_id = _ticket_id
  ) THEN
    RAISE EXCEPTION 'Este atendimento já foi avaliado';
  END IF;

  IF ticket_row.status = 'resolvido' THEN
    UPDATE public.tickets
    SET
      status = 'fechado',
      closed_at = NOW(),
      resolved_at = COALESCE(resolved_at, NOW())
    WHERE id = _ticket_id;
  END IF;

  INSERT INTO public.feedbacks (
    ticket_id,
    avaliador_id,
    nota_satisfacao,
    eficacia_solucao,
    comentarios
  )
  VALUES (
    _ticket_id,
    _requester_id,
    NULL,
    FALSE,
    'Não, é de outro setor'
  );

  INSERT INTO public.interactions (
    ticket_id,
    autor_id,
    mensagem,
    tipo
  )
  VALUES (
    _ticket_id,
    _requester_id,
    'Solicitante informou que a solicitação pertence a outro setor. Chamado mantido fechado.',
    'mudanca_status'
  );

  RETURN ticket_row.status = 'resolvido';
END;
$$;

REVOKE ALL ON FUNCTION public.record_ticket_other_department_feedback(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ticket_other_department_feedback(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ticket_other_department_feedback(UUID, UUID) TO service_role;
