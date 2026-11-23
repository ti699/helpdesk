DROP POLICY IF EXISTS "Agents can view their own budgets and admins can view all" ON public.orcamentos;
DROP POLICY IF EXISTS "Agents can create their own budgets" ON public.orcamentos;
DROP POLICY IF EXISTS "Agents can update their own drafts" ON public.orcamentos;
DROP POLICY IF EXISTS "Agents can update their own revision requests" ON public.orcamentos;
DROP POLICY IF EXISTS "Admins can decide pending budgets" ON public.orcamentos;

CREATE POLICY "Management users can view all budgets"
  ON public.orcamentos FOR SELECT
  TO authenticated
  USING (public.has_management_report_access(auth.uid()));

CREATE POLICY "Management users can create budgets"
  ON public.orcamentos FOR INSERT
  TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND public.has_management_report_access(auth.uid())
    AND status IN ('rascunho', 'aguardando_aprovacao')
    AND aprovado_por IS NULL
    AND aprovado_em IS NULL
    AND motivo_decisao IS NULL
  );

CREATE POLICY "Management users can update their own drafts"
  ON public.orcamentos FOR UPDATE
  TO authenticated
  USING (
    criado_por = auth.uid()
    AND status = 'rascunho'
    AND public.has_management_report_access(auth.uid())
  )
  WITH CHECK (
    criado_por = auth.uid()
    AND status IN ('rascunho', 'aguardando_aprovacao')
    AND aprovado_por IS NULL
    AND aprovado_em IS NULL
    AND motivo_decisao IS NULL
    AND public.has_management_report_access(auth.uid())
  );

CREATE POLICY "Management users can update their own revision requests"
  ON public.orcamentos FOR UPDATE
  TO authenticated
  USING (
    criado_por = auth.uid()
    AND status = 'revisao'
    AND public.has_management_report_access(auth.uid())
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
    AND public.has_management_report_access(auth.uid())
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

DROP POLICY IF EXISTS "Budget owners and admins can read budget attachments" ON storage.objects;
DROP POLICY IF EXISTS "Agents can upload their own budget attachments" ON storage.objects;
DROP POLICY IF EXISTS "Budget owners and admins can update budget attachments" ON storage.objects;
DROP POLICY IF EXISTS "Budget owners and admins can delete budget attachments" ON storage.objects;

CREATE POLICY "Management users can read budget attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'orcamentos-anexos'
    AND public.has_management_report_access(auth.uid())
  );

CREATE POLICY "Management users can upload budget attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'orcamentos-anexos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.has_management_report_access(auth.uid())
  );

CREATE POLICY "Management users can update budget attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'orcamentos-anexos'
    AND public.has_management_report_access(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  )
  WITH CHECK (
    bucket_id = 'orcamentos-anexos'
    AND public.has_management_report_access(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "Management users can delete budget attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'orcamentos-anexos'
    AND public.has_management_report_access(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );
