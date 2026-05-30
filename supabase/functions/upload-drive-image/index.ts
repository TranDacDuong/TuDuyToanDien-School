const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!accessToken || !supabaseUrl || !anonKey) throw new Error("Authentication required");

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const user = await res.json().catch(() => ({}));
  if (!res.ok || !user?.id) throw new Error("Authentication required");
  return user;
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
  const data = await res.json();
  if (!res.ok) {
    const detail = [data?.error, data?.error_description].filter(Boolean).join(": ") || "Unknown OAuth error";
    throw new Error(`Cannot get Google access token: ${detail}`);
  }
  return data.access_token as string;
}

function safeFileName(name: string) {
  const clean = String(name || "image").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-");
  return clean.slice(0, 120) || "image";
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

async function uploadToDrive(file: File, accessToken: string, folderId: string, folderName: string) {
  const boundary = `mindup_${crypto.randomUUID()}`;
  const prefix = folderName ? `${folderName}-` : "";
  const metadata = {
    name: `${prefix}${Date.now()}-${crypto.randomUUID()}-${safeFileName(file.name)}`,
    parents: [folderId],
    mimeType: file.type || "application/octet-stream",
  };
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const body = new Blob([
    delimiter,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata),
    "\r\n",
    delimiter,
    `Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
    await file.arrayBuffer(),
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
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Google Drive upload failed");
  await createPublicPermission(data.id, accessToken);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    await requireAuthenticatedUser(req);
    const clientId = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET");
    const refreshToken = Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN");
    const folderId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");
    if (!clientId || !clientSecret || !refreshToken || !folderId) {
      return jsonResponse({ error: "Missing Google Drive secrets" }, 500);
    }

    const form = await req.formData();
    const file = form.get("file");
    const folderName = safeFileName(String(form.get("folder") || ""));
    if (!(file instanceof File)) return jsonResponse({ error: "Missing file" }, 400);
    if (!file.type.startsWith("image/")) return jsonResponse({ error: "Only image uploads are allowed" }, 400);
    if (file.size > 2 * 1024 * 1024) return jsonResponse({ error: "Image is too large after compression" }, 400);

    const accessToken = await getGoogleAccessToken(clientId, clientSecret, refreshToken);
    const uploaded = await uploadToDrive(file, accessToken, folderId, folderName);
    const fileId = uploaded.id;

    return jsonResponse({
      ok: true,
      provider: "google_drive",
      fileId,
      mimeType: uploaded.mimeType,
      size: Number(uploaded.size || file.size),
      webViewLink: uploaded.webViewLink,
      url: `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
      lh3Url: `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}`,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return jsonResponse({ error: message }, 500);
  }
});
