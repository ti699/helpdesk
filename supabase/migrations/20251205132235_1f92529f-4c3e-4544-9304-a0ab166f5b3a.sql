-- Atribuir role admin ao usuário principal
INSERT INTO public.user_roles (user_id, role)
VALUES ('84bcd0a3-edbb-441a-9c5a-436c3bcb3a77', 'admin')
ON CONFLICT (user_id) DO NOTHING;

-- Atribuir role solicitante para outros usuários sem role
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'solicitante'::app_role
FROM public.profiles p
LEFT JOIN public.user_roles ur ON p.id = ur.user_id
WHERE ur.id IS NULL AND p.id != '84bcd0a3-edbb-441a-9c5a-436c3bcb3a77'
ON CONFLICT DO NOTHING;