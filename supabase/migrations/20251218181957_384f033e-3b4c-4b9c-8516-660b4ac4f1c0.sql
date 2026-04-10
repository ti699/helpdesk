-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  lida BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
ON public.notifications
FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Function to create notifications
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_tipo TEXT,
  p_titulo TEXT,
  p_mensagem TEXT,
  p_ticket_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, tipo, titulo, mensagem, ticket_id)
  VALUES (p_user_id, p_tipo, p_titulo, p_mensagem, p_ticket_id)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Trigger function for new ticket notifications
CREATE OR REPLACE FUNCTION public.notify_on_new_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_team_type TEXT;
BEGIN
  -- Notify the requester
  PERFORM public.create_notification(
    NEW.solicitante_id,
    'ticket_created',
    'Ticket criado com sucesso',
    'Seu ticket #' || NEW.protocolo || ' foi registrado. Acompanhe o andamento aqui.',
    NEW.id
  );
  
  -- Determine team type based on ticket type
  IF NEW.tipo = 'TI' THEN
    v_team_type := 'agente_ti';
  ELSIF NEW.tipo = 'Manutenção predial' THEN
    v_team_type := 'agente_manutencao';
  ELSE
    RETURN NEW;
  END IF;
  
  -- Notify all agents of the team
  FOR v_agent IN 
    SELECT user_id FROM public.user_roles WHERE role::text = v_team_type
  LOOP
    PERFORM public.create_notification(
      v_agent.user_id,
      'new_ticket_alert',
      'Novo ticket recebido',
      'Novo ticket #' || NEW.protocolo || ': ' || NEW.titulo,
      NEW.id
    );
  END LOOP;
  
  -- Notify admins
  FOR v_agent IN 
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    PERFORM public.create_notification(
      v_agent.user_id,
      'new_ticket_alert',
      'Novo ticket recebido',
      'Novo ticket #' || NEW.protocolo || ': ' || NEW.titulo,
      NEW.id
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Trigger function for ticket status changes
CREATE OR REPLACE FUNCTION public.notify_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_label TEXT;
BEGIN
  -- Only notify if status actually changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Get status label in Portuguese
  CASE NEW.status
    WHEN 'aberto' THEN v_status_label := 'Aberto';
    WHEN 'em_andamento' THEN v_status_label := 'Em Andamento';
    WHEN 'pendente' THEN v_status_label := 'Pendente';
    WHEN 'resolvido' THEN v_status_label := 'Resolvido';
    WHEN 'cancelado' THEN v_status_label := 'Cancelado';
    ELSE v_status_label := NEW.status::text;
  END CASE;
  
  -- Notify requester about status change
  PERFORM public.create_notification(
    NEW.solicitante_id,
    'status_updated',
    'Status do ticket atualizado',
    'Seu ticket #' || NEW.protocolo || ' agora está: ' || v_status_label,
    NEW.id
  );
  
  -- If resolved, request feedback
  IF NEW.status = 'resolvido' THEN
    PERFORM public.create_notification(
      NEW.solicitante_id,
      'feedback_request',
      'Avalie o atendimento',
      'Seu ticket #' || NEW.protocolo || ' foi resolvido. Avalie o atendimento!',
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger function for new interactions
CREATE OR REPLACE FUNCTION public.notify_on_new_interaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket RECORD;
  v_autor_nome TEXT;
  v_target_user_id UUID;
BEGIN
  -- Get ticket info
  SELECT * INTO v_ticket FROM public.tickets WHERE id = NEW.ticket_id;
  
  -- Get author name
  SELECT nome INTO v_autor_nome FROM public.profiles WHERE id = NEW.autor_id;
  
  -- Determine who to notify (the other party)
  IF NEW.autor_id = v_ticket.solicitante_id THEN
    -- Author is requester, notify agent if assigned
    IF v_ticket.agente_id IS NOT NULL THEN
      v_target_user_id := v_ticket.agente_id;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    -- Author is agent, notify requester
    v_target_user_id := v_ticket.solicitante_id;
  END IF;
  
  -- Create notification
  PERFORM public.create_notification(
    v_target_user_id,
    'new_message',
    'Nova mensagem no ticket',
    v_autor_nome || ' enviou uma mensagem no ticket #' || v_ticket.protocolo,
    NEW.ticket_id
  );
  
  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER on_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_ticket();

CREATE TRIGGER on_ticket_status_changed
  AFTER UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_status_change();

CREATE TRIGGER on_interaction_created
  AFTER INSERT ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_interaction();