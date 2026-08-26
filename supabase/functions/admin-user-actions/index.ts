import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = "solicitante" | "agente_ti" | "agente_manutencao" | "admin";

interface AdminContext {
  userId: string;
  role: AppRole;
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

const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const getAdminContext = async (authorization: string): Promise<AdminContext> => {
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    throw new HttpError(401, "Sessão inválida ou expirada");
  }

  const { data: roleData, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (roleError) {
    throw new HttpError(400, roleError.message);
  }

  const role = (roleData?.role || "solicitante") as AppRole;
  if (role !== "admin") {
    throw new HttpError(403, "Apenas administradores podem gerenciar usuários");
  }

  return { userId: userData.user.id, role };
};

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const getUserRole = async (userId: string): Promise<AppRole> => {
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new HttpError(400, error.message);
  }

  return (data?.role || "solicitante") as AppRole;
};

const ensureTargetExists = async (userId: string) => {
  const { data, error } = await admin
    .from("profiles")
    .select("id, active")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new HttpError(400, error.message);
  }

  if (!data) {
    throw new HttpError(404, "Usuário não encontrado");
  }

  return data as { id: string; active: boolean };
};

const ensureCanDeactivate = async (targetUserId: string, adminUserId: string) => {
  if (targetUserId === adminUserId) {
    throw new HttpError(400, "Você não pode desativar o próprio usuário");
  }

  const targetRole = await getUserRole(targetUserId);
  if (targetRole !== "admin") return;

  const { data: adminRoles, error: adminRolesError } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  if (adminRolesError) {
    throw new HttpError(400, adminRolesError.message);
  }

  const adminIds = (adminRoles || []).map((role) => role.user_id);
  if (!adminIds.length) {
    throw new HttpError(400, "Nenhum administrador encontrado");
  }

  const { data: activeAdmins, error: activeAdminsError } = await admin
    .from("profiles")
    .select("id")
    .in("id", adminIds)
    .eq("active", true);

  if (activeAdminsError) {
    throw new HttpError(400, activeAdminsError.message);
  }

  if ((activeAdmins || []).length <= 1) {
    throw new HttpError(400, "Não é permitido desativar o último administrador ativo");
  }
};

const handleUpdateProfile = async (payload: Record<string, unknown>) => {
  const userId = normalizeText(payload.userId);
  const nome = normalizeText(payload.nome);

  if (!userId) {
    throw new HttpError(400, "Usuário é obrigatório");
  }

  if (!nome) {
    throw new HttpError(400, "Nome é obrigatório");
  }

  await ensureTargetExists(userId);

  const updatePayload = {
    nome,
    telefone: normalizeText(payload.telefone) || null,
    funcao: normalizeText(payload.funcao) || null,
    setor: normalizeText(payload.setor) || null,
    num_anydesk: normalizeText(payload.num_anydesk) || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId)
    .select("id, nome, email, telefone, funcao, setor, num_anydesk, foto_perfil, created_at, active, deactivated_at")
    .single();

  if (error || !data) {
    throw new HttpError(400, error?.message || "Não foi possível atualizar o usuário");
  }

  return { user: data };
};

const handleDeactivateUser = async (
  payload: Record<string, unknown>,
  context: AdminContext,
) => {
  const userId = normalizeText(payload.userId);

  if (!userId) {
    throw new HttpError(400, "Usuário é obrigatório");
  }

  await ensureTargetExists(userId);
  await ensureCanDeactivate(userId, context.userId);

  const { data, error } = await admin
    .from("profiles")
    .update({
      active: false,
      deactivated_at: new Date().toISOString(),
      deactivated_by: context.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id, active, deactivated_at")
    .single();

  if (error || !data) {
    throw new HttpError(400, error?.message || "Não foi possível desativar o usuário");
  }

  const { error: managementError } = await admin
    .from("management_report_access")
    .delete()
    .eq("user_id", userId);

  if (managementError) {
    throw new HttpError(400, managementError.message);
  }

  return { user: data };
};

const handleReactivateUser = async (payload: Record<string, unknown>) => {
  const userId = normalizeText(payload.userId);

  if (!userId) {
    throw new HttpError(400, "Usuário é obrigatório");
  }

  await ensureTargetExists(userId);

  const { data, error } = await admin
    .from("profiles")
    .update({
      active: true,
      deactivated_at: null,
      deactivated_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id, active, deactivated_at")
    .single();

  if (error || !data) {
    throw new HttpError(400, error?.message || "Não foi possível reativar o usuário");
  }

  return { user: data };
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

    const context = await getAdminContext(authorization);
    const body = (await req.json()) as { action?: string; payload?: Record<string, unknown> };

    if (!body.action || !body.payload) {
      throw new HttpError(400, "Ação e dados são obrigatórios");
    }

    const result = await (async () => {
      switch (body.action) {
        case "update_profile":
          return handleUpdateProfile(body.payload || {});
        case "deactivate_user":
          return handleDeactivateUser(body.payload || {}, context);
        case "reactivate_user":
          return handleReactivateUser(body.payload || {});
        default:
          throw new HttpError(400, "Ação inválida");
      }
    })();

    return jsonResponse({ success: true, data: result });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[admin-user-actions] Error:", error);

    return jsonResponse({ success: false, error: message }, status);
  }
};

serve(handler);
