import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = "solicitante" | "agente_ti" | "agente_manutencao" | "admin";
type AssetAccess = "consulta" | "operador" | "gestor";
type MovementStatus = "pendente" | "aprovada" | "concluida" | "cancelada";

interface RequestContext {
  userId: string;
  role: AppRole;
  access: AssetAccess | null;
  profile: { id: string; nome: string; email: string; setor: string | null };
  userClient: SupabaseClient;
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
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const appUrl = Deno.env.get("APP_URL") || "https://astrotur-helpdesk.vercel.app";
const emailFrom = Deno.env.get("EMAIL_FROM") || "Help Desk Astrotur <notificacoes@helpdesk.astroturviagens.com>";
const resendKey = Deno.env.get("RESEND_API_KEY");
const resend = resendKey ? new Resend(resendKey) : null;
const admin = createClient(supabaseUrl, serviceRoleKey);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const text = (value: unknown, max = 500) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const nullableText = (value: unknown, max = 500) => {
  const normalized = text(value, max);
  return normalized || null;
};

const nullableUuid = (value: unknown) => {
  const normalized = text(value, 50);
  return normalized || null;
};

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[character] || character));

const nullableMoney = (value: unknown) => {
  if (value === "" || value == null) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new HttpError(400, "Valor de aquisição inválido");
  return amount;
};

const getContext = async (authorization: string): Promise<RequestContext> => {
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) throw new HttpError(401, "Sessão inválida ou expirada");

  const userId = authData.user.id;
  const [{ data: roleRow }, { data: accessRow }, { data: profile }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    admin.from("asset_module_access").select("access_level").eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("id, nome, email, setor, active").eq("id", userId).maybeSingle(),
  ]);
  if (!profile || profile.active === false) throw new HttpError(403, "Usuário sem acesso ativo");

  const role = (roleRow?.role || "solicitante") as AppRole;
  return {
    userId,
    role,
    access: role === "admin" ? "gestor" : (accessRow?.access_level as AssetAccess | undefined) || null,
    profile,
    userClient,
  };
};

const requireAccess = (context: RequestContext) => {
  if (!context.access) throw new HttpError(403, "Sem acesso ao módulo de patrimônio");
};

const requireOperator = (context: RequestContext) => {
  if (!context.access || context.access === "consulta") {
    throw new HttpError(403, "Permissão de operador ou gestor necessária");
  }
};

const requireManager = (context: RequestContext) => {
  if (context.access !== "gestor") throw new HttpError(403, "Permissão de gestor necessária");
};

