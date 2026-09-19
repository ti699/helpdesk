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

const normalizeKey = (value: unknown) => text(value, 200)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .replace(/[^a-z0-9]/g, "");

const normalizeDate = (value: unknown) => {
  if (value === "" || value == null) return null;
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30));
    date.setUTCDate(date.getUTCDate() + Math.floor(value));
    return date.toISOString().slice(0, 10);
  }
  const raw = text(value, 20);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const candidate = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : br ? `${br[3]}-${br[2]}-${br[1]}` : "";
  if (!candidate) return null;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
};

const normalizeMoney = (value: unknown) => {
  if (value === "" || value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const raw = String(value).trim().replace(/\s/g, "").replace(/^R\$/i, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
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

    if (action === "validate_import") {
      requireManager(context);
      const fileName = text(payload.fileName, 240) || "importacao";
      const sourceSheet = nullableText(payload.sourceSheet, 120);
      const columnMapping = payload.columnMapping && typeof payload.columnMapping === "object" ? payload.columnMapping : {};
      const rows = Array.isArray(payload.rows) ? payload.rows.slice(0, 2000) as Record<string, unknown>[] : [];
      if (!rows.length) throw new HttpError(400, "Nenhuma linha para validar");
      const [{ data: categories }, { data: statuses }, { data: locations }, { data: existingAssets }, { data: profiles }] = await Promise.all([
        admin.from("asset_categories").select("id, name").eq("active", true),
        admin.from("asset_statuses").select("id, name, color, is_terminal, is_default").eq("active", true),
        admin.from("asset_locations").select("id, name").eq("active", true),
        admin.from("assets").select("asset_code"),
        admin.from("profiles").select("id, email, nome").eq("active", true),
      ]);
      const categoryMap = new Map((categories || []).map((row) => [normalizeKey(row.name), row.id]));
      const statusMap = new Map((statuses || []).map((row) => [normalizeKey(row.name), row.id]));
      const locationMap = new Map((locations || []).map((row) => [normalizeKey(row.name), row.id]));
      const profileMap = new Map((profiles || []).map((row) => [String(row.email || "").toLowerCase(), row]));
      const codes = new Set((existingAssets || []).map((row) => normalizeKey(row.asset_code)));
      const seen = new Set<string>();
      const stagedRows: Array<Record<string, unknown>> = [];
      const unknown = { categories: new Map<string, string>(), statuses: new Map<string, string>(), locations: new Map<string, string>() };
      let validRows = 0;
      let errorRows = 0;
      let warningRows = 0;

      rows.forEach((row, index) => {
        const code = text(row.asset_code, 80);
        const name = text(row.name, 160);
        const codeKey = normalizeKey(code);
        const errors: string[] = [];
        const warnings: string[] = [];
        if (!code) errors.push("Código obrigatório");
        if (!name) errors.push("Nome obrigatório");
        if (codeKey && (codes.has(codeKey) || seen.has(codeKey))) errors.push("Código duplicado");

        const categoryName = text(row.category, 120);
        const statusName = text(row.status, 120);
        const locationName = text(row.location, 120);
        const categoryKey = normalizeKey(categoryName);
        const statusKey = normalizeKey(statusName);
        const locationKey = normalizeKey(locationName);
        const purchaseDate = normalizeDate(row.purchase_date);
        const warrantyUntil = normalizeDate(row.warranty_until);
        const purchaseValue = normalizeMoney(row.purchase_value);
        if (row.purchase_date && !purchaseDate) errors.push("Data de aquisição inválida");
        if (row.warranty_until && !warrantyUntil) errors.push("Data de garantia inválida");
        if (row.purchase_value !== "" && row.purchase_value != null && purchaseValue === null) errors.push("Valor de aquisição inválido");
        if (categoryName && !categoryMap.has(categoryKey)) {
          warnings.push(`Categoria não cadastrada: ${categoryName}`);
          unknown.categories.set(categoryKey, categoryName);
        }
        if (statusName && !statusMap.has(statusKey)) {
          warnings.push(`Status não cadastrado: ${statusName}`);
          unknown.statuses.set(statusKey, statusName);
        }
        if (locationName && !locationMap.has(locationKey)) {
          warnings.push(`Localização não cadastrada: ${locationName}`);
          unknown.locations.set(locationKey, locationName);
        }
        const responsibleEmail = text(row.responsible_email, 240).toLowerCase();
        if (responsibleEmail && !/^\S+@\S+\.\S+$/.test(responsibleEmail)) errors.push("E-mail do responsável inválido");
        if (responsibleEmail && !profileMap.has(responsibleEmail)) warnings.push("E-mail sem usuário ativo; responsável será mantido como texto livre");
        if (codeKey) seen.add(codeKey);

        const normalizedData = {
          asset_code: code,
          name,
          description: nullableText(row.description, 2000),
          category: categoryName,
          category_key: categoryKey,
          category_id: categoryName ? categoryMap.get(categoryKey) || null : null,
          brand: nullableText(row.brand, 120),
          model: nullableText(row.model, 120),
          serial_number: nullableText(row.serial_number, 160),
          invoice_number: nullableText(row.invoice_number, 120),
          purchase_date: purchaseDate,
          purchase_value: purchaseValue,
          warranty_until: warrantyUntil,
          department: nullableText(row.department, 120),
          location: locationName,
          location_key: locationKey,
          location_id: locationName ? locationMap.get(locationKey) || null : null,
          responsible_name: nullableText(row.responsible_name, 160),
          responsible_email: responsibleEmail || null,
          status: statusName,
          status_key: statusKey,
          status_id: statusName ? statusMap.get(statusKey) || null : null,
          notes: nullableText(row.notes, 3000),
        };
        const rowStatus = errors.length ? "error" : warnings.length ? "warning" : "valid";
        if (rowStatus === "error") errorRows += 1;
        else {
          validRows += 1;
          if (rowStatus === "warning") warningRows += 1;
        }
        stagedRows.push({ row_number: index + 2, raw_data: row, normalized_data: normalizedData, errors, warnings, row_status: rowStatus });
      });

      const { data: job, error: jobError } = await admin.from("asset_import_jobs").insert({
        file_name: fileName,
        source_sheet: sourceSheet,
        column_mapping: columnMapping,
        total_rows: rows.length,
        valid_rows: validRows,
        imported_rows: 0,
        error_rows: errorRows,
        status: "validado",
        validation_summary: { warningRows },
        imported_by: context.userId,
      }).select("*").single();
      if (jobError) throw new HttpError(400, jobError.message);
      const { error: rowsError } = await admin.from("asset_import_rows").insert(stagedRows.map((row) => ({ ...row, import_job_id: job.id })));
      if (rowsError) throw new HttpError(400, rowsError.message);
      const preview = stagedRows.map(({ raw_data: _raw, ...row }) => row);
      return jsonResponse({ success: true, data: {
        jobId: job.id,
        total: rows.length,
        valid: validRows,
        errors: errorRows,
        warnings: warningRows,
        preview,
        unknown: {
          categories: [...unknown.categories].map(([key, name]) => ({ key, name })),
          statuses: [...unknown.statuses].map(([key, name]) => ({ key, name })),
          locations: [...unknown.locations].map(([key, name]) => ({ key, name })),
        },
        options: { categories, statuses, locations },
      } });
    }

    if (action === "commit_import") {
      requireManager(context);
      const jobId = text(payload.jobId, 50);
      const resolutions = payload.resolutions && typeof payload.resolutions === "object" ? payload.resolutions : {};
      const { data, error } = await context.userClient.rpc("commit_asset_import", {
        _job_id: jobId,
        _resolutions: resolutions,
      });
      if (error) throw new HttpError(400, error.message);
      return jsonResponse({ success: true, data });
    }

    if (action === "import_assets") {
      throw new HttpError(410, "Atualize a tela e use o novo assistente de importação");
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
