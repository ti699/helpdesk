import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import {
  getEmailTemplate,
  NotificationType,
  TicketEmailPayload,
} from "../_shared/ticket-email-templates.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: NotificationType;
  ticket: TicketEmailPayload;
  recipient: {
    email: string;
    name: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Método não permitido" }),
        { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const body = (await req.json()) as NotificationRequest;
    const { type, ticket, recipient } = body;

    if (!type || !ticket || !recipient) {
      return new Response(
        JSON.stringify({ success: false, error: "Campos obrigatórios faltando (type, ticket, recipient)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (!recipient.email) {
      return new Response(
        JSON.stringify({ success: false, error: "Email do destinatário não informado" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { subject, html } = getEmailTemplate(type, ticket, recipient.name);
    const emailResponse = await resend.emails.send({
      from: "Help Desk Astrotur <onboarding@resend.dev>",
      to: [recipient.email.trim().toLowerCase()],
      subject,
      html,
    });

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[send-notification] Error:", error);

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
};

serve(handler);
