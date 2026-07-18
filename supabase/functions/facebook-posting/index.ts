const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type FacebookAction = "create" | "delete";

type FacebookPostPayload = {
  page_id?: string;
  content?: string;
  link_url?: string | null;
  image_url?: string | null;
  scheduled_at?: string;
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

function restHeaders(serviceRole = false, accessToken = "") {
  const key = serviceRole ? env("SUPABASE_SERVICE_ROLE_KEY") : env("SUPABASE_ANON_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${accessToken || key}`,
    "Content-Type": "application/json",
  };
}

async function requireAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const supabaseUrl = env("SUPABASE_URL");
  if (!accessToken || !supabaseUrl || !env("SUPABASE_ANON_KEY")) {
    throw new Error("Authentication required");
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: restHeaders(false, accessToken),
  });
  const user = await res.json().catch(() => ({}));
  if (!res.ok || !user?.id) throw new Error("Authentication required");
  return { user, accessToken };
}

async function fetchJson<T>(path: string, init: RequestInit = {}) {
  const supabaseUrl = env("SUPABASE_URL");
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...restHeaders(true), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { message?: string })?.message || res.statusText);
  return data as T;
}

async function getUserRole(userId: string) {
  const rows = await fetchJson<Array<{ role: string }>>(
    `users?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,
  );
  return rows[0]?.role || "";
}

function assertAllowedRole(role: string) {
  if (!["admin", "assistant"].includes(role)) {
    throw new Error("Only admin or assistant can manage Facebook posts");
  }
}

function pageTokenEnvName(pageId: string) {
  return `FACEBOOK_PAGE_TOKEN_${pageId.replace(/[^0-9A-Za-z_]/g, "_")}`;
}

function getStaticPageToken(pageId: string) {
  return env(pageTokenEnvName(pageId)) || env("FACEBOOK_PAGE_ACCESS_TOKEN");
}

function isExpiredFacebookTokenError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("Session has expired")
    || message.includes("Mã lỗi: 190")
    || message.includes("Subcode: 463")
    || message.includes("code: 190");
}

async function graphFetch(path: string, params: Record<string, string>, token: string, method = "POST") {
  const version = env("FACEBOOK_GRAPH_VERSION") || "v25.0";
  const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`);
  const opt: RequestInit = { method };

  if (method === "GET") {
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== "") url.searchParams.set(key, value);
    });
    url.searchParams.set("access_token", token);
  } else {
    const body = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== "") body.set(key, value);
    });
    body.set("access_token", token);
    opt.body = body;
    opt.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  }

  const res = await fetch(url, opt);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    const err = json?.error || {};
    const parts = [
      err.message || "Facebook API error",
      err.code ? `Mã lỗi: ${err.code}` : "",
      err.error_subcode ? `Subcode: ${err.error_subcode}` : "",
    ].filter(Boolean);
    throw new Error(parts.join("\n"));
  }
  return json;
}

async function getPageTokenFromUserToken(pageId: string) {
  const userToken = env("FACEBOOK_USER_ACCESS_TOKEN") || env("FACEBOOK_LONG_LIVED_USER_TOKEN") || env("FACEBOOK_SYSTEM_USER_TOKEN");
  if (!userToken) return "";
  const result = await graphFetch("/me/accounts", { fields: "id,name,access_token", limit: "100" }, userToken, "GET");
  const pages = Array.isArray(result?.data) ? result.data : [];
  const page = pages.find((item: { id?: string }) => String(item?.id || "") === String(pageId));
  return String(page?.access_token || "");
}

async function getPageToken(pageId: string) {
  const token = getStaticPageToken(pageId);
  if (token) return token;
  const dynamicToken = await getPageTokenFromUserToken(pageId);
  if (dynamicToken) return dynamicToken;
  throw new Error(`Thiếu Facebook token cho page ${pageId}. Hãy set ${pageTokenEnvName(pageId)}, FACEBOOK_PAGE_ACCESS_TOKEN hoặc FACEBOOK_USER_ACCESS_TOKEN dài hạn.`);
}

async function graphFetchWithPageToken(path: string, params: Record<string, string>, pageId: string, method = "POST") {
  const staticToken = await getPageToken(pageId);
  try {
    return await graphFetch(path, params, staticToken, method);
  } catch (error) {
    if (!isExpiredFacebookTokenError(error)) throw error;
    const dynamicToken = await getPageTokenFromUserToken(pageId);
    if (dynamicToken && dynamicToken !== staticToken) {
      return await graphFetch(path, params, dynamicToken, method);
    }
    throw new Error("Facebook token đã hết hạn. Hãy cập nhật token dài hạn/System User token cho chức năng đăng bài Facebook.");
  }
}

function normalizePost(input: unknown): Required<FacebookPostPayload> {
  const post = (input || {}) as FacebookPostPayload;
  const pageId = String(post.page_id || "").trim();
  if (!pageId) throw new Error("Missing page_id");
  return {
    page_id: pageId,
    content: String(post.content || "").trim(),
    link_url: post.link_url ? String(post.link_url).trim() : null,
    image_url: post.image_url ? String(post.image_url).trim() : null,
    scheduled_at: post.scheduled_at ? String(post.scheduled_at) : "",
  };
}

async function createFacebookPost(postInput: unknown, mode: string) {
  const post = normalizePost(postInput);
  if (!post.content && !post.link_url && !post.image_url) {
    throw new Error("Vui lòng nhập nội dung, link hoặc ảnh trước khi hẹn/đăng.");
  }

  const isScheduled = mode === "schedule";
  const scheduledDate = post.scheduled_at ? new Date(post.scheduled_at) : null;
  if (isScheduled) {
    if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) throw new Error("Thời gian hẹn lịch không hợp lệ.");
    if (scheduledDate.getTime() < Date.now() + 10 * 60 * 1000) {
      throw new Error("Facebook yêu cầu thời gian hẹn lịch sau hiện tại ít nhất khoảng 10 phút.");
    }
  }

  const params: Record<string, string> = {};
  const hasImage = Boolean(post.image_url);

  if (hasImage) {
    params.url = post.image_url || "";
    if (post.content) params.caption = post.content;
  } else {
    if (post.content) params.message = post.content;
    if (post.link_url) params.link = post.link_url;
  }
  if (isScheduled && scheduledDate) {
    params.published = "false";
    params.scheduled_publish_time = String(Math.floor(scheduledDate.getTime() / 1000));
  }

  const endpoint = `/${post.page_id}/${hasImage ? "photos" : "feed"}`;
  const json = await graphFetchWithPageToken(endpoint, params, post.page_id, "POST");
  return { facebook_post_id: json.post_id || json.id || "" };
}

async function deleteFacebookPost(pageId: string, facebookPostId: string) {
  if (!pageId) throw new Error("Missing page_id");
  if (!facebookPostId) throw new Error("Missing facebook_post_id");
  await graphFetchWithPageToken(`/${facebookPostId}`, {}, pageId, "DELETE");
  return { deleted: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { user } = await requireAuthenticatedUser(req);
    const role = await getUserRole(user.id);
    assertAllowedRole(role);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "") as FacebookAction;
    if (action === "create") {
      const result = await createFacebookPost(body?.post, String(body?.mode || "schedule"));
      return jsonResponse({ ok: true, ...result });
    }
    if (action === "delete") {
      const result = await deleteFacebookPost(String(body?.page_id || ""), String(body?.facebook_post_id || ""));
      return jsonResponse({ ok: true, ...result });
    }
    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Facebook posting failed";
    const status = message.includes("Authentication") ? 401 : message.includes("Only admin") ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
