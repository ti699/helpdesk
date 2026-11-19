DROP POLICY IF EXISTS "Report users can view profiles" ON public.profiles;
CREATE POLICY "Report users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'agente_manutencao'::app_role)
  OR public.has_management_report_access(auth.uid())
);

DROP POLICY IF EXISTS "Maintenance and management can view feedbacks" ON public.feedbacks;
CREATE POLICY "Maintenance and management can view feedbacks"
ON public.feedbacks
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'agente_manutencao'::app_role)
  OR public.has_management_report_access(auth.uid())
);
