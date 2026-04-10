-- Bloquear acesso anônimo à tabela profiles
CREATE POLICY "Deny anonymous access to profiles"
ON public.profiles
FOR SELECT
TO anon
USING (false);

-- Bloquear acesso anônimo à tabela invitations
CREATE POLICY "Deny anonymous access to invitations"
ON public.invitations
FOR ALL
TO anon
USING (false)
WITH CHECK (false);