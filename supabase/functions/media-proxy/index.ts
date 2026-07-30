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

function env(name: string) {
  return Deno.env.get(name) || "";
}

async function requireAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
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

function isAllowedMediaUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return false;
    return (
      host === "drive.google.com" ||
      host === "lh3.googleusercontent.com" ||
      host === "images.pexels.com" ||
      host === "videos.pexels.com"
    );
  } catch (_) {
    return false;
  }
}

async function fetchBinary(url: string) {
  if (!isAllowedMediaUrl(url)) throw new Error("URL media không được phép proxy.");
  const res = await fetch(url, {
    headers: {
      "User-Agent": "MindUp/1.0",
    },
  });
  if (!res.ok) throw new Error(`Không tải được media: ${res.status} ${res.statusText}`);
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > 30 * 1024 * 1024) throw new Error("Media quá lớn để dùng trong Reel.");
  return { bytes, contentType };
}

async function searchPexelsImage(query: string) {
  const apiKey = env("PEXELS_API_KEY");
  if (!apiKey) throw new Error("Thiếu Supabase secret PEXELS_API_KEY.");
  const cleanQuery = String(query || "").replace(/\s+/g, " ").trim();
  if (!cleanQuery) throw new Error("Thiếu từ khóa tìm ảnh scene.");
  const searchUrl = new URL("https://api.pexels.com/v1/search");
  searchUrl.searchParams.set("query", `${cleanQuery}, education, no text`);
  searchUrl.searchParams.set("orientation", "portrait");
  searchUrl.searchParams.set("per_page", "5");
  searchUrl.searchParams.set("page", "1");
  const res = await fetch(searchUrl.toString(), {
    headers: { Authorization: apiKey },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || data?.message || "Pexels search failed");
  const photos = Array.isArray(data?.photos) ? data.photos : [];
  const photo = photos.find((item: unknown) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : null;
    const src = record?.src && typeof record.src === "object" ? record.src as Record<string, unknown> : null;
    return src?.portrait || src?.large2x || src?.large || src?.original;
  }) as Record<string, unknown> | undefined;
  if (!photo) return null;
  const src = photo.src && typeof photo.src === "object" ? photo.src as Record<string, unknown> : {};
  return {
    url: String(src.portrait || src.large2x || src.large || src.original || ""),
    alt: String(photo.alt || ""),
    photographer: String(photo.photographer || ""),
    page_url: String(photo.url || ""),
  };
}

async function searchPexelsVideo(query: string) {
  const apiKey = env("PEXELS_API_KEY");
  if (!apiKey) throw new Error("Thiếu Supabase secret PEXELS_API_KEY.");
  const cleanQuery = String(query || "").replace(/\s+/g, " ").trim();
  if (!cleanQuery) throw new Error("Thiếu từ khóa tìm video scene.");
  const searchUrl = new URL("https://api.pexels.com/videos/search");
  searchUrl.searchParams.set("query", `${cleanQuery}, education`);
  searchUrl.searchParams.set("orientation", "portrait");
  searchUrl.searchParams.set("per_page", "6");
  searchUrl.searchParams.set("page", "1");
  const res = await fetch(searchUrl.toString(), {
    headers: { Authorization: apiKey },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || data?.message || "Pexels video search failed");
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  for (const item of videos) {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : null;
    const files = Array.isArray(record?.video_files) ? record.video_files as Array<Record<string, unknown>> : [];
    const candidates = files
      .filter(file => String(file.file_type || "").includes("mp4") && String(file.link || ""))
      .map(file => ({
        link: String(file.link || ""),
        width: Number(file.width || 0),
        height: Number(file.height || 0),
        quality: String(file.quality || ""),
      }))
      .sort((a, b) => {
        const portraitA = a.height >= a.width ? 0 : 1;
        const portraitB = b.height >= b.width ? 0 : 1;
        if (portraitA !== portraitB) return portraitA - portraitB;
        const scoreA = Math.abs(a.height - 1280) + Math.abs(a.width - 720);
        const scoreB = Math.abs(b.height - 1280) + Math.abs(b.width - 720);
        return scoreA - scoreB;
      });
    const best = candidates[0];
    if (best?.link) {
      return {
        url: best.link,
        width: best.width,
        height: best.height,
        quality: best.quality,
        duration: Number(record?.duration || 0),
        page_url: String(record?.url || ""),
      };
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    await requireAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "fetch").trim().toLowerCase();
    if (action === "pexels_image") {
      const image = await searchPexelsImage(String(body?.query || ""));
      return jsonResponse({ ok: true, image });
    }
    if (action === "pexels_video") {
      const video = await searchPexelsVideo(String(body?.query || ""));
      return jsonResponse({ ok: true, video });
    }
    const url = String(body?.url || "").trim();
    const { bytes, contentType } = await fetchBinary(url);
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Media proxy failed";
    return jsonResponse({ error: message }, 500);
  }
});
