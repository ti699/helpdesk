-- Configurable department email recipients and outbound email audit logs.

CREATE TABLE IF NOT EXISTS public.ticket_department_email_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type TEXT NOT NULL CHECK (ticket_type IN ('TI', 'Manutenção predial')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticket_type, email)
);

CREATE TABLE IF NOT EXISTS public.ticket_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_ticket_department_email_recipients_updated_at
  ON public.ticket_department_email_recipients;

CREATE TRIGGER update_ticket_department_email_recipients_updated_at
  BEFORE UPDATE ON public.ticket_department_email_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ticket_department_email_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage ticket department email recipients"
  ON public.ticket_department_email_recipients;

CREATE POLICY "Admins can manage ticket department email recipients"
  ON public.ticket_department_email_recipients
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view ticket email logs"
  ON public.ticket_email_logs;

CREATE POLICY "Admins can view ticket email logs"
  ON public.ticket_email_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "System can insert ticket email logs"
  ON public.ticket_email_logs;

CREATE POLICY "System can insert ticket email logs"
  ON public.ticket_email_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

INSERT INTO public.ticket_department_email_recipients (ticket_type, name, email, active)
VALUES
  ('TI', 'Equipe TI', 'ti@astroturviagens.com', TRUE),
  ('Manutenção predial', 'Equipe Manutenção', 'elton@astroturviagens.com', TRUE)
ON CONFLICT (ticket_type, email)
DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now();
