const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type FacebookAction = "create" | "delete" | "list_scheduled";

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

async function graphFetchForm(path: string, form: FormData, token: string) {
  const version = env("FACEBOOK_GRAPH_VERSION") || "v25.0";
  const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`);
  form.set("access_token", token);

  const res = await fetch(url, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    const err = json?.error || {};
    const parts = [
      err.message || "Facebook API error",
      err.code ? `MÃ£ lá»—i: ${err.code}` : "",
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

async function graphFetchFormWithPageToken(path: string, form: FormData, pageId: string) {
  const staticToken = await getPageToken(pageId);
  try {
    return await graphFetchForm(path, form, staticToken);
  } catch (error) {
    if (!isExpiredFacebookTokenError(error)) throw error;
    const dynamicToken = await getPageTokenFromUserToken(pageId);
    if (dynamicToken && dynamicToken !== staticToken) {
      return await graphFetchForm(path, form, dynamicToken);
    }
    throw new Error("Facebook token Ä‘Ã£ háº¿t háº¡n. HÃ£y cáº­p nháº­t token dÃ i háº¡n/System User token cho chá»©c nÄƒng Ä‘Äƒng bÃ i Facebook.");
  }
}

function getExtensionFromContentType(contentType: string) {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return "jpg";
}

async function fetchImageAsBlob(imageUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch (_) {
    throw new Error("URL áº£nh khÃ´ng há»£p lá»‡.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("URL áº£nh pháº£i báº¯t Ä‘áº§u báº±ng http hoáº·c https.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "MindUpFacebookPosting/1.0",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`KhÃ´ng táº£i Ä‘Æ°á»£c áº£nh (${res.status}). HÃ£y kiá»ƒm tra URL áº£nh cÃ³ cÃ´ng khai khÃ´ng.`);
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error("URL Ä‘Æ°á»£c nháº­p khÃ´ng tráº£ vá» file áº£nh há»£p lá»‡.");
    }
    const blob = await res.blob();
    if (!blob.size) throw new Error("File áº£nh táº£i vá» bá»‹ rá»—ng.");
    if (blob.size > 8 * 1024 * 1024) throw new Error("áº¢nh quÃ¡ lá»›n Ä‘á»ƒ Ä‘Äƒng Facebook. HÃ£y náº¿n áº£nh nhá» hÆ¡n 8MB.");
    return {
      blob,
      filename: `mindup-facebook-image.${getExtensionFromContentType(contentType)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getDriveFileIdFromUrl(url: URL) {
  if (url.hostname === "lh3.googleusercontent.com") {
    const match = url.pathname.match(/^\/d\/([\w-]+)/);
    if (match) return match[1];
  }
  if (url.hostname === "drive.google.com") {
    const byQuery = url.searchParams.get("id");
    if (byQuery && /^[\w-]+$/.test(byQuery)) return byQuery;
    const match = url.pathname.match(/^\/file\/d\/([\w-]+)/);
    if (match) return match[1];
  }
  return "";
}

function buildImageFetchUrls(inputUrl: string) {
  const parsed = new URL(inputUrl);
  const urls = [parsed.toString()];
  const driveFileId = getDriveFileIdFromUrl(parsed);
  if (driveFileId) {
    urls.push(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}`);
    urls.push(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveFileId)}&export=download`);
  }
  return Array.from(new Set(urls));
}

function detectImageMime(bytes: Uint8Array, contentType = "") {
  const normalized = String(contentType || "").toLowerCase().split(";")[0].trim();
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  if (normalized === "image/svg+xml") return normalized;
  return "";
}

async function getGoogleDriveAccessTokenForFacebook() {
  const clientId = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET") || "";
  const refreshToken = Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN") || "";
  if (!clientId || !clientSecret || !refreshToken) return "";

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
  if (!res.ok) return "";
  return String(data?.access_token || "");
}

async function fetchDriveImageAsBlobForFacebook(fileId: string) {
  const accessToken = await getGoogleDriveAccessTokenForFacebook();
  if (!accessToken) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      redirect: "follow",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "MindUpFacebookPosting/1.0",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const bytes = new Uint8Array(await res.arrayBuffer());
    const mimeType = detectImageMime(bytes, res.headers.get("content-type") || "");
    if (!mimeType || !bytes.byteLength) return null;
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("Image is too large for Facebook upload. Please keep it under 8MB.");

    return {
      blob: new Blob([bytes], { type: mimeType }),
      filename: `mindup-facebook-image.${getExtensionFromContentType(mimeType)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImageAsBlobForFacebook(imageUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch (_) {
    throw new Error("Invalid image URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Image URL must start with http or https.");
  }

  const driveFileId = getDriveFileIdFromUrl(parsed);
  if (driveFileId) {
    const driveImage = await fetchDriveImageAsBlobForFacebook(driveFileId);
    if (driveImage) return driveImage;
  }

  let lastError = "";
  for (const url of buildImageFetchUrls(imageUrl)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "MindUpFacebookPosting/1.0" },
        signal: controller.signal,
      });
      if (!res.ok) {
        lastError = `Cannot download image (${res.status}).`;
        continue;
      }

      const bytes = new Uint8Array(await res.arrayBuffer());
      const mimeType = detectImageMime(bytes, res.headers.get("content-type") || "");
      if (!mimeType) {
        lastError = "Image URL did not return a valid image file.";
        continue;
      }
      if (!bytes.byteLength) throw new Error("Downloaded image is empty.");
      if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("Image is too large for Facebook upload. Please keep it under 8MB.");

      return {
        blob: new Blob([bytes], { type: mimeType }),
        filename: `mindup-facebook-image.${getExtensionFromContentType(mimeType)}`,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error || "Cannot download image.");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError || "Cannot download image. Please check that the image URL is public.");
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

  const hasImage = Boolean(post.image_url);

  if (hasImage) {
    const params = new FormData();
    const image = await fetchImageAsBlobForFacebook(post.image_url || "");
    params.set("source", image.blob, image.filename);
    if (post.content) params.set("caption", post.content);
    if (isScheduled && scheduledDate) {
      params.set("published", "false");
      params.set("scheduled_publish_time", String(Math.floor(scheduledDate.getTime() / 1000)));
    }
    const json = await graphFetchFormWithPageToken(`/${post.page_id}/photos`, params, post.page_id);
    return { facebook_post_id: json.post_id || json.id || "" };
  }

  const params: Record<string, string> = {};
  if (post.content) params.message = post.content;
  if (post.link_url) params.link = post.link_url;
  if (isScheduled && scheduledDate) {
    params.published = "false";
    params.scheduled_publish_time = String(Math.floor(scheduledDate.getTime() / 1000));
  }

  const json = await graphFetchWithPageToken(`/${post.page_id}/feed`, params, post.page_id, "POST");
  return { facebook_post_id: json.post_id || json.id || "" };
}

async function deleteFacebookPost(pageId: string, facebookPostId: string) {
  if (!pageId) throw new Error("Missing page_id");
  if (!facebookPostId) throw new Error("Missing facebook_post_id");
  await graphFetchWithPageToken(`/${facebookPostId}`, {}, pageId, "DELETE");
  return { deleted: true };
}

async function listFacebookScheduledPosts(pageId: string, since?: string, until?: string) {
  if (!pageId) throw new Error("Missing page_id");
  const result = await graphFetchWithPageToken(`/${pageId}/scheduled_posts`, {
    fields: "id,scheduled_publish_time,created_time,message,permalink_url",
    limit: "100",
  }, pageId, "GET");

  const sinceMs = since ? new Date(since).getTime() : Number.NEGATIVE_INFINITY;
  const untilMs = until ? new Date(until).getTime() : Number.POSITIVE_INFINITY;
  const rows = (Array.isArray(result?.data) ? result.data : [])
    .map((item: { id?: string; scheduled_publish_time?: number | string; created_time?: string; message?: string; permalink_url?: string }) => {
      const seconds = Number(item?.scheduled_publish_time || 0);
      const scheduledAt = seconds ? new Date(seconds * 1000) : null;
      return {
        id: String(item?.id || ""),
        facebook_post_id: String(item?.id || ""),
        scheduled_at: scheduledAt ? scheduledAt.toISOString() : "",
        scheduled_publish_time: seconds || null,
        created_time: item?.created_time || "",
        message: item?.message || "",
        permalink_url: item?.permalink_url || "",
      };
    })
    .filter((item: { id: string; scheduled_at: string }) => {
      if (!item.id || !item.scheduled_at) return false;
      const ms = new Date(item.scheduled_at).getTime();
      return ms >= sinceMs && ms <= untilMs;
    });

  return { posts: rows };
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
    if (action === "list_scheduled") {
      const result = await listFacebookScheduledPosts(
        String(body?.page_id || ""),
        body?.since ? String(body.since) : "",
        body?.until ? String(body.until) : "",
      );
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
