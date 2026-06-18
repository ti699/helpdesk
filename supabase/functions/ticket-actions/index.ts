import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import {
  getEmailTemplate,
  getStatusLabel,
  NotificationType,
  TicketEmailPayload,
} from "../_shared/ticket-email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type AppRole = "solicitante" | "agente_ti" | "agente_manutencao" | "admin";
type TicketStatus = "aberto" | "em_andamento" | "aguardando_resposta" | "resolvido" | "fechado";
type TicketPriority = "baixa" | "media" | "alta" | "critica";
type TicketType = "TI" | "Manutenção predial";

interface Profile {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  setor: string | null;
  num_anydesk: string | null;
}

interface TicketRecord {
  id: string;
  protocolo: string;
  titulo: string;
  descricao: string;
  status: TicketStatus;
  prioridade: TicketPriority | null;
  tipo: string | null;
  setor: string | null;
  solicitante_id: string;
  agente_id: string | null;
  resolved_at: string | null;
}

interface Recipient {
  email: string;
  name: string;
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const emailFrom = Deno.env.get("EMAIL_FROM") || "Help Desk Astrotur <onboarding@resend.dev>";
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const uniqueRecipients = (recipients: Recipient[]) => {
  const seen = new Set<string>();

  return recipients.filter((recipient) => {
    if (!recipient.email) return false;

    const normalized = normalizeEmail(recipient.email);
    if (seen.has(normalized)) return false;

    seen.add(normalized);
    recipient.email = normalized;
    return true;
  });
};

const getUserAndRole = async (authorization: string) => {
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    throw new HttpError(401, "Sessão inválida ou expirada");
  }

  const { data: roleData } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .select("id, nome, email, telefone, setor, num_anydesk")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profileData) {
    throw new HttpError(403, "Perfil do usuário não encontrado");
  }

  return {
    user: userData.user,
    profile: profileData as Profile,
    role: (roleData?.role || "solicitante") as AppRole,
  };
};

const getProfileByEmail = async (email: string) => {
  const { data, error } = await admin
    .from("profiles")
    .select("id, nome, email, telefone, setor, num_anydesk")
    .eq("email", normalizeEmail(email))
    .maybeSingle();

  if (error || !data) {
    throw new HttpError(404, `Usuário não encontrado para o e-mail ${email}`);
  }

  return data as Profile;
};

const getTicket = async (ticketId: string) => {
  const { data, error } = await admin
    .from("tickets")
    .select("id, protocolo, titulo, descricao, status, prioridade, tipo, setor, solicitante_id, agente_id, resolved_at")
    .eq("id", ticketId)
    .single();

  if (error || !data) {
    throw new HttpError(404, "Ticket não encontrado");
  }

  return data as TicketRecord;
};

const getTicketRequester = async (ticket: TicketRecord) => {
  const { data, error } = await admin
    .from("profiles")
    .select("id, nome, email, telefone, setor, num_anydesk")
    .eq("id", ticket.solicitante_id)
    .maybeSingle();

  if (error || !data) {
    throw new HttpError(404, "Solicitante do ticket não encontrado");
  }

  return data as Profile;
};

const getPendingFeedbackTickets = async (requesterId: string) => {
  const { data: tickets, error: ticketsError } = await admin
    .from("tickets")
    .select("id, protocolo, titulo")
    .eq("solicitante_id", requesterId)
    .in("status", ["resolvido", "fechado"]);

  if (ticketsError) {
    throw new HttpError(400, ticketsError.message);
  }

  const ticketIds = (tickets || []).map((ticket) => ticket.id);
  if (!ticketIds.length) return [];

  const { data: feedbacks, error: feedbacksError } = await admin
    .from("feedbacks")
    .select("ticket_id")
    .in("ticket_id", ticketIds);

  if (feedbacksError) {
    throw new HttpError(400, feedbacksError.message);
  }

  const evaluatedTicketIds = new Set((feedbacks || []).map((feedback) => feedback.ticket_id));
  return (tickets || []).filter((ticket) => !evaluatedTicketIds.has(ticket.id));
};

