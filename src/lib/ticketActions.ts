import { supabase } from '@/integrations/supabase/client';

export type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_resposta' | 'resolvido' | 'fechado';
export type TicketPriority = 'baixa' | 'media' | 'alta' | 'critica';

type TicketActionName =
  | 'create_ticket'
  | 'add_message'
  | 'update_status'
  | 'start_service'
  | 'finish_service'
  | 'reopen_ticket_from_feedback';

interface TicketActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateTicketPayload {
  titulo: string;
  descricao: string;
  tipo: string;
  categoria: string;
  prioridade: TicketPriority;
  solicitanteEmail?: string;
  anexos: {
    imagens: string[];
    arquivos: string[];
    audio: string | null;
  };
}

export interface CreateTicketResult {
  ticket: {
    id: string;
    protocolo: string;
  };
}

const invokeTicketAction = async <T>(
  action: TicketActionName,
  payload: Record<string, unknown>,
): Promise<T> => {
  const { data, error } = await supabase.functions.invoke<TicketActionResult<T>>('ticket-actions', {
    body: { action, payload },
  });

  if (error) {
    throw new Error(error.message || 'Não foi possível executar a ação do ticket');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Não foi possível executar a ação do ticket');
  }

  return data.data as T;
};

export const createTicket = (payload: CreateTicketPayload) =>
  invokeTicketAction<CreateTicketResult>('create_ticket', payload as unknown as Record<string, unknown>);

export const addTicketMessage = (ticketId: string, message: string) =>
  invokeTicketAction<{ ok: boolean }>('add_message', { ticketId, message });

export const updateTicketStatus = (ticketId: string, status: TicketStatus) =>
  invokeTicketAction<{ ok: boolean; unchanged?: boolean; status?: TicketStatus }>('update_status', {
    ticketId,
    status,
  });

export const startTicketService = (
  ticketId: string,
  payload: {
    executorIds: string[];
    startedAt?: string;
    notes?: string;
  },
) =>
  invokeTicketAction<{ ok: boolean; session: { id: string; started_at: string } }>('start_service', {
    ticketId,
    ...payload,
  });

export const finishTicketService = (
  ticketId: string,
  payload: {
    finishedAt?: string;
    notes?: string;
  },
) =>
  invokeTicketAction<{ ok: boolean; status: TicketStatus; finished_at: string }>('finish_service', {
    ticketId,
    ...payload,
  });

export const reopenTicketFromFeedback = (ticketId: string, reason?: string) =>
  invokeTicketAction<{ ok: boolean; status: TicketStatus }>('reopen_ticket_from_feedback', {
    ticketId,
    reason,
  });
