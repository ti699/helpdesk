-- Create function to handle new user registration (profile + role assignment)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invitation_role app_role;
  _user_nome text;
BEGIN
  -- Get name from metadata or fallback to email
  _user_nome := COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1));

  -- Create profile
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, _user_nome, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  -- Check for valid invitation
  SELECT role INTO _invitation_role
  FROM public.invitations
  WHERE email = NEW.email
    AND used = FALSE
    AND expires_at > NOW()
  LIMIT 1;

  -- Assign role based on invitation or default to solicitante
  IF _invitation_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _invitation_role)
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Mark invitation as used
    UPDATE public.invitations
    SET used = TRUE
    WHERE email = NEW.email AND used = FALSE;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'solicitante')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Add unique constraint on user_roles.user_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_key'
  ) THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();