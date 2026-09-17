-- Expose the asset responsible relationship through PostgREST using profiles.
ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_responsible_user_id_fkey;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_responsible_user_id_fkey
  FOREIGN KEY (responsible_user_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;
