const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

const DEFAULT_ELEVENLABS_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_v3";

const FALLBACK_ELEVENLABS_VOICES = [
  {
    voice_id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    category: "premade",
    description: "Fallback ElevenLabs voice",
    labels: { source: "fallback" },
    preview_url: "",
  },
  {
    voice_id: "EXAVITQu4vr4xnSDxMaL",
    name: "Bella",
    category: "premade",
    description: "Fallback ElevenLabs voice",
    labels: { source: "fallback" },
    preview_url: "",
  },
  {
    voice_id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    category: "premade",
    description: "Fallback ElevenLabs voice",
    labels: { source: "fallback" },
    preview_url: "",
  },
];

const FPT_TTS_VOICES = [
  { voice_id: "fpt:banmai", name: "Ban Mai (Nữ miền Bắc)", labels: { provider: "fpt", language: "vi", locale: "vi-VN", accent: "northern", gender: "female" } },
  { voice_id: "fpt:thuminh", name: "Thu Minh (Nữ miền Bắc)", labels: { provider: "fpt", language: "vi", locale: "vi-VN", accent: "northern", gender: "female" } },
  { voice_id: "fpt:leminh", name: "Lê Minh (Nam miền Bắc)", labels: { provider: "fpt", language: "vi", locale: "vi-VN", accent: "northern", gender: "male" } },
  { voice_id: "fpt:lannhi", name: "Lan Nhi (Nữ miền Nam)", labels: { provider: "fpt", language: "vi", locale: "vi-VN", accent: "southern", gender: "female" } },
  { voice_id: "fpt:linhsan", name: "Linh San (Nữ miền Nam)", labels: { provider: "fpt", language: "vi", locale: "vi-VN", accent: "southern", gender: "female" } },
  { voice_id: "fpt:myan", name: "Mỹ An (Nữ miền Trung)", labels: { provider: "fpt", language: "vi", locale: "vi-VN", accent: "central", gender: "female" } },
  { voice_id: "fpt:giahuy", name: "Gia Huy (Nam miền Trung)", labels: { provider: "fpt", language: "vi", locale: "vi-VN", accent: "central", gender: "male" } },
  { voice_id: "fpt:ngoclam", name: "Ngọc Lam (Nữ miền Trung)", labels: { provider: "fpt", language: "vi", locale: "vi-VN", accent: "central", gender: "female" } },
];

