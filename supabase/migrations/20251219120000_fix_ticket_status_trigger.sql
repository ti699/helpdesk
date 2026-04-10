-- Fix the trigger to use correct enum value 'aguardando_resposta' instead of 'pendente'

-- Drop the existing trigger
DROP TRIGGER IF EXISTS on_ticket_status_changed ON public.tickets;

-- Recreate the trigger function with correct enum value
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
    WHEN 'aguardando_resposta' THEN v_status_label := 'Aguardando Resposta';
    WHEN 'resolvido' THEN v_status_label := 'Resolvido';
    WHEN 'fechado' THEN v_status_label := 'Fechado';
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

-- Recreate the trigger
CREATE TRIGGER on_ticket_status_changed
  AFTER UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_status_change();
