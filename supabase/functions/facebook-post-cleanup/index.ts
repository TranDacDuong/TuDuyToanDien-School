const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-automation-secret, content-type",
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

function requireAutomationSecret(req: Request) {
  const expected = env("FACEBOOK_AUTOMATION_SECRET");
  const received = req.headers.get("x-automation-secret") || "";
  if (!expected || received !== expected) throw new Error("Unauthorized automation request");
}

async function restJson<T>(path: string, init: RequestInit = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
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
  if (!res.ok) throw new Error((data as JsonRecord)?.message || `Database request failed (${res.status})`);
  return data as T;
}

async function getGoogleAccessToken() {
  const clientId = env("GOOGLE_DRIVE_CLIENT_ID");
  const clientSecret = env("GOOGLE_DRIVE_CLIENT_SECRET");
  const refreshToken = env("GOOGLE_DRIVE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Missing Google Drive secrets");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error_description || data?.error || "Cannot get Google Drive access token");
  return String(data.access_token || "");
}

function driveFileId(value: unknown) {
  const source = String(value || "").trim();
  const lh3 = source.match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([\w-]+)/i);
  if (lh3) return lh3[1];
  const drive = source.match(/^https:\/\/drive\.google\.com\/(?:uc\?[^#]*\bid=|file\/d\/)([\w-]+)/i);
  return drive?.[1] || "";
}

function collectDriveFileIds(value: unknown, output = new Set<string>()) {
  if (typeof value === "string") {
    const id = driveFileId(value);
    if (id) output.add(id);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectDriveFileIds(item, output));
    return output;
  }
  if (value && typeof value === "object") {
    Object.values(value as JsonRecord).forEach(item => collectDriveFileIds(item, output));
  }
  return output;
}

async function deleteDriveFile(fileId: string, accessToken: string) {
  const folderId = env("GOOGLE_DRIVE_FOLDER_ID");
  if (!folderId) throw new Error("Missing GOOGLE_DRIVE_FOLDER_ID");
  const metadataRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,parents`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (metadataRes.status === 404) return { missing: true };
  const metadata = await metadataRes.json().catch(() => ({}));
  if (!metadataRes.ok) throw new Error(metadata?.error?.message || `Cannot inspect Drive file ${fileId}`);
  if (!Array.isArray(metadata.parents) || !metadata.parents.includes(folderId)) {
    throw new Error(`Drive file ${fileId} is outside the configured MindUp folder`);
  }
  const deleteRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!deleteRes.ok && deleteRes.status !== 404) {
    const data = await deleteRes.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Cannot delete Drive file ${fileId}`);
  }
  return { deleted: deleteRes.ok, missing: deleteRes.status === 404 };
}

function parseMetadata(value: unknown): JsonRecord {
  if (!value) return {};
  if (typeof value === "object") return value as JsonRecord;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function compactSourceRecord(value: unknown, kind: "question" | "phenomenon") {
  const source = parseMetadata(value);
  const fingerprintKey = kind === "question" ? "question_fingerprint" : "phenomenon_fingerprint";
  const compact = {
    source_name: source.source_name || source.sourceName || null,
    source_title: source.source_title || source.sourceTitle || null,
    source_url: source.source_url || source.sourceUrl || null,
    [fingerprintKey]: source[fingerprintKey] || source.fingerprint || null,
  };
  return Object.fromEntries(Object.entries(compact).filter(([, item]) => item !== null && item !== ""));
}

function compactMetadata(value: unknown) {
  const metadata = parseMetadata(value);
  const compact: JsonRecord = {
    purged: true,
    purged_at: new Date().toISOString(),
  };
  const question = compactSourceRecord(metadata.interesting_question, "question");
  const phenomenon = compactSourceRecord(metadata.real_world_phenomenon, "phenomenon");
  if (Object.keys(question).length) compact.interesting_question = question;
  if (Object.keys(phenomenon).length) compact.real_world_phenomenon = phenomenon;
  return compact;
}

async function claimCleanupJob() {
  const rows = await restJson<JsonRecord[]>("rpc/claim_facebook_post_cleanup_job", {
    method: "POST",
    body: "{}",
  });
  return rows?.[0] || null;
}

async function patchPost(postId: string, patch: JsonRecord) {
  await restJson<JsonRecord[]>(`facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

async function processPost(post: JsonRecord, accessToken: string) {
  const driveIds = collectDriveFileIds({
    image_url: post.image_url,
    ai_image_url: post.ai_image_url,
    metadata: post.metadata,
  });
  for (const fileId of driveIds) await deleteDriveFile(fileId, accessToken);

  const confirmedPublished = Boolean(String(post.facebook_post_id || "").trim())
    && ["scheduled", "published"].includes(String(post.status || ""));
  await patchPost(String(post.id), {
    content: null,
    link_url: null,
    image_url: null,
    internal_note: null,
    metadata: compactMetadata(post.metadata),
    ai_status: "idle",
    ai_generated_at: null,
    ai_model: null,
    ai_prompt: null,
    ai_image_prompt: null,
    ai_image_url: null,
    ai_error: null,
    status: confirmedPublished ? "published" : post.status,
    posted_at: confirmedPublished ? (post.posted_at || post.scheduled_at) : post.posted_at,
    cleanup_status: "done",
    cleanup_error: null,
    drive_cleanup_completed_at: new Date().toISOString(),
    content_purged_at: new Date().toISOString(),
  });
  return { post_id: post.id, deleted_drive_files: driveIds.size };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    requireAutomationSecret(req);
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(250, Number(body?.limit || 100)));
    const accessToken = await getGoogleAccessToken();
    const results: JsonRecord[] = [];
    for (let index = 0; index < limit; index += 1) {
      const post = await claimCleanupJob();
      if (!post?.id) break;
      try {
        results.push(await processPost(post, accessToken));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "Cleanup failed");
        await patchPost(String(post.id), { cleanup_status:"error", cleanup_error:message.slice(0, 4000) }).catch(() => {});
        results.push({ post_id:post.id, error:message });
      }
    }
    return jsonResponse({
      ok: true,
      processed: results.length,
      completed: results.filter(row => !row.error).length,
      failed: results.filter(row => row.error).length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Cleanup failed");
    return jsonResponse({ error: message }, message.includes("Unauthorized") ? 401 : 500);
  }
});
