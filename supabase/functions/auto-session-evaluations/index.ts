// Supabase Edge Function: auto-session-evaluations
// MindUp - Tư Duy Toàn Diện
// Auto-sends evaluations 30 minutes after class ends (only for students with positive or needs_attention statuses)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return Deno.env.get(name) || "";
}

function restHeaders() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_ANON_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({})) || {};
    }

    const sessionId = body.session_id ? String(body.session_id) : null;
    const targetDate = body.target_date || body.date ? String(body.target_date || body.date).slice(0, 10) : null;
    const force = Boolean(body.force);

    const supabaseUrl = env("SUPABASE_URL");
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/auto_send_session_evaluations_after_30m`, {
      method: "POST",
      headers: restHeaders(),
      body: JSON.stringify({
        p_session_id: sessionId,
        p_target_date: targetDate,
        p_force: force,
      }),
    });

    const result = await rpcRes.json().catch(() => null);
    if (!rpcRes.ok) {
      throw new Error((result as { message?: string })?.message || rpcRes.statusText);
    }

    return jsonResponse({
      success: true,
      message: "Đã thực hiện quét và tự động gửi nhận xét sau buổi học.",
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto session evaluation failed";
    return jsonResponse({ error: message }, 500);
  }
});
