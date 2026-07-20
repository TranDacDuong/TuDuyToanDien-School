const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

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

async function patchJson<T>(path: string, body: JsonRecord) {
  return fetchJson<T>(path, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
}

async function getUserRole(userId: string) {
  const rows = await fetchJson<Array<{ role: string }>>(
    `users?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,
  );
  return rows[0]?.role || "";
}

function canAccessByRole(role: string) {
  return ["admin", "assistant", "teacher", "marketing", "accountant"].includes(String(role || ""));
}

function assertAllowedRole(role: string) {
  if (!canAccessByRole(role)) {
    throw new Error("Tài khoản này chưa có quyền tạo nháp bài đăng Facebook.");
  }
}

function safeFileName(name: string) {
  const clean = String(name || "image").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-");
  return clean.slice(0, 120) || "image";
}

async function getGoogleAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
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
  if (!res.ok) {
    const detail = [data?.error, data?.error_description].filter(Boolean).join(": ") || "Unknown OAuth error";
    throw new Error(`Cannot get Google access token: ${detail}`);
  }
  return data.access_token as string;
}

async function createPublicPermission(fileId: string, accessToken: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Cannot make Google Drive image public: ${data?.error?.message || res.statusText}`);
  }
}

async function uploadBytesToDrive(bytes: Uint8Array, filename: string, mimeType: string) {
  const clientId = env("GOOGLE_DRIVE_CLIENT_ID");
  const clientSecret = env("GOOGLE_DRIVE_CLIENT_SECRET");
  const refreshToken = env("GOOGLE_DRIVE_REFRESH_TOKEN");
  const folderId = env("GOOGLE_DRIVE_FOLDER_ID");
  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    throw new Error("Missing Google Drive secrets");
  }

  const accessToken = await getGoogleAccessToken(clientId, clientSecret, refreshToken);
  const boundary = `mindup_${crypto.randomUUID()}`;
  const metadata = {
    name: `facebook-ai-${Date.now()}-${crypto.randomUUID()}-${safeFileName(filename)}`,
    parents: [folderId],
    mimeType,
  };
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const body = new Blob([
    delimiter,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata),
    "\r\n",
    delimiter,
    `Content-Type: ${mimeType}\r\n\r\n`,
    bytes,
    closeDelimiter,
  ], { type: `multipart/related; boundary=${boundary}` });

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Google Drive upload failed");
  await createPublicPermission(data.id, accessToken);
  return {
    fileId: String(data.id || ""),
    webViewLink: data.webViewLink || "",
    url: `https://drive.google.com/uc?export=view&id=${encodeURIComponent(String(data.id || ""))}`,
    lh3Url: `https://lh3.googleusercontent.com/d/${encodeURIComponent(String(data.id || ""))}`,
  };
}

function tryParseJson(text: string) {
  const cleaned = String(text || "").trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Gemini trả về nội dung không đúng JSON.");
  }
}

function normalizeHashtags(value: unknown) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.startsWith("#"));
}

