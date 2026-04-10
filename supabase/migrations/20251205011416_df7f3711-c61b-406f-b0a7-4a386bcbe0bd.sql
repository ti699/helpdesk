-- Make the attachments bucket private (idempotent)
UPDATE storage.buckets SET public = false WHERE id = 'attachments';

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Public can view attachments" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can view attachments for their tickets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;

-- Create SELECT policy: Users can view attachments for tickets they have access to
CREATE POLICY "Users can view attachments for their tickets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'attachments' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('agente_ti', 'admin')
    )
  )
);

-- Create INSERT policy: Authenticated users can upload to their own folder
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments' AND
  (storage.foldername(name))[1] = auth.uid()::text
);