const sendEmail = async (to: string, subject: string, title: string, message: string, href: string) => {
  if (!resend || !to) return;
  try {
    await resend.emails.send({
      from: emailFrom,
      to: [to],
      subject: text(subject, 180),
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#172033">
        <div style="background:#c92026;color:#fff;padding:24px;text-align:center"><h1 style="margin:0;font-size:24px">Help Desk - Grupo Astrotur</h1></div>
        <div style="padding:28px"><h2>${escapeHtml(title)}</h2><p style="line-height:1.6">${escapeHtml(message)}</p>
        <a href="${escapeHtml(href)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px">Ver patrimônio</a></div>
      </div>`,
    });
  } catch (error) {
    console.error("Asset email failed", error);
  }
};

const notifyUsers = async (userIds: string[], title: string, message: string, assetId: string) => {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  await admin.from("notifications").insert(uniqueIds.map((userId) => ({
    user_id: userId,
    tipo: "patrimonio",
    titulo: title,
    mensagem: message,
    ticket_id: null,
  })));
  const { data: profiles } = await admin.from("profiles").select("id, email").in("id", uniqueIds);
  await Promise.all((profiles || []).map((profile) => sendEmail(
    profile.email,
    title,
    title,
    message,
    `${appUrl}/patrimonio/${assetId}`,
  )));
};

const assetPayload = (payload: Record<string, unknown>, context: RequestContext) => ({
  asset_code: text(payload.assetCode, 80),
  name: text(payload.name, 160),
  description: nullableText(payload.description, 2000),
  category_id: nullableUuid(payload.categoryId),
  brand: nullableText(payload.brand, 120),
  model: nullableText(payload.model, 120),
  serial_number: nullableText(payload.serialNumber, 160),
  invoice_number: nullableText(payload.invoiceNumber, 120),
  purchase_date: nullableText(payload.purchaseDate, 10),
  purchase_value: nullableMoney(payload.purchaseValue),
  warranty_until: nullableText(payload.warrantyUntil, 10),
  department: nullableText(payload.department, 120),
  location_id: nullableUuid(payload.locationId),
  responsible_user_id: nullableUuid(payload.responsibleUserId),
  responsible_name: nullableText(payload.responsibleName, 160),
  status_id: nullableUuid(payload.statusId),
  notes: nullableText(payload.notes, 3000),
  updated_by: context.userId,
});

const getAsset = async (assetId: string) => {
  const { data, error } = await admin.from("assets").select("*").eq("id", assetId).maybeSingle();
  if (error) throw new HttpError(400, error.message);
  if (!data) throw new HttpError(404, "Patrimônio não encontrado");
  return data;
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
    const authorization = req.headers.get("Authorization") || "";
    const context = await getContext(authorization);
    const body = await req.json();
    const action = text(body?.action, 80);
    const payload = (body?.payload || {}) as Record<string, unknown>;

    if (action === "create_asset") {
      requireOperator(context);
      const values = assetPayload(payload, context);
      if (!values.asset_code || !values.name) throw new HttpError(400, "Código e nome são obrigatórios");
      if (!values.status_id) {
        const { data: defaultStatus } = await admin.from("asset_statuses").select("id").eq("is_default", true).single();
        values.status_id = defaultStatus?.id || null;
      }
      const { data, error } = await admin.from("assets").insert({ ...values, created_by: context.userId }).select("id, asset_code").single();
      if (error?.code === "23505") throw new HttpError(409, "Já existe patrimônio com este código");
      if (error) throw new HttpError(400, error.message);
      return jsonResponse({ success: true, data: { asset: data } });
    }

    if (action === "update_asset") {
      requireOperator(context);
      const assetId = text(payload.assetId, 50);
      await getAsset(assetId);
      const values = assetPayload(payload, context);
      if (!values.asset_code || !values.name) throw new HttpError(400, "Código e nome são obrigatórios");
      const { data, error } = await admin.from("assets").update(values).eq("id", assetId).select("id, asset_code").single();
      if (error?.code === "23505") throw new HttpError(409, "Já existe patrimônio com este código");
      if (error) throw new HttpError(400, error.message);
      return jsonResponse({ success: true, data: { asset: data } });
    }

    if (action === "deactivate_asset") {
      requireOperator(context);
      const assetId = text(payload.assetId, 50);
      const { data, error } = await admin.from("assets").update({ active: false, updated_by: context.userId }).eq("id", assetId).select("id").single();
      if (error) throw new HttpError(400, error.message);
      return jsonResponse({ success: true, data: { asset: data } });
    }

    if (action === "create_movement") {
      requireOperator(context);
      const assetId = text(payload.assetId, 50);
      const asset = await getAsset(assetId);
      const reason = text(payload.reason, 1000);
      if (!reason) throw new HttpError(400, "Informe o motivo da movimentação");
      const { data, error } = await admin.from("asset_movements").insert({
        asset_id: assetId,
        movement_type: text(payload.movementType, 60),
        from_snapshot: asset,
        to_responsible_user_id: nullableUuid(payload.toResponsibleUserId),
        to_responsible_name: nullableText(payload.toResponsibleName, 160),
        to_department: nullableText(payload.toDepartment, 120),
        to_location_id: nullableUuid(payload.toLocationId),
        to_status_id: nullableUuid(payload.toStatusId),
        reason,
        notes: nullableText(payload.notes, 2000),
        requested_by: context.userId,
      }).select("*").single();
      if (error) throw new HttpError(400, error.message);
      const [{ data: managers }, { data: admins }] = await Promise.all([
        admin.from("asset_module_access").select("user_id").eq("access_level", "gestor"),
        admin.from("user_roles").select("user_id").eq("role", "admin"),
      ]);
      await notifyUsers(
        [...(managers || []), ...(admins || [])].map((row) => row.user_id),
        "Movimentação patrimonial pendente",
        `${context.profile.nome} solicitou uma movimentação do patrimônio ${asset.asset_code}.`,
        assetId,
      );
      return jsonResponse({ success: true, data: { movement: data } });
    }

    if (action === "approve_movement") {
      requireManager(context);
      const movementId = text(payload.movementId, 50);
      const { data, error } = await context.userClient.rpc("approve_asset_movement", { _movement_id: movementId });
      if (error) throw new HttpError(400, error.message);
      await notifyUsers([data.requested_by, data.to_responsible_user_id], "Movimentação patrimonial concluída", "A movimentação foi aprovada e aplicada ao patrimônio.", data.asset_id);
      return jsonResponse({ success: true, data: { movement: data } });
    }

    if (action === "cancel_movement") {
      requireAccess(context);
      const movementId = text(payload.movementId, 50);
      const { data: existing } = await admin.from("asset_movements").select("*").eq("id", movementId).maybeSingle();
      if (!existing) throw new HttpError(404, "Movimentação não encontrada");
      if (existing.status !== "pendente") throw new HttpError(400, "Somente movimentações pendentes podem ser canceladas");
      if (existing.requested_by !== context.userId && context.access !== "gestor") throw new HttpError(403, "Sem permissão para cancelar");
      const { data, error } = await admin.from("asset_movements").update({ status: "cancelada" as MovementStatus, cancelled_at: new Date().toISOString() }).eq("id", movementId).select("*").single();
      if (error) throw new HttpError(400, error.message);
      return jsonResponse({ success: true, data: { movement: data } });
    }

    if (action === "import_assets") {
      requireManager(context);
      const fileName = text(payload.fileName, 240) || "importacao.csv";
      const rows = Array.isArray(payload.rows) ? payload.rows.slice(0, 2000) as Record<string, unknown>[] : [];
      if (!rows.length) throw new HttpError(400, "Nenhuma linha válida para importar");
      const [{ data: categories }, { data: statuses }, { data: locations }, { data: existingAssets }] = await Promise.all([
        admin.from("asset_categories").select("id, name"),
        admin.from("asset_statuses").select("id, name, is_default"),
        admin.from("asset_locations").select("id, name"),
        admin.from("assets").select("asset_code"),
      ]);
      const normalized = (value: unknown) => text(value, 200).toLocaleLowerCase("pt-BR");
      const categoryMap = new Map((categories || []).map((row) => [normalized(row.name), row.id]));
      const statusMap = new Map((statuses || []).map((row) => [normalized(row.name), row.id]));
      const locationMap = new Map((locations || []).map((row) => [normalized(row.name), row.id]));
      const defaultStatusId = (statuses || []).find((row) => row.is_default)?.id || null;
      const codes = new Set((existingAssets || []).map((row) => normalized(row.asset_code)));
      const seen = new Set<string>();
      const valid: Record<string, unknown>[] = [];
      const errors: { row_number: number; message: string; raw_data: Record<string, unknown> }[] = [];

      rows.forEach((row, index) => {
        const code = text(row.asset_code || row.codigo || row.patrimonio, 80);
        const name = text(row.name || row.nome || row.item || row.tipo, 160);
        const codeKey = normalized(code);
        const messages: string[] = [];
        if (!code) messages.push("código obrigatório");
        if (!name) messages.push("nome obrigatório");
        if (codeKey && (codes.has(codeKey) || seen.has(codeKey))) messages.push("código duplicado");
        const categoryName = text(row.category || row.categoria, 120);
        const statusName = text(row.status, 120);
        const locationName = text(row.location || row.localizacao || row.local, 120);
        const rawPurchaseValue = row.purchase_value || row.valor;
        const purchaseValueText = String(rawPurchaseValue || "").trim();
        const purchaseValue = purchaseValueText
          ? Number(purchaseValueText.includes(",") ? purchaseValueText.replace(/\./g, "").replace(",", ".") : purchaseValueText)
          : null;
        if (categoryName && !categoryMap.has(normalized(categoryName))) messages.push(`categoria não cadastrada: ${categoryName}`);
        if (statusName && !statusMap.has(normalized(statusName))) messages.push(`status não cadastrado: ${statusName}`);
        if (locationName && !locationMap.has(normalized(locationName))) messages.push(`localização não cadastrada: ${locationName}`);
        if (purchaseValue !== null && (!Number.isFinite(purchaseValue) || purchaseValue < 0)) messages.push("valor de aquisição inválido");
        if (messages.length) {
          errors.push({ row_number: index + 2, message: messages.join("; "), raw_data: row });
          return;
        }
        seen.add(codeKey);
        valid.push({
          asset_code: code,
          name,
          description: nullableText(row.description || row.descricao, 2000),
          category_id: categoryName ? categoryMap.get(normalized(categoryName)) : null,
          brand: nullableText(row.brand || row.marca, 120),
          model: nullableText(row.model || row.modelo, 120),
          serial_number: nullableText(row.serial_number || row.serial, 160),
          invoice_number: nullableText(row.invoice_number || row.nf, 120),
          purchase_date: nullableText(row.purchase_date || row.data_aquisicao || row.data, 10),
          purchase_value: purchaseValue,
          warranty_until: nullableText(row.warranty_until || row.garantia, 10),
          department: nullableText(row.department || row.setor, 120),
          location_id: locationName ? locationMap.get(normalized(locationName)) : null,
          responsible_name: nullableText(row.responsible_name || row.responsavel, 160),
          status_id: statusName ? statusMap.get(normalized(statusName)) : defaultStatusId,
          notes: nullableText(row.notes || row.observacoes, 3000),
          created_by: context.userId,
          updated_by: context.userId,
        });
      });

      const { data: job, error: jobError } = await admin.from("asset_import_jobs").insert({
        file_name: fileName,
        total_rows: rows.length,
        valid_rows: valid.length,
        imported_rows: 0,
        error_rows: errors.length,
        status: "processando",
        imported_by: context.userId,
      }).select("*").single();
      if (jobError) throw new HttpError(400, jobError.message);
      if (errors.length) await admin.from("asset_import_errors").insert(errors.map((error) => ({ ...error, import_job_id: job.id })));
      let importedRows = 0;
      if (valid.length) {
        const { data: inserted, error: insertError } = await admin.from("assets").insert(valid).select("id");
        if (insertError) {
          await admin.from("asset_import_jobs").update({ status: "falhou", completed_at: new Date().toISOString() }).eq("id", job.id);
          throw new HttpError(400, insertError.message);
        }
        importedRows = inserted?.length || 0;
      }
      await admin.from("asset_import_jobs").update({ imported_rows: importedRows, status: "concluido", completed_at: new Date().toISOString() }).eq("id", job.id);
      return jsonResponse({ success: true, data: { jobId: job.id, total: rows.length, imported: importedRows, errors } });
    }

    if (action === "create_term") {
      requireOperator(context);
      const asset = await getAsset(text(payload.assetId, 50));
      const documentType = text(payload.documentType, 60);
      const [{ data: responsibleProfile }, { data: location }] = await Promise.all([
        asset.responsible_user_id
          ? admin.from("profiles").select("nome, email, setor").eq("id", asset.responsible_user_id).maybeSingle()
          : Promise.resolve({ data: null }),
        asset.location_id
          ? admin.from("asset_locations").select("name").eq("id", asset.location_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const snapshot = {
        asset,
        responsibleName: responsibleProfile?.nome || asset.responsible_name || null,
        responsibleEmail: responsibleProfile?.email || null,
        responsibleDepartment: responsibleProfile?.setor || asset.department || null,
        locationName: location?.name || null,
        movementId: nullableUuid(payload.movementId),
        issuedAt: new Date().toISOString(),
        issuedBy: context.profile.nome,
      };
      const canonical = JSON.stringify(snapshot);
      const { data, error } = await admin.from("asset_terms").insert({
        asset_id: asset.id,
        movement_id: nullableUuid(payload.movementId),
        document_type: documentType,
        document_snapshot: snapshot,
        content_hash: await sha256(canonical),
        responsible_user_id: asset.responsible_user_id,
        responsible_name: asset.responsible_name,
        issued_by: context.userId,
      }).select("*").single();
      if (error) throw new HttpError(400, error.message);
      if (asset.responsible_user_id) await notifyUsers([asset.responsible_user_id], "Termo patrimonial disponível", `Um termo de ${documentType.replaceAll("_", " ")} aguarda sua confirmação.`, asset.id);
      return jsonResponse({ success: true, data: { term: data } });
    }

    throw new HttpError(400, "Ação patrimonial inválida");
  } catch (error) {
    console.error("asset-actions", error);
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Erro interno";
    return jsonResponse({ success: false, error: message }, status);
  }
});
