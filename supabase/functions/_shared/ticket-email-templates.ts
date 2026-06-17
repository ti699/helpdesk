export type NotificationType =
  | "ticket_created"
  | "new_ticket_alert"
  | "status_updated"
  | "feedback_request"
  | "ticket_activity"
  | "ticket_closed";

export interface TicketEmailPayload {
  id: string;
  protocolo: string;
  titulo: string;
  descricao?: string;
  newStatus?: string;
  prioridade?: string | null;
  solicitante?: string | null;
  solicitante_email?: string | null;
  solicitante_telefone?: string | null;
  solicitante_anydesk?: string | null;
  actorName?: string | null;
  messagePreview?: string | null;
}

const escapeHtml = (value?: string | null) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const getStatusLabel = (status?: string | null) => {
  const statusLabels: Record<string, string> = {
    aberto: "Aberto",
    em_andamento: "Em Andamento",
    aguardando_resposta: "Aguardando Resposta",
    resolvido: "Resolvido",
    fechado: "Fechado",
  };

  if (!status) return "Atualizado";
  return statusLabels[status] || status;
};

const getAppUrl = () => {
  const configuredUrl = Deno.env.get("APP_URL");
  const fallbackUrl =
    Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") ||
    "https://app.lovable.app";

  return (configuredUrl || fallbackUrl).replace(/\/$/, "");
};

