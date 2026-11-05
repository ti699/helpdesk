import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ valid: false, message: "Método não permitido." }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const hubUrl = (Deno.env.get("SSO_HUB_URL") || "").trim().replace(/\/+$/, "");
    const clientSecret = (Deno.env.get("SSO_CLIENT_SECRET") || "").trim();

    // Log de diagnóstico no Dashboard do Supabase
    console.log(`[DEBUG SSO] Secret lida: "${clientSecret.substring(0, 8)}..." | Tamanho: ${clientSecret.length}`);

    if (!hubUrl || !clientSecret) {
      return new Response(JSON.stringify({ valid: false, message: "Integração SSO não configurada." }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = await request.json();
    const ticket = String(body.ticket || "").trim();
    if (!ticket) {
      return new Response(JSON.stringify({ valid: false, message: "Ticket SSO obrigatório." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const response = await fetch(`${hubUrl}/api/sso/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const hubData = await response.json().catch(() => null);
    console.log(`[DEBUG SSO] Resposta do Hub (HTTP ${response.status}):`, JSON.stringify(hubData));

    if (!response.ok || hubData?.valid !== true) {
      const message = hubData?.message || "Credenciais inválidas.";
      return new Response(JSON.stringify({ valid: false, message }), {
        status: response.status === 401 ? 401 : 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const user = hubData.user || hubData;
    const email = String(user.email || hubData.email || "").trim().toLowerCase();
    if (!email) {
      return new Response(JSON.stringify({ valid: false, message: "O Hub não retornou o email do usuário." }), {
        status: 422,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const admin = createClient(supabaseUrl, serviceRole);

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { shouldCreateUser: false },
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("Falha ao gerar sessão Supabase:", linkError?.message);
      return new Response(JSON.stringify({
        valid: false,
        message: "Usuário não autorizado ou ausente no Help Desk.",
      }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      valid: true,
      email,
      token_hash: linkData.properties.hashed_token,
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("sso-validate", error);
    return new Response(JSON.stringify({ valid: false, message: "Falha ao validar o SSO." }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});