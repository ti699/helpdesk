CREATE TABLE IF NOT EXISTS public.management_report_access (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.management_report_access ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_management_report_access(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.management_report_access
      WHERE user_id = _user_id
    );
$$;

DROP POLICY IF EXISTS "Admins can manage management report access" ON public.management_report_access;
CREATE POLICY "Admins can manage management report access"
ON public.management_report_access
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view own management report access" ON public.management_report_access;
CREATE POLICY "Users can view own management report access"
ON public.management_report_access
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Management report users can view tickets" ON public.tickets;
CREATE POLICY "Management report users can view tickets"
ON public.tickets
FOR SELECT
TO authenticated
USING (public.has_management_report_access(auth.uid()));

DROP POLICY IF EXISTS "Management report users can view feedbacks" ON public.feedbacks;
CREATE POLICY "Management report users can view feedbacks"
ON public.feedbacks
FOR SELECT
TO authenticated
USING (public.has_management_report_access(auth.uid()));