function buildGeminiPrompt(args: {
  pageName: string;
  typeName: string;
  scheduledAt: string;
  typePrompt: string;
  existingContent: string;
  internalNote: string;
}) {
  const defaultPrompt = [
    "Bạn là chuyên gia marketing giáo dục cho MindUp - Tư Duy Toàn Diện.",
    "Hãy tạo một bài đăng Facebook tự nhiên, rõ thông điệp, đúng tinh thần giáo dục, không sáo rỗng.",
    "Nếu loại bài là Quiz thì caption không được lộ đáp án.",
  ].join("\n");
  return [
    args.typePrompt || defaultPrompt,
    "",
    "Thông tin bài đăng:",
    `- Fanpage: ${args.pageName}`,
    `- Loại bài: ${args.typeName}`,
    `- Thời gian đăng: ${args.scheduledAt}`,
    args.existingContent ? `- Nội dung nháp hiện có: ${args.existingContent}` : "",
    args.internalNote ? `- Ghi chú nội bộ: ${args.internalNote}` : "",
    "",
    "Hãy trả về duy nhất JSON hợp lệ, không markdown, theo schema:",
    JSON.stringify({
      caption: "Caption đầy đủ bằng tiếng Việt, chia đoạn dễ đọc.",
      hashtags: ["#MindUp", "#PhatTrienTuDuy"],
      image_prompt: "Prompt tiếng Anh để tạo ảnh Facebook square 1:1, có logo MindUp rõ ở góc hoặc trung tâm, phong cách giáo dục hiện đại.",
      internal_note: "Ghi chú nội bộ, đáp án đúng nếu có, hoặc rỗng.",
    }, null, 2),
    "",
    "Yêu cầu hashtag: luôn có #MindUp và #PhatTrienTuDuy; nếu là Quiz thì thêm #Quiz.",
    "Yêu cầu ảnh: ảnh vuông 1:1, rõ ràng khi xem trên điện thoại, có logo/text MindUp - Tư Duy Toàn Diện.",
  ].filter(Boolean).join("\n");
}

async function generateTextDraft(prompt: string) {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Thiếu Supabase secret GEMINI_API_KEY.");

  const model = env("GEMINI_TEXT_MODEL") || "gemini-2.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        response_mime_type: "application/json",
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || "Gemini text generation failed");
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("\n") || "";
  const parsed = tryParseJson(text);
  const hashtags = normalizeHashtags(parsed?.hashtags);
  if (!hashtags.includes("#MindUp")) hashtags.unshift("#MindUp");
  if (!hashtags.includes("#PhatTrienTuDuy")) hashtags.push("#PhatTrienTuDuy");
  return {
    model,
    caption: String(parsed?.caption || "").trim(),
    hashtags,
    imagePrompt: String(parsed?.image_prompt || "").trim(),
    internalNote: String(parsed?.internal_note || "").trim(),
  };
}

function extractImageFromInteractions(data: JsonRecord) {
  const output = data?.output;
  const candidates = [
    ...(Array.isArray(output) ? output : []),
    ...((data?.outputs && Array.isArray(data.outputs)) ? data.outputs as unknown[] : []),
  ] as JsonRecord[];

  for (const item of candidates) {
    const image = item?.output_image || item?.image || item?.inline_data || item?.inlineData;
    if (image && typeof image === "object") {
      const record = image as JsonRecord;
      const dataValue = String(record.data || record.bytesBase64Encoded || "");
      if (dataValue) return { data: dataValue, mimeType: String(record.mime_type || record.mimeType || "image/png") };
    }
  }

  const asText = JSON.stringify(data);
  const dataMatch = asText.match(/"data"\s*:\s*"([A-Za-z0-9+/=]+)"/);
  if (dataMatch) return { data: dataMatch[1], mimeType: "image/png" };
  return null;
}

