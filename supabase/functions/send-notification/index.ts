import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type NotificationType = 
  | "ticket_created" 
  | "new_ticket_alert" 
  | "status_updated" 
  | "feedback_request";

interface NotificationRequest {
  type: NotificationType;
  ticket: {
    id: string;
    protocolo: string;
    titulo: string;
    descricao?: string;
    newStatus?: string;
    prioridade?: string;
    solicitante?: string;
    solicitante_email?: string;
    solicitante_telefone?: string;
    solicitante_anydesk?: string;
  };
  recipient: {
    email: string;
    name: string;
  };
}

// Email templates with Grupo Astrotur branding
const getEmailTemplate = (type: NotificationType, ticket: NotificationRequest["ticket"], recipientName: string): { subject: string; html: string } => {
  const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") || "https://app.lovable.app";
  const ticketUrl = `${baseUrl}/ticket/${ticket.id}`;
  
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
              <h2 style="color: #333; margin-top: 0;">Olá, ${recipientName}!</h2>
              <p style="color: #666; line-height: 1.6;">
                Seu ticket de suporte foi criado com sucesso. Nossa equipe de TI irá analisar sua solicitação em breve.
              </p>
              <div style="background-color: #f9f9f9; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Protocolo:</strong> ${ticket.protocolo}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Título:</strong> ${ticket.titulo}</p>
              </div>
              <p style="color: #666; line-height: 1.6;">
                Você pode acompanhar o status do seu ticket a qualquer momento clicando no botão abaixo:
              </p>
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Ver Ticket</a>
              </div>
            </div>
            <div style="${footerStyle}">
              <p style="margin: 0;">© ${new Date().getFullYear()} Grupo Astrotur - Todos os direitos reservados</p>
              <p style="margin: 5px 0 0 0;">Este é um email automático, por favor não responda.</p>
            </div>
          </div>
        `,
      };

    case "new_ticket_alert":
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
      const priorityKey = (ticket.prioridade || 'media') as string;
      const priorityLabel = priorityLabels[priorityKey] || "Média";
      const priorityColor = priorityColors[priorityKey] || "#FFC107";

      return {
        subject: `🔔 NOVO CHAMADO - Prioridade: ${priorityLabel} - ${ticket.titulo}`,
        html: `
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">ALERTA TI - GRUPO ASTROTUR</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Novo Chamado Aberto: ${ticket.titulo}</h2>
              <p style="color: #666; line-height: 1.6;">
                Olá, ${recipientName}! Um novo chamado de suporte foi aberto e exige sua atenção imediata.
              </p>
              <div style="background-color: #fff3e0; border-left: 4px solid ${priorityColor}; padding: 15px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Protocolo:</strong> ${ticket.protocolo}</p>
                <p style="margin: 5px 0; color: #333;">
                  <strong>Prioridade:</strong> 
                  <span style="color: #ffffff; background-color: ${priorityColor}; padding: 3px 8px; border-radius: 4px; font-weight: bold;">
                    ${priorityLabel}
                  </span>
                </p>
              </div>
              <h3 style="color: #333; margin-top: 30px; margin-bottom: 10px;">Dados de Contato do Solicitante</h3>
              <div style="background-color: #f9f9f9; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Nome:</strong> ${ticket.solicitante || "Não informado"}</p>
                <p style="margin: 5px 0; color: #333;"><strong>E-mail:</strong> ${ticket.solicitante_email || "Não informado"}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Telefone:</strong> ${ticket.solicitante_telefone || "Não informado"}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Número AnyDesk:</strong> ${ticket.solicitante_anydesk || "Não informado"}</p>
              </div>
              ${ticket.descricao ? `
                <h3 style="color: #333; margin-top: 30px; margin-bottom: 10px;">Descrição do Chamado</h3>
                <div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0; color: #666; white-space: pre-wrap;">${ticket.descricao.substring(0, 300)}${ticket.descricao.length > 300 ? "..." : ""}</p>
                </div>
              ` : ""}
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Visualizar e Atender Chamado</a>
              </div>
            </div>
            <div style="${footerStyle}">
              <p style="margin: 0;">© ${new Date().getFullYear()} Grupo Astrotur - Todos os direitos reservados</p>
            </div>
          </div>
        `,
      };

    case "status_updated":
      const statusLabels: Record<string, string> = {
        aberto: "Aberto",
        em_andamento: "Em Andamento",
        aguardando_resposta: "Aguardando Resposta",
        resolvido: "Resolvido",
        fechado: "Fechado",
      };
      const statusLabel = statusLabels[ticket.newStatus || ""] || ticket.newStatus;
      
      return {
        subject: `Ticket #${ticket.protocolo} - Status atualizado para ${statusLabel}`,
        html: `
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Help Desk - Grupo Astrotur</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Atualização do seu Ticket</h2>
              <p style="color: #666; line-height: 1.6;">
                Olá, ${recipientName}! O status do seu ticket foi atualizado.
              </p>
              <div style="background-color: #e3f2fd; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                <p style="margin: 0 0 10px 0; color: #333; font-size: 14px;">Novo Status:</p>
                <p style="margin: 0; color: #1976d2; font-size: 20px; font-weight: 600;">${statusLabel}</p>
              </div>
              <div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Protocolo:</strong> ${ticket.protocolo}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Título:</strong> ${ticket.titulo}</p>
              </div>
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Ver Ticket</a>
              </div>
            </div>
            <div style="${footerStyle}">
              <p style="margin: 0;">© ${new Date().getFullYear()} Grupo Astrotur - Todos os direitos reservados</p>
              <p style="margin: 5px 0 0 0;">Este é um email automático, por favor não responda.</p>
            </div>
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
              <h2 style="color: #333; margin-top: 0;">Seu Ticket foi Resolvido! 🎉</h2>
              <p style="color: #666; line-height: 1.6;">
                Olá, ${recipientName}! Seu ticket de suporte foi marcado como resolvido.
              </p>
              <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                <p style="margin: 0; color: #2e7d32; font-size: 18px;">✅ Ticket Resolvido</p>
              </div>
              <div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Protocolo:</strong> ${ticket.protocolo}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Título:</strong> ${ticket.titulo}</p>
              </div>
              <p style="color: #666; line-height: 1.6;">
                <strong>Sua opinião é muito importante!</strong> Por favor, avalie o atendimento para que possamos continuar melhorando nossos serviços.
              </p>
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Avaliar Atendimento</a>
              </div>
            </div>
            <div style="${footerStyle}">
              <p style="margin: 0;">© ${new Date().getFullYear()} Grupo Astrotur - Todos os direitos reservados</p>
              <p style="margin: 5px 0 0 0;">Obrigado por utilizar nosso Help Desk!</p>
            </div>
          </div>
        `,
      };

    default:
      return {
        subject: `Notificação - Help Desk`,
        html: `<p>Notificação do Help Desk</p>`,
      };
  }
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verificar se o método é POST
    if (req.method !== "POST") {
      console.log(`[send-notification] Method not allowed: ${req.method}`);
      return new Response(
        JSON.stringify({ success: false, error: "Método não permitido" }),
        { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verificar Content-Type
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.log(`[send-notification] Invalid content-type: ${contentType}`);
      return new Response(
        JSON.stringify({ success: false, error: "Content-Type inválido" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Ler o corpo como texto primeiro para validar
    const bodyText = await req.text();
    
    if (!bodyText || bodyText.trim() === '') {
      console.log("[send-notification] Empty body received");
      return new Response(
        JSON.stringify({ success: false, error: "Corpo da requisição vazio" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Tentar fazer parse do JSON
    let body: NotificationRequest;
    try {
      body = JSON.parse(bodyText);
    } catch (parseError) {
      console.error("[send-notification] JSON parse error:", parseError);
      return new Response(
        JSON.stringify({ success: false, error: "JSON inválido" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { type, ticket, recipient } = body;

    // Validar campos obrigatórios
    if (!type || !ticket || !recipient) {
      console.log("[send-notification] Missing required fields:", { type: !!type, ticket: !!ticket, recipient: !!recipient });
      return new Response(
        JSON.stringify({ success: false, error: "Campos obrigatórios faltando (type, ticket, recipient)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!recipient.email) {
      console.log("[send-notification] Missing recipient email");
      return new Response(
        JSON.stringify({ success: false, error: "Email do destinatário não informado" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[send-notification] Sending ${type} email to ${recipient.email}`);
    console.log(`[send-notification] Ticket info:`, JSON.stringify(ticket));

    const { subject, html } = getEmailTemplate(type, ticket, recipient.name);

    const emailResponse = await resend.emails.send({
      from: "Help Desk Astrotur <onboarding@resend.dev>",
      to: [recipient.email],
      subject,
      html,
    });

    console.log("[send-notification] Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[send-notification] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
