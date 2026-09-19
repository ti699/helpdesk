import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const clean = (value: unknown, max: number) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
  .replace(/(bearer|token|password|senha|apikey)[=: ]+[^\s]+/gi, "$1=[redacted]")
  .slice(0, max);

const digest = async (value: string) => {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: authData } = await userClient.auth.getUser();
    if (!authData.user) return new Response(JSON.stringify({ success: false }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });

    const body = await request.json();
    const message = clean(body.message, 500);
    const route = clean(body.route, 240);
    const source = clean(body.source, 80);
    if (!message) throw new Error("Mensagem obrigatoria");
    const fingerprint = await digest(`${source}|${route}|${message}`);
    const admin = createClient(supabaseUrl, serviceRole);

    const { data: existing } = await admin.from("application_error_logs")
      .select("id, occurrence_count, last_seen_at")
      .eq("fingerprint", fingerprint)
      .is("resolved_at", null)
      .maybeSingle();

    if (existing) {
      const elapsed = Date.now() - new Date(existing.last_seen_at).getTime();
      if (elapsed >= 30_000) {
        await admin.from("application_error_logs").update({ occurrence_count: existing.occurrence_count + 1, last_seen_at: new Date().toISOString() }).eq("id", existing.id);
      }
    } else {
      await admin.from("application_error_logs").insert({
        fingerprint, message, route, app_version: clean(body.appVersion, 80), browser: clean(body.browser, 400), user_id: authData.user.id,
      });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (error) {
    console.error("client-diagnostics", error);
    return new Response(JSON.stringify({ success: false }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
