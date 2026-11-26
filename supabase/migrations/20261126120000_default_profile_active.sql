UPDATE public.profiles
SET active = TRUE
WHERE active IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN active SET DEFAULT TRUE,
  ALTER COLUMN active SET NOT NULL;

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
  _user_nome := COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (
    id,
    nome,
    email,
    telefone,
    funcao,
    setor,
    num_anydesk,
    active
  )
  VALUES (
    NEW.id,
    _user_nome,
    NEW.email,
    NEW.raw_user_meta_data->>'telefone',
    NEW.raw_user_meta_data->>'funcao',
    NEW.raw_user_meta_data->>'setor',
    NEW.raw_user_meta_data->>'num_anydesk',
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT role INTO _invitation_role
  FROM public.invitations
  WHERE email = NEW.email
    AND used = FALSE
    AND expires_at > NOW()
  LIMIT 1;

  IF _invitation_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _invitation_role)
    ON CONFLICT (user_id) DO NOTHING;

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
