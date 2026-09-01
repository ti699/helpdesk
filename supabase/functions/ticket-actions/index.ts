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
  closed_at: string | null;
  service_started_at: string | null;
  service_finished_at: string | null;
}

interface Recipient {
  email: string;
  name: string;
}

interface ServiceExecutor {
  id: string;
  name: string;
  specialty: string;
  area: string;
  active: boolean;
}

interface ServiceSession {
  id: string;
  ticket_id: string;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
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

const ticketSelect =
  "id, protocolo, titulo, descricao, status, prioridade, tipo, setor, solicitante_id, agente_id, resolved_at, closed_at, service_started_at, service_finished_at";

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
    .select(ticketSelect)
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

const parseActionDate = (value: unknown, fieldLabel: string) => {
  const raw = typeof value === "string" ? value.trim() : "";
  const date = raw ? new Date(raw) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${fieldLabel} inválida`);
  }

  return date.toISOString();
};

const formatDateTime = (isoDate: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Recife",
  }).format(new Date(isoDate));

const formatDuration = (startIso: string, endIso: string) => {
  const durationMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (durationMs < 0) return "Sem dados";

  const totalMinutes = Math.max(1, Math.floor(durationMs / 60000));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (totalHours < 1) return `${totalMinutes}min`;
  if (days < 1) return minutes > 0 ? `${totalHours}h ${minutes}min` : `${totalHours}h`;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
};

const getOpenServiceSession = async (ticketId: string) => {
  const { data, error } = await admin
    .from("ticket_service_sessions")
    .select("id, ticket_id, started_at, finished_at, notes")
    .eq("ticket_id", ticketId)
    .is("finished_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(400, error.message);
  }

  return data as ServiceSession | null;
};

const getExecutorsForTicket = async (executorIds: unknown, ticket: TicketRecord) => {
  if (!Array.isArray(executorIds) || executorIds.length === 0) {
    throw new HttpError(400, "Selecione ao menos um executor do serviço");
  }

  const ids = [...new Set(executorIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) {
    throw new HttpError(400, "Selecione ao menos um executor do serviço");
  }

  const { data, error } = await admin
    .from("service_executors")
    .select("id, name, specialty, area, active")
    .in("id", ids);

  if (error) {
    throw new HttpError(400, error.message);
  }

  const executors = (data || []) as ServiceExecutor[];
  if (executors.length !== ids.length) {
    throw new HttpError(400, "Um ou mais executores não foram encontrados");
  }

  const invalidExecutor = executors.find((executor) => !executor.active || executor.area !== ticket.tipo);
  if (invalidExecutor) {
    throw new HttpError(400, `Executor inválido para este ticket: ${invalidExecutor.name}`);
  }

  return executors;
};

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
    .select(ticketSelect)
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
  const openServiceSession = newStatus === "resolvido"
    ? await getOpenServiceSession(ticketId)
    : null;

  if (newStatus === "resolvido" && !openServiceSession) {
    throw new HttpError(409, "Inicie o serviço e selecione o executor antes de resolver o ticket");
  }

  if (openServiceSession) {
    const { error: finishSessionError } = await admin
      .from("ticket_service_sessions")
      .update({
        finished_at: nowIso,
        finished_by: context.user.id,
      })
      .eq("id", openServiceSession.id);

    if (finishSessionError) {
      throw new HttpError(400, finishSessionError.message);
    }
  }

  const updatePayload: {
    status: TicketStatus;
    closed_at: string | null;
    resolved_at: string | null;
    service_started_at?: string | null;
    service_finished_at?: string | null;
  } = {
    status: newStatus,
    closed_at: newStatus === "fechado" ? nowIso : null,
    resolved_at: null,
  };

  if (newStatus === "em_andamento") {
    updatePayload.service_finished_at = null;
  } else if (newStatus === "resolvido") {
    updatePayload.resolved_at = nowIso;
    updatePayload.service_started_at = currentTicket.service_started_at || openServiceSession?.started_at || nowIso;
    updatePayload.service_finished_at = currentTicket.service_finished_at || nowIso;
  } else if (newStatus === "fechado") {
    updatePayload.resolved_at = currentTicket.resolved_at || nowIso;
    if (currentTicket.service_started_at) {
      updatePayload.service_started_at = currentTicket.service_started_at;
      updatePayload.service_finished_at = currentTicket.service_finished_at || nowIso;
    }
  } else if (newStatus === "aberto" || newStatus === "aguardando_resposta") {
    updatePayload.service_finished_at = null;
  }

  const { data, error } = await admin
    .from("tickets")
    .update(updatePayload)
    .eq("id", ticketId)
    .select(ticketSelect)
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

const handleStartService = async (
  payload: Record<string, unknown>,
  context: Awaited<ReturnType<typeof getUserAndRole>>,
) => {
  const ticketId = String(payload.ticketId || "");
  if (!ticketId) {
    throw new HttpError(400, "Ticket é obrigatório");
  }

  const ticket = await getTicket(ticketId);
  if (!canUpdateTicketStatus(context.role, ticket)) {
    throw new HttpError(403, "Você não tem permissão para iniciar serviço neste ticket");
  }

  if (ticket.status === "fechado") {
    throw new HttpError(400, "Tickets fechados não aceitam início de serviço");
  }

  if (ticket.status === "resolvido") {
    throw new HttpError(400, "Reabra o ticket antes de iniciar novo serviço");
  }

  const existingOpenSession = await getOpenServiceSession(ticketId);
  if (existingOpenSession) {
    throw new HttpError(409, "Este ticket já possui um serviço em andamento");
  }

  const startedAt = parseActionDate(payload.startedAt, "Data/hora inicial do serviço");
  const notes = typeof payload.notes === "string" && payload.notes.trim()
    ? payload.notes.trim()
    : null;
  const executors = await getExecutorsForTicket(payload.executorIds, ticket);

  const { data: session, error: sessionError } = await admin
    .from("ticket_service_sessions")
    .insert({
      ticket_id: ticketId,
      started_at: startedAt,
      started_by: context.user.id,
      notes,
    })
    .select("id, ticket_id, started_at, finished_at, notes")
    .single();

  if (sessionError || !session) {
    throw new HttpError(400, sessionError?.message || "Não foi possível iniciar o serviço");
  }

  const { error: executorError } = await admin
    .from("ticket_service_session_executors")
    .insert(executors.map((executor) => ({
      session_id: session.id,
      executor_id: executor.id,
    })));

  if (executorError) {
    throw new HttpError(400, executorError.message);
  }

  const { data: updatedTicket, error: ticketError } = await admin
    .from("tickets")
    .update({
      status: "em_andamento",
      agente_id: ticket.agente_id || context.user.id,
      service_started_at: ticket.service_started_at || startedAt,
      service_finished_at: null,
      resolved_at: null,
      closed_at: null,
    })
    .eq("id", ticketId)
    .select(ticketSelect)
    .single();

  if (ticketError || !updatedTicket) {
    throw new HttpError(400, ticketError?.message || "Não foi possível atualizar o ticket");
  }

  const executorLabel = executors.map((executor) => `${executor.name} (${executor.specialty})`).join(", ");
  const message = `Serviço iniciado em ${formatDateTime(startedAt)}. Executor(es): ${executorLabel}${notes ? `. Observação: ${notes}` : ""}`;

  const { error: interactionError } = await admin.from("interactions").insert({
    ticket_id: ticketId,
    autor_id: context.user.id,
    mensagem: message,
    tipo: "mudanca_status",
  });

  if (interactionError) {
    console.error("[ticket-actions] Failed to create service start interaction", interactionError);
  }

  const requester = await getTicketRequester(updatedTicket as TicketRecord);
  const departmentRecipients = await getDepartmentRecipients(updatedTicket.tipo);

  await sendEmails(
    "status_updated",
    buildTicketPayload(updatedTicket as TicketRecord, requester, {
      newStatus: "em_andamento",
      actorName: context.profile.nome,
      messagePreview: message,
    }),
    [...requesterRecipient(requester), ...departmentRecipients],
  );

  return {
    ok: true,
    session: {
      id: session.id,
      started_at: startedAt,
      executors,
    },
  };
};

const handleFinishService = async (
  payload: Record<string, unknown>,
  context: Awaited<ReturnType<typeof getUserAndRole>>,
) => {
  const ticketId = String(payload.ticketId || "");
  if (!ticketId) {
    throw new HttpError(400, "Ticket é obrigatório");
  }

  const ticket = await getTicket(ticketId);
  if (!canUpdateTicketStatus(context.role, ticket)) {
    throw new HttpError(403, "Você não tem permissão para encerrar serviço neste ticket");
  }

  if (ticket.status === "fechado") {
    throw new HttpError(400, "Tickets fechados não aceitam encerramento de serviço");
  }

  const session = await getOpenServiceSession(ticketId);
  if (!session) {
    throw new HttpError(409, "Inicie o serviço antes de encerrar");
  }

  const finishedAt = parseActionDate(payload.finishedAt, "Data/hora final do serviço");
  if (new Date(finishedAt).getTime() < new Date(session.started_at).getTime()) {
    throw new HttpError(400, "A data/hora final não pode ser anterior ao início do serviço");
  }

  const notes = typeof payload.notes === "string" && payload.notes.trim()
    ? payload.notes.trim()
    : session.notes;

  const { error: sessionError } = await admin
    .from("ticket_service_sessions")
    .update({
      finished_at: finishedAt,
      finished_by: context.user.id,
      notes,
    })
    .eq("id", session.id);

  if (sessionError) {
    throw new HttpError(400, sessionError.message);
  }

  const { data: updatedTicket, error: ticketError } = await admin
    .from("tickets")
    .update({
      status: "resolvido",
      resolved_at: finishedAt,
      service_started_at: ticket.service_started_at || session.started_at,
      service_finished_at: finishedAt,
      closed_at: null,
    })
    .eq("id", ticketId)
    .select(ticketSelect)
    .single();

  if (ticketError || !updatedTicket) {
    throw new HttpError(400, ticketError?.message || "Não foi possível encerrar o serviço");
  }

  const { data: executorRows } = await admin
    .from("ticket_service_session_executors")
    .select("executor_id")
    .eq("session_id", session.id);

  const executorIds = (executorRows || []).map((row) => row.executor_id);
  let executorLabel = "Não informado";

  if (executorIds.length) {
    const { data: executors } = await admin
      .from("service_executors")
      .select("name, specialty")
      .in("id", executorIds);

    executorLabel = (executors || [])
      .map((executor) => `${executor.name} (${executor.specialty})`)
      .join(", ") || executorLabel;
  }

  const message = `Serviço encerrado em ${formatDateTime(finishedAt)}. Executor(es): ${executorLabel}. Tempo executado: ${formatDuration(session.started_at, finishedAt)}${notes ? `. Observação: ${notes}` : ""}`;

  const { error: interactionError } = await admin.from("interactions").insert({
    ticket_id: ticketId,
    autor_id: context.user.id,
    mensagem: message,
    tipo: "mudanca_status",
  });

  if (interactionError) {
    console.error("[ticket-actions] Failed to create service finish interaction", interactionError);
  }

  const requester = await getTicketRequester(updatedTicket as TicketRecord);
  const departmentRecipients = await getDepartmentRecipients(updatedTicket.tipo);
  const ticketPayload = buildTicketPayload(updatedTicket as TicketRecord, requester, {
    newStatus: "resolvido",
    actorName: context.profile.nome,
    messagePreview: message,
  });

  await Promise.all([
    sendEmails("feedback_request", ticketPayload, requesterRecipient(requester)),
    sendEmails("ticket_activity", ticketPayload, departmentRecipients),
  ]);

  return {
    ok: true,
    status: "resolvido" as TicketStatus,
    finished_at: finishedAt,
  };
};

const handleReopenTicketFromFeedback = async (
  payload: Record<string, unknown>,
  context: Awaited<ReturnType<typeof getUserAndRole>>,
) => {
  const ticketId = String(payload.ticketId || "");
  const reason = String(payload.reason || "").trim();

  if (!ticketId) {
    throw new HttpError(400, "Ticket é obrigatório");
  }

  const currentTicket = await getTicket(ticketId);

  if (currentTicket.solicitante_id !== context.user.id) {
    throw new HttpError(403, "Somente o solicitante pode reabrir este ticket pela avaliação");
  }

  if (!["resolvido", "fechado"].includes(currentTicket.status)) {
    throw new HttpError(400, "A reabertura pela avaliação só está disponível para tickets resolvidos ou fechados");
  }

  const alreadyEvaluated = await hasTicketFeedback(currentTicket.id);
  if (alreadyEvaluated) {
    throw new HttpError(409, "Este atendimento já foi avaliado");
  }

  const { data, error } = await admin
    .from("tickets")
    .update({
      status: "aberto",
      resolved_at: null,
      closed_at: null,
      service_started_at: null,
      service_finished_at: null,
    })
    .eq("id", ticketId)
    .select(ticketSelect)
    .single();

  if (error || !data) {
    throw new HttpError(400, error?.message || "Não foi possível reabrir o ticket");
  }

  const ticket = data as TicketRecord;
  const reopenMessage = reason
    ? `Solicitante informou que a solicitação não foi resolvida e reabriu o ticket. Motivo: ${reason}`
    : "Solicitante informou que a solicitação não foi resolvida e reabriu o ticket.";

  const { error: interactionError } = await admin.from("interactions").insert({
    ticket_id: ticketId,
    autor_id: context.user.id,
    mensagem: reopenMessage,
    tipo: "mudanca_status",
  });

  if (interactionError) {
    console.error("[ticket-actions] Failed to create reopen interaction", interactionError);
  }

  const requester = await getTicketRequester(ticket);
  const departmentRecipients = await getDepartmentRecipients(ticket.tipo);

  await sendEmails(
    "status_updated",
    buildTicketPayload(ticket, requester, {
      newStatus: "aberto",
      actorName: context.profile.nome,
      messagePreview: reopenMessage,
    }),
    departmentRecipients,
  );

  return { ok: true, status: "aberto" as TicketStatus };
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
        case "start_service":
          return handleStartService(body.payload || {}, context);
        case "finish_service":
          return handleFinishService(body.payload || {}, context);
        case "reopen_ticket_from_feedback":
          return handleReopenTicketFromFeedback(body.payload || {}, context);
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
