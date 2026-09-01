ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS service_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS service_finished_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.service_executors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('TI', 'Manutenção predial')),
  phone TEXT,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_service_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  finished_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE TABLE IF NOT EXISTS public.ticket_service_session_executors (
  session_id UUID NOT NULL REFERENCES public.ticket_service_sessions(id) ON DELETE CASCADE,
  executor_id UUID NOT NULL REFERENCES public.service_executors(id) ON DELETE RESTRICT,
  PRIMARY KEY (session_id, executor_id)
);

DROP TRIGGER IF EXISTS update_service_executors_updated_at ON public.service_executors;
CREATE TRIGGER update_service_executors_updated_at
  BEFORE UPDATE ON public.service_executors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ticket_service_sessions_updated_at ON public.ticket_service_sessions;
CREATE TRIGGER update_ticket_service_sessions_updated_at
  BEFORE UPDATE ON public.ticket_service_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_tickets_service_started_at
ON public.tickets (service_started_at)
WHERE service_started_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_service_finished_at
ON public.tickets (service_finished_at)
WHERE service_finished_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_executors_area_active
ON public.service_executors (area, active);

CREATE INDEX IF NOT EXISTS idx_ticket_service_sessions_ticket_id
ON public.ticket_service_sessions (ticket_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_service_sessions_started_at
ON public.ticket_service_sessions (started_at);

CREATE INDEX IF NOT EXISTS idx_ticket_service_sessions_finished_at
ON public.ticket_service_sessions (finished_at)
WHERE finished_at IS NOT NULL;

ALTER TABLE public.service_executors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_service_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_service_session_executors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage service executors" ON public.service_executors;
CREATE POLICY "Admins can manage service executors"
ON public.service_executors
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Operational users can view service executors" ON public.service_executors;
CREATE POLICY "Operational users can view service executors"
ON public.service_executors
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_management_report_access(auth.uid())
  OR (public.has_role(auth.uid(), 'agente_ti'::app_role) AND area = 'TI')
  OR (public.has_role(auth.uid(), 'agente_manutencao'::app_role) AND area = 'Manutenção predial')
);

DROP POLICY IF EXISTS "Users can view service sessions for accessible tickets" ON public.ticket_service_sessions;
CREATE POLICY "Users can view service sessions for accessible tickets"
ON public.ticket_service_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tickets
    WHERE tickets.id = ticket_service_sessions.ticket_id
      AND (
        tickets.solicitante_id = auth.uid()
        OR public.has_management_report_access(auth.uid())
        OR (public.has_role(auth.uid(), 'agente_ti'::app_role) AND tickets.tipo = 'TI')
        OR (public.has_role(auth.uid(), 'agente_manutencao'::app_role) AND tickets.tipo = 'Manutenção predial')
      )
  )
);

DROP POLICY IF EXISTS "Agents and admins can manage service sessions" ON public.ticket_service_sessions;
CREATE POLICY "Agents and admins can manage service sessions"
ON public.ticket_service_sessions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tickets
    WHERE tickets.id = ticket_service_sessions.ticket_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'agente_ti'::app_role) AND tickets.tipo = 'TI')
        OR (public.has_role(auth.uid(), 'agente_manutencao'::app_role) AND tickets.tipo = 'Manutenção predial')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.tickets
    WHERE tickets.id = ticket_service_sessions.ticket_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'agente_ti'::app_role) AND tickets.tipo = 'TI')
        OR (public.has_role(auth.uid(), 'agente_manutencao'::app_role) AND tickets.tipo = 'Manutenção predial')
      )
  )
);

DROP POLICY IF EXISTS "Users can view service session executors" ON public.ticket_service_session_executors;
CREATE POLICY "Users can view service session executors"
ON public.ticket_service_session_executors
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ticket_service_sessions
    JOIN public.tickets ON tickets.id = ticket_service_sessions.ticket_id
    WHERE ticket_service_sessions.id = ticket_service_session_executors.session_id
      AND (
        tickets.solicitante_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_management_report_access(auth.uid())
        OR (public.has_role(auth.uid(), 'agente_ti'::app_role) AND tickets.tipo = 'TI')
        OR (public.has_role(auth.uid(), 'agente_manutencao'::app_role) AND tickets.tipo = 'Manutenção predial')
      )
  )
);

DROP POLICY IF EXISTS "Agents and admins can manage service session executors" ON public.ticket_service_session_executors;
CREATE POLICY "Agents and admins can manage service session executors"
ON public.ticket_service_session_executors
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ticket_service_sessions
    JOIN public.tickets ON tickets.id = ticket_service_sessions.ticket_id
    WHERE ticket_service_sessions.id = ticket_service_session_executors.session_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'agente_ti'::app_role) AND tickets.tipo = 'TI')
        OR (public.has_role(auth.uid(), 'agente_manutencao'::app_role) AND tickets.tipo = 'Manutenção predial')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.ticket_service_sessions
    JOIN public.tickets ON tickets.id = ticket_service_sessions.ticket_id
    WHERE ticket_service_sessions.id = ticket_service_session_executors.session_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (public.has_role(auth.uid(), 'agente_ti'::app_role) AND tickets.tipo = 'TI')
        OR (public.has_role(auth.uid(), 'agente_manutencao'::app_role) AND tickets.tipo = 'Manutenção predial')
      )
  )
);