export const getEmailTemplate = (
  type: NotificationType,
  ticket: TicketEmailPayload,
  recipientName: string,
): { subject: string; html: string } => {
  const ticketUrl = `${getAppUrl()}/ticket/${ticket.id}`;
  const feedbackUrl = `${ticketUrl}?avaliar=1`;
  const safeRecipientName = escapeHtml(recipientName);
  const safeTitle = escapeHtml(ticket.titulo);
  const safeProtocol = escapeHtml(ticket.protocolo);
  const safeActorName = escapeHtml(ticket.actorName);
  const safeStatusLabel = escapeHtml(getStatusLabel(ticket.newStatus));
  const safeDescription = escapeHtml(ticket.descricao);
  const safeMessagePreview = escapeHtml(ticket.messagePreview);

  const headerStyle = `
    background: linear-gradient(135deg, #D32F2F 0%, #B71C1C 100%);
    padding: 30px;
    text-align: center;
  `;

  const containerStyle = `
    max-width: 600px;
    margin: 0 auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background-color: #ffffff;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  `;

  const buttonStyle = `
    display: inline-block;
    background-color: #D32F2F;
    color: #ffffff;
    text-decoration: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-weight: 600;
    margin-top: 20px;
  `;

  const footerStyle = `
    background-color: #f5f5f5;
    padding: 20px;
    text-align: center;
    color: #6B6B6B;
    font-size: 12px;
  `;

  const ticketSummary = `
    <div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <p style="margin: 5px 0; color: #333;"><strong>Protocolo:</strong> ${safeProtocol}</p>
      <p style="margin: 5px 0; color: #333;"><strong>Título:</strong> ${safeTitle}</p>
    </div>
  `;

  const footer = `
    <div style="${footerStyle}">
      <p style="margin: 0;">© ${new Date().getFullYear()} Grupo Astrotur - Todos os direitos reservados</p>
      <p style="margin: 5px 0 0 0;">Este é um email automático, por favor não responda.</p>
    </div>
  `;

  switch (type) {
    case "ticket_created":
      return {
        subject: `Ticket #${ticket.protocolo} criado com sucesso`,
        html: `
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Help Desk - Grupo Astrotur</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Olá, ${safeRecipientName}!</h2>
              <p style="color: #666; line-height: 1.6;">
                Seu ticket de suporte foi criado com sucesso. Nossa equipe irá analisar sua solicitação em breve.
              </p>
              ${ticketSummary}
              <p style="color: #666; line-height: 1.6;">
                Você pode acompanhar o status do seu ticket a qualquer momento clicando no botão abaixo:
              </p>
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Ver Ticket</a>
              </div>
            </div>
            ${footer}
          </div>
        `,
      };

    case "new_ticket_alert": {
      const priorityLabels: Record<string, string> = {
        baixa: "Baixa (Tranquila)",
        media: "Média",
        alta: "Alta (Urgente)",
        critica: "Crítica (Interrupção)",
      };
      const priorityColors: Record<string, string> = {
        baixa: "#4CAF50",
        media: "#FFC107",
        alta: "#FF9800",
        critica: "#F44336",
      };
      const priorityKey = ticket.prioridade || "media";
      const priorityLabel = priorityLabels[priorityKey] || "Média";
      const priorityColor = priorityColors[priorityKey] || "#FFC107";

      return {
        subject: `NOVO CHAMADO - Prioridade: ${priorityLabel} - ${ticket.titulo}`,
        html: `
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">ALERTA - GRUPO ASTROTUR</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Novo Chamado Aberto: ${safeTitle}</h2>
              <p style="color: #666; line-height: 1.6;">
                Olá, ${safeRecipientName}! Um novo chamado foi aberto para o seu setor.
              </p>
              <div style="background-color: #fff3e0; border-left: 4px solid ${priorityColor}; padding: 15px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Protocolo:</strong> ${safeProtocol}</p>
                <p style="margin: 5px 0; color: #333;">
                  <strong>Prioridade:</strong>
                  <span style="color: #ffffff; background-color: ${priorityColor}; padding: 3px 8px; border-radius: 4px; font-weight: bold;">
                    ${escapeHtml(priorityLabel)}
                  </span>
                </p>
              </div>
              <h3 style="color: #333; margin-top: 30px; margin-bottom: 10px;">Dados de Contato do Solicitante</h3>
              <div style="background-color: #f9f9f9; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Nome:</strong> ${escapeHtml(ticket.solicitante) || "Não informado"}</p>
                <p style="margin: 5px 0; color: #333;"><strong>E-mail:</strong> ${escapeHtml(ticket.solicitante_email) || "Não informado"}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Telefone:</strong> ${escapeHtml(ticket.solicitante_telefone) || "Não informado"}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Número AnyDesk:</strong> ${escapeHtml(ticket.solicitante_anydesk) || "Não informado"}</p>
              </div>
              ${ticket.descricao ? `
                <h3 style="color: #333; margin-top: 30px; margin-bottom: 10px;">Descrição do Chamado</h3>
                <div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0; color: #666; white-space: pre-wrap;">${safeDescription.substring(0, 300)}${safeDescription.length > 300 ? "..." : ""}</p>
                </div>
              ` : ""}
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Visualizar e Atender Chamado</a>
              </div>
            </div>
            ${footer}
          </div>
        `,
      };
    }

    case "status_updated":
      return {
        subject: `Ticket #${ticket.protocolo} - Status atualizado para ${getStatusLabel(ticket.newStatus)}`,
        html: `
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Help Desk - Grupo Astrotur</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Atualização do Ticket</h2>
              <p style="color: #666; line-height: 1.6;">
                Olá, ${safeRecipientName}! O status do ticket foi atualizado.
              </p>
              <div style="background-color: #e3f2fd; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                <p style="margin: 0 0 10px 0; color: #333; font-size: 14px;">Novo Status:</p>
                <p style="margin: 0; color: #1976d2; font-size: 20px; font-weight: 600;">${safeStatusLabel}</p>
              </div>
              ${ticketSummary}
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Ver Ticket</a>
              </div>
            </div>
            ${footer}
          </div>
        `,
      };

    case "feedback_request":
      return {
        subject: `Avalie o atendimento - Ticket #${ticket.protocolo}`,
        html: `
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Help Desk - Grupo Astrotur</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Seu Ticket foi Resolvido!</h2>
              <p style="color: #666; line-height: 1.6;">
                Olá, ${safeRecipientName}! Seu ticket de suporte foi marcado como resolvido.
              </p>
              <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                <p style="margin: 0; color: #2e7d32; font-size: 18px;">Ticket Resolvido</p>
              </div>
              ${ticketSummary}
              <p style="color: #666; line-height: 1.6;">
                <strong>Sua opinião é muito importante!</strong> Por favor, avalie o atendimento para que possamos continuar melhorando nossos serviços.
              </p>
              <div style="text-align: center;">
                <a href="${feedbackUrl}" style="${buttonStyle}">Avaliar Atendimento</a>
              </div>
            </div>
            ${footer}
          </div>
        `,
      };

    case "ticket_activity":
      return {
        subject: `Movimentação no ticket #${ticket.protocolo}`,
        html: `
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Help Desk - Grupo Astrotur</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Nova movimentação no ticket</h2>
              <p style="color: #666; line-height: 1.6;">
                Olá, ${safeRecipientName}! Houve uma atualização no ticket abaixo.
              </p>
              <div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Protocolo:</strong> ${safeProtocol}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Título:</strong> ${safeTitle}</p>
                ${ticket.actorName ? `<p style="margin: 5px 0; color: #333;"><strong>Atualizado por:</strong> ${safeActorName}</p>` : ""}
                ${ticket.newStatus ? `<p style="margin: 5px 0; color: #333;"><strong>Novo status:</strong> ${safeStatusLabel}</p>` : ""}
              </div>
              ${ticket.messagePreview ? `
                <div style="background-color: #fff8e1; border-radius: 8px; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0 0 8px 0; color: #333;"><strong>Mensagem:</strong></p>
                  <p style="margin: 0; color: #666; white-space: pre-wrap;">${safeMessagePreview.substring(0, 300)}${safeMessagePreview.length > 300 ? "..." : ""}</p>
                </div>
              ` : ""}
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Acompanhar Ticket</a>
              </div>
            </div>
            ${footer}
          </div>
        `,
      };

    case "ticket_closed":
      return {
        subject: `Ticket #${ticket.protocolo} finalizado`,
        html: `
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Help Desk - Grupo Astrotur</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Ticket finalizado</h2>
              <p style="color: #666; line-height: 1.6;">
                Olá, ${safeRecipientName}! O ticket abaixo foi encerrado no Help Desk.
              </p>
              <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Protocolo:</strong> ${safeProtocol}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Título:</strong> ${safeTitle}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Status final:</strong> ${safeStatusLabel}</p>
                ${ticket.actorName ? `<p style="margin: 5px 0; color: #333;"><strong>Finalizado por:</strong> ${safeActorName}</p>` : ""}
              </div>
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Ver Ticket</a>
              </div>
            </div>
            ${footer}
          </div>
        `,
      };

    default:
      return {
        subject: "Notificação - Help Desk",
        html: "<p>Notificação do Help Desk</p>",
      };
  }
};