const hasTicketFeedback = async (ticketId: string) => {
  const { data, error } = await admin
    .from("feedbacks")
    .select("id")
    .eq("ticket_id", ticketId)
    .maybeSingle();

  if (error) {
    throw new HttpError(400, error.message);
  }

  return !!data;
};

const isTeamMemberForTicket = (role: AppRole, ticketType?: string | null) =>
  (role === "agente_ti" && ticketType === "TI") ||
  (role === "agente_manutencao" && ticketType === "Manutenção predial");

const canCommentTicket = (userId: string, role: AppRole, ticket: TicketRecord) =>
  ticket.solicitante_id === userId ||
  role === "admin" ||
  isTeamMemberForTicket(role, ticket.tipo);

const canUpdateTicketStatus = (role: AppRole, ticket: TicketRecord) =>
  role === "admin" || isTeamMemberForTicket(role, ticket.tipo);

const getDepartmentRecipients = async (ticketType?: string | null): Promise<Recipient[]> => {
  if (!ticketType) return [];

  const { data, error } = await admin
    .from("ticket_department_email_recipients")
    .select("name, email")
    .eq("ticket_type", ticketType)
    .eq("active", true);

  if (error) {
    console.error("[ticket-actions] Failed to load department recipients", error);
    return [];
  }

  return (data || []).map((recipient) => ({
    email: recipient.email,
    name: recipient.name || recipient.email,
  }));
};

const requesterRecipient = (profile: Profile): Recipient[] => {
  if (!profile.email) return [];
  return [{ email: profile.email, name: profile.nome || profile.email }];
};

const buildTicketPayload = (
  ticket: TicketRecord,
  requester: Profile,
  extra: Partial<TicketEmailPayload> = {},
): TicketEmailPayload => ({
  id: ticket.id,
  protocolo: ticket.protocolo,
  titulo: ticket.titulo,
  descricao: ticket.descricao,
  prioridade: ticket.prioridade,
  solicitante: requester.nome,
  solicitante_email: requester.email,
  solicitante_telefone: requester.telefone,
  solicitante_anydesk: requester.num_anydesk,
  ...extra,
});

const logEmail = async ({
  ticketId,
  eventType,
  recipient,
  status,
  providerMessageId,
  errorMessage,
}: {
  ticketId: string;
  eventType: NotificationType;
  recipient: Recipient;
  status: "sent" | "failed";
  providerMessageId?: string | null;
  errorMessage?: string | null;
}) => {
  const { error } = await admin.from("ticket_email_logs").insert({
    ticket_id: ticketId,
    event_type: eventType,
    recipient_email: recipient.email,
    recipient_name: recipient.name,
    status,
    provider_message_id: providerMessageId || null,
    error_message: errorMessage || null,
  });

  if (error) {
    console.error("[ticket-actions] Failed to write email log", error);
  }
};

