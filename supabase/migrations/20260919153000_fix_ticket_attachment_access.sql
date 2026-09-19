-- Authorize private ticket attachments through the ticket relationship instead
-- of relying only on the folder of the user who uploaded the file.
CREATE OR REPLACE FUNCTION public.can_view_ticket_attachment(
  _object_name TEXT,
  _user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    _user_id IS NOT NULL
    AND (
      split_part(_object_name, '/', 1) = _user_id::TEXT
      OR public.has_role(_user_id, 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.tickets AS ticket
        WHERE (
          COALESCE(ticket.anexos -> 'imagens', '[]'::JSONB) ? _object_name
          OR COALESCE(ticket.anexos -> 'arquivos', '[]'::JSONB) ? _object_name
          OR ticket.anexos ->> 'audio' = _object_name
        )
        AND (
          ticket.solicitante_id = _user_id
          OR (
            ticket.tipo = 'TI'
            AND public.has_role(_user_id, 'agente_ti'::public.app_role)
          )
          OR (
            ticket.tipo = 'Manutenção predial'
            AND public.has_role(_user_id, 'agente_manutencao'::public.app_role)
          )
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_ticket_attachment(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_ticket_attachment(TEXT, UUID) TO authenticated;

DROP POLICY IF EXISTS "Users can view attachments for their tickets" ON storage.objects;

CREATE POLICY "Users can view attachments for their tickets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'attachments'
  AND public.can_view_ticket_attachment(name, auth.uid())
);
