DROP FUNCTION IF EXISTS public.record_ticket_other_department_feedback(UUID, UUID);

CREATE OR REPLACE FUNCTION public.record_ticket_no_reopen_feedback(
  _ticket_id UUID,
  _requester_id UUID,
  _outcome TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ticket_row public.tickets%ROWTYPE;
  feedback_comment TEXT;
  history_message TEXT;
BEGIN
  IF _outcome NOT IN ('other_department', 'not_resolved_no_reopen') THEN
    RAISE EXCEPTION 'Motivo da avaliação inválido';
  END IF;

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

  IF _outcome = 'other_department' THEN
    feedback_comment := 'Não, é de outro setor';
    history_message := 'Solicitante informou que a solicitação pertence a outro setor. Chamado mantido fechado.';
  ELSE
    feedback_comment := 'Não foi resolvido, mas não quero reabrir';
    history_message := 'Solicitante informou que o chamado não foi resolvido, mas optou por não reabri-lo. Chamado mantido fechado.';
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
    feedback_comment
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
    history_message,
    'mudanca_status'
  );

  RETURN ticket_row.status = 'resolvido';
END;
$$;

REVOKE ALL ON FUNCTION public.record_ticket_no_reopen_feedback(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ticket_no_reopen_feedback(UUID, UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ticket_no_reopen_feedback(UUID, UUID, TEXT) TO service_role;