async function generateImage(prompt: string) {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Thiếu Supabase secret GEMINI_API_KEY.");
  const model = env("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-image";
  const imagePrompt = [
    prompt,
    "Square 1:1 Facebook educational post.",
    "Include a clean MindUp logo/text mark: MindUp - Tư Duy Toàn Diện.",
    "Modern blue and gold educational design, Vietnamese-friendly typography, readable on mobile.",
    "Do not add misspelled Vietnamese text except the exact MindUp brand text.",
  ].join("\n");
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [{ type: "text", text: imagePrompt }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Gemini image generation failed");
  const image = extractImageFromInteractions(data);
  if (!image?.data) throw new Error("Gemini chưa trả về ảnh hợp lệ.");
  const bytes = Uint8Array.from(atob(image.data), c => c.charCodeAt(0));
  return {
    model,
    imagePrompt,
    bytes,
    mimeType: image.mimeType || "image/png",
  };
}

async function loadPostBundle(postId: string) {
  const rows = await fetchJson<Array<{
    id: string;
    page_id: string;
    post_type_id: string | null;
    scheduled_at: string;
    content: string | null;
    internal_note: string | null;
    task_id: string | null;
    page?: { page_name?: string } | null;
    type?: { name?: string; description?: string | null; ai_prompt?: string | null } | null;
  }>>(
    `facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}&select=id,page_id,post_type_id,scheduled_at,content,internal_note,task_id,page:facebook_pages(page_name),type:facebook_post_types(name,description,ai_prompt)&limit=1`,
  );
  const post = rows[0];
  if (!post?.id) throw new Error("Không tìm thấy bài đăng Facebook.");
  return post;
}

async function assertCanUsePost(userId: string, role: string, post: { task_id?: string | null }) {
  if (["admin", "assistant"].includes(role)) return;
  if (!post.task_id) throw new Error("Bạn chưa được giao công việc kiểm tra bài đăng này.");
  const rows = await fetchJson<Array<{ id: string }>>(
    `task_assignments?task_id=eq.${encodeURIComponent(post.task_id)}&user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
  );
  if (!rows[0]?.id) throw new Error("Bạn chưa được giao công việc kiểm tra bài đăng này.");
}

function mergeCaptionAndHashtags(caption: string, hashtags: string[]) {
  const cleanCaption = String(caption || "").trim();
  const cleanTags = Array.from(new Set(hashtags.map(tag => tag.trim()).filter(Boolean)));
  const tagLine = cleanTags.join(" ");
  return [cleanCaption, tagLine].filter(Boolean).join("\n\n").slice(0, 6000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let postId = "";
  try {
    const { user } = await requireAuthenticatedUser(req);
    const role = await getUserRole(user.id);
    assertAllowedRole(role);

    const body = await req.json().catch(() => ({}));
    postId = String(body?.post_id || "").trim();
    if (!postId) throw new Error("Thiếu post_id.");

    const post = await loadPostBundle(postId);
    await assertCanUsePost(user.id, role, post);
    await patchJson(`facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}`, {
      ai_status: "generating",
      ai_error: null,
      updated_at: new Date().toISOString(),
    });

    const textPrompt = buildGeminiPrompt({
      pageName: post.page?.page_name || post.page_id,
      typeName: post.type?.name || "Facebook",
      scheduledAt: post.scheduled_at,
      typePrompt: post.type?.ai_prompt || post.type?.description || "",
      existingContent: post.content || "",
      internalNote: post.internal_note || "",
    });

    const draft = await generateTextDraft(textPrompt);
    const image = await generateImage(draft.imagePrompt || textPrompt);
    const uploaded = await uploadBytesToDrive(image.bytes, "mindup-facebook-ai.png", image.mimeType);
    const finalContent = mergeCaptionAndHashtags(draft.caption, draft.hashtags);
    const finalNote = [draft.internalNote, post.internal_note].filter(Boolean).join("\n\n").trim() || null;

    const rows = await patchJson<Array<JsonRecord>>(`facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}`, {
      content: finalContent,
      image_url: uploaded.lh3Url || uploaded.url,
      internal_note: finalNote,
      status: "draft",
      content_status: "submitted",
      approval_status: "pending",
      ai_status: "drafted",
      ai_generated_at: new Date().toISOString(),
      ai_model: `${draft.model}; ${image.model}`,
      ai_prompt: textPrompt,
      ai_image_prompt: image.imagePrompt,
      ai_image_url: uploaded.lh3Url || uploaded.url,
      ai_error: null,
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({ ok: true, post: rows?.[0] || null, image_url: uploaded.lh3Url || uploaded.url });
  } catch (error) {
    console.error(error);
    if (postId) {
      await patchJson(`facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}`, {
        ai_status: "error",
        ai_error: error instanceof Error ? error.message : String(error || "Gemini failed"),
        updated_at: new Date().toISOString(),
      }).catch(() => {});
    }
    const message = error instanceof Error ? error.message : "Gemini draft failed";
    const status = message.includes("Authentication") ? 401 : message.includes("quyền") || message.includes("giao công việc") ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