const sendEmails = async (
  eventType: NotificationType,
  ticket: TicketEmailPayload,
  recipients: Recipient[],
) => {
  const finalRecipients = uniqueRecipients(recipients);

  await Promise.all(
    finalRecipients.map(async (recipient) => {
      try {
        const { subject, html } = getEmailTemplate(eventType, ticket, recipient.name);
        const result = await resend.emails.send({
          from: emailFrom,
          to: [recipient.email],
          subject,
          html,
        });

        if ((result as { error?: { message?: string } }).error) {
          throw new Error((result as { error: { message?: string } }).error.message || "Falha no Resend");
        }

        const providerMessageId =
          (result as { data?: { id?: string } }).data?.id ||
          (result as { id?: string }).id ||
          null;

        await logEmail({
          ticketId: ticket.id,
          eventType,
          recipient,
          status: "sent",
          providerMessageId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido";
        console.error("[ticket-actions] Email failed", { eventType, recipient: recipient.email, error });

        await logEmail({
          ticketId: ticket.id,
          eventType,
          recipient,
          status: "failed",
          errorMessage: message,
        });
      }
    }),
  );
};

const handleCreateTicket = async (
  payload: Record<string, unknown>,
  context: Awaited<ReturnType<typeof getUserAndRole>>,
) => {
  const ticketType = payload.tipo as TicketType;
  const solicitanteEmail = typeof payload.solicitanteEmail === "string"
    ? payload.solicitanteEmail.trim()
    : "";

  if (!["TI", "Manutenção predial"].includes(ticketType)) {
    throw new HttpError(400, "Tipo de ticket inválido");
  }

  const requester = solicitanteEmail
    ? await getProfileByEmail(solicitanteEmail)
    : context.profile;

  if (requester.id !== context.user.id && !["agente_ti", "agente_manutencao", "admin"].includes(context.role)) {
    throw new HttpError(403, "Você não tem permissão para criar ticket para outra pessoa");
  }

  const pendingFeedbackTickets = await getPendingFeedbackTickets(requester.id);
  if (pendingFeedbackTickets.length > 0) {
    const protocols = pendingFeedbackTickets.map((ticket) => ticket.protocolo).join(", ");
    throw new HttpError(
      409,
      `Antes de abrir um novo ticket, avalie o atendimento pendente: ${protocols}`,
    );
  }

  const { data, error } = await admin
    .from("tickets")
    .insert({
      solicitante_id: requester.id,
      created_by_id: context.user.id,
      titulo: String(payload.titulo || "").trim(),
      descricao: String(payload.descricao || "").trim(),
      tipo: ticketType,
      categoria: payload.categoria ? String(payload.categoria) : null,
      setor: requester.setor || null,
      prioridade: (payload.prioridade || "media") as TicketPriority,
      anexos: payload.anexos || { imagens: [], arquivos: [], audio: null },
    })
    .select("id, protocolo, titulo, descricao, status, prioridade, tipo, setor, solicitante_id, agente_id, resolved_at")
    .single();

  if (error || !data) {
    throw new HttpError(400, error?.message || "Não foi possível criar o ticket");
  }

  const ticket = data as TicketRecord;
  const ticketPayload = buildTicketPayload(ticket, requester);
  const departmentRecipients = await getDepartmentRecipients(ticket.tipo);

  await Promise.all([
    sendEmails("ticket_created", ticketPayload, requesterRecipient(requester)),
    sendEmails("new_ticket_alert", ticketPayload, departmentRecipients),
  ]);

  return {
    ticket: {
      id: ticket.id,
      protocolo: ticket.protocolo,
    },
  };
};

const handleAddMessage = async (
  payload: Record<string, unknown>,
  context: Awaited<ReturnType<typeof getUserAndRole>>,
) => {
  const ticketId = String(payload.ticketId || "");
  const message = String(payload.message || "").trim();

  if (!ticketId || !message) {
    throw new HttpError(400, "Ticket e mensagem são obrigatórios");
  }

  const ticket = await getTicket(ticketId);
  if (ticket.status === "fechado") {
    throw new HttpError(400, "Tickets fechados não aceitam novas mensagens");
  }

  if (!canCommentTicket(context.user.id, context.role, ticket)) {
    throw new HttpError(403, "Você não tem permissão para movimentar este ticket");
  }

  const { error } = await admin.from("interactions").insert({
    ticket_id: ticketId,
    autor_id: context.user.id,
    mensagem: message,
    tipo: "texto",
  });

  if (error) {
    throw new HttpError(400, error.message);
  }

  const requester = await getTicketRequester(ticket);
  const authorIsRequester = context.user.id === ticket.solicitante_id;
  const recipients = authorIsRequester
    ? await getDepartmentRecipients(ticket.tipo)
    : requesterRecipient(requester);

  await sendEmails(
    "ticket_activity",
    buildTicketPayload(ticket, requester, {
      actorName: context.profile.nome,
      messagePreview: message,
    }),
    recipients,
  );

  return { ok: true };
};

const handleUpdateStatus = async (
  payload: Record<string, unknown>,
  context: Awaited<ReturnType<typeof getUserAndRole>>,
) => {
  const ticketId = String(payload.ticketId || "");
  const newStatus = payload.status as TicketStatus;

  if (!ticketId || !["aberto", "em_andamento", "aguardando_resposta", "resolvido", "fechado"].includes(newStatus)) {
    throw new HttpError(400, "Status inválido");
  }

  const currentTicket = await getTicket(ticketId);
  if (!canUpdateTicketStatus(context.role, currentTicket)) {
    throw new HttpError(403, "Você não tem permissão para alterar o status deste ticket");
  }

  if (currentTicket.status === newStatus) {
    return { ok: true, unchanged: true };
  }

  const nowIso = new Date().toISOString();
  const updatePayload: {
    status: TicketStatus;
    closed_at: string | null;
    resolved_at: string | null;
  } = {
    status: newStatus,
    closed_at: newStatus === "fechado" ? nowIso : null,
    resolved_at: null,
  };

  if (newStatus === "resolvido") {
    updatePayload.resolved_at = nowIso;
  } else if (newStatus === "fechado") {
    updatePayload.resolved_at = currentTicket.resolved_at || nowIso;
  }

  const { data, error } = await admin
    .from("tickets")
    .update(updatePayload)
    .eq("id", ticketId)
    .select("id, protocolo, titulo, descricao, status, prioridade, tipo, setor, solicitante_id, agente_id, resolved_at")
    .single();

  if (error || !data) {
    throw new HttpError(400, error?.message || "Não foi possível atualizar o status");
  }

  const ticket = data as TicketRecord;
  const statusLabel = getStatusLabel(newStatus);

  const { error: interactionError } = await admin.from("interactions").insert({
    ticket_id: ticketId,
    autor_id: context.user.id,
    mensagem: `Status alterado para: ${statusLabel}`,
    tipo: "mudanca_status",
  });

  if (interactionError) {
    console.error("[ticket-actions] Failed to create status interaction", interactionError);
  }

  const requester = await getTicketRequester(ticket);
  const departmentRecipients = await getDepartmentRecipients(ticket.tipo);
  const ticketPayload = buildTicketPayload(ticket, requester, {
    newStatus,
    actorName: context.profile.nome,
  });

  if (newStatus === "resolvido") {
    await Promise.all([
      sendEmails("feedback_request", ticketPayload, requesterRecipient(requester)),
      sendEmails("ticket_activity", ticketPayload, departmentRecipients),
    ]);
  } else if (newStatus === "fechado") {
    const alreadyEvaluated = await hasTicketFeedback(ticket.id);
    await Promise.all([
      sendEmails(
        alreadyEvaluated ? "ticket_closed" : "feedback_request",
        ticketPayload,
        requesterRecipient(requester),
      ),
      sendEmails("ticket_closed", ticketPayload, departmentRecipients),
    ]);
  } else {
    await sendEmails("status_updated", ticketPayload, [
      ...requesterRecipient(requester),
      ...departmentRecipients,
    ]);
  }

  return { ok: true, status: newStatus };
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Método não permitido");
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization) {
      throw new HttpError(401, "Autenticação obrigatória");
    }

    const context = await getUserAndRole(authorization);
    const body = (await req.json()) as { action?: string; payload?: Record<string, unknown> };

    if (!body.action || !body.payload) {
      throw new HttpError(400, "Ação e dados são obrigatórios");
    }

    const result = await (async () => {
      switch (body.action) {
        case "create_ticket":
          return handleCreateTicket(body.payload || {}, context);
        case "add_message":
          return handleAddMessage(body.payload || {}, context);
        case "update_status":
          return handleUpdateStatus(body.payload || {}, context);
        default:
          throw new HttpError(400, "Ação inválida");
      }
    })();

    return jsonResponse({ success: true, data: result });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[ticket-actions] Error:", error);

    return jsonResponse({ success: false, error: message }, status);
  }
};

serve(handler);
