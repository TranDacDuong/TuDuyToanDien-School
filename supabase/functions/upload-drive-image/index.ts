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

function base64Url(input: string | ArrayBuffer) {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getGoogleAccessToken(serviceAccount: Record<string, string>) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const res = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description || data?.error || "Cannot get Google access token");
  return data.access_token as string;
}

function safeFileName(name: string) {
  const clean = String(name || "image").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-");
  return clean.slice(0, 120) || "image";
}

async function createPublicPermission(fileId: string, accessToken: string) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
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
    const serviceAccountRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const folderId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");
    if (!serviceAccountRaw || !folderId) {
      return jsonResponse({ error: "Missing Google Drive secrets" }, 500);
    }

    const form = await req.formData();
    const file = form.get("file");
    const folderName = safeFileName(String(form.get("folder") || ""));
    if (!(file instanceof File)) return jsonResponse({ error: "Missing file" }, 400);
    if (!file.type.startsWith("image/")) return jsonResponse({ error: "Only image uploads are allowed" }, 400);
    if (file.size > 2 * 1024 * 1024) return jsonResponse({ error: "Image is too large after compression" }, 400);

    const serviceAccount = JSON.parse(serviceAccountRaw);
    const accessToken = await getGoogleAccessToken(serviceAccount);
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
