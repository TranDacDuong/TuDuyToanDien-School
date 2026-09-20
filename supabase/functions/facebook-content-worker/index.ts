const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JsonRecord = Record<string, any>;

function env(name: string) {
  return Deno.env.get(name) || "";
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceRoleKey() {
  return env("SUPABASE_SERVICE_ROLE_KEY");
}

function automationSecret() {
  return env("FACEBOOK_AUTOMATION_SECRET");
}

function requireAutomationSecret(req: Request) {
  const expected = automationSecret();
  const received = req.headers.get("x-automation-secret") || "";
  if (!expected || received !== expected) {
    throw new Error("Unauthorized automation request");
  }
}

async function restJson<T>(path: string, init: RequestInit = {}) {
  const key = serviceRoleKey();
  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data as JsonRecord)?.message || `Database request failed (${res.status})`);
  }
  return data as T;
}

async function claimJob() {
  const rows = await restJson<JsonRecord[]>("rpc/claim_facebook_content_generation_job", {
    method: "POST",
    body: "{}",
  });
  return rows?.[0] || null;
}

async function loadPost(postId: string) {
  const rows = await restJson<JsonRecord[]>(
    `facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}&select=id,status,content,link_url,image_url`,
  );
  return rows?.[0] || null;
}

async function updateJob(jobId: string, patch: JsonRecord) {
  return await restJson<JsonRecord[]>(`facebook_content_generation_queue?id=eq.${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

async function invokeGemini(postId: string) {
  const key = serviceRoleKey();
  const res = await fetch(`${env("SUPABASE_URL")}/functions/v1/facebook-ai-draft`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "x-automation-secret": automationSecret(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ post_id: postId, provider: "gemini", automation: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `Gemini draft request failed (${res.status})`);
  }
  return data;
}

function retryDelayMinutes(attempts: number) {
  return Math.min(30, Math.max(2, 2 ** Math.max(1, attempts)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let job: JsonRecord | null = null;
  try {
    requireAutomationSecret(req);
    const body = await req.json().catch(() => ({}));
    if (String(body?.action || "process_next") !== "process_next") {
      return jsonResponse({ error: "Unknown action" }, 400);
    }

    job = await claimJob();
    if (!job?.id) return jsonResponse({ ok: true, processed: false, reason: "queue_empty" });

    const post = await loadPost(String(job.post_id || ""));
    const hasContent = Boolean(
      String(post?.content || "").trim()
      || String(post?.link_url || "").trim()
      || String(post?.image_url || "").trim()
    );
    if (!post?.id || hasContent || ["scheduled", "published", "cancelled"].includes(String(post?.status || ""))) {
      await updateJob(job.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        locked_at: null,
        last_error: hasContent ? "Skipped because the post was completed manually." : "Skipped because the post is no longer eligible.",
      });
      return jsonResponse({ ok: true, processed: false, skipped: true, job_id: job.id, post_id: job.post_id });
    }

    const result = await invokeGemini(post.id);
    await updateJob(job.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      locked_at: null,
      last_error: null,
      metadata: {
        ...(job.metadata || {}),
        ai_model: result?.skipped ? "not_called" : (result?.post?.ai_model || "gemini"),
        skipped: Boolean(result?.skipped),
        skip_reason: result?.reason || null,
        generated_at: new Date().toISOString(),
      },
    });

    return jsonResponse({
      ok: true,
      processed: !result?.skipped,
      skipped: Boolean(result?.skipped),
      reason: result?.reason || null,
      job_id: job.id,
      post_id: job.post_id,
      post_status: result?.post?.status || "draft",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Facebook automation failed");
    if (job?.id) {
      const attempts = Number(job.attempts || 1);
      const maxAttempts = Number(job.max_attempts || 3);
      const terminal = attempts >= maxAttempts;
      await updateJob(job.id, {
        status: terminal ? "failed" : "queued",
        run_after: terminal
          ? new Date().toISOString()
          : new Date(Date.now() + retryDelayMinutes(attempts) * 60_000).toISOString(),
        completed_at: terminal ? new Date().toISOString() : null,
        locked_at: null,
        last_error: message.slice(0, 4000),
      }).catch(() => {});
    }
    console.error("[Facebook content worker]", message);
    return jsonResponse({ error: message, job_id: job?.id || null }, message.includes("Unauthorized") ? 401 : 500);
  }
});
