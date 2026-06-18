DROP POLICY IF EXISTS "Solicitantes can create feedback for their tickets" ON public.feedbacks;

CREATE POLICY "Solicitantes can create feedback for their tickets"
  ON public.feedbacks FOR INSERT
  TO authenticated
  WITH CHECK (
    avaliador_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.tickets
      WHERE tickets.id = feedbacks.ticket_id
      AND tickets.solicitante_id = auth.uid()
      AND tickets.status IN ('resolvido', 'fechado')
    )
  );
