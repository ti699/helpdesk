-- Drop the permissive invitation policy that exposes all tokens
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public.invitations;

-- Drop the redundant storage policy that allows all authenticated users to view attachments
DROP POLICY IF EXISTS "Anyone can view attachments" ON storage.objects;