function env(name: string) {
  return Deno.env.get(name) || "";
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

function assertAllowedRole(role: string) {
  if (!["admin", "assistant", "teacher", "marketing", "accountant"].includes(String(role || ""))) {
    throw new Error("Tài khoản này chưa có quyền tạo giọng đọc Facebook.");
  }
}

function parseMetadata(value: unknown): JsonRecord {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

function safeFileName(name: string) {
  const clean = String(name || "audio").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-");
  return clean.slice(0, 120) || "audio";
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
    throw new Error(`Cannot make Google Drive file public: ${data?.error?.message || res.statusText}`);
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
    name: `facebook-tts-${Date.now()}-${crypto.randomUUID()}-${safeFileName(filename)}`,
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
  const fileId = String(data.id || "");
  return {
    fileId,
    webViewLink: data.webViewLink || "",
    url: `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
    lh3Url: `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}`,
    mimeType: data.mimeType || mimeType,
    size: Number(data.size || bytes.byteLength),
  };
}

async function listElevenLabsVoices() {
  const apiKey = env("ELEVENLABS_API_KEY");
  if (!apiKey) throw new Error("Thiếu Supabase secret ELEVENLABS_API_KEY.");
  const res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
    headers: { "xi-api-key": apiKey },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.detail?.message || data?.message || "Không tải được danh sách voice ElevenLabs.";
    if (String(message).includes("voices_read")) return FALLBACK_ELEVENLABS_VOICES;
    throw new Error(message);
  }
  const voices = Array.isArray(data?.voices) ? data.voices : [];
  return voices.map((voice: JsonRecord) => ({
    voice_id: String(voice.voice_id || ""),
    name: String(voice.name || "Voice"),
    category: String(voice.category || ""),
    description: String(voice.description || ""),
    labels: voice.labels && typeof voice.labels === "object" ? voice.labels : {},
    preview_url: String(voice.preview_url || ""),
  })).filter((voice: { voice_id: string }) => voice.voice_id);
}

function defaultElevenLabsVoice() {
  return {
    voice_id: DEFAULT_ELEVENLABS_VOICE_ID,
    name: "ElevenLabs Adam",
    category: "default",
    description: "Default ElevenLabs voice for MindUp reels",
    labels: { provider: "elevenlabs", model: DEFAULT_ELEVENLABS_MODEL_ID },
    preview_url: "",
  };
}

function listFptVoices() {
  return FPT_TTS_VOICES.map((voice) => ({
    ...voice,
    category: "fpt",
    description: "FPT.AI Vietnamese Text to Speech",
    preview_url: "",
  }));
}

function resolveFptVoiceId(voiceId: string) {
  const clean = String(voiceId || "").trim();
  if (!clean) return "thuminh";
  return clean.replace(/^fpt:/i, "") || "thuminh";
}

async function waitForFptAudio(asyncUrl: string) {
  const cleanUrl = String(asyncUrl || "").trim();
  if (!cleanUrl) throw new Error("FPT.AI không trả về link audio.");
  let lastStatus = 0;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt < 5 ? 3000 : 5000));
    const res = await fetch(cleanUrl);
    lastStatus = res.status;
    const contentType = res.headers.get("Content-Type") || "";
    if (res.ok && (contentType.includes("audio") || cleanUrl.toLowerCase().endsWith(".mp3"))) {
      return new Uint8Array(await res.arrayBuffer());
    }
  }
  throw new Error(`FPT.AI đã nhận request nhưng file audio chưa sẵn sàng (HTTP ${lastStatus || "timeout"}). Hãy thử tạo lại sau ít phút.`);
}

async function generateFptSpeech(text: string, voiceId: string) {
  const apiKey = env("FPT_AI_API_KEY");
  if (!apiKey) throw new Error("Thiếu Supabase secret FPT_AI_API_KEY.");
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleanText) throw new Error("Chưa có nội dung voice-over để tạo giọng đọc.");
  if (cleanText.length > 5000) throw new Error("Voice-over quá dài. FPT.AI chỉ nhận tối đa 5000 ký tự mỗi request.");
  const fptVoice = resolveFptVoiceId(voiceId);
  const res = await fetch("https://api.fpt.ai/hmi/tts/v5", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "voice": fptVoice,
      "speed": "",
      "format": "mp3",
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: cleanText,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || Number(data?.error || 0) !== 0) {
    throw new Error(data?.message || "Không tạo được giọng đọc FPT.AI.");
  }
  return waitForFptAudio(String(data?.async || ""));
}

async function generateElevenLabsSpeech(text: string, voiceId: string) {
  const apiKey = env("ELEVENLABS_API_KEY");
  if (!apiKey) throw new Error("Thiếu Supabase secret ELEVENLABS_API_KEY.");
  const modelId = DEFAULT_ELEVENLABS_MODEL_ID;
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleanText) throw new Error("Chưa có nội dung voice-over để tạo giọng đọc.");
  if (cleanText.length > 4500) throw new Error("Voice-over quá dài. Hãy rút gọn dưới 4500 ký tự.");
  const cleanVoiceId = String(voiceId || DEFAULT_ELEVENLABS_VOICE_ID).trim();
  if (!cleanVoiceId) throw new Error("Chưa chọn voice ElevenLabs.");

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cleanVoiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: cleanText,
      model_id: modelId,
      voice_settings: {
        stability: 0.46,
        similarity_boost: 0.82,
        style: 0.18,
        use_speaker_boost: true,
      },
    }),
  });
  const contentType = res.headers.get("Content-Type") || "";
  if (!res.ok || !contentType.includes("audio")) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail?.message || data?.message || "Không tạo được giọng đọc ElevenLabs.");
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function loadPost(postId: string) {
  const rows = await fetchJson<Array<{
    id: string;
    page_id: string;
    post_type_id: string;
    content: string | null;
    internal_note: string | null;
    metadata: JsonRecord | string | null;
    type?: { name?: string };
  }>>(
    `facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}&select=id,page_id,post_type_id,content,internal_note,metadata,type:facebook_post_types(name)&limit=1`,
  );
  const post = rows[0];
  if (!post?.id) throw new Error("Không tìm thấy bài đăng.");
  return post;
}

function extractVoiceOver(post: Awaited<ReturnType<typeof loadPost>>, fallbackText = "") {
  const metadata = parseMetadata(post.metadata);
  const applying = (metadata.applying_knowledge && typeof metadata.applying_knowledge === "object" ? metadata.applying_knowledge : {}) as JsonRecord;
  const reel = (applying.reel && typeof applying.reel === "object" ? applying.reel : {}) as JsonRecord;
  const fromMetadata = String(reel.voiceOver || reel.voice_over || "").trim();
  const wordCount = (value: string) => value.split(/\s+/).filter(Boolean).length;
  const directText = String(fallbackText || "").trim();
  if (directText) return directText;
  const note = String(post.internal_note || "");
  const sceneVoiceOver = Array.isArray(reel.scenes)
    ? reel.scenes.map((scene: unknown) => {
      const record = (scene && typeof scene === "object" ? scene : {}) as JsonRecord;
      return String(record.voice_text || record.voiceText || record.voice_over || "").trim();
    }).filter(Boolean).join(" ")
    : "";
  const noteVoiceMatch = note.match(/Voice-over:\s*([\s\S]*?)(?:\nScenes:|\nReel caption:|\nReel hashtags:|$)/i);
  const fromNote = String(noteVoiceMatch?.[1] || "").trim();
  const captionFallback = String(post.content || "")
    .replace(/#\S+/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 155)
    .join(" ");
  const candidates = [fallbackText, fromMetadata, sceneVoiceOver, fromNote]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const longCandidate = candidates.find((value) => wordCount(value) >= 90);
  if (longCandidate) return longCandidate;
  const bestCandidate = candidates
    .sort((a, b) => wordCount(b) - wordCount(a))[0];
  if (bestCandidate) return bestCandidate;
  if (captionFallback) return captionFallback;
  return "";
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
    const action = String(body?.action || "generate").trim().toLowerCase();
    if (action === "voices") {
      const voices = [defaultElevenLabsVoice()];
      return jsonResponse({ ok: true, voices });
    }

    postId = String(body?.post_id || "").trim();
    if (!postId) throw new Error("Thiếu post_id.");
    const post = await loadPost(postId);
    const voiceId = String(body?.voice_id || DEFAULT_ELEVENLABS_VOICE_ID).trim();
    const voiceName = String(body?.voice_name || "").trim();
    const audioKey = String(body?.audio_key || "audio").trim() === "explainer_audio" ? "explainer_audio" : "audio";
    const text = extractVoiceOver(post, String(body?.text || ""));
    const useFpt = voiceId.startsWith("fpt:");
    const audioBytes = useFpt ? await generateFptSpeech(text, voiceId) : await generateElevenLabsSpeech(text, voiceId);
    const uploaded = await uploadBytesToDrive(audioBytes, `mindup-reel-voice-${postId}.mp3`, "audio/mpeg");

    const metadata = parseMetadata(post.metadata);
    const applying = (metadata.applying_knowledge && typeof metadata.applying_knowledge === "object" ? metadata.applying_knowledge : {}) as JsonRecord;
    const audio = {
      provider: useFpt ? "fpt-ai" : "elevenlabs",
      voice_id: useFpt ? `fpt:${resolveFptVoiceId(voiceId)}` : voiceId,
      voice_name: voiceName || (useFpt ? FPT_TTS_VOICES.find((voice) => voice.voice_id === `fpt:${resolveFptVoiceId(voiceId)}`)?.name || resolveFptVoiceId(voiceId) : ""),
      text,
      file_id: uploaded.fileId,
      url: uploaded.downloadUrl || uploaded.url,
      preview_url: uploaded.downloadUrl || uploaded.url,
      web_view_link: uploaded.webViewLink,
      mime_type: uploaded.mimeType,
      size: uploaded.size,
      created_at: new Date().toISOString(),
    };
    const updatedMetadata = {
      ...metadata,
      applying_knowledge: {
        ...applying,
        enabled: true,
        [audioKey]: audio,
        updated_at: new Date().toISOString(),
      },
    };
    const noteLine = `${audioKey === "explainer_audio" ? "Long explainer voice audio" : "Voice audio"}: ${audio.preview_url}`;
    const currentNote = String(post.internal_note || "").trim();
    const finalNote = currentNote.includes(noteLine) ? currentNote : [currentNote, noteLine].filter(Boolean).join("\n\n");
    const rows = await patchJson<Array<JsonRecord>>(`facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}`, {
      metadata: updatedMetadata,
      internal_note: finalNote || null,
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      ok: true,
      post: rows?.[0] || null,
      audio,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Không tạo được giọng đọc.";
    return jsonResponse({ error: message }, message.includes("Authentication") ? 401 : 500);
  }
});
