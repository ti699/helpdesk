import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CORPORATE_EMAIL_DOMAINS = [
  "astroturviagens.com",
  "grupoastrotur.com.br",
  "transastro.com.br",
];

const APP_ROLES = ["solicitante", "agente_ti", "agente_manutencao", "admin"] as const;
type AppRole = (typeof APP_ROLES)[number];

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const asAppRole = (value: string | null): AppRole | null => {
  const normalized = value?.toLowerCase();
  return APP_ROLES.find((role) => role === normalized) || null;
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

    if (!CORPORATE_EMAIL_DOMAINS.some((domain) => email.endsWith(`@${domain}`))) {
      return new Response(JSON.stringify({
        valid: false,
        message: "Acesso permitido somente com e-mail corporativo (@astroturviagens.com, @grupoastrotur.com.br ou @transastro.com.br).",
      }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRole) {
      return new Response(JSON.stringify({ valid: false, message: "Integração com o Supabase não configurada." }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const admin = createClient(supabaseUrl, serviceRole);
    const name = firstText(user.name, user.nome, user.full_name, user.fullName, hubData.name, hubData.nome);
    const sector = firstText(user.setor, user.sector, user.department, hubData.setor, hubData.sector, hubData.department);
    const position = firstText(
      user.funcao, user.cargo, user.position, user.job_title, user.title, user.role,
      hubData.funcao, hubData.cargo, hubData.position, hubData.job_title, hubData.title, hubData.role,
    );
    const hubRole = firstText(
      user.app_role, user.helpdesk_role, user.user_role, user.role,
      hubData.app_role, hubData.helpdesk_role, hubData.user_role, hubData.role,
    );

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { 
        shouldCreateUser: true,
        data: {
          nome: name || email.split("@")[0],
          setor: sector,
          funcao: position,
        },
      },
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("Falha ao gerar sessão Supabase:", linkError?.message);
      return new Response(JSON.stringify({
        valid: false,
        message: linkError?.message || "Falha ao gerar o token de acesso no HelpDesk.",
      }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const userId = linkData.user?.id;
    if (!userId) {
      console.error("Supabase não retornou o usuário associado ao link SSO.");
      return new Response(JSON.stringify({
        valid: false,
        message: "Não foi possível identificar o usuário do Helpdesk.",
      }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const [
      { data: existingProfile, error: profileReadError },
      { data: existingRole, error: roleReadError },
    ] = await Promise.all([
      admin.from("profiles").select("nome, setor, funcao, active").eq("id", userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    ]);

    if (profileReadError || roleReadError) {
      const error = profileReadError || roleReadError;
      console.error("Falha ao consultar perfil do usuário SSO:", error.message);
      return new Response(JSON.stringify({
        valid: false,
        message: "Não foi possível carregar o perfil do usuário no Helpdesk.",
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { error: profileUpsertError } = await admin.from("profiles").upsert({
      id: userId,
      email,
      nome: name || existingProfile?.nome || email.split("@")[0],
      setor: sector || existingProfile?.setor || null,
      funcao: position || existingProfile?.funcao || null,
      active: existingProfile?.active ?? true,
    }, { onConflict: "id" });

    if (profileUpsertError) {
      console.error("Falha ao atualizar perfil do usuário SSO:", profileUpsertError.message);
      return new Response(JSON.stringify({
        valid: false,
        message: "Não foi possível atualizar o perfil do usuário no Helpdesk.",
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const role = asAppRole(hubRole) || existingRole?.role || "solicitante";
    const { error: roleUpsertError } = await admin.from("user_roles").upsert({
      user_id: userId,
      role,
    }, { onConflict: "user_id" });

    if (roleUpsertError) {
      console.error("Falha ao atualizar role do usuário SSO:", roleUpsertError.message);
      return new Response(JSON.stringify({
        valid: false,
        message: "Não foi possível atualizar o acesso do usuário no Helpdesk.",
      }), {
        status: 500,
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