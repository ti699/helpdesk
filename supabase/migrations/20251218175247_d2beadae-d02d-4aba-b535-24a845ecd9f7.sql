-- Create helper function to get user team type
CREATE OR REPLACE FUNCTION public.get_user_team_type(_user_id uuid)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN role = 'agente_ti' THEN 'TI'
      WHEN role = 'agente_manutencao' THEN 'Manutencao'
      WHEN role = 'admin' THEN 'Admin'
      ELSE 'Solicitante'
    END
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Create function to check if user can access ticket type
CREATE OR REPLACE FUNCTION public.can_access_ticket_type(_user_id uuid, _ticket_tipo text)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      -- Admins can access all
      WHEN public.has_role(_user_id, 'admin') THEN true
      -- TI agents can only access TI tickets
      WHEN public.has_role(_user_id, 'agente_ti') AND _ticket_tipo = 'TI' THEN true
      -- Maintenance agents can only access maintenance tickets
      WHEN public.has_role(_user_id, 'agente_manutencao') AND _ticket_tipo = 'Manutenção predial' THEN true
      ELSE false
    END
$$;

-- Drop existing agent/admin policies on tickets that need updating
DROP POLICY IF EXISTS "Agents and admins can view all tickets" ON public.tickets;
DROP POLICY IF EXISTS "Agents and admins can update tickets" ON public.tickets;

-- Create new policy for agents to view tickets based on team type
CREATE POLICY "Agents and admins can view team tickets" 
ON public.tickets 
FOR SELECT 
USING (
  public.has_role(auth.uid(), 'admin'::app_role) 
  OR (public.has_role(auth.uid(), 'agente_ti'::app_role) AND tipo = 'TI')
  OR (public.has_role(auth.uid(), 'agente_manutencao'::app_role) AND tipo = 'Manutenção predial')
);

-- Create new policy for agents to update tickets based on team type
CREATE POLICY "Agents and admins can update team tickets" 
ON public.tickets 
FOR UPDATE 
USING (
  public.has_role(auth.uid(), 'admin'::app_role) 
  OR (public.has_role(auth.uid(), 'agente_ti'::app_role) AND tipo = 'TI')
  OR (public.has_role(auth.uid(), 'agente_manutencao'::app_role) AND tipo = 'Manutenção predial')
);

-- Add DELETE policy for tickets (agents/admins can delete team tickets)
CREATE POLICY "Agents and admins can delete team tickets" 
ON public.tickets 
FOR DELETE 
USING (
  public.has_role(auth.uid(), 'admin'::app_role) 
  OR (public.has_role(auth.uid(), 'agente_ti'::app_role) AND tipo = 'TI')
  OR (public.has_role(auth.uid(), 'agente_manutencao'::app_role) AND tipo = 'Manutenção predial')
);