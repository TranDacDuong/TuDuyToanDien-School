const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

function parseKeys(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean);
    if (typeof parsed === "string") return parsed.split(/[\n,;]+/).map(value => value.trim()).filter(Boolean);
  } catch { /* Legacy single keys are not JSON. */ }
  return raw.split(/[\n,;]+/).map(value => value.trim()).filter(Boolean);
}

// Per-isolate cooldowns reduce repeated quota failures; Google remains the quota authority.
const cooldowns = new Map<string, number>();
let keyCursor = 0;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let messages, purpose;
  try { ({ messages, purpose } = await req.json()); } catch { return json({ error: "Invalid JSON request" }, 400); }
  if (!Array.isArray(messages) || !messages.length || messages.length > 50) return json({ error: "Invalid messages" }, 400);

  const keys = [...new Set([
    ...parseKeys(Deno.env.get("GEMINI_API_KEYS") || ""),
    ...parseKeys(Deno.env.get("GEMINI_API_KEY") || ""),
  ])];
  if (!keys.length) return json({ error: "Chưa cấu hình khóa Gemini cho dịch vụ AI." }, 503);
  const parts: Record<string, unknown>[] = [];
  for (const message of messages) {
    if (typeof message?.content === "string") parts.push({ text: message.content });
    else if (Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part?.type === "text" && typeof part.text === "string") parts.push({ text: part.text });
        else if (part?.type === "image" && part.source?.type === "base64" && typeof part.source.data === "string") {
          parts.push({ inline_data: { mime_type: part.source.media_type, data: part.source.data } });
        }
      }
    }
  }
  if (!parts.length) return json({ error: "Không có nội dung để xử lý." }, 400);

  // Only answer filling opts into free-tier eligible models; other AI tools keep their model.
  const models = purpose === "question_answers"
    ? ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-2.5-flash"]
    : [Deno.env.get("AI_SOLUTION_MODEL") || "gemini-2.5-flash"];
  const start = keyCursor++ % keys.length;
  const orderedKeys = [...keys.slice(start), ...keys.slice(0, start)];
  const deadline = Date.now() + 70000;
  let rateLimited = false;
  let retrySeconds = Infinity;
  for (const model of models) {
  for (const key of orderedKeys) {
    const cooldownKey = model + ":" + key;
    const waiting = Math.ceil(((cooldowns.get(cooldownKey) || 0) - Date.now()) / 1000);
    if (waiting > 0) { rateLimited = true; retrySeconds = Math.min(retrySeconds, waiting); continue; }
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal: AbortSignal.timeout(Math.min(30000, remaining)),
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: 8192 } }),
      });
      const data = await response.json().catch(() => null);
      if (response.status === 429) {
        rateLimited = true;
        const details = data?.error?.details || [];
        const daily = /perday|per_day|daily/i.test(JSON.stringify(details));
        const retry = details.find((item: { retryDelay?: string }) => item.retryDelay)?.retryDelay;
        const seconds = daily ? 86400 : Math.max(1, Math.ceil(Number.parseFloat(retry || response.headers.get("retry-after") || "60") || 60));
        cooldowns.set(cooldownKey, Date.now() + seconds * 1000);
        retrySeconds = Math.min(retrySeconds, seconds);
        continue;
      }
      if (response.status === 404) break;
      if (!response.ok) continue;
      const candidate = data?.candidates?.[0];
      if (candidate?.finishReason === "MAX_TOKENS") return json({ error: "Phản hồi AI bị cắt ngắn. Hãy xử lý ít câu hơn mỗi lần." }, 502);
      const text = (candidate?.content?.parts || []).filter((part: { text?: string; thought?: boolean }) => typeof part.text === "string" && !part.thought)
        .map((part: { text: string }) => part.text).join("");
      if (!text.trim()) return json({ error: "AI chưa trả về nội dung hợp lệ; cần kiểm tra câu hỏi hoặc hình ảnh." }, 422);
      return json({ content: [{ type: "text", text }], model });
    } catch { /* Do not expose keys or provider URLs in errors. */ }
  }
  }
  return rateLimited
    ? json({ error: "Các model/khóa Gemini hiện có đang bị giới hạn hạn mức. Các khóa cùng dự án dùng chung quota.", retry_after_seconds: Number.isFinite(retrySeconds) ? retrySeconds : null }, 429)
    : json({ error: "Chưa kết nối được Gemini bằng cấu hình hiện tại. Kiểm tra khóa API, model và trạng thái dịch vụ." }, 502);
});
