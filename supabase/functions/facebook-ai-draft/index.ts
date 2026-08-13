const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

const MONDAY_MINDSET_ITEMS = [
  "GET TO vs. HAVE TO: Thay đổi thái độ từ nghĩa vụ sang đặc ân.",
  "Talk to Yourself, Don't Listen to Yourself: Nói chuyện với chính mình bằng sự khích lệ thay vì ngồi nghe những suy nghĩ sợ hãi tự động.",
  "Feed the Positive Dog: Trong bạn có 2 con chó tích cực và tiêu cực, con nào bạn cho ăn nhiều hơn sẽ thắng.",
  "Love over Fear: Hành động vì tình yêu công việc và sự cống hiến, không phải vì sợ thất bại.",
  "Energy Giver vs. Energy Drainer: Hãy là nguồn phát năng lượng thay vì máy hút năng lượng của người khác.",
  "Gratitude Kills Stress: Bạn không thể vừa biết ơn vừa lo âu cùng một lúc.",
  "Positive Disruption: Dùng sự tích cực để phá vỡ sự trì trệ và tư duy cũ kỹ.",
  "The Power of a Smile: Nụ cười và năng lượng tích cực có khả năng lây lan sinh học.",
  "Complaining is Waste of Energy: Phàn nàn không giải quyết được vấn đề, chỉ làm cạn kiệt năng lượng.",
  "Be a Vitamin, Not a Virus: Mang lại sức sống cho môi trường xung quanh thay vì lan truyền sự tiêu cực.",
  "Life is Like a Roller Coaster: Cuộc sống có lúc trầm lúc thăng, điểm lùi là đà cho bước tiến tiếp theo.",
  "Refine, Not Define: Thất bại là để mài giũa bản lĩnh, không phải để định nghĩa con người bạn.",
  "The Bamboo Principle: Sự kiên trì cắm rễ âm thầm trong bóng tối sẽ tạo nên sự bứt phá thần tốc sau này.",
  "Embrace the Struggle: Khó khăn không đến để cản đường bạn, nó đến để rèn luyện bạn.",
  "Don't Let Doubt Win: Sự nghi ngờ tiêu diệt nhiều giấc mơ hơn là thất bại.",
  "Finish Strong: Cách bạn kết thúc quan trọng không kém cách bạn bắt đầu.",
  "Keep Moving Forward: Khi gặp giông bão, lựa chọn duy nhất là tiếp tục tiến lên.",
  "Overcome the Wall: Mọi người thành công đều từng đụng phải bức tường nản lòng và quyết định vượt qua nó.",
  "Failure is a Teacher: Đặt câu hỏi bài học ở đây là gì thay vì tại sao lại là tôi.",
  "Grit is Built in the Dark: Sự vững vàng được tạo ra khi không ai nhìn thấy bạn nỗ lực.",
  "Control What You Can Control: Chỉ tập trung vào thái độ, nỗ lực và hành động của chính mình.",
  "Focus on the Process, Not the Outcome: Tập trung làm tốt việc hôm nay, kết quả sẽ tự đến.",
  "1% Better Every Day: Cải thiện bản thân từng chút một mỗi ngày để tạo nên sự thay đổi phi thường.",
  "One Word That Will Change Your Life: Chọn một từ khóa định hình mục tiêu cho cả năm thay vì danh sách nghị quyết dài dòng.",
  "Eliminate Distractions: Loại bỏ những tiếng ồn không phục vụ cho sứ mệnh của bạn.",
  "Win the Morning, Win the Day: Cách bạn bắt đầu buổi sáng quyết định năng lượng của cả ngày.",
  "Be Present: Hiện diện 100% trong công việc và mối quan hệ ở thời điểm hiện tại.",
  "Action Cures Fear: Hành động là liều thuốc duy nhất dập tắt sự sợ hãi.",
  "Do It with Passion or Not at All: Làm việc với niềm đam mê hoặc đừng làm.",
  "Keep It Simple: Đừng phức tạp hóa mọi thứ, tập trung vào những điều cốt lõi.",
  "You Can't Do It Alone: Không ai thành công một mình, hãy biết kết nối và nhờ sự trợ giúp.",
  "Encourage in Public, Coach in Private: Tôn trọng và khen ngợi công khai, góp ý riêng tư.",
  "Connect Before You Lead: Mối quan hệ tốt là nền tảng của sự lãnh đạo hiệu quả.",
  "Forgive Fast: Tha thứ nhanh chóng để giải phóng bản thân khỏi gánh nặng oán giận.",
  "WE before ME: Đặt lợi ích của tập thể lên trên cái tôi cá nhân.",
  "Build a Culture of Greatness: Văn hóa được xây dựng từ những hành vi nhỏ lặp đi lặp lại hằng ngày.",
  "Serve Others: Lãnh đạo thực sự là phục vụ và nâng đỡ người khác.",
  "Tough Love: Yêu thương đi kèm với kỷ luật và tiêu chuẩn cao.",
  "Celebrate Others' Success: Thành công của đồng đội cũng là thành công của bạn.",
  "Listen to Understand: Lắng nghe để hiểu và chia sẻ, không phải để đối đáp.",
  "Purpose Driven: Mục đích sống và làm việc tạo ra nguồn năng lượng vô tận.",
  "Vision Keeps You Going: Khi bạn có một tầm nhìn rõ ràng, bạn sẽ vượt qua mọi trở ngại.",
  "Leave a Legacy: Hãy sống và làm việc sao cho giá trị bạn để lại kéo dài mãi mãi.",
  "Be a Transformer, Not a Conformist: Thay đổi môi trường xung quanh thay vì để môi trường đồng hóa bạn.",
  "Hope is a Superpower: Hy vọng kết hợp với hành động là sức mạnh định hình tương lai.",
  "Your Mindset is Your Choice: Tư duy không phải là bẩm sinh, đó là lựa chọn mỗi sáng bạn thức dậy.",
  "Believe Before You See: Bạn phải tin vào thành công trước khi bạn nhìn thấy nó xuất hiện.",
  "Trust the Journey: Tin tưởng vào hành trình và bài học mà cuộc sống đang mang lại cho bạn.",
  "Shine Your Light: Đừng giấu đi năng lực và năng lượng tích cực của bạn.",
  "Today is a Gift: Hôm nay là một món quà hoàn toàn mới để bạn viết tiếp câu chuyện của mình.",
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return Deno.env.get(name) || "";
}

function geminiApiKeys() {
  const keys = [
    ...env("GEMINI_API_KEYS").split(/[\n,;]+/),
    env("GEMINI_API_KEY"),
  ].map((key) => key.trim()).filter(Boolean);
  return Array.from(new Set(keys));
}

function llamaApiKeys() {
  const keys = [
    ...env("LLAMA_API_KEYS").split(/[\n,;]+/),
    env("LLAMA_API_KEY"),
  ].map((key) => key.trim()).filter(Boolean);
  return Array.from(new Set(keys));
}

function normalizeTextAiProvider(value: unknown) {
  const provider = String(value || "").trim().toLowerCase();
  if (provider.includes("llama") || provider.includes("groq")) return "llama";
  if (provider.includes("gemini") || provider.includes("google")) return "gemini";
  return "";
}

function preferredTextAiProvider(providerOverride: unknown = "") {
  const override = normalizeTextAiProvider(providerOverride);
  if (override) return override;
  const explicit = normalizeTextAiProvider(env("FACEBOOK_AI_TEXT_PROVIDER") || env("AI_TEXT_PROVIDER"));
  if (explicit) return explicit;
  return llamaApiKeys().length ? "llama" : "gemini";
}

function isRetryableGeminiError(status: number, message: string) {
  const lower = message.toLowerCase();
  return status === 429
    || status === 503
    || lower.includes("high demand")
    || lower.includes("quota")
    || lower.includes("rate limit")
    || lower.includes("resource exhausted")
    || lower.includes("try again later");
}

async function postGeminiGenerateContent(args: {
  prompt: string;
  temperature: number;
}) {
  const keys = geminiApiKeys();
  if (!keys.length) throw new Error("Thiếu Supabase secret GEMINI_API_KEYS hoặc GEMINI_API_KEY.");

  const model = env("GEMINI_TEXT_MODEL") || "gemini-2.5-pro";
  const errors: string[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const apiKey = keys[index];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: args.prompt }] }],
        generationConfig: {
          temperature: args.temperature,
          response_mime_type: "application/json",
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { model, data };

    const message = data?.error?.message || "Gemini text generation failed";
    errors.push(`Key ${index + 1}: ${message}`);
    if (!isRetryableGeminiError(res.status, message) && res.status !== 400 && res.status !== 403) {
      throw new Error(message);
    }
  }

  throw new Error(errors.join(" | ") || "Gemini text generation failed");
}

async function postLlamaGenerateContent(args: {
  prompt: string;
  temperature: number;
}) {
  const keys = llamaApiKeys();
  if (!keys.length) throw new Error("Thiếu Supabase secret LLAMA_API_KEYS hoặc LLAMA_API_KEY.");

  const baseUrl = (env("LLAMA_API_BASE_URL") || env("OPENAI_COMPATIBLE_API_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/+$/g, "");
  const model = env("LLAMA_TEXT_MODEL") || "llama-3.3-70b-versatile";
  const errors: string[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const apiKey = keys[index];
    const callLlama = async (useJsonMode: boolean) => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: [
                "You create high-performing Vietnamese Facebook educational content for MindUp.",
                "Return only valid JSON. Do not wrap JSON in markdown.",
                "Use JSON string values with escaped newlines if needed. Do not include raw control characters.",
                "Write naturally, emotionally, and with strong Facebook hooks.",
              ].join(" "),
            },
            { role: "user", content: args.prompt },
          ],
          temperature: args.temperature,
          ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      const text = data?.choices?.[0]?.message?.content || "";
      const message = data?.error?.message || data?.message || `Llama text generation failed (${res.status})`;
      return { res, data, text, message };
    };

    let result = await callLlama(true);
    if (!result.res.ok && String(result.message || "").toLowerCase().includes("failed to generate json")) {
      result = await callLlama(false);
    }
    if (result.res.ok && result.text) {
      return {
        model: `llama:${model}`,
        data: {
          candidates: [{ content: { parts: [{ text: result.text }] } }],
        },
      };
    }
    errors.push(`Key ${index + 1}: ${result.message}`);
  }
  throw new Error(errors.join(" | ") || "Llama text generation failed");
}

async function postAiGenerateContent(args: {
  prompt: string;
  temperature: number;
  provider?: string;
}) {
  const explicitProvider = normalizeTextAiProvider(args.provider);
  const provider = preferredTextAiProvider(args.provider);
  if (provider.includes("llama")) {
    try {
      return await postLlamaGenerateContent(args);
    } catch (error) {
      if (explicitProvider) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (!geminiApiKeys().length) throw error;
      console.warn("[Facebook AI Draft] Llama failed, falling back to Gemini:", message);
      return await postGeminiGenerateContent(args);
    }
  }
  return await postGeminiGenerateContent(args);
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

function escapeControlCharsInsideJsonStrings(value: string) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (const ch of String(value || "")) {
    if (!inString) {
      output += ch;
      if (ch === "\"") inString = true;
      continue;
    }
    if (escaped) {
      output += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      output += ch;
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      output += ch;
      inString = false;
      continue;
    }
    if (ch === "\n") {
      output += "\\n";
      continue;
    }
    if (ch === "\r") {
      output += "\\r";
      continue;
    }
    if (ch === "\t") {
      output += "\\t";
      continue;
    }
    const code = ch.charCodeAt(0);
    output += code < 32 ? " " : ch;
  }
  return output;
}

function isEscaped(value: string, index: number) {
  let count = 0;
  for (let i = index - 1; i >= 0 && value[i] === "\\"; i -= 1) count += 1;
  return count % 2 === 1;
}

function insertMissingCommasBetweenJsonProperties(value: string) {
  return String(value || "")
    .replace(/"\s+(?="[\w-]+"\s*:)/g, '",')
    .replace(/([}\]])\s+(?="[\w-]+"\s*:)/g, "$1,")
    .replace(/(true|false|null|-?\d+(?:\.\d+)?)\s+(?="[\w-]+"\s*:)/g, "$1,");
}

function parseGeminiJsonCandidate(value: string) {
  try {
    return JSON.parse(value);
  } catch (firstError) {
    const repaired = escapeControlCharsInsideJsonStrings(value);
    try {
      return JSON.parse(repaired);
    } catch (_) {
      const latexBackslashRepaired = escapeInvalidJsonBackslashes(repaired);
      try {
        return JSON.parse(latexBackslashRepaired);
      } catch (_) {
        const commaRepaired = insertMissingCommasBetweenJsonProperties(latexBackslashRepaired);
        try {
          return JSON.parse(commaRepaired);
        } catch (_) {
          throw firstError;
        }
      }
    }
  }
}

function escapeInvalidJsonBackslashes(value: string) {
  let output = "";
  let inString = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === '"' && !isEscaped(value, i)) {
      inString = !inString;
      output += char;
      continue;
    }
    if (inString && char === "\\") {
      const next = value[i + 1] || "";
      const nextFour = value.slice(i + 2, i + 6);
      const validSimple = ['"', "\\", "/", "b", "f", "n", "r", "t"].includes(next);
      const validUnicode = next === "u" && /^[0-9a-fA-F]{4}$/.test(nextFour);
      output += validSimple || validUnicode ? "\\" : "\\\\";
      continue;
    }
    output += char;
  }
  return output;
}

function tryParseJson(text: string) {
  const cleaned = String(text || "").trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return parseGeminiJsonCandidate(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return parseGeminiJsonCandidate(match[0]);
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

function isMondayMindset(typeName: string) {
  return String(typeName || "").trim().toLowerCase() === "monday mindset";
}

function isHardQuizWithPrize(typeName: string) {
  return String(typeName || "").trim().toLowerCase().includes("hard quiz");
}

function isProblemType(typeName: string) {
  const normalized = String(typeName || "").trim().toLowerCase();
  return normalized === "problem";
}

function isTeachingPhilosophy(typeName: string) {
  return String(typeName || "").trim().toLowerCase() === "teaching philosophy";
}

function isLearningMethod(typeName: string) {
  return String(typeName || "").trim().toLowerCase() === "learning method";
}

function isApplyingKnowledge(typeName: string) {
  const normalized = stripVietnameseForTag(typeName || "").toLowerCase();
  return normalized === "applying knowledge to practice" || normalized.includes("applying knowledge");
}

function isInterestingQuestion(typeName: string) {
  const normalized = stripVietnameseForTag(typeName || "").toLowerCase();
  return normalized.includes("interesting question")
    || normalized.includes("cau hoi thu vi")
    || normalized.includes("cau hoi hay");
}

function isRealWorldPhenomenon(typeName: string) {
  const normalized = stripVietnameseForTag(typeName || "").toLowerCase();
  return normalized.includes("real world phenomenon")
    || normalized.includes("real-world phenomenon")
    || normalized.includes("hien tuong thuc te")
    || normalized.includes("phenomenon");
}

function isQuizTypeName(typeName: string) {
  return String(typeName || "").trim().toLowerCase() === "quiz";
}

const QUIZ_WEEKDAY_GRADES = [12, 9, 10, 11, 12, 10, 11]; // JS Sunday=0, Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6.

const QUIZ_CURRICULUM_TOPICS: Record<string, Record<number, string>> = {
  "Toán học": {
    6: "số tự nhiên, phân số, số thập phân, hình học trực quan",
    7: "số hữu tỉ, tỉ lệ thức, biểu thức đại số, góc và tam giác",
    8: "đa thức, hằng đẳng thức, phương trình bậc nhất, tứ giác",
    9: "căn bậc hai, hàm số bậc nhất, hệ phương trình, đường tròn",
    10: "mệnh đề - tập hợp, hàm số, phương trình, hệ thức lượng",
    11: "lượng giác, dãy số, giới hạn, đạo hàm cơ bản",
    12: "hàm số, mũ - logarit, nguyên hàm - tích phân, hình học Oxyz",
  },
  "Vật lý": {
    6: "đo lường, lực, khối lượng, nhiệt độ",
    7: "tốc độ, âm thanh, ánh sáng, nam châm",
    8: "áp suất, lực đẩy Archimedes, cơ năng, nhiệt học",
    9: "điện học, điện trở, công suất điện, điện từ",
    10: "động học, động lực học, công - năng lượng, động lượng",
    11: "điện trường, dòng điện, từ trường, cảm ứng điện từ",
    12: "dao động, sóng, điện xoay chiều, quang học, hạt nhân",
  },
  "Hóa học": {
    6: "chất, thể của chất, hỗn hợp, tách chất",
    7: "nguyên tử, nguyên tố hóa học, phân tử, liên kết hóa học",
    8: "phản ứng hóa học, mol, dung dịch, oxit - axit - bazơ",
    9: "kim loại, phi kim, hydrocarbon, polymer cơ bản",
    10: "cấu tạo nguyên tử, bảng tuần hoàn, liên kết hóa học, phản ứng oxi hóa khử",
    11: "cân bằng hóa học, acid-base, nitrogen-sulfur, hydrocarbon",
    12: "ester-lipid, carbohydrate, amine-amino acid-protein, polymer, kim loại",
  },
  "Sinh học": {
    6: "tế bào, cơ thể sống, đa dạng thế giới sống, vi sinh vật",
    7: "trao đổi chất, cảm ứng, sinh trưởng, sinh sản ở sinh vật",
    8: "cơ thể người, dinh dưỡng, tuần hoàn, hô hấp, thần kinh",
    9: "di truyền, nhiễm sắc thể, DNA, biến dị, sinh thái",
    10: "sinh học tế bào, chuyển hóa vật chất, phân bào, vi sinh vật",
    11: "chuyển hóa, cảm ứng, sinh trưởng, sinh sản ở thực vật và động vật",
    12: "di truyền học, tiến hóa, sinh thái học",
  },
  "Ngữ văn": {
    6: "truyện, thơ, ký, tiếng Việt và viết đoạn văn",
    7: "văn bản tự sự, biểu cảm, nghị luận, biện pháp tu từ",
    8: "truyện ký, thơ, nghị luận xã hội, câu ghép",
    9: "truyện hiện đại, thơ, nghị luận văn học, tổng kết ngữ pháp",
    10: "văn học dân gian, thơ trung đại, nghị luận xã hội",
    11: "văn học trung đại và hiện đại, thao tác lập luận, đọc hiểu",
    12: "văn học hiện đại, nghị luận văn học, nghị luận xã hội, đọc hiểu",
  },
  "Tiếng Anh": {
    6: "present simple, adverbs of frequency, rooms, school topics",
    7: "past simple, present perfect basics, hobbies, community service",
    8: "comparatives, future forms, conditional type 1, teen topics",
    9: "relative clauses, reported speech, passive voice, environment",
    10: "tenses review, passive voice, gerunds, communication topics",
    11: "conditionals, clauses, perfect tenses, social issues",
    12: "tense review, articles, modal verbs, reading inference",
  },
  "Tư duy học tập": {
    6: "đọc kỹ đề, kiểm tra dữ kiện, tính nhẩm đơn giản",
    7: "nhận diện bẫy ngôn ngữ, so sánh lựa chọn, suy luận nhanh",
    8: "phân tích điều kiện, tránh đáp án nghe có vẻ đúng",
    9: "đọc hiểu yêu cầu, loại trừ phương án, kiểm tra đơn vị",
    10: "mô hình hóa tình huống, phát hiện dữ kiện thừa",
    11: "suy luận logic, phản biện giả định, kiểm tra điều kiện",
    12: "tư duy chiến lược khi làm bài, phát hiện bẫy đề thi",
  },
};

async function fetchRecentLessonsForSubjectAndGrade(subjectName: string, gradeNum: number): Promise<string[]> {
  try {
    const classes = await fetchJson<Array<{ id: string; class_name: string; subjects?: { name?: string }; grades?: { name?: string } }>>(
      "classes?select=id,class_name,subjects(name),grades(name)&limit=100"
    ).catch(() => []);
    if (!Array.isArray(classes) || !classes.length) return [];

    const normSubject = stripVietnameseForTag(subjectName).toLowerCase();
    const targetGradeStr = String(gradeNum);

    const matchingClassIds = classes.filter(c => {
      const className = String(c.class_name || "").toLowerCase();
      const sName = stripVietnameseForTag(c?.subjects?.name || "").toLowerCase();
      const gName = String(c?.grades?.name || "");

      const matchesGrade = gName.includes(targetGradeStr) || className.includes(targetGradeStr);
      const matchesSubject = !normSubject || sName.includes(normSubject) || className.includes(normSubject.slice(0, 4));
      return matchesGrade && matchesSubject;
    }).map(c => c.id);

    if (!matchingClassIds.length) return [];

    const sessions = await fetchJson<Array<{ session_date: string; lessons?: { name?: string } | null; lesson_id?: string }>>(
      `class_sessions?class_id=in.(${matchingClassIds.map(encodeURIComponent).join(",")})&select=session_date,lesson_id,lessons(name)&order=session_date.desc&limit=20`
    ).catch(() => []);

    if (!Array.isArray(sessions) || !sessions.length) return [];

    const lessonNames = Array.from(new Set(
      sessions
        .map(s => String(s.lessons?.name || "").trim())
        .filter(Boolean)
    )).slice(0, 5);

    return lessonNames;
  } catch (err) {
    console.error("fetchRecentLessonsForSubjectAndGrade error:", err);
    return [];
  }
}

function quizCurriculumFor(scheduledAt: string, pageName: string) {
  const date = new Date(scheduledAt);
  const day = Number.isNaN(date.getTime()) ? 1 : date.getUTCDay();
  const grade = QUIZ_WEEKDAY_GRADES[day] || 10;
  const subject = pageSubjectContext(pageName).subject;
  const topicByGrade = QUIZ_CURRICULUM_TOPICS[subject] || QUIZ_CURRICULUM_TOPICS["Tư duy học tập"];
  return {
    grade,
    subject,
    topic: topicByGrade[grade] || topicByGrade[10],
    weekdayRule: "Thứ 2 lớp 9, thứ 3 lớp 10, thứ 4 lớp 11, thứ 5 lớp 12, thứ 6 lớp 10, thứ 7 lớp 11, chủ nhật lớp 12.",
  };
}

function isoWeekNumber(dateInput: string | Date) {
  const date = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 1;
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function yearFromDate(dateInput: string | Date) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return Number.isNaN(date.getTime()) ? new Date().getUTCFullYear() : date.getUTCFullYear();
}

function weeksLeftInYear(dateInput: string | Date) {
  const date = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 0;
  const end = Date.UTC(date.getUTCFullYear(), 11, 31, 23, 59, 59);
  return Math.max(0, Math.ceil((end - date.getTime()) / (7 * 86400000)));
}

function stripVietnameseForTag(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function pageHashtag(pageName: string) {
  const words = stripVietnameseForTag(pageName)
    .replace(/MindUp/gi, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const suffix = words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  return suffix ? `#MindUp${suffix}` : "#MindUpTuDuyToanDien";
}

function mondayMindsetOffset(pageName: string) {
  const clean = stripVietnameseForTag(pageName).toLowerCase();
  if (clean.includes("toan hoc")) return 10;
  if (clean.includes("vat ly")) return 20;
  if (clean.includes("hoa hoc")) return 30;
  if (clean.includes("sinh hoc")) return 40;
  return 0;
}

function pageSubjectContext(pageName: string) {
  const clean = stripVietnameseForTag(pageName).toLowerCase();
  if (clean.includes("sinh hoc")) {
    return {
      subject: "Sinh h\u1ecdc",
      example: "H\u1ecdc sinh A h\u1ecdc v\u1ec1 c\u1ea5u t\u1ea1o t\u1ebf b\u00e0o. Thay v\u00ec h\u1ecdc thu\u1ed9c, A gi\u1ea3i th\u00edch cho em g\u00e1i t\u1eebng b\u00e0o quan v\u00e0 ch\u1ee9c n\u0103ng c\u1ee7a ch\u00fang, r\u1ed3i v\u1ebd s\u01a1 \u0111\u1ed3. Khi em h\u1ecfi ti th\u1ec3 \u0111\u1ec3 l\u00e0m g\u00ec, A ph\u1ea3i \u0111\u00e0o s\u00e2u \u0111\u1ec3 tr\u1ea3 l\u1eddi b\u1eb1ng ng\u00f4n ng\u1eef c\u1ee7a m\u00ecnh.",
      background: "soft biology classroom background, abstract cells, microscope shapes, green-blue light, no text",
    };
  }
  if (clean.includes("hoa hoc")) {
    return {
      subject: "H\u00f3a h\u1ecdc",
      example: "H\u1ecdc sinh A h\u1ecdc v\u1ec1 ph\u1ea3n \u1ee9ng axit - baz\u01a1. Thay v\u00ec ch\u00e9p \u0111\u1ecbnh ngh\u0129a, A t\u1ef1 gi\u1ea3i th\u00edch v\u00ec sao n\u01b0\u1edbc chanh c\u00f3 v\u1ecb chua, x\u00e0 ph\u00f2ng l\u1ea1i tr\u01a1n v\u00e0 th\u1eed v\u1ebd s\u01a1 \u0111\u1ed3 ion H+ / OH- \u0111\u1ec3 hi\u1ec3u b\u1ea3n ch\u1ea5t.",
      background: "soft chemistry lab background, abstract beakers, molecules, blue-gold light, no text",
    };
  }
  if (clean.includes("vat ly")) {
    return {
      subject: "V\u1eadt l\u00fd",
      example: "H\u1ecdc sinh A h\u1ecdc v\u1ec1 l\u1ef1c ma s\u00e1t. Thay v\u00ec ch\u1ec9 nh\u1edb c\u00f4ng th\u1ee9c, A quan s\u00e1t d\u00e9p tr\u01b0\u1ee3t tr\u00ean n\u1ec1n \u0111\u1ea5t, xe \u0111\u1ea1p phanh g\u1ea5p v\u00e0 t\u1ef1 gi\u1ea3i th\u00edch v\u00ec sao c\u00f9ng m\u1ed9t l\u1ef1c k\u00e9o nh\u01b0ng v\u1eadt c\u00f3 th\u1ec3 chuy\u1ec3n \u0111\u1ed9ng kh\u00e1c nhau.",
      background: "soft physics learning background, abstract motion lines, light bulb, waves, blue light, no text",
    };
  }
  if (clean.includes("toan hoc")) {
    return {
      subject: "To\u00e1n h\u1ecdc",
      example: "H\u1ecdc sinh A h\u1ecdc v\u1ec1 h\u00e0m s\u1ed1 b\u1eadc nh\u1ea5t. Thay v\u00ec thu\u1ed9c c\u00f4ng th\u1ee9c, A t\u1ef1 l\u1ea5y v\u00ed d\u1ee5 ti\u1ec1n taxi g\u1ed3m ph\u00ed m\u1edf c\u1eeda v\u00e0 ti\u1ec1n theo km, r\u1ed3i gi\u1ea3i th\u00edch v\u00ec sao \u0111\u1ed3 th\u1ecb l\u00e0 m\u1ed9t \u0111\u01b0\u1eddng th\u1eb3ng.",
      background: "soft mathematics study background, abstract graphs, geometric shapes, blue-gold light, no text",
    };
  }
  if (clean.includes("ngu van") || clean.includes("van hoc")) {
    return {
      subject: "Ng\u1eef v\u0103n",
      example: "H\u1ecdc sinh A h\u1ecdc m\u1ed9t \u0111o\u1ea1n th\u01a1. Thay v\u00ec h\u1ecdc thu\u1ed9c b\u00e0i ph\u00e2n t\u00edch, A t\u1ef1 h\u1ecfi h\u00ecnh \u1ea3nh n\u00e0o l\u00e0m m\u00ecnh nh\u1edb nh\u1ea5t, v\u00ec sao t\u00e1c gi\u1ea3 ch\u1ecdn t\u1eeb \u0111\u00f3, r\u1ed3i k\u1ec3 l\u1ea1i \u00fd hi\u1ec3u b\u1eb1ng l\u1eddi c\u1ee7a m\u00ecnh.",
      background: "soft literature study background, abstract open books, warm notebook shapes, blue-gold light, no text",
    };
  }
  if (clean.includes("tieng anh") || clean.includes("english")) {
    return {
      subject: "Ti\u1ebfng Anh",
      example: "H\u1ecdc sinh A h\u1ecdc th\u00ec hi\u1ec7n t\u1ea1i ho\u00e0n th\u00e0nh. Thay v\u00ec nh\u1edb m\u00e1y m\u00f3c have/has + V3, A t\u1ef1 k\u1ec3 nh\u1eefng vi\u1ec7c m\u00ecnh \u0111\u00e3 l\u00e0m trong tu\u1ea7n v\u00e0 so s\u00e1nh v\u1edbi vi\u1ec7c x\u1ea3y ra h\u00f4m qua.",
      background: "soft English learning background, abstract conversation bubbles and notebooks, blue-gold light, no text",
    };
  }
  return {
    subject: "T\u01b0 duy h\u1ecdc t\u1eadp",
    example: "H\u1ecdc sinh A h\u1ecdc m\u1ed9t ki\u1ebfn th\u1ee9c m\u1edbi. Thay v\u00ec ch\u1ec9 \u0111\u1ecdc l\u1ea1i v\u1edf, A t\u1ef1 gi\u1ea3i th\u00edch cho ng\u01b0\u1eddi kh\u00e1c, t\u1ef1 \u0111\u1eb7t c\u00e2u h\u1ecfi ng\u01b0\u1ee3c v\u00e0 s\u1eeda l\u1ea1i ph\u1ea7n m\u00ecnh ch\u01b0a n\u00f3i r\u00f5.",
    background: "soft modern learning background, abstract classroom, light bulb, notebooks, blue-gold light, no text",
  };
}

function subjectContextPromptBlock(pageName: string) {
  const ctx = pageSubjectContext(pageName);
  return [
    "B\u1ed1i c\u1ea3nh m\u00f4n h\u1ecdc c\u1ee7a fanpage:",
    `- M\u00f4n/tr\u1ee5c n\u1ed9i dung: ${ctx.subject}`,
    `- V\u00ed d\u1ee5 th\u1ef1c t\u1ebf b\u1eaft bu\u1ed9c ph\u1ea3i c\u00f9ng tinh th\u1ea7n v\u00e0 li\u00ean quan \u0111\u1ebfn m\u00f4n n\u00e0y: ${ctx.example}`,
    `- Gợi ý ảnh nền không chữ cho môn này: ${ctx.background}`,
    "- Trong b\u00e0i Learning Method, ph\u1ea3i c\u00f3 m\u1ed9t v\u00ed d\u1ee5 th\u1ef1c t\u1ebf c\u1ee5 th\u1ec3 li\u00ean quan \u0111\u1ebfn fanpage/m\u00f4n h\u1ecdc, kh\u00f4ng vi\u1ebft v\u00ed d\u1ee5 chung chung.",
    "- N\u1ebfu fanpage l\u00e0 MindUp t\u1ed5ng, v\u00ed d\u1ee5 c\u00f3 th\u1ec3 li\u00ean m\u00f4n nh\u01b0ng v\u1eabn ph\u1ea3i g\u1eafn v\u1edbi m\u1ed9t t\u00ecnh hu\u1ed1ng h\u1ecdc th\u1eadt.",
  ].join("\n");
}

const LEARNING_METHOD_ITEMS = [
  { name: "Active Recall", group: "Nhớ lâu" },
  { name: "Spaced Repetition", group: "Nhớ lâu" },
  { name: "Leitner System", group: "Nhớ lâu" },
  { name: "Blurting", group: "Nhớ lâu" },
  { name: "Brain Dump", group: "Nhớ lâu" },
  { name: "24-Hour Rule", group: "Chiến thuật học nhanh" },
  { name: "Last 5 Minutes", group: "Chiến thuật học nhanh" },
  { name: "50/10 Rule", group: "Tập trung" },
  { name: "Pomodoro", group: "Tập trung" },
  { name: "Anki/Quizlet", group: "Nhớ lâu" },
  { name: "Memory Palace", group: "Nhớ lâu" },
  { name: "Method of Loci", group: "Nhớ lâu" },
  { name: "Chunking", group: "Nhớ lâu" },
  { name: "Mnemonic", group: "Nhớ lâu" },
  { name: "Story Method", group: "Nhớ lâu" },
  { name: "Dual Coding", group: "Nhớ lâu" },
  { name: "Feynman Technique", group: "Hiểu sâu" },
  { name: "SQ3R", group: "Hiểu sâu" },
  { name: "Cornell Note", group: "Hiểu sâu" },
  { name: "Mind Mapping", group: "Hiểu sâu" },
  { name: "Self-Explanation", group: "Hiểu sâu" },
  { name: "Elaboration", group: "Hiểu sâu" },
  { name: "Generation Effect", group: "Hiểu sâu" },
  { name: "Reflection", group: "Hiểu sâu" },
  { name: "Practice Testing", group: "Hiểu sâu" },
  { name: "Interleaving", group: "Hiểu sâu" },
  { name: "Effort-Based Learning", group: "Tư duy học tập" },
  { name: "80/20 Pareto", group: "Tư duy học tập" },
  { name: "Kaizen", group: "Tư duy học tập" },
  { name: "Teaching Method", group: "Hiểu sâu" },
  { name: "Empty Chair Method", group: "Hiểu sâu" },
  { name: "Mirror Method", group: "Hiểu sâu" },
  { name: "Question-First Method", group: "Hiểu sâu" },
  { name: "Red Pen Rule", group: "Chiến thuật học nhanh" },
  { name: "Reverse Learning", group: "Hiểu sâu" },
  { name: "Zettelkasten Method", group: "Hiểu sâu" },
  { name: "Flow State Priming", group: "Tập trung" },
  { name: "Off-Screen Reset", group: "Tập trung" },
  { name: "Ultradian Cycling", group: "Tập trung" },
  { name: "Single-Task Locking", group: "Tập trung" },
  { name: "Body Doubling", group: "Tập trung" },
  { name: "Environment Design", group: "Tập trung" },
  { name: "Lo-fi/White Noise", group: "Tập trung" },
  { name: "90-20 Cycle", group: "Tập trung" },
  { name: "Pre-test", group: "Chiến thuật học nhanh" },
  { name: "Skim First", group: "Chiến thuật học nhanh" },
  { name: "Extract, Don't Memorise", group: "Chiến thuật học nhanh" },
  { name: "Bloom's Taxonomy", group: "Tư duy học tập" },
  { name: "Learning Pyramid", group: "Tư duy học tập" },
  { name: "Forgetting Curve", group: "Tư duy học tập" },
  { name: "Active Learning Strategies", group: "Tư duy học tập" },
  { name: "Retrieval Practice", group: "Nhớ lâu" },
  { name: "Desirable Difficulties", group: "Tư duy học tập" },
];

function learningMethodTopic(scheduledAt: string, pageName: string) {
  const week = isoWeekNumber(scheduledAt);
  const year = yearFromDate(scheduledAt);
  const offset = mondayMindsetOffset(pageName);
  const index = ((week - 1 - offset) % LEARNING_METHOD_ITEMS.length + LEARNING_METHOD_ITEMS.length) % LEARNING_METHOD_ITEMS.length;
  const item = LEARNING_METHOD_ITEMS[index] || LEARNING_METHOD_ITEMS[0];
  return {
    week,
    year,
    offset,
    methodNumber: index + 1,
    totalMethods: LEARNING_METHOD_ITEMS.length,
    name: item.name,
    group: item.group,
  };
}

function learningMethodPromptBlock(method: ReturnType<typeof learningMethodTopic>) {
  return [
    "Phương pháp học bắt buộc dùng cho bài Learning Method:",
    `- Tuần ISO: ${method.week}/${method.year}`,
    `- Offset fanpage: ${method.offset}`,
    `- Công thức: ((tuần - 1 - offset) mod ${method.totalMethods}) + 1`,
    `- Số thứ tự phương pháp: ${method.methodNumber}/${method.totalMethods}`,
    `- Nhóm: ${method.group}`,
    `- Tên phương pháp: ${method.name}`,
    "",
    "Yêu cầu: bài Learning Method phải dùng đúng phương pháp trên. Không tự chọn phương pháp khác, trừ khi nội dung Problem đã nhập quá đặc thù; nếu phải điều chỉnh thì vẫn phải nhắc phương pháp bắt buộc là trục chính.",
    "Nguồn cảm hứng: hãy dựa trên tinh thần của một bài viết/nguồn nước ngoài uy tín về phương pháp học này, sau đó viết lại thành bài gốc bằng tiếng Việt tự nhiên. Không dịch sát từng câu, không copy nguyên văn, không làm giọng văn AI.",
  ].join("\n");
}


const CONTENT_TOPIC_POOLS: Record<string, string[]> = {
  applying_knowledge: [
    "Personal finance decisions need percentages, ratios, and critical reading",
    "Reading weather forecasts requires graphs, probability, and physics",
    "Healthy eating labels combine chemistry, biology, and data literacy",
    "AI tools need math, language, logic, and ethical judgement",
    "Sports performance combines force, energy, biology, and measurement",
    "Cooking is chemistry, heat transfer, ratios, and experimentation",
    "Choosing a phone plan uses functions, averages, and hidden conditions",
    "Understanding medicine dosage needs ratios, body biology, and careful units",
    "Traffic jams show systems thinking, speed, probability, and behavior",
    "Online shopping discounts test percentage thinking and consumer judgment",
    "Electric bills connect physics, habits, graphs, and household budgeting",
    "Reading news charts needs statistics and skepticism",
    "Urban flooding connects biology, chemistry, geography, and data",
    "Sleep quality affects memory, hormones, focus, and learning outcomes",
    "A viral claim online needs source checking, logic, and scientific thinking",
    "Budgeting a family trip uses estimation, optimization, and trade-offs",
    "Air pollution connects chemistry, biology, physics, and public health",
    "Fitness trackers use sensors, statistics, and biology",
    "Packaging design uses geometry, materials, chemistry, and persuasion",
    "Plant care combines biology, light, water, and experimental thinking",
    "A cup of coffee involves chemistry, heat, biology, and habit design",
    "Music and headphones connect waves, biology, and engineering",
    "Maps and delivery apps use coordinates, optimization, and estimation",
    "Saving time in studying needs data, habits, and feedback loops",
    "Choosing food safely uses biology, chemistry, and probability",
    "Household cleaning requires chemistry and safety thinking",
    "Designing a classroom uses psychology, attention, and environment design",
    "A simple game can teach probability, strategy, and feedback",
    "Photography uses light, geometry, chemistry history, and perception",
    "Managing screen time combines biology, psychology, and self-regulation",
    "A broken appliance becomes a lesson in systems and cause-effect thinking",
    "Public health campaigns use biology, statistics, and communication",
    "Learning from mistakes requires evidence, reflection, and iteration",
    "A supermarket receipt can become a math and decision-making lesson",
    "Climate stories require data literacy, chemistry, and systems thinking",
    "Medicine side effects need biology, chemistry, and risk comparison",
    "Planning exam revision uses memory science, scheduling, and feedback",
    "A bridge or building reveals geometry, force, and material science",
    "A garden reveals ecology, chemistry, and patience",
    "Digital privacy needs logic, systems thinking, and careful reading",
    "A school score report needs statistics and growth mindset",
    "A recipe scale-up uses ratios, units, heat, and chemistry",
    "Electric vehicles connect energy, chemistry, physics, and environment",
    "Understanding ads requires language, psychology, statistics, and skepticism",
    "Water quality connects chemistry, biology, and community decisions",
    "A football curve shows motion, pressure, and observation",
    "Studying a language uses memory, pattern recognition, and feedback",
    "A bank loan requires compound interest and long-term thinking",
    "Household waste sorting connects chemistry, biology, and civic habits",
    "A medical test result needs statistics and careful interpretation",
    "Building a habit is a real-world experiment",
    "A science fair project teaches variables, evidence, and communication",
    "Real learning means using knowledge to make better decisions",
  ],
  qna: [
    "Math in GPS and map coordinates", "Probability in lucky draws and giveaways", "Compound interest in saving money", "Optimization in delivery routes", "Scale and ratio in maps", "Matrices behind QR codes", "Statistics in weather forecasts", "Graphs in electricity bills", "Derivatives for finding maximum profit", "Logarithms in pH and sound levels",
    "Physics of helmets and road safety", "Why elevators make us feel heavier or lighter", "Why rainbows have colors", "Why air conditioners are placed high", "Why footballs can curve", "How noise cancelling headphones work", "Why objects float better in seawater", "Why high voltage wires are dangerous", "Why LED bulbs save energy", "Heat transfer in cooking",
    "Chemistry of hand sanitizer", "Why bread rises in the oven", "Why metals rust", "Why lemon removes fishy smells", "Why soda bubbles", "How soap removes oil", "pH in skincare products", "Why salt melts ice", "Why bleach should not mix with acid", "Why phone batteries degrade",
    "Biology of sleep and memory", "Why the heart beats faster when nervous", "Why muscles hurt after exercise", "How breakfast affects concentration", "Why plants grow toward light", "How vaccines train immunity", "Why eyes get tired from screens", "Gut microbiome and focus", "Why hydration matters for studying", "Teen hormones and emotions",
    "Metaphors in advertising", "Storytelling and persuasion", "Reading books and better writing", "Arguments in everyday debate", "Hidden meaning in communication", "Math for personal finance", "Science needs writing skills", "Reading charts in daily news", "Sports as interdisciplinary learning", "Critical thinking on social media", "AI needs math language and ethics", "Why good questions improve learning", "How one normal day contains many school subjects"
  ],
  quiz: [
    "Order of operations trap", "Negative sign trap", "Equivalent fractions trap", "Percentage increase decrease trap", "Division by zero trap", "Square root condition trap", "Domain condition trap", "Geometry visual illusion trap", "Probability intuition trap", "Number pattern trap",
    "Mass versus weight trap", "Average speed trap", "Friction direction trap", "Pressure formula trap", "Temperature versus heat trap", "Mirror image trap", "Series versus parallel circuit trap", "Electric power trap", "Floating and sinking trap", "Inertia trap",
    "Valency trap", "Balancing equation trap", "Mole and mass trap", "Dilute versus concentrated solution trap", "pH acid base trap", "Metal and acid reaction trap", "Precipitate trap", "Redox trap", "Gas produced trap", "Conservation of atoms trap",
    "DNA versus RNA trap", "Dominant recessive inheritance trap", "Photosynthesis versus respiration trap", "Blood vessel trap", "Digestive system trap", "Hormone trap", "Immunity trap", "Food chain trap", "Prokaryote eukaryote trap", "Evolution misconception trap",
    "Subject predicate trap", "Rhetorical device trap", "Explicit versus implied meaning trap", "Word choice trap", "Expression mode trap", "Present perfect trap", "A an the trap", "Much many trap", "Homophone trap", "Reading too fast trap", "Unit conversion trap", "Extra data trap", "Answer that sounds right trap"
  ],
  hard_quiz: [
    "Math optimization in travel cost", "Inequality proof with transformations", "Geometry with an auxiliary line", "Conditional probability", "Function with parameter", "System of equations with conditions", "Compound interest application", "Counting cases in combinatorics", "Trigonometric transformation", "Area under a curve application",
    "Projectile motion", "Conservation of mechanical energy", "Multi-resistor circuit", "Lens image formation", "Liquid pressure", "Thermal equilibrium", "Basic oscillation", "Friction on inclined plane", "Household electricity consumption", "Relative velocity",
    "Mole and mass conservation", "Metal mixture reacting with acid", "Carbon dioxide and alkaline solution", "pH calculation", "Redox balancing", "Ester or fat basic problem", "Reaction yield", "Chemical identification", "Basic electrolysis", "Reaction chain transformation",
    "Genetic pedigree", "One or two trait inheritance", "Hardy Weinberg population", "Enzyme and reaction rate", "Cell metabolism", "Ecological community", "Immunity and vaccination", "Blood glucose regulation", "Photosynthesis under changing conditions", "Cellular respiration",
    "Analyze a poetic image", "Argue against a statement", "Compare two literary details", "Write a social argument paragraph", "Find the message of a literary work", "Optimize a weekly study plan", "Analyze score data", "Read a climate chart", "Energy in daily life", "Design an experiment", "Evaluate online information", "Personal finance planning", "Model a real-world situation"
  ],
  meme: [
    "Study for five minutes then rest for two hours", "The question looks familiar but memory is blank", "Teacher says this one is easy", "Night before exam and the book is thick", "Memorized everything but the test asks understanding", "Calculator dies during homework", "All multiple choice answers look possible", "Promise to study early but open notebook at 11 PM", "Wrong because of missing the word not", "Class goes silent when teacher asks for volunteer",
    "Parent asks if homework is done while student holds phone", "Solved an answer not in the options", "Confident submission then notice wrong sign", "Best friend asks for help five minutes before test", "Test matches the lesson missed last week", "Understand in class forget at home", "The easiest question is wrong", "Study group becomes story time", "Teacher says oral check is light", "Read the question twice and still confused",
    "Remember formula forget condition", "Every subject says just review today", "Parent asks why score is not higher", "Goal is 10 points but sleepy after opening book", "Teacher changes seats before test", "Student finds a silly mistake", "Bonus question saves the whole paper", "Playlist ruins serious study plan", "Just finished one subject then another test appears", "Handwriting gets worse in essay",
    "Class monitor reminds homework submission", "Online class camera turns on accidentally", "Three color pens but still confused", "New year promise to study consistently", "Test asks exactly the skipped part", "Front row student cannot sleep", "Formula was on the next page", "Math and literature talking inside one brain", "Student meets a trick question", "Teacher says five minutes left",
    "Finish too early and suspect everything", "Calculate what score is needed to recover", "Memorized but forgot keyword", "Receiving test paper moment", "Parent asks what did you learn today", "Thought understood until doing alone", "Whole class misses one question", "After one lesson finally understand the concept", "Remember answer after submission", "Teacher says just review a little", "Difference between reading notes and understanding", "Last question says prove", "Student mood during exam season"
  ],
  enrollment: [
    "Student has weak foundations and does not know where to start", "Student studies hard but scores do not improve", "Parent cannot identify knowledge gaps", "Student fears a subject because formulas feel memorized", "Student works slowly despite understanding", "Student loses marks by reading too fast", "Student lacks self-study method", "Student forgets soon after learning", "Student is afraid to ask questions", "Student needs close progress tracking",
    "Grade 9 entrance exam needs a clear roadmap", "High school graduation exam needs gap diagnosis", "Good student wants to become excellent", "Excellent student needs advanced problems", "Parent wants visible learning progress", "Small class with personal correction", "Trial lesson to check fit", "One trial lesson finds bottlenecks", "Free placement test", "Thinking-based learning not rote learning",
    "Improve written solution presentation", "Train strategic test-taking habits", "Learn from personal mistakes", "Attendance feedback and homework tracking", "Teacher feedback after each session", "Roadmap based on target score", "Build foundation before acceleration", "Student loses focus when studying at home", "Student needs weekly motivation", "Busy parent cannot tutor at home",
    "Online learning lacks interaction", "Offline class improves concentration", "Transition grade needs foundation review", "Grade 9 needs entrance strategy", "Grade 12 needs exam strategy", "Practice tests with detailed correction", "Understand why not just know answer", "Build critical thinking through hard questions", "Trial before long-term class", "Parent receives feedback after trial lesson",
    "Student lacks confidence", "From fear of subject to understanding", "Small class quality focus", "Study the right gaps to save time", "Clear roadmap beats random exercises", "Someone needs to point out repeated mistakes", "Improve scores by correcting habits", "Choose suitable teacher through trial", "Student needs to ask and speak in class", "Parent wants real progress", "Book a trial lesson this week", "Limited small class seats", "Start with a diagnostic session"
  ]
};

function contentPoolKey(typeName: string) {
  const clean = stripVietnameseForTag(typeName).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (clean.includes("applying knowledge")) return "applying_knowledge";
  if (clean.includes("interesting question") || clean.includes("cau hoi thu vi") || clean.includes("cau hoi hay")) return "interesting_question";
  if (clean.includes("real world phenomenon") || clean.includes("hien tuong thuc te") || clean.includes("phenomenon")) return "real_world_phenomenon";
  if (clean === "q a" || clean === "qa" || clean.includes("q a")) return "qna";
  if (clean === "quiz") return "quiz";
  if (clean.includes("hard quiz")) return "hard_quiz";
  if (clean === "meme") return "meme";
  if (clean === "enrollment") return "enrollment";
  return "";
}

function contentTopicFor(typeName: string, scheduledAt: string, pageName: string) {
  const key = contentPoolKey(typeName);
  const pool = CONTENT_TOPIC_POOLS[key] || [];
  const week = isoWeekNumber(scheduledAt);
  const year = yearFromDate(scheduledAt);
  const offset = mondayMindsetOffset(pageName);
  const index = pool.length ? ((week - 1 - offset) % pool.length + pool.length) % pool.length : 0;
  return { key, week, year, offset, index, number: index + 1, total: pool.length, topic: pool[index] || "" };
}

function contentTopicBlock(topic: ReturnType<typeof contentTopicFor>) {
  if (!topic.key) return "";
  return [
    "Required weekly/page topic:",
    `- ISO week: ${topic.week}/${topic.year}`,
    `- Offset fanpage: ${topic.offset}`,
    `- Formula: ((week - 1 - offset) mod ${topic.total}) + 1`,
    `- Topic number: ${topic.number}/${topic.total}`,
    `- Topic: ${topic.topic}`,
    "- Do not choose a different topic unless the admin draft explicitly requires it.",
  ].join("\n");
}

function applyingKnowledgeReferenceFor(pageName: string) {
  const ctx = pageSubjectContext(pageName);
  const clean = stripVietnameseForTag(pageName).toLowerCase();
  if (clean.includes("toan hoc")) {
    return {
      subject: ctx.subject,
      sourceName: "Real World Math",
      sourceUrl: "https://www.realworldmath.org/",
      sourceGuidance: "Use real-world math situations such as maps, money, scale, optimization, data, graphs, and measurement.",
    };
  }
  if (clean.includes("vat ly")) {
    return {
      subject: ctx.subject,
      sourceName: "Real World Physics Problems",
      sourceUrl: "https://www.real-world-physics-problems.com/",
      sourceGuidance: "Use real physics situations such as motion, forces, sports, elevators, electricity, waves, pressure, heat, and energy.",
    };
  }
  if (clean.includes("hoa hoc")) {
    return {
      subject: ctx.subject,
      sourceName: "Compound Interest / RSC Education",
      sourceUrl: "https://www.compoundchem.com/",
      sourceGuidance: "Use everyday chemistry such as food, soap, batteries, materials, smell, pH, color, medicine, and cleaning safety.",
    };
  }
  if (clean.includes("sinh hoc")) {
    return {
      subject: ctx.subject,
      sourceName: "HHMI BioInteractive",
      sourceUrl: "https://www.biointeractive.org/",
      sourceGuidance: "Use biology in real life such as sleep, immunity, genetics, health, cells, ecology, evolution, plants, and human body systems.",
    };
  }
  return {
    subject: ctx.subject,
    sourceName: "JASON Learning / PhET Interactive Simulations / real-world STEM examples",
    sourceUrl: "https://jason.org/",
    sourceGuidance: "Use interdisciplinary STEM situations: data literacy, AI, personal finance, health, environment, technology, media literacy, and everyday decisions.",
  };
}

function applyingKnowledgeVideoInspirationFor(pageName: string) {
  const clean = stripVietnameseForTag(pageName).toLowerCase();
  if (clean.includes("toan hoc")) {
    return {
      sourceName: "3Blue1Brown",
      sourceUrl: "https://www.3blue1brown.com/",
      sourceChannelUrl: "https://www.youtube.com/c/3blue1brown",
      sourceStyle: "visual math explanations that make one core idea intuitive through diagrams, motion, and discovery.",
      topicGuidance: "Pick one visual mathematical idea with a real-life entry point: probability, geometry, graphs, optimization, growth, scale, or patterns.",
      visualGuidance: "Use clean diagrams, coordinate grids, geometric shapes, simple charts, arrows, and step-by-step transformations instead of generic classroom footage.",
    };
  }
  if (clean.includes("vat ly")) {
    return {
      sourceName: "MinutePhysics",
      sourceUrl: "https://www.minutephysics.com/",
      sourceChannelUrl: "https://www.youtube.com/user/minutephysics",
      sourceStyle: "short whiteboard physics explainers that turn a surprising everyday question into a simple model.",
      topicGuidance: "Pick one physics phenomenon students can see: motion, force, light, sound, electricity, heat, pressure, waves, magnets, or energy transfer.",
      visualGuidance: "Use whiteboard motion diagrams, force arrows, waves, meters, simple apparatus, and real-world objects moving or interacting.",
    };
  }
  if (clean.includes("hoa hoc")) {
    return {
      sourceName: "NileRed / ACS Reactions",
      sourceUrl: "https://www.youtube.com/@NileRed",
      sourceChannelUrl: "https://www.youtube.com/user/ACSReactions",
      sourceStyle: "chemistry explainers grounded in visible substances, reactions, color changes, food, materials, and safe lab observations.",
      topicGuidance: "Pick one everyday chemistry question: pH, soap, batteries, food chemistry, smell, color, materials, cleaning, oxidation, or solubility.",
      visualGuidance: "Use beakers, safe lab glassware, molecules, pH scales, material close-ups, food, color change diagrams, and reaction arrows.",
    };
  }
  if (clean.includes("sinh hoc")) {
    return {
      sourceName: "AsapSCIENCE",
      sourceUrl: "https://www.youtube.com/user/AsapSCIENCE",
      sourceChannelUrl: "https://www.youtube.com/user/AsapSCIENCE",
      sourceStyle: "whiteboard science explainers about the human body, health, psychology, and everyday biology, using doodles plus clear voice-over.",
      topicGuidance: "Pick one biology-in-life question: sleep and memory, stress and learning, sugar and energy, exercise and focus, immunity, hormones, brain, cells, genetics, nutrition, or senses.",
      visualGuidance: "Use whiteboard-style body diagrams, brain icons, cells, organs, microscope/lab visuals, timelines, comparison panels, and simple cause-effect arrows.",
    };
  }
  return {
    sourceName: "Kurzgesagt / TED-Ed / SciShow",
    sourceUrl: "https://kurzgesagt.org/",
    sourceChannelUrl: "https://www.youtube.com/teded",
    sourceStyle: "research-based animated science storytelling that turns complex topics into memorable, structured explanations.",
    topicGuidance: "Pick one interdisciplinary STEM topic connecting science, technology, data, daily decisions, health, environment, or learning.",
    visualGuidance: "Use animated explainer scenes: diagrams, icons, simple systems, cause-effect arrows, charts, and a few concrete real-world stock clips only when they clarify the idea.",
  };
}

function interestingQuestionReferenceFor(pageName: string) {
  const ctx = pageSubjectContext(pageName);
  const clean = stripVietnameseForTag(pageName).toLowerCase();
  if (clean.includes("toan hoc")) {
    return {
      subject: ctx.subject,
      sourceName: "Plus Magazine Puzzles",
      sourceUrl: "https://plus.maths.org/puzzles",
      sourceGuidance: "Choose one surprising mathematical puzzle or question, then rewrite it naturally in Vietnamese for students. Keep the answer out of the public caption.",
    };
  }
  if (clean.includes("vat ly")) {
    return {
      subject: ctx.subject,
      sourceName: "The Physics Classroom / Physics World puzzles",
      sourceUrl: "https://www.physicsclassroom.com/",
      secondaryUrl: "https://www.physicsworld.com/c/puzzles/",
      sourceGuidance: "Choose one physics reasoning question about motion, forces, waves, light, electricity, pressure, heat, or energy.",
    };
  }
  if (clean.includes("hoa hoc")) {
    return {
      subject: ctx.subject,
      sourceName: "AACT Chemistry Puzzles and Games",
      sourceUrl: "https://teachchemistry.org/classroom-resources/topics/games-puzzles",
      sourceGuidance: "Choose one chemistry puzzle or question involving substances, reactions, pH, mixtures, atoms, molecules, materials, food, or lab observations.",
    };
  }
  if (clean.includes("sinh hoc")) {
    return {
      subject: ctx.subject,
      sourceName: "Ask A Biologist Puzzles",
      sourceUrl: "https://askabiologist.asu.edu/activities/puzzles",
      sourceGuidance: "Choose one biology question involving cells, body systems, genetics, ecology, plants, evolution, health, or animal/human observations.",
    };
  }
  return {
    subject: ctx.subject,
    sourceName: "Plus Magazine Puzzles / The Physics Classroom / AACT / Ask A Biologist",
    sourceUrl: "https://plus.maths.org/puzzles",
    sourceGuidance: "Choose one interdisciplinary STEM question suitable for a curious student and rewrite it for MindUp.",
  };
}

function realWorldPhenomenonReferenceFor(pageName: string) {
  const ctx = pageSubjectContext(pageName);
  const clean = stripVietnameseForTag(pageName).toLowerCase();
  if (clean.includes("toan hoc")) {
    return {
      subject: ctx.subject,
      sourceName: "Plus Magazine Maths Minute",
      sourceUrl: "https://plus.maths.org/tags/maths-minute",
      sourceGuidance: "Explain a real-world mathematical phenomenon through one core idea, with a concrete everyday example.",
    };
  }
  if (clean.includes("vat ly")) {
    return {
      subject: ctx.subject,
      sourceName: "The Physics Classroom / Physics World Everyday Science",
      sourceUrl: "https://www.physicsclassroom.com/",
      secondaryUrl: "https://www.physicsworld.com/",
      sourceGuidance: "Explain one everyday physics phenomenon using simple models, cause-effect reasoning, and one visual example.",
    };
  }
  if (clean.includes("hoa hoc")) {
    return {
      subject: ctx.subject,
      sourceName: "Compound Interest / RSC Education",
      sourceUrl: "https://www.compoundchem.com/",
      secondaryUrl: "https://edu.rsc.org/resources/collections/compound-interest",
      sourceGuidance: "Explain one everyday chemistry phenomenon involving food, smell, color, cleaning, pH, batteries, materials, medicine, or safety.",
    };
  }
  if (clean.includes("sinh hoc")) {
    return {
      subject: ctx.subject,
      sourceName: "HHMI BioInteractive / Science Journal for Kids",
      sourceUrl: "https://www.biointeractive.org/",
      secondaryUrl: "https://www.sciencejournalforkids.org/articles/biology/",
      sourceGuidance: "Explain one biology-in-life phenomenon involving the body, sleep, memory, immunity, genetics, ecology, plants, microbes, nutrition, or senses.",
    };
  }
  return {
    subject: ctx.subject,
    sourceName: "Science Journal for Kids / Frontiers for Young Minds / STEM explainers",
    sourceUrl: "https://www.sciencejournalforkids.org/",
    sourceGuidance: "Explain one real-world STEM phenomenon in a practical, student-friendly way.",
  };
}

const TEACHING_PHILOSOPHY_ITEMS = [
  "Điểm số không phải mục tiêu của giáo dục.",
  "Giáo dục là giúp học sinh biết tự học.",
  "Một người biết tư duy sẽ học nhanh hơn một người chỉ biết ghi nhớ.",
  "Học không phải để thi, mà để hiểu thế giới.",
  "Giáo dục tốt phải làm học sinh bớt phụ thuộc vào giáo viên.",
  "Một tiết học thành công là khi học sinh nghĩ nhiều hơn giáo viên nói.",
  "Điều quý nhất sau mỗi buổi học không phải là một công thức mới, mà là một cách suy nghĩ mới.",
  "Hiểu luôn quan trọng hơn nhớ.",
  "Nếu chỉ nhớ, kiến thức sẽ mất đi. Nếu hiểu, kiến thức sẽ ở lại.",
  "Học thuộc không phải là hiểu.",
  "Muốn nhớ lâu, hãy hiểu trước.",
  "Kiến thức phải được tự xây dựng, không thể truyền nguyên vẹn.",
  "Người học phải tự tạo ra kết nối giữa các kiến thức.",
  "Mỗi lần \"À, ra là vậy!\" giá trị hơn mười lần chép bài.",
  "Một câu hỏi hay đáng giá hơn một đáp án nhanh.",
  "Điều quan trọng không phải em nghĩ gì, mà là em nghĩ như thế nào.",
  "Tư duy là kỹ năng có thể rèn luyện.",
  "Không có tư duy đúng nếu thiếu lập luận.",
  "Mọi kết luận đều cần lý do.",
  "Biết phản biện chính mình là dấu hiệu của người học tốt.",
  "Khả năng đặt câu hỏi quyết định khả năng học tập.",
  "Muốn giải quyết vấn đề, hãy hiểu bản chất trước.",
  "Đừng học công thức, hãy học cách công thức được tạo ra.",
  "Sai lầm không phải thất bại, mà là dữ liệu để học.",
  "Một lỗi sai được hiểu rõ có giá trị hơn mười câu đúng do may mắn.",
  "Đừng vội sửa lỗi cho học sinh, hãy để các em tự phát hiện.",
  "Điều đáng sợ không phải làm sai, mà là không biết mình sai ở đâu.",
  "Một lớp học tốt phải là nơi học sinh dám sai.",
  "Người thầy không phải người có nhiều đáp án nhất.",
  "Vai trò của giáo viên là khơi mở tư duy.",
  "Dạy học không phải truyền đạt, mà là dẫn dắt.",
  "Một câu hỏi đúng lúc có thể thay đổi cả tiết học.",
  "Giảng ít hơn chưa chắc dạy ít hơn.",
  "Giáo viên giỏi không tạo ra học sinh phụ thuộc.",
  "Người thầy nên tò mò trước khi yêu cầu học sinh tò mò.",
  "Lớp học nên là nơi được phép suy nghĩ thành tiếng.",
  "Không khí học tập quan trọng không kém nội dung học.",
  "Mỗi học sinh nên có cơ hội giải thích suy nghĩ của mình.",
  "Tranh luận học thuật tốt hơn đồng ý một cách thụ động.",
  "Một lớp học yên lặng chưa chắc là một lớp học đang tư duy.",
  "Không phải mọi sự im lặng đều là tập trung.",
  "Không có học sinh kém, chỉ có tốc độ tiến bộ khác nhau.",
  "Mỗi học sinh đều có khả năng phát triển.",
  "Tự tin được xây từ sự hiểu biết, không phải lời khen.",
  "So sánh với chính mình tốt hơn so sánh với người khác.",
  "Điều quan trọng nhất là học sinh tin rằng mình có thể tiến bộ.",
  "Kiến thức chỉ có giá trị khi được vận dụng.",
  "Một kiến thức tốt phải trả lời được câu hỏi \"Vì sao?\"",
  "Muốn học nhanh, hãy học chậm ở những điều cốt lõi.",
  "Hiểu bản chất giúp giải quyết vô số bài toán.",
  "Một nguyên lý tốt đáng giá hơn hàng chục mẹo.",
  "Điều học sinh cần mang theo sau kỳ thi không chỉ là điểm số, mà là cách tư duy.",
  "Giáo dục không kết thúc khi học sinh rời khỏi lớp; nó tiếp tục trong cách các em suy nghĩ mỗi ngày.",
].map((name) => ({ name, angle: name }));

function teachingPhilosophyTopic(scheduledAt: string, pageName: string) {
  const week = isoWeekNumber(scheduledAt);
  const year = yearFromDate(scheduledAt);
  const offset = mondayMindsetOffset(pageName);
  const index = ((week - 1 - offset) % TEACHING_PHILOSOPHY_ITEMS.length + TEACHING_PHILOSOPHY_ITEMS.length) % TEACHING_PHILOSOPHY_ITEMS.length;
  const item = TEACHING_PHILOSOPHY_ITEMS[index] || TEACHING_PHILOSOPHY_ITEMS[0];
  return {
    week,
    year,
    offset,
    topicNumber: index + 1,
    totalTopics: TEACHING_PHILOSOPHY_ITEMS.length,
    name: item.name,
    angle: item.angle,
  };
}

function teachingPhilosophyPromptBlock(topic: ReturnType<typeof teachingPhilosophyTopic>) {
  return [
    "Required weekly/page Teaching Philosophy topic:",
    `- ISO week: ${topic.week}/${topic.year}`,
    `- Fanpage offset: ${topic.offset}`,
    `- Formula: ((week - 1 - offset) mod ${topic.totalTopics}) + 1`,
    `- Topic number: ${topic.topicNumber}/${topic.totalTopics}`,
    `- Topic: ${topic.name}`,
    `- Angle: ${topic.angle}`,
    "- Use this exact topic as the main idea. Do not randomly choose another teaching philosophy.",
    "- Source inspiration: base the idea on a credible foreign article/source about education, teaching, learning science, classroom culture, or parenting support. Then rewrite it as an original Vietnamese MindUp post. Do not translate sentence-by-sentence and do not copy.",
  ].join("\n");
}

function viralFacebookPromptBlock(typeName: string) {
  const cleanType = stripVietnameseForTag(typeName).toLowerCase();
  const common = [
    "Phong cách viết ưu tiên theo Llama/Meta AI:",
    "- Viết như một người làm content Facebook giỏi, không viết như văn mẫu AI.",
    "- Mục tiêu: người đọc dừng lướt, thấy đúng vấn đề của mình, muốn comment/lưu/share.",
    "- 1-2 dòng đầu phải là hook mạnh, đánh vào nỗi đau, sai lầm phổ biến, tình huống đời thường hoặc một sự thật khiến người xem tò mò.",
    "- Câu ngắn, nhịp nhanh, dễ đọc trên điện thoại; mỗi đoạn chỉ 1-3 dòng.",
    "- Có cảm xúc, có ví dụ đời thường, có sự đồng cảm; nhưng vẫn có ích thật, không giật tít rỗng.",
    "- Tránh mở bài sáo rỗng kiểu: 'Trong thời đại hiện nay', 'Hãy cùng khám phá', 'Bạn có bao giờ tự hỏi'.",
    "- Không quảng cáo lộ liễu, không hứa hẹn phi thực tế, không làm quá sự thật.",
    "- Có thể dùng emoji vừa phải để tăng nhịp đọc, không lạm dụng.",
    "- Có thể dùng **in đậm** cho 1-3 ý chính.",
    "- Kết bài nên có CTA nhẹ: hỏi ý kiến, rủ comment, lưu bài hoặc chia sẻ cho phụ huynh/học sinh khác.",
  ];
  if (cleanType.includes("quiz")) {
    return [
      ...common,
      "- Với Quiz/Hard Quiz: caption phải tạo cảm giác thử thách, kích thích comment, tuyệt đối không lộ đáp án/lời giải.",
    ];
  }
  if (cleanType.includes("meme")) {
    return [
      ...common,
      "- Với Meme: ưu tiên vui, đời, trúng tâm lý học sinh/phụ huynh; ngắn, gọn, có chất 'đúng quá'.",
    ];
  }
  if (cleanType.includes("enrollment")) {
    return [
      ...common,
      "- Với Enrollment: mở bằng nỗi lo thật của phụ huynh/học sinh, CTA học thử rõ nhưng không sales thô.",
    ];
  }
  if (cleanType.includes("learning method")) {
    return [
      ...common,
      "- Với Learning Method: mở bằng một nỗi đau học sai rất cụ thể, sau đó đưa phương pháp như một lời giải dễ áp dụng.",
    ];
  }
  if (cleanType.includes("teaching philosophy")) {
    return [
      ...common,
      "- With Teaching Philosophy: open with a sharp educational belief, connect it to a real learning problem, then make the idea practical for teachers, parents, and students.",
      "- Do not write abstract slogans only. The post must feel wise, human, and useful in a real classroom.",
    ];
  }
  if (cleanType.includes("applying knowledge")) {
    return [
      ...common,
      "- With Applying Knowledge to Practice: the first line must answer the reader's hidden question: 'Why do I need to learn this?'",
      "- Use one concrete real-life situation, then reveal the school knowledge behind it. Make the subject feel useful, surprising, and close to daily life.",
      "- Avoid generic lines like 'knowledge is important'. Show the application through a specific story, object, habit, problem, or decision.",
    ];
  }
  if (cleanType === "q a" || cleanType === "qa" || cleanType.includes("q a") || cleanType.includes("tim hieu")) {
    return [
      ...common,
      "- Với Q&A/Tìm hiểu thực tế: mở bằng một câu hỏi đời sống khiến người đọc tò mò 'Ủa tại sao lại thế?'.",
    ];
  }
  return common;
}

function llamaLearningMethodDepthPromptBlock() {
  return [
    "Yêu cầu RIÊNG khi dùng Llama AI cho Learning Method:",
    "- Đây KHÔNG phải caption ngắn/slogan/quảng cáo. Phải viết thành một bài Facebook có giá trị thật, đọc xong áp dụng được ngay.",
    "- Độ dài bắt buộc: 450-800 từ. Nếu caption dưới 350 từ hoặc chỉ gồm vài câu ngắn thì coi là sai.",
    "- Phải dựa trên ý chính từ một bài viết/nguồn nước ngoài uy tín về phương pháp học được giao, rồi chuyển hóa thành bài tiếng Việt tự nhiên. Không dịch sát, không copy nguyên văn.",
    "- Bài phải có ít nhất 6 đoạn rõ ràng, mỗi đoạn 1-3 dòng để dễ đọc trên điện thoại.",
    "- Cấu trúc bắt buộc:",
    "  1) Hook 2-3 dòng đánh trúng nỗi đau học sai rất cụ thể.",
    "  2) Phân tích vì sao học sinh/phụ huynh gặp vấn đề đó.",
    "  3) Giới thiệu đúng phương pháp học được giao như một lời giải.",
    "  4) Giải thích vì sao phương pháp này hiệu quả, dễ hiểu nhưng có chiều sâu.",
    "  5) Mục 'Cách áp dụng' gồm 3-5 bước cụ thể.",
    "  6) Ví dụ thực tế liên quan trực tiếp đến môn/trục nội dung của fanpage.",
    "  7) Kết luận ngắn + CTA nhẹ: rủ lưu bài, thử áp dụng, hoặc comment trải nghiệm.",
    "- Không chỉ nói 'hãy dùng phương pháp X'. Phải hướng dẫn cách dùng phương pháp đó trong một tình huống học tập cụ thể.",
    "- Giọng văn: gần gũi, cuốn hút, có nhịp Facebook, nhưng vẫn có chất chuyên môn giáo dục.",
    "- Tránh văn AI sáo rỗng: không dùng các cụm 'trong thời đại ngày nay', 'vô cùng quan trọng', 'chìa khóa thành công', 'hành trang vững chắc' nếu không thật cần.",
    "- Không viết thành danh sách khô cứng từ đầu đến cuối; cần có chuyển ý tự nhiên và ví dụ sống.",
  ];
}

function llamaTeachingPhilosophyDepthPromptBlock() {
  return [
    "Extra requirements when using Llama AI for Teaching Philosophy:",
    "- This is NOT a short quote, slogan, or ad. Write a complete Facebook post with real educational value.",
    "- Required length: 450-800 Vietnamese words. If the caption is under 350 words or only a few short lines, it is wrong.",
    "- The core idea must be inspired by a credible foreign article/source about education or learning, then rewritten naturally for Vietnamese parents/students/teachers. Do not translate closely and do not copy.",
    "- The post must have at least 6 clear paragraphs, each 1-3 mobile-friendly lines.",
    "- Mandatory structure:",
    "  1) A strong hook about a common learning/teaching misconception.",
    "  2) Explain the philosophy in plain Vietnamese.",
    "  3) Show why this philosophy matters for students' thinking habits.",
    "  4) Connect it to parents/teachers: what adults should change in the way they support students.",
    "  5) Give a subject-specific classroom example based on the fanpage subject.",
    "  6) Give 3-5 practical actions MindUp/teachers/parents/students can try immediately.",
    "  7) End with a gentle CTA: ask readers to comment, save, or share the idea.",
    "- Tone: thoughtful, warm, premium education brand, viral-friendly on Facebook, not academic jargon.",
    "- Avoid generic statements. Use concrete situations, mini examples, and memorable sentences.",
    "- Avoid AI-sounding phrases such as 'trong thời đại ngày nay', 'vô cùng quan trọng', 'chìa khóa thành công', or 'hành trang vững chắc' unless truly necessary.",
  ];
}

function mondayMindsetTopic(scheduledAt: string, pageName: string) {
  const week = isoWeekNumber(scheduledAt);
  const year = yearFromDate(scheduledAt);
  const offset = mondayMindsetOffset(pageName);
  const contentIndex = ((week - 1 - offset) % MONDAY_MINDSET_ITEMS.length + MONDAY_MINDSET_ITEMS.length) % MONDAY_MINDSET_ITEMS.length;
  const topic = MONDAY_MINDSET_ITEMS[contentIndex] || "";
  if (week <= MONDAY_MINDSET_ITEMS.length && topic) {
    return {
      week,
      year,
      mode: "jon_gordon" as const,
      topic,
      contentNumber: contentIndex + 1,
      offset,
      countdownWeeks: 0,
    };
  }
  return {
    week,
    year,
    mode: "year_countdown" as const,
    topic: `Đếm ngược hết năm ${year} cho fanpage ${pageName}: còn khoảng ${weeksLeftInYear(scheduledAt)} tuần để kết thúc năm. Hãy chọn một việc quan trọng theo tinh thần của fanpage để hoàn thiện trước khi năm mới bắt đầu.`,
    contentNumber: 0,
    offset,
    countdownWeeks: weeksLeftInYear(scheduledAt),
  };
}

async function buildGeminiPrompt(args: {
  pageName: string;
  typeName: string;
  scheduledAt: string;
  typePrompt: string;
  existingContent: string;
  internalNote: string;
  provider?: string;
  sourceHistory?: string;
}) {
  if (isMondayMindset(args.typeName)) {
    const monday = mondayMindsetTopic(args.scheduledAt, args.pageName);
    const fanpageTag = pageHashtag(args.pageName);
    const isCountdown = monday.mode === "year_countdown";
    return [
      "Bạn là trợ lý nội dung cho MindUp - Tư Duy Toàn Diện.",
      "Nhiệm vụ: tạo bài Monday Mindset dạng quote-card, không viết caption phân tích dài.",
      "Quote tiếng Việt phải ngắn, chạm cảm xúc học tập, dễ share trên Facebook, đọc một lần là nhớ; không dùng giọng văn mẫu AI.",
      "",
      "Thông tin:",
      `- Fanpage: ${args.pageName}`,
      `- Hashtag fanpage bắt buộc: ${fanpageTag}`,
      `- Tuần ISO trong năm: ${monday.week}/${monday.year}`,
      `- Offset nội dung theo fanpage: ${monday.offset}`,
      monday.contentNumber ? `- Số thứ tự nội dung Jon Gordon dùng cho fanpage này: ${monday.contentNumber}/50` : "",
      `- Chủ đề: ${monday.topic}`,
      "",
      isCountdown
        ? "Vì bộ nội dung Jon Gordon chỉ có 50 tuần, tuần này hãy tạo quote tiếng Anh ngắn về việc đếm ngược hết năm, hoàn thiện mục tiêu, kết thúc năm thật mạnh mẽ. Quote không cần gán tác giả Jon Gordon."
        : "Hãy tìm/khôi phục một câu nói tiếng Anh ngắn, đúng tinh thần Jon Gordon, phù hợp nhất với chủ đề trên. Nếu không chắc nguyên văn 100%, hãy viết một câu quote tiếng Anh tự nhiên theo phong cách Jon Gordon và ghi nguồn là Jon Gordon-inspired, không bịa là trích dẫn nguyên văn.",
      "Sau đó chuyển ngữ quote sang tiếng Việt theo bối cảnh học tập của học sinh Việt Nam. Không dịch sát từng chữ nếu câu bị chung chung; hãy giữ tinh thần gốc nhưng diễn đạt thành thông điệp phù hợp với việc học, tư duy học tập, hiểu sâu, nỗ lực, kỷ luật, sự tập trung, kết nối giữa học sinh - thầy cô - phụ huynh. Câu tiếng Việt dùng trên ảnh phải ngắn, tự nhiên, truyền cảm hứng, có chất học thuật nhẹ và dễ nhớ.",
      "",
      "Caption chỉ được là hashtag, không thêm mô tả:",
      `#MondayMindset #MindUp ${fanpageTag}`,
      "",
      "Hãy trả về duy nhất JSON hợp lệ, không markdown, theo schema:",
      JSON.stringify({
        caption: `#MondayMindset #MindUp ${fanpageTag}`,
        hashtags: ["#MondayMindset", "#MindUp", fanpageTag],
        quote_en: isCountdown ? "Short English countdown quote." : "English Jon Gordon quote or Jon Gordon-inspired quote.",
        quote_vi: "Câu chuyển ngữ tiếng Việt theo bối cảnh học tập, ngắn, hay, dễ nhớ, không dịch sát máy móc.",
        quote_source: isCountdown ? "MindUp" : "Jon Gordon / Jon Gordon-inspired",
        image_prompt: "Prompt tiếng Anh để tạo ảnh Facebook 16:9 phong cách Monday Mindset: nền xanh MindUp, logo MindUp, quote tiếng Việt lớn ở vùng trống, typography đẹp, dễ đọc trên điện thoại. Không thêm tên tác giả trên ảnh.",
        internal_note: `Monday Mindset tuần ${monday.week}/${monday.year}; fanpage ${args.pageName}; offset ${monday.offset}; content ${monday.contentNumber || "countdown"}: ${monday.topic}`,
      }, null, 2),
      "",
      "Yêu cầu ảnh:",
      "- Ảnh phải tập trung vào quote tiếng Việt đã chuyển ngữ theo bối cảnh học tập.",
      "- Nền xanh sáng, giáo dục, hiện đại, có logo hoặc chữ MindUp - Tư Duy Toàn Diện.",
      "- Không viết sai tiếng Việt.",
      "- Không đưa quote tiếng Anh hoặc tên nguồn lên ảnh; nếu cần thì chỉ lưu trong internal_note.",
    ].join("\n");
  }

  const scheduledTopic = contentTopicFor(args.typeName, args.scheduledAt, args.pageName);

  if (isInterestingQuestion(args.typeName)) {
    const fanpageTag = pageHashtag(args.pageName);
    const reference = interestingQuestionReferenceFor(args.pageName);
    return [
      "You are a MindUp educational content editor.",
      "Task: create an Interesting Question Facebook post in Vietnamese.",
      "",
      ...viralFacebookPromptBlock(args.typeName),
      "",
      "Source research requirement:",
      `- Subject/page: ${reference.subject}`,
      `- Primary source: ${reference.sourceName} (${reference.sourceUrl})`,
      reference.secondaryUrl ? `- Secondary source if useful: ${reference.secondaryUrl}` : "",
      `- Guidance: ${reference.sourceGuidance}`,
      "- Search/read the source style and choose ONE interesting question suitable for Vietnamese students.",
      "- Do not copy a full copyrighted question verbatim. Keep the core idea, then rewrite/adapt it naturally in Vietnamese.",
      "- If the original question has a specific source page, return source_title and source_url. Do not invent a URL if unsure.",
      "- If the source page includes a relevant image/illustration for the selected question, return its direct source_image_url. Prefer a real image from the source page over generic images. Do not invent an image URL.",
      args.sourceHistory ? ["", "Recently used questions/sources to avoid:", args.sourceHistory].join("\n") : "",
      "",
      "Non-duplication rules:",
      "- Do not reuse any source_url, source_title, question_fingerprint, or near-identical question from the avoid list.",
      "- If the most obvious source item was already used, choose another one from the same source family.",
      "- Return question_fingerprint as a short lowercase English/Vietnamese slug summarizing the unique idea, not a random UUID.",
      "",
      "Content requirements:",
      "- Public caption must show the question clearly and invite comments.",
      "- Do not reveal the answer in the caption.",
      "- Put answer/explanation only in internal_note and interesting_question.",
      "- Make it feel like a curious Facebook challenge, not an exam.",
      "- Add 3-6 tasteful emoji/icons in the caption.",
      "- Image rule: the system will download source_image_url when available, then add the MindUp logo and a large question mark in the center. If no source image is available, provide fallback image_prompt/image_search_keywords.",
      "",
      "Return only valid JSON, no markdown, with this schema:",
      JSON.stringify({
        caption: "Vietnamese Interesting Question caption. Includes the question, curiosity hook, CTA to comment, no answer.",
        hashtags: ["#MindUp", "#CauHoiThuVi", "#PhatTrienTuDuy", fanpageTag],
        image_prompt: "English prompt for a clean 1:1 educational background, no answer text, no logo.",
        image_search_keywords: "English keywords for a relevant background image.",
        interesting_question: {
          subject: reference.subject,
          source_name: reference.sourceName,
          source_title: "Title/name of selected source item if known",
          source_url: "URL of selected source item if known",
          source_image_url: "Direct URL of the source page image/illustration if known",
          question_fingerprint: "short unique slug of the question idea",
          question: "Vietnamese rewritten/adapted question",
          answer: "Correct answer, not for public caption",
          explanation: "Short explanation for staff/internal note",
        },
        internal_note: "Include source, answer, explanation, and why this question was selected.",
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  if (isRealWorldPhenomenon(args.typeName)) {
    const fanpageTag = pageHashtag(args.pageName);
    const reference = realWorldPhenomenonReferenceFor(args.pageName);
    return [
      "You are a MindUp educational content editor.",
      "Task: create a Real-world Phenomenon Facebook post in Vietnamese.",
      "",
      ...viralFacebookPromptBlock(args.typeName),
      "",
      "Source research requirement:",
      `- Subject/page: ${reference.subject}`,
      `- Primary source: ${reference.sourceName} (${reference.sourceUrl})`,
      reference.secondaryUrl ? `- Secondary source if useful: ${reference.secondaryUrl}` : "",
      `- Guidance: ${reference.sourceGuidance}`,
      "- Choose ONE real-world phenomenon/article idea from the source family, then write an original Vietnamese post for MindUp.",
      "- Do not translate sentence-by-sentence and do not copy the source. Use the source only for the core idea and factual direction.",
      "- If the source has a specific page/article, return source_title and source_url. Do not invent a URL if unsure.",
      "- If the source page includes a relevant image/illustration for the selected phenomenon, return its direct source_image_url. Prefer a real source image over generic images. Do not invent an image URL.",
      args.sourceHistory ? ["", "Recently used phenomena/sources to avoid:", args.sourceHistory].join("\n") : "",
      "",
      "Non-duplication rules:",
      "- Do not reuse any source_url, source_title, phenomenon_fingerprint, or near-identical phenomenon from the avoid list.",
      "- Return phenomenon_fingerprint as a short lowercase English/Vietnamese slug summarizing the unique idea, not a random UUID.",
      "",
      "Content requirements:",
      "- Open with a real-life hook: something students/parents can see, touch, measure, taste, hear, or experience.",
      "- Explain the school concept behind the phenomenon in simple language.",
      "- Include one concrete mini example related to the fanpage subject.",
      "- Keep the post practical and shareable, similar in spirit to Maths Minute but written as original MindUp content.",
      "- Add 3-6 tasteful emoji/icons in the caption.",
      "- Image rule: the system will download source_image_url when available, then add the MindUp logo and the short image_overlay_text. If no source image is available, provide fallback image_prompt/image_search_keywords.",
      "",
      "Return only valid JSON, no markdown, with this schema:",
      JSON.stringify({
        caption: "Vietnamese Real-world Phenomenon post, 300-650 words, with hook, explanation, mini example, and CTA.",
        hashtags: ["#MindUp", "#HienTuongThucTe", "#HocDeHieuTheGioi", fanpageTag],
        image_prompt: "English prompt for a relevant 1:1 background image, no text, no logo.",
        image_search_keywords: "English keywords for a relevant background image.",
        image_overlay_text: "Vietnamese summary up to 20 words for image overlay.",
        real_world_phenomenon: {
          subject: reference.subject,
          source_name: reference.sourceName,
          source_title: "Title/name of selected source item if known",
          source_url: "URL of selected source item if known",
          source_image_url: "Direct URL of the source page image/illustration if known",
          phenomenon_fingerprint: "short unique slug of the phenomenon idea",
          phenomenon: "Short Vietnamese name of the phenomenon",
          core_idea: "Main concept adapted from the source",
        },
        source_inspiration: "Source name/URL if known",
        core_idea: "Core idea adapted for MindUp",
        internal_note: "Include source, selected phenomenon, and adaptation note.",
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  if (scheduledTopic.key === "qna") {
    const fanpageTag = pageHashtag(args.pageName);
    return [
      "Bạn là chuyên gia content giáo dục cho MindUp - Tư Duy Toàn Diện.",
      "Nhiệm vụ: tạo bài Q&A/Tìm hiểu kiến thức môn học trong thực tế. Bài phải làm người đọc thấy: hóa ra kiến thức trên lớp có thật trong đời sống.",
      "",
      ...viralFacebookPromptBlock(args.typeName),
      "",
      contentTopicBlock(scheduledTopic),
      "",
      "Yêu cầu nội dung:",
      "- Mở bài bằng một câu hỏi đời sống thật gần gũi.",
      "- Giải thích bằng kiến thức môn học, nhưng dùng ngôn ngữ dễ hiểu cho học sinh/phụ huynh.",
      "- Có ví dụ ngắn, không quá dài dòng.",
      "- Kết bài bằng câu hỏi gợi bình luận: Bạn từng gặp hiện tượng này chưa?",
      "- Không copy nguyên văn từ nguồn khác; chỉ dùng insight phổ biến rồi viết lại theo giọng MindUp.",
      "",
      "Hãy trả về duy nhất JSON hợp lệ, không markdown, theo schema:",
      JSON.stringify({
        caption: "Caption Q&A bằng tiếng Việt, có câu hỏi mở đầu, giải thích ngắn, ví dụ thực tế, CTA bình luận.",
        hashtags: ["#MindUp", "#TimHieuThucTe", "#KienThucDoiSong", fanpageTag],
        image_prompt: "Template Q&A MindUp: nền xanh sáng, logo MindUp, tiêu đề TÌM HIỂU THỰC TẾ, một câu hỏi lớn ở giữa, 2-3 bullet insight ngắn.",
        internal_note: `Q&A topic ${scheduledTopic.number}/${scheduledTopic.total}: ${scheduledTopic.topic}`,
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  if (scheduledTopic.key === "quiz") {
    const fanpageTag = pageHashtag(args.pageName);
    const curriculum = quizCurriculumFor(args.scheduledAt, args.pageName);
    const realLessons = await fetchRecentLessonsForSubjectAndGrade(curriculum.subject, curriculum.grade);
    const lessonTopicContext = realLessons.length
      ? `BÀI HỌC THỰC TẾ GẦN ĐÂY CỦA CÁC LỚP ${curriculum.subject.toUpperCase()} ${curriculum.grade} TẠI MINDUP: ${realLessons.join(" | ")}. BẮT BUỘC NÊU CÂU HỎI TRẮC NGHIỆM NHANH LIÊN QUAN ĐẾN CÁC BÀI NÀY.`
      : `Chủ đề bài học theo phân phối chương trình bộ sách KNTT cho tháng này: ${curriculum.topic}.`;

    return [
      "IMPORTANT QUIZ FLOW: Gemini only creates quiz text data. Do not create an image. The website will place the question and answers into MindUp's Quiz image template.",
      `Mandatory textbook curriculum standard: Bộ sách Kết nối tri thức với cuộc sống (KNTT) - Bộ GD&ĐT Việt Nam.`,
      `Target subject: ${curriculum.subject}`,
      `Target grade: Lớp ${curriculum.grade}`,
      `Scheduled date: ${args.scheduledAt}. ${lessonTopicContext}`,
      "MANDATORY QUIZ NATURE: THIS IS A QUICK 10-30 SECOND INTERACTION QUIZ (CÂU HỎI INTERACTION NHANH 10-30 GIÂY).",
      "CRITICAL REQUIREMENT: BẮT BUỘC ĐẠT ĐỦ 3 YÊU CẦU DƯỚI ĐÂY:",
      "1. NGẮN: Đề bài cực kỳ ngắn gọn (dưới 20 từ), học sinh lướt Facebook đọc hiểu ngay trong 5-10 giây.",
      "2. DỄ: Kiến thức cơ bản, nền tảng môn học; KHÔNG bắt tính toán cồng kềnh, không giải phương trình phức tạp hay biến đổi nhiều bước.",
      "3. DỄ SAI (BẪY NHẸ): Có 1 chi tiết bẫy nhỏ hoặc nhầm lẫn phổ biến (common misconception) khiến học sinh khoanh vội dễ chọn sai, tạo cảm giác thú vị và bất ngờ khi bấm chọn và xem đáp án.",
      "The question can test a fundamental concept, a quick mental calculation, or a common misconception/subtle trap, but IT MUST NOT BE ADVANCED OR TIME-CONSUMING.",
      "Return a quiz object with grade, subject, curriculum_topic, question, answers, correct_answer, trap, explanation.",
      "Math formatting rule: every mathematical expression, variable, formula, equation, inequality, fraction, exponent, radical, logarithm, geometry notation, chemistry equation, or unit expression that appears inside quiz.question, quiz.answers, quiz.correct_answer, quiz.trap, or quiz.explanation must be written as inline LaTeX between single dollar signs, for example $x^2+1=0$, $\\sqrt{x+1}$, $\\log_2 8$, $H_2SO_4$, $\\Delta H<0$.",
      "Do not put normal Vietnamese words inside $...$. Only wrap the mathematical/chemical symbols or formulas.",
      "Keep inline LaTeX on one line. Never split a formula across lines.",
      "Caption must not reveal the correct answer. Correct answer and explanation must only appear in internal_note and quiz fields.",
      "Do not ask Gemini to create the image. The website will create the image from MindUp Quiz template.",
      "Bạn là giáo viên ra câu hỏi tương tác nhanh 10-30 giây cho MindUp - Tư Duy Toàn Diện.",
      `Nhiệm vụ: tạo một câu hỏi Quiz thỏa mãn đúng 3 tiêu chí NGẮN - DỄ - DỄ SAI, đúng bài đang học (${realLessons.length ? "Bài học thực tế: " + realLessons.join(", ") : "Theo chương trình tháng"}). Học sinh lướt Facebook có thể đọc hiểu trong 5-10 giây, chọn ngay đáp án trong 10-30 giây. KHÔNG ra đề tính toán nhiều bước hay phức tạp rườm rà.`,
      "",
      ...viralFacebookPromptBlock(args.typeName),
      "",
      contentTopicBlock(scheduledTopic),
      "",
      "Yêu cầu câu hỏi:",
      realLessons.length
        ? `- ƯU TIÊN HÀNG ĐẦU: Bắt buộc ra câu hỏi trắc nghiệm nhanh thuộc các bài học vừa dạy gần đây: ${realLessons.join(", ")}.`
        : "- Bắt buộc dùng kiến thức đúng bài/chương đang học trên lớp theo bộ sách KẾT NỐI TRI THỨC VỚI CUỘC SỐNG.",
      "- CỰC KỲ BẮT BUỘC ĐỦ 3 TIÊU CHÍ: NGẮN (dưới 20 từ) - DỄ (kiến thức cơ bản, không tính toán nhiều bước) - DỄ SAI (có bẫy nhẹ / nhầm lẫn phổ biến).",
      "- KHÔNG bắt tính toán cồng kềnh, không giải phương trình phức tạp, không biến đổi dài dòng.",
      "- Có một chi tiết bẫy nhẹ hoặc nhầm lẫn phổ biến để học sinh thấy thú vị khi bấm chọn đáp án.",
      "- Có 2-4 đáp án ngắn gọn, rõ ràng.",
      "- Caption ngắn, không tiết lộ đáp án, kêu gọi học sinh comment chọn đáp án.",
      "- Internal note giải thích ngắn gọn đáp án đúng và phân tích bẫy nhầm lẫn.",
      "",
      "Hãy trả về duy nhất JSON hợp lệ, không markdown, theo schema:",
      JSON.stringify({
        caption: "Caption Quiz ngắn bằng tiếng Việt, kêu gọi comment đáp án, không lộ đáp án.",
        hashtags: ["#MindUp", "#Quiz", "#PhatTrienTuDuy", fanpageTag],
        quiz: {
          grade: curriculum.grade,
          subject: curriculum.subject,
          curriculum_topic: curriculum.topic,
          question: "Câu hỏi cực ngắn, dễ hiểu, làm xong trong 10-30 giây. Nếu có công thức thì viết dạng $x^2+1=0$.",
          answers: ["Đáp án 1 có thể chứa $\\sqrt{x+1}$", "Đáp án 2", "Đáp án 3"],
          correct_answer: "Nội dung đáp án đúng, không chỉ ghi A/B/C/D; công thức phải ở dạng $...$.",
          trap: "Mô tả nhầm lẫn phổ biến hoặc bẫy nhỏ; công thức/ký hiệu nếu có phải ở dạng $...$.",
          explanation: "Giải thích ngắn 1-2 câu; công thức/ký hiệu nếu có phải ở dạng $...$.",
        },
        image_prompt: "Template Quiz MindUp: nền xanh, logo MindUp, vùng câu hỏi lớn, 2-4 ô đáp án ngắn, font lớn, dễ đọc trên điện thoại.",
        internal_note: "Câu hỏi; các đáp án; đáp án đúng; bẫy nằm ở đâu; giải thích ngắn.",
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  if (isHardQuizWithPrize(args.typeName)) {
    const fanpageTag = pageHashtag(args.pageName);
    const curriculum = quizCurriculumFor(args.scheduledAt, args.pageName);
    return [
      "IMPORTANT HARD QUIZ FLOW: Gemini only creates the hard quiz question data. Do not create an image.",
      "The website already has the MindUp Hard Quiz image template and will place hard_quiz.question into that template.",
      "The website will automatically generate the caption with fixed game rules, like/share requirements, XSMB prediction rule, prize, and hashtags. Do not write game rules yourself.",
      "Return a hard_quiz object with question, correct_answer, solution, prize_amount.",
      "Caption must not reveal the correct answer. Correct answer and solution must only appear in internal_note and hard_quiz fields.",
      "Use inline LaTeX between single dollar signs for every formula or math/chemistry notation, for example $x^2+1=0$, $\\sqrt{x+1}$, $H_2SO_4$.",
      "VERY IMPORTANT IMAGE LIMIT: hard_quiz.question must be concise enough to fit inside the MindUp Hard Quiz image.",
      "Keep hard_quiz.question at maximum 80 Vietnamese words or 520 characters.",
      "The question must be a real-world application problem, not a bare theory question. Use a short realistic context with concrete data, then ask one clear question.",
      "Use short given data and one clear question. Do not write a long story, long explanation, or multi-part prompt in the question field.",
      "The question can still require about 10 lines of solution, but the visible problem statement must be short and easy to read on a phone.",
      "Bạn là trợ lý nội dung cho MindUp - Tư Duy Toàn Diện.",
      "Nhiệm vụ: tạo bài Facebook cho chương trình Hard Quiz with Prize, tên hiển thị là HỎI NHANH ĐỚP TRỌN.",
      "",
      ...viralFacebookPromptBlock(args.typeName),
      "",
      "Thông tin bài đăng:",
      `- Fanpage: ${args.pageName}`,
      `- Hashtag fanpage bắt buộc: ${fanpageTag}`,
      `- Thời gian đăng: ${args.scheduledAt}`,
      `- Kế hoạch lớp theo ngày đăng: ${curriculum.weekdayRule}`,
      `- Lớp bắt buộc: lớp ${curriculum.grade}`,
      `- Môn bắt buộc theo fanpage: ${curriculum.subject}`,
      `- Chương/mảng kiến thức hiện tại bắt buộc dùng: ${curriculum.topic}`,
      args.existingContent ? `- Nội dung nháp/câu hỏi hiện có: ${args.existingContent}` : "",
      args.internalNote ? `- Ghi chú nội bộ/đáp án/lời giải nếu có: ${args.internalNote}` : "",
      "",
      subjectContextPromptBlock(args.pageName),
      "",
      "Yêu cầu cực kỳ quan trọng:",
      `- Câu hỏi BẮT BUỘC đúng môn ${curriculum.subject}, đúng lớp ${curriculum.grade}, và nằm trong chương/mảng kiến thức: ${curriculum.topic}.`,
      "- CỰC KỲ QUAN TRỌNG: Câu hỏi BẮT BUỘC phải HAY, THÚ VỊ, ĐỘC ĐÁO và mang tính VẬN DỤNG THỰC TẾ cao.",
      "- Tránh các bài toán khô khan, tính toán nhàm chán hoặc thuần lý thuyết giáo khoa. Bối cảnh phải thông minh, kích thích trí tò mò của học sinh.",
      "- Không được tạo câu hỏi thuộc môn khác, chương khác, hoặc kiểu tư duy chung nếu fanpage là Toán/Lý/Hóa/Sinh.",
      "- Nếu nội dung nháp/admin note mâu thuẫn với môn/chương bắt buộc, hãy ưu tiên môn/chương bắt buộc và chỉ dùng nháp như gợi ý phụ.",
      "- Đề bài, đáp án và lời giải phải sử dụng đúng kiến thức trong chương/mảng hiện tại; internal_note phải ghi rõ lớp, môn, chương.",
      "- Câu hỏi phải là dạng bài toán/tình huống thực tế: dữ kiện đến từ đời sống, lớp học, thí nghiệm, đo đạc, mua bán, sức khỏe, môi trường, kỹ thuật hoặc một tình huống học sinh có thể hình dung.",
      "- Không hỏi kiểu lý thuyết thuần túy như 'nêu định nghĩa', 'tính trực tiếp theo công thức' nếu không có bối cảnh thực tế.",
      "- Bối cảnh thực tế phải ngắn gọn nhưng đủ dữ kiện; lời giải phải quy về đúng kiến thức môn/chương hiện tại.",
      "- Câu hỏi phải ở mức vận dụng, hơi khó, học sinh bắt buộc phải đặt bút viết khoảng 10 dòng mới giải chắc được.",
      "- Không tạo câu hỏi mẹo quá ngắn; phải có dữ kiện đủ rõ để giải bằng kiến thức môn học.",
      "- Hard Quiz question image limit: write the visible question in maximum 80 Vietnamese words or 520 characters.",
      "- Compress data into 1-2 short sentences; avoid long stories, subquestions, and verbose setup.",
      "- Caption KHÔNG được lộ đáp án đúng.",
      "- Caption phải ghi rõ luật chơi yêu cầu người tham gia LIKE bài viết và SHARE bài viết ở chế độ công khai.",
      "- Người thắng: trả lời đúng câu hỏi và dự đoán số từ 00-99 gần nhất với 2 số cuối giải Đặc biệt XSMB Chủ nhật.",
      "- Nếu nhiều người cùng gần nhất thì ưu tiên người comment sớm hơn.",
      "- Kết quả được công bố trong bài Monday Mindset thứ Hai tuần sau.",
      "- Phần thưởng mặc định 50.000đ nếu không có ghi chú khác.",
      "",
      "Hãy trả về duy nhất JSON hợp lệ, không markdown, theo schema:",
      JSON.stringify({
        caption: [
          "🔥 HỎI NHANH ĐỚP TRỌN 🔥",
          "",
          "Caption tiếng Việt ngắn, vui, kích thích tương tác nhưng không lộ đáp án.",
          "",
          "🎁 Phần thưởng: 50.000đ",
          "",
          "📌 Quy định chơi:",
          "1. Like bài viết này.",
          "2. Share bài viết ở chế độ công khai.",
          "3. Comment đáp án đúng của câu hỏi.",
          "4. Comment kèm 1 số dự đoán từ 00 đến 99.",
          "5. Người thắng là người có đáp án đúng và dự đoán gần nhất với 2 số cuối giải Đặc biệt XSMB Chủ nhật.",
          "6. Nếu nhiều bạn cùng gần nhất, ưu tiên bạn comment sớm hơn.",
          "7. Kết quả sẽ được công bố trong bài Monday Mindset thứ Hai tuần sau.",
          "",
          "#HardQuiz #HoiNhanhDopTron #MindUp #PhatTrienTuDuy " + fanpageTag,
        ].join("\n"),
        hashtags: ["#HardQuiz", "#HoiNhanhDopTron", "#MindUp", "#PhatTrienTuDuy", fanpageTag],
        hard_quiz: {
          grade: curriculum.grade,
          subject: curriculum.subject,
          curriculum_topic: curriculum.topic,
          question: "Concise real-world application problem, maximum 80 Vietnamese words/520 characters, correct subject/grade/curriculum, may require about 10 lines to solve. Formulas must use $x^2+1=0$ format.",
          correct_answer: "??p ?n ??ng, kh?ng ??a v?o caption. C?ng th?c n?u c? vi?t d?ng $...$.",
          solution: "L?i gi?i/ghi ch? n?i b? ng?n g?n. C?ng th?c n?u c? vi?t d?ng $...$.",
          prize_amount: 50000,
        },
        image_prompt: "Prompt tiếng Anh để tạo ảnh theo template Hỏi nhanh đớp trọn của MindUp: nền xanh, logo MindUp, headline Hỏi nhanh đớp trọn, vùng trắng lớn chỉ chứa đề bài, phần thưởng 50.000đ, typography rõ, dễ đọc trên điện thoại.",
        internal_note: "Ghi đáp án đúng/lời giải nội bộ nếu có, không đưa vào caption.",
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  if (isTeachingPhilosophy(args.typeName)) {
    const fanpageTag = pageHashtag(args.pageName);
    const topic = teachingPhilosophyTopic(args.scheduledAt, args.pageName);
    return [
      "You are a senior education content strategist for MindUp - Tu Duy Toan Dien.",
      "Task: create a standalone Teaching Philosophy Facebook post in Vietnamese.",
      "The post must communicate one deep but practical education belief, then connect it to how students learn better.",
      "",
      ...viralFacebookPromptBlock(args.typeName),
      ...(normalizeTextAiProvider(args.provider) === "llama" ? [
        "",
        ...llamaTeachingPhilosophyDepthPromptBlock(),
      ] : []),
      "",
      "Post information:",
      `- Fanpage: ${args.pageName}`,
      `- Required fanpage hashtag: ${fanpageTag}`,
      `- Scheduled time: ${args.scheduledAt}`,
      args.existingContent ? `- Existing draft/admin note: ${args.existingContent}` : "",
      args.internalNote ? `- Internal note: ${args.internalNote}` : "",
      "",
      teachingPhilosophyPromptBlock(topic),
      "",
      subjectContextPromptBlock(args.pageName),
      "",
      "Content requirements:",
      "- Write in natural Vietnamese, warm and premium, suitable for parents, students, and teachers.",
      "- Before writing, choose a credible foreign article/source about education, teaching philosophy, learning science, classroom culture, or parenting support as the source inspiration.",
      "- Use the core idea from that source to write an original Vietnamese post for MindUp. Do not translate mechanically, do not translate sentence-by-sentence, and do not copy the source.",
      "- You may mention the source inspiration briefly in internal_note, but the public caption should not sound academic or like a literature review.",
      "- Start with a concrete misconception or real classroom/parenting situation, not with a generic slogan.",
      "- Explain the teaching philosophy clearly: what it means, why it matters, and how it changes the way MindUp teaches.",
      "- Include one concrete example related to the fanpage subject. For the general MindUp page, use an interdisciplinary learning example.",
      "- Include 3-5 practical actions that teachers/parents/students can try immediately.",
      "- The voice must sound like a thoughtful education practitioner writing from real classroom experience. Avoid AI-sounding generic lines and empty slogans.",
      "- Do not mention Learning Method, Problem series, previous week, or a linked post. This post is standalone.",
      "- Do not over-sell classes. The CTA should be soft: comment, save, share, or reflect.",
      "- Image: AI only returns background search keywords/prompt and one overlay sentence. The system will fetch a background image, place the MindUp logo at top center, and place the overlay sentence in the center.",
      "- image_overlay_text should be Vietnamese, memorable, and short enough for the image; aim around 10-20 words, but do not omit the key meaning.",
      "",
      "Return ONLY valid JSON, no markdown, using this schema:",
      "JSON safety rules: every property must be separated by a comma; all multiline text must use \\n escapes; do not put raw line breaks inside string values.",
      JSON.stringify({
        caption: normalizeTextAiProvider(args.provider) === "llama"
          ? "Complete Teaching Philosophy Facebook post in Vietnamese, 450-800 words, at least 6 paragraphs, inspired by a credible foreign education article/source and rewritten naturally for MindUp, with hook, philosophy explanation, why it matters, subject-specific example, 3-5 practical actions, and soft CTA."
          : "Teaching Philosophy Facebook post in Vietnamese, inspired by a credible foreign education article/source and rewritten naturally for MindUp, thoughtful and useful, with hook, philosophy explanation, subject-specific example, practical actions, and soft CTA.",
        hashtags: ["#MindUp", "#TeachingPhilosophy", "#TrietLyGiaoDuc", "#PhatTrienTuDuy", fanpageTag],
        image_prompt: "English prompt for a square 1:1 educational background photo/illustration related to the teaching philosophy and fanpage subject, no text, no logo.",
        image_search_keywords: "English Pexels search keywords for a background image related to the philosophy and fanpage subject, no text.",
        image_background_prompt: "English background prompt/keywords, no text, no logo.",
        image_overlay_text: "Vietnamese summary sentence for the image, about 10-20 words, memorable and complete.",
        source_inspiration: "Name/URL or short description of the foreign source used as inspiration, if known. Do not invent a specific URL if unsure.",
        core_idea: "Core idea taken from the source inspiration and adapted for MindUp.",
        internal_note: `Teaching Philosophy week ${topic.week}/${topic.year}; fanpage ${args.pageName}; offset ${topic.offset}; topic ${topic.topicNumber}/${topic.totalTopics}: ${topic.name} | ${topic.angle}; add source inspiration if available`,
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  if (isApplyingKnowledge(args.typeName)) {
    const fanpageTag = pageHashtag(args.pageName);
    const topic = contentTopicFor(args.typeName, args.scheduledAt, args.pageName);
    const curriculum = quizCurriculumFor(args.scheduledAt, args.pageName);
    const reference = applyingKnowledgeReferenceFor(args.pageName);
    const videoInspiration = applyingKnowledgeVideoInspirationFor(args.pageName);
    return [
      "You are a senior Facebook education content creator for MindUp - Tu Duy Toan Dien.",
      "Task: create an Applying Knowledge to Practice post in Vietnamese.",
      "Goal: make students and parents feel that school knowledge is useful in real life.",
      "",
      ...viralFacebookPromptBlock(args.typeName),
      "",
      "Post information:",
      `- Fanpage: ${args.pageName}`,
      `- Fanpage subject/axis: ${reference.subject}`,
      `- Required fanpage hashtag: ${fanpageTag}`,
      `- Scheduled time: ${args.scheduledAt}`,
      `- Suggested grade by weekday: grade ${curriculum.grade}`,
      `- Current curriculum area: ${curriculum.topic}`,
      `- Reference inspiration source: ${reference.sourceName} (${reference.sourceUrl})`,
      `- Source guidance: ${reference.sourceGuidance}`,
      `- Video inspiration source: ${videoInspiration.sourceName} (${videoInspiration.sourceUrl})`,
      `- Video channel/source URL: ${videoInspiration.sourceChannelUrl}`,
      `- Inspiration style: ${videoInspiration.sourceStyle}`,
      `- Topic selection guidance: ${videoInspiration.topicGuidance}`,
      `- Visual guidance: ${videoInspiration.visualGuidance}`,
      args.existingContent ? `- Existing draft/admin note: ${args.existingContent}` : "",
      args.internalNote ? `- Internal note: ${args.internalNote}` : "",
      "",
      contentTopicBlock(topic),
      "- If the rotating content topic above is not clearly compatible with the fanpage subject/current curriculum, use it only as a loose inspiration and choose a concrete subject-specific application instead.",
      "",
      subjectContextPromptBlock(args.pageName),
      "",
      "Content requirements:",
      "- Write a complete Facebook post in Vietnamese, 300-650 words.",
      "- Do not copy, translate, summarize, or imitate any specific source video. Use the sources only to choose a topic style and level of clarity, then create original MindUp content.",
      "- If a source/channel inspires the topic, mention it only in internal_note, never in the public caption.",
      "- The post must teach ONE concrete piece of school knowledge, not only a general life skill or consumer advice.",
      `- For this fanpage, the concrete knowledge must belong to ${reference.subject} and connect to: ${curriculum.topic}.`,
      "- Do NOT write a generic article about advertising, motivation, study habits, consumer behavior, or media literacy unless that exact topic is explicitly part of the fanpage subject and curriculum.",
      "- Start with a real situation or surprising question from daily life that naturally requires the subject knowledge.",
      "- Connect that situation clearly to the selected subject and current curriculum area within the first 2 paragraphs.",
      "- Explain the knowledge simply enough for students and parents, including the actual concept, mechanism, formula, rule, or cause-effect relationship.",
      "- Include one mini example that a student can imagine or try safely, and the example must use the same subject knowledge.",
      "- Include a short 'Bài học rút ra' sentence that states what the reader now understands.",
      "- End with a light CTA: ask readers to comment a real-life situation they want MindUp to explain next.",
      "- For the main MindUp page, make it interdisciplinary instead of focusing on only one subject.",
      "- Add 3-6 tasteful emoji/icons in the public caption to improve scanability and warmth. Place them mostly at the hook, section lead-ins, key takeaway, and CTA. Choose icons that match the topic, such as 🧠, 🔬, 🧬, ⚗️, 📐, ⚡, 🌱, 💡, ✅, 👇. Do not put emoji inside every sentence or in the middle of technical explanations.",
      "",
      "Image requirements:",
      "- AI must NOT generate an image. Return Pexels-friendly English search keywords and one Vietnamese overlay sentence.",
      "- image_search_keywords must describe visible objects/actions, not abstract ideas. Include the subject, school setting, and real-life application. Good: 'biology student microscope cells lab classroom'. Bad: 'understanding knowledge'.",
      "- image_overlay_text should be a complete Vietnamese sentence, memorable and readable on an image, around 10-22 words.",
      "",
      "Reel draft requirements:",
      "- Also create a complete short Reel plan using stock footage/images, no filming required.",
      "- Reel duration: 55-65 seconds, ideally about 60 seconds. AI must design the timing naturally; do NOT force equal scene lengths.",
      "- The full voice_over must be long enough for about 55-65 seconds of Vietnamese speech: target 135-170 Vietnamese words total.",
      "- Create 9-10 scenes. Each scene must have: seconds, voice_text, overlay_text, stock_video_keywords, visual_type.",
      "- seconds must be a continuous timeline like 0-4, 4-10, 10-15, 15-23, ... ending exactly at duration_seconds.",
      "- voice_text is the exact Vietnamese narration spoken during that scene. Each scene should normally have 14-22 Vietnamese words, adjusted to its duration.",
      "- voice_over must be the full narration made by joining all scene voice_text in order. Do not add content outside the scenes.",
      "- overlay_text must be very short, 3-9 Vietnamese words, readable on mobile.",
      "- stock_video_keywords must be English Pexels-friendly search keywords matching that scene and must describe visible objects/actions, not abstract ideas.",
      `- Every stock_video_keywords must include at least one concrete subject/application term related to ${reference.subject} / ${curriculum.topic}.`,
      "- Avoid generic keywords like advertisement, person, education, learning, knowledge, motivation unless combined with concrete subject visuals.",
      "- For Science/Biology pages, prefer visuals like lab, microscope, cells, plants, human body, nutrition, breathing, heart, nerves, experiment, classroom model.",
      "- For Math pages, prefer visuals like geometry, graphs, measurement, maps, finance, architecture, calculator, notebook, classroom problem solving.",
      "- For Physics pages, prefer visuals like electricity, light, motion, force, magnets, waves, experiment, engineering.",
      "- For Chemistry pages, prefer visuals like molecules, reactions, pH, solution, lab glassware, periodic table, safe experiment.",
      "- visual_type must be either image or video. Prefer video for almost every scene; use image only if a still diagram is truly better.",
      "- stock_video_keywords should be suitable for short stock video clips with obvious movement: hands writing, experiment, student using microscope, graph animation, measuring object, pouring liquid, classroom discussion, etc.",
      "- The Reel must have a clear rhythm: hook -> problem/context -> knowledge explanation -> real-life example -> CTA.",
      "- The Reel should work even without voice-over: overlay text must still tell the story.",
      "",
      "Long animated explainer requirements:",
      "- Also create a 3-5 minute animated explainer video plan for the same topic. This is for an automated whiteboard/diagram video, not a copy of the inspiration source.",
      "- Target duration: 210-300 seconds.",
      "- Voice-over target: 520-780 Vietnamese words total.",
      "- Create 18-28 scenes. Each scene must have: seconds, voice_text, overlay_text, visual_type, visual_objects, animation_notes, stock_video_keywords.",
      "- Prefer diagram/whiteboard scenes as the backbone. Use stock video only when it clarifies a real object/action; do not make a 5-minute stock montage.",
      "- Include a structure: hook -> why it matters -> core concept -> mechanism -> student example -> safe/practical application -> recap -> CTA.",
      "- visual_objects should be simple renderer-friendly objects such as brain, cell, dna, microscope, clock, book, graph, arrow, molecule, battery, wave, ruler, calculator, student, heart, lungs, plant, beaker, label, comparison_panel.",
      "",
      "Reel series requirements:",
      "- Also create 3 short reels cut from the long explainer idea. Each reel should focus on one sub-idea and be 45-75 seconds.",
      "- The first reel should match the reel field above. The other reels are follow-up drafts for later posts.",
      "",
      "Return ONLY valid JSON, no markdown, using this schema:",
      JSON.stringify({
        caption: "Vietnamese Applying Knowledge to Practice post, 300-650 words, with real-life hook, school knowledge explanation, mini example, CTA, and 3-6 tasteful topic-matching emoji/icons.",
        hashtags: ["#MindUp", "#UngDungKienThuc", "#HocDeHieuTheGioi", "#PhatTrienTuDuy", fanpageTag],
        image_prompt: "English prompt for a square 1:1 real-life educational background related to the application and subject, no text, no logo.",
        image_search_keywords: "English Pexels search keywords for a relevant real-life background/video frame, no text.",
        image_background_prompt: "English background prompt/keywords, no text, no logo.",
        image_overlay_text: "Vietnamese summary sentence for the image, around 10-22 words.",
        reel: {
          hook_3s: "A strong first 3 seconds hook in Vietnamese.",
          duration_seconds: 60,
          voice_over: "Full Vietnamese narration created by joining scene voice_text in order.",
          scenes: [
            { seconds: "0-4", visual_type: "video", stock_video_keywords: "English keywords", overlay_text: "Vietnamese hook overlay", voice_text: "Vietnamese narration for scene 1." },
            { seconds: "4-11", visual_type: "video", stock_video_keywords: "English keywords", overlay_text: "Vietnamese problem overlay", voice_text: "Vietnamese narration for scene 2." },
            { seconds: "11-18", visual_type: "video", stock_video_keywords: "English keywords", overlay_text: "Vietnamese knowledge overlay", voice_text: "Vietnamese narration for scene 3." },
            { seconds: "18-26", visual_type: "video", stock_video_keywords: "English keywords", overlay_text: "Vietnamese example overlay", voice_text: "Vietnamese narration for scene 4." },
            { seconds: "26-34", visual_type: "video", stock_video_keywords: "English keywords", overlay_text: "Vietnamese detail overlay", voice_text: "Vietnamese narration for scene 5." },
            { seconds: "34-43", visual_type: "video", stock_video_keywords: "English keywords", overlay_text: "Vietnamese practical overlay", voice_text: "Vietnamese narration for scene 6." },
            { seconds: "43-52", visual_type: "video", stock_video_keywords: "English keywords", overlay_text: "Vietnamese recap overlay", voice_text: "Vietnamese narration for scene 7." },
            { seconds: "52-60", visual_type: "video", stock_video_keywords: "English keywords", overlay_text: "Vietnamese CTA overlay", voice_text: "Vietnamese narration for scene 8." }
          ],
          caption: "Short Vietnamese reel caption.",
          hashtags: ["#MindUp", "#UngDungKienThuc", "#ReelsHocTap", fanpageTag]
        },
        explainer_video: {
          title: "Vietnamese title for a 3-5 minute animated explainer.",
          duration_seconds: 240,
          voice_over: "Full Vietnamese narration for the long animated explainer, 520-780 words.",
          scenes: [
            {
              seconds: "0-8",
              visual_type: "whiteboard",
              visual_objects: ["brain", "clock", "book", "arrow"],
              animation_notes: "What appears, moves, highlights, or transforms.",
              stock_video_keywords: "English keywords only if a stock clip is useful",
              overlay_text: "Short Vietnamese overlay",
              voice_text: "Vietnamese narration for this scene."
            }
          ],
          chapters: ["Hook", "Core concept", "Mechanism", "Example", "Application", "Recap"],
          thumbnail_text: "Short Vietnamese thumbnail text"
        },
        reel_series: [
          {
            title: "Vietnamese reel title",
            duration_seconds: 60,
            focus: "One sub-idea from the long explainer",
            voice_over: "Vietnamese narration for this reel",
            scenes: [
              { seconds: "0-5", visual_type: "whiteboard", visual_objects: ["icon"], animation_notes: "Animation notes", stock_video_keywords: "English keywords", overlay_text: "Vietnamese overlay", voice_text: "Vietnamese narration" }
            ],
            caption: "Short Vietnamese reel caption.",
            hashtags: ["#MindUp", "#UngDungKienThuc", "#ReelsHocTap", fanpageTag]
          }
        ],
        internal_note: `Applying Knowledge to Practice week ${topic.week}/${topic.year}; fanpage ${args.pageName}; offset ${topic.offset}; topic ${topic.number}/${topic.total}: ${topic.topic}; grade ${curriculum.grade}; curriculum ${curriculum.topic}; source ${reference.sourceName} ${reference.sourceUrl}`,
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  if (isLearningMethod(args.typeName)) {
    const fanpageTag = pageHashtag(args.pageName);
    const method = learningMethodTopic(args.scheduledAt, args.pageName);
    return [
      "Bạn là chuyên gia content marketing giáo dục cho MindUp - Tư Duy Toàn Diện.",
      "Nhiệm vụ: tạo một bài Learning Method độc lập: mở đầu bằng một khó khăn học tập/phụ huynh rất thật, sau đó giải bằng một phương pháp học tập cụ thể, dễ hiểu, có thể áp dụng ngay.",
      "",
      ...viralFacebookPromptBlock(args.typeName),
      ...(normalizeTextAiProvider(args.provider) === "llama" ? [
        "",
        ...llamaLearningMethodDepthPromptBlock(),
      ] : []),
      "",
      "Thông tin bài đăng:",
      `- Fanpage: ${args.pageName}`,
      `- Hashtag fanpage bắt buộc: ${fanpageTag}`,
      `- Thời gian đăng: ${args.scheduledAt}`,
      args.existingContent ? `- Nội dung nháp/vấn đề admin nhập: ${args.existingContent}` : "",
      args.internalNote ? `- Ghi chú nội bộ: ${args.internalNote}` : "",
      "",
      learningMethodPromptBlock(method),
      "",
      subjectContextPromptBlock(args.pageName),
      "",
      "Yêu cầu nội dung:",
      "- Viết bằng tiếng Việt tự nhiên, thân thiện với học sinh/phụ huynh.",
      "- Trước khi viết, hãy chọn một bài viết/nguồn nước ngoài đáng tin về phương pháp học được giao làm nguồn cảm hứng nội dung. Có thể là bài từ blog/trang giáo dục/tâm lý học học tập bằng tiếng Anh.",
      "- Sử dụng ý chính của nguồn đó để viết lại thành bài gốc bằng tiếng Việt tự nhiên, gần với học sinh/phụ huynh Việt Nam. Không dịch máy móc, không dịch sát từng câu, không copy nguyên văn.",
      "- Có thể nhắc nguồn cảm hứng rất ngắn trong internal_note, nhưng caption không cần viết kiểu học thuật 'theo bài viết X...' trừ khi thật tự nhiên.",
      "- Mở bài bằng chính vấn đề/nỗi đau ngay trong bài này, không nhắc đến một bài Problem/bài tuần trước. Ví dụ mở kiểu: 'Nhiều học sinh gặp tình trạng...', 'Không ít phụ huynh thấy con...', 'Có một khó khăn rất phổ biến khi học...'.",
      "- Vấn đề/nỗi đau cần rõ ràng: học mãi không nhớ, học thuộc nhưng không hiểu, mất tập trung, làm bài sai do đọc vội, phụ huynh kèm con bị căng thẳng... Chọn vấn đề phù hợp với phương pháp học được giao.",
      "- Sau đó chuyển tự nhiên sang phương pháp học: tên phương pháp, vì sao hiệu quả, cách áp dụng 3-5 bước, ví dụ cụ thể.",
      "- Ví dụ thực tế bắt buộc phải liên quan đến môn/trục nội dung của fanpage. Ví dụ không được chung chung; phải giống một tình huống học thật trong Toán/Lý/Hóa/Sinh/page chính.",
      "- Giọng văn phải giống một người tư vấn học tập đang viết cho phụ huynh/học sinh: có nhịp, có trải nghiệm, có câu ngắn dài tự nhiên; tránh các câu AI sáo rỗng như 'trong thời đại ngày nay', 'đóng vai trò vô cùng quan trọng', 'chìa khóa thành công'.",
      "- TUYỆT ĐỐI KHÔNG dùng các cụm: 'tuần trước', 'bài trước', 'hôm trước', 'lần trước', 'chúng ta đã cùng trò chuyện', 'như đã nói ở bài trước', 'tiếp nối bài Problem'. Nếu nội dung nháp cũ có các cụm này thì phải viết lại thành vấn đề trực tiếp trong bài.",
      "- Không nhắc rằng đây là bài tiếp nối Problem. Không hẹn sang bài Learning Method khác.",
      "- Ảnh: Gemini chỉ trả về từ khóa/prompt tìm ảnh nền liên quan đến bài viết, không chữ, không logo. Hệ thống sẽ tự lấy ảnh nền, chèn logo MindUp phía trên giữa ảnh và chữ tóm tắt tối đa 20 từ ở chính giữa.",
      "",
      "Hãy trả về duy nhất JSON hợp lệ, không markdown, theo schema:",
      JSON.stringify({
        caption: normalizeTextAiProvider(args.provider) === "llama"
          ? "Bài Facebook Learning Method hoàn chỉnh 450-800 từ, tối thiểu 6 đoạn, lấy ý từ một nguồn/bài viết nước ngoài uy tín rồi viết lại tự nhiên bằng tiếng Việt, có hook, phân tích vấn đề, giới thiệu phương pháp, giải thích vì sao hiệu quả, mục Cách áp dụng 3-5 bước, ví dụ theo môn fanpage và CTA nhẹ. Không được viết ngắn kiểu slogan/quảng cáo."
          : "Caption bài Learning Method bằng tiếng Việt: lấy ý từ một nguồn/bài viết nước ngoài uy tín rồi viết lại tự nhiên, bắt đầu bằng vấn đề trực tiếp trong bài, không nhắc tuần trước/bài trước, giải bằng phương pháp học cụ thể, có ví dụ theo môn fanpage và CTA nhẹ.",
        hashtags: ["#MindUp", "#LearningMethod", "#PhuongPhapHocTap", "#PhatTrienTuDuy", fanpageTag],
        image_prompt: "Prompt tiếng Anh tạo ảnh nền 1:1 cho bài Learning Method, không chữ, không logo, liên quan đến phương pháp học và môn học của fanpage.",
        image_search_keywords: "Từ khóa tiếng Anh để tìm ảnh nền phù hợp trên Pexels, không chữ, liên quan đến bài viết và môn học.",
        image_background_prompt: "Prompt/từ khóa tiếng Anh cho ảnh nền liên quan bài viết, không chữ, không logo.",
        image_overlay_text: "Một câu tóm tắt tiếng Việt tối đa 20 từ, nêu vấn đề hoặc lời hứa phương pháp học, để hệ thống đặt ở giữa ảnh.",
        source_inspiration: "Tên/URL hoặc mô tả ngắn nguồn nước ngoài đã dùng làm cảm hứng, nếu biết. Không bịa URL cụ thể nếu không chắc.",
        core_idea: "Ý chính đã rút ra từ nguồn cảm hứng và chuyển hóa cho bài viết.",
        internal_note: `Learning Method tuần ${method.week}/${method.year}; fanpage ${args.pageName}; offset ${method.offset}; method ${method.methodNumber}/${method.totalMethods}: ${method.name} (${method.group}); ghi thêm source inspiration nếu có`,
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  if (isProblemType(args.typeName)) {
    const fanpageTag = pageHashtag(args.pageName);
    return [
      "Bạn là chuyên gia content marketing giáo dục cho MindUp - Tư Duy Toàn Diện.",
      "Nhiệm vụ: tạo một CẶP 2 bài liên kết: bài Problem và bài Learning Method sau đó.",
      "",
      "Bối cảnh:",
      "- Bài Problem nêu một khó khăn thật của học sinh hoặc phụ huynh trong việc học.",
      "- Bài Learning Method sau đó giải đáp đúng khó khăn đó bằng một phương pháp học cụ thể.",
      "- Lịch đăng bài Learning Method có thể cùng tuần hoặc tuần sau, không cố định; hệ thống sẽ tự ghép bài gần nhất sau bài Problem.",
      "- Nội dung cần ăn khớp như một mini-series, nhưng mỗi bài vẫn độc lập nếu người đọc chỉ thấy một bài.",
      "",
      "Thông tin bài Problem:",
      `- Fanpage: ${args.pageName}`,
      `- Hashtag fanpage bắt buộc: ${fanpageTag}`,
      `- Thời gian đăng Problem: ${args.scheduledAt}`,
      args.existingContent ? `- Nội dung nháp/vấn đề admin nhập: ${args.existingContent}` : "",
      args.internalNote ? `- Ghi chú nội bộ: ${args.internalNote}` : "",
      "",
      subjectContextPromptBlock(args.pageName),
      "",
      "Yêu cầu nội dung:",
      "- Với Learning Method: chọn/đọc một bài viết hoặc nguồn nước ngoài đáng tin về phương pháp học, rút ra ý chính rồi viết lại thành bài gốc tiếng Việt theo giọng MindUp.",
      "- Không dịch sát từng câu, không copy nguyên văn bài nước ngoài, không viết giọng AI.",
      "- Problem: đồng cảm, chạm nỗi đau, ví dụ đời thường, không giải pháp quá sâu, hẹn bài Learning Method.",
      "- Learning Method: nhắc lại vấn đề, nêu phương pháp học, vì sao hiệu quả, cách áp dụng 3-5 bước, ví dụ cụ thể cho học sinh/phụ huynh.",
      "- Ví dụ trong Learning Method bắt buộc phải liên quan đến môn/trục nội dung của fanpage.",
      "- Hệ thống sẽ bổ sung riêng phương pháp học bắt buộc cho bài Learning Method theo tuần và offset fanpage. Không tự chọn ngẫu nhiên nếu đã có phương pháp bắt buộc.",
      "- Ảnh của cả Problem và Learning Method: Gemini chỉ mô tả nền ảnh liên quan đến bài viết, không chữ và không có logo. Hệ thống sẽ tự chèn logo MindUp phía trên giữa ảnh và chữ tóm tắt vấn đề tối đa 20 từ ở chính giữa.",
      "",
      "Hãy trả về duy nhất JSON hợp lệ, không markdown, theo schema:",
      JSON.stringify({
        series: {
          problem: "Khó khăn/nỗi đau chính",
          method: "Tên phương pháp học được chọn",
          audience: "Học sinh / Phụ huynh / Cả hai",
          source_reference: "Tên ý tưởng/nguồn tiếng Anh tham khảo nếu có, không cần URL nếu không chắc",
        },
        problem_post: {
          caption: "Caption bài Problem bằng tiếng Việt, có CTA và hẹn bài Learning Method sau đó.",
          hashtags: ["#MindUp", "#VanDeHocTap", fanpageTag],
          image_prompt: "Prompt tiếng Anh tạo ảnh nền 1:1 cho bài Problem, không chữ, không logo, thể hiện nỗi đau học tập/phụ huynh và liên quan đến môn học fanpage.",
          image_search_keywords: "Từ khóa tiếng Anh để tìm ảnh nền phù hợp trên Pexels, không chữ, liên quan đến vấn đề và môn học.",
          image_background_prompt: "Prompt/từ khóa tiếng Anh cho ảnh nền mờ, không chữ, không logo.",
          image_overlay_text: "Một câu tóm tắt vấn đề bằng tiếng Việt tối đa 20 từ để hệ thống đặt ở giữa ảnh.",
          internal_note: "Ghi chú nội bộ cho người kiểm tra bài Problem.",
        },
        learning_method_post: {
          caption: "Caption bài Learning Method bằng tiếng Việt, giải đáp vấn đề bằng phương pháp học cụ thể.",
          hashtags: ["#MindUp", "#LearningMethod", "#PhuongPhapHocTap", "#PhatTrienTuDuy", fanpageTag],
          image_prompt: "Prompt tiếng Anh tạo ảnh nền 1:1 cho bài Learning Method, không chữ, không logo, liên quan đến phương pháp học và môn học fanpage.",
          image_search_keywords: "Từ khóa tiếng Anh để tìm ảnh nền phù hợp trên Pexels, không chữ, liên quan đến phương pháp học và môn học.",
          image_background_prompt: "Prompt/từ khóa tiếng Anh cho ảnh nền mờ, không chữ, không logo.",
          image_overlay_text: "Một câu tóm tắt vấn đề đã nêu trong bài Problem bằng tiếng Việt tối đa 20 từ để hệ thống đặt ở giữa ảnh.",
          source_inspiration: "Tên/URL hoặc mô tả ngắn nguồn nước ngoài đã dùng làm cảm hứng cho Learning Method, nếu biết. Không bịa URL cụ thể nếu không chắc.",
          core_idea: "Ý chính đã rút ra từ nguồn cảm hứng và chuyển hóa cho Learning Method.",
          internal_note: "Ghi chú nội bộ cho người kiểm tra bài Learning Method.",
        },
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  if (scheduledTopic.key === "meme") {
    const fanpageTag = pageHashtag(args.pageName);
    return [
      "Bạn là người viết meme giáo dục cho MindUp - Tư Duy Toàn Diện.",
      "Nhiệm vụ: tạo bài Meme vui liên quan đến học tập, khiến học sinh thấy quen, phụ huynh thấy đáng yêu, không tiêu cực độc hại.",
      "",
      ...viralFacebookPromptBlock(args.typeName),
      "",
      contentTopicBlock(scheduledTopic),
      "",
      "Yêu cầu nội dung:",
      "- Caption ngắn, vui, đời thường.",
      "- Không chế giễu học sinh quá đà; vibe hài hước nhưng tích cực.",
      "- Có thể dùng format: 'Khi...', 'POV:', 'Não tôi lúc...', 'Học sinh sau khi...'.",
      "- Kết bài có thể hỏi: Ai từng như này chưa?",
      "",
      "Hãy trả về duy nhất JSON hợp lệ, không markdown, theo schema:",
      JSON.stringify({
        caption: "Caption meme ngắn, vui, dễ share.",
        hashtags: ["#MindUp", "#MemeHocTap", "#HocSinh", fanpageTag],
        image_prompt: "Template Meme MindUp: nền vui tươi, logo MindUp nhỏ, chữ meme lớn 1-2 dòng, có biểu cảm học sinh/emoji dạng minh họa.",
        internal_note: `Meme topic ${scheduledTopic.number}/${scheduledTopic.total}: ${scheduledTopic.topic}`,
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  if (scheduledTopic.key === "enrollment") {
    const fanpageTag = pageHashtag(args.pageName);
    return [
      "Bạn là chuyên gia content tuyển sinh cho trung tâm MindUp - Tư Duy Toàn Diện.",
      "Nhiệm vụ: tạo bài Enrollment/gạ học sinh đăng ký học thử, nhưng không viết kiểu quảng cáo lố. Bài phải đánh trúng vấn đề thật và mời học thử nhẹ nhàng.",
      "",
      ...viralFacebookPromptBlock(args.typeName),
      "",
      contentTopicBlock(scheduledTopic),
      "",
      "Yêu cầu nội dung:",
      "- Mở đầu bằng nỗi đau cụ thể của học sinh/phụ huynh.",
      "- Nêu cách MindUp hỗ trợ: chẩn đoán lỗ hổng, học theo lỗi sai, lớp nhỏ, giáo viên theo sát, phản hồi sau buổi học.",
      "- CTA rõ: inbox/đăng ký học thử/đặt lịch học thử.",
      "- Không cam kết tăng điểm phi thực tế, không dùng ngôn từ gây áp lực quá mức.",
      "",
      "Hãy trả về duy nhất JSON hợp lệ, không markdown, theo schema:",
      JSON.stringify({
        caption: "Caption tuyển sinh học thử bằng tiếng Việt, có pain point, giải pháp MindUp, CTA đăng ký học thử.",
        hashtags: ["#MindUp", "#HocThu", "#DangKyHocThu", "#PhatTrienTuDuy", fanpageTag],
        image_prompt: "Template Enrollment MindUp: nền xanh/vàng tin cậy, logo MindUp, headline học thử rõ, 3 lợi ích ngắn, CTA Đăng ký học thử.",
        internal_note: `Enrollment topic ${scheduledTopic.number}/${scheduledTopic.total}: ${scheduledTopic.topic}`,
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  const defaultPrompt = [
    "Bạn là chuyên gia marketing giáo dục cho MindUp - Tư Duy Toàn Diện.",
    "Hãy tạo một bài đăng Facebook tự nhiên, rõ thông điệp, đúng tinh thần giáo dục, không sáo rỗng.",
    "Nếu loại bài là Quiz thì caption không được lộ đáp án.",
  ].join("\n");
  return [
    args.typePrompt || defaultPrompt,
    "",
    ...viralFacebookPromptBlock(args.typeName),
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

async function generateTextDraft(prompt: string, typeName = "", provider = "") {
  let { model, data } = await postAiGenerateContent({ prompt, temperature: 0.8, provider });
  let text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("\n") || "";
  let parsed = tryParseJson(text);
  const isStandaloneLearning = isLearningMethod(typeName);
  const isStandaloneTeaching = isTeachingPhilosophy(typeName);
  const isApplyingKnowledgePost = isApplyingKnowledge(typeName);
  const isPhenomenonPost = isRealWorldPhenomenon(typeName);
  let rawCaption = String(parsed?.caption || "").trim();

  // Enforce word count check for ALL AI providers (Gemini & Llama)
  if ((isStandaloneLearning || isStandaloneTeaching) && stripMarkdown(rawCaption).split(/\s+/).filter(Boolean).length < 350) {
    console.log(`Caption for ${typeName} was too short (${stripMarkdown(rawCaption).split(/\s+/).filter(Boolean).length} words). Retrying for depth...`);
    const retry = await postAiGenerateContent({
      prompt: [
        prompt,
        "",
        isStandaloneTeaching
          ? "BẢN VỪA TẠO QUÁ NGẮN, THIẾU CHIỀU SÂU CHO BÀI TRIẾT LÝ GIÁO DỤC."
          : "BẢN VỪA TẠO QUÁ NGẮN (CHỈ CÓ VÀI DÒNG), THIẾU CHIỀU SÂU CHO BÀI PHƯƠNG PHÁP HỌC TẬP.",
        "YÊU CẦU CỰC KỲ BẮT BUỘC:",
        "- Bài viết phải DÀI VÀ CÓ CHIỀU SÂU (450-800 TỪ), tối thiểu 6-8 đoạn văn hoàn chỉnh.",
        "- Hãy lấy ý tưởng/nguồn cảm hứng từ bài viết nước ngoài uy tín về phương pháp/nghiên cứu học tập.",
        "- Phân tích sâu sắc vấn đề, giải thích vì sao phương pháp hiệu quả, hướng dẫn áp dụng 3-5 bước chi tiết và ví dụ thực tế môn học cụ thể.",
        "- KHÔNG ĐƯỢC CHỈ TÓM TẮT VÀI DÒNG SÁO RỖNG HOẶC VIẾT KIỂU SLOGAN QUẢNG CÁO.",
        "",
        "Bản ngắn vừa tạo cần được mở rộng bài viết chi tiết, sâu sắc:",
        rawCaption,
      ].join("\n"),
      temperature: 0.82,
      provider,
    });
    model = retry.model;
    data = retry.data;
    text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("\n") || "";
    parsed = tryParseJson(text);
    rawCaption = String(parsed?.caption || "").trim();
  }

  if ((isApplyingKnowledgePost || isPhenomenonPost) && stripMarkdown(rawCaption).split(/\s+/).filter(Boolean).length < 280) {
    console.log(`Caption for ${typeName} was too short (${stripMarkdown(rawCaption).split(/\s+/).filter(Boolean).length} words). Retrying for depth...`);
    const retry = await postAiGenerateContent({
      prompt: [
        prompt,
        "",
        "BẢN VỪA TẠO QUÁ NGẮN CHO BÀI NỘI DUNG THỰC TẾ.",
        "Yêu cầu bài viết phải dài 350-650 từ, giàu chiều sâu, phân tích kỹ tình huống/hiện tượng thực tế, cơ chế môn học đằng sau và ví dụ cụ thể.",
        "Trả về duy nhất JSON hợp lệ theo đúng schema.",
        "",
        "Bản ngắn vừa tạo cần mở rộng bài viết sâu sắc:",
        rawCaption,
      ].join("\n"),
      temperature: 0.82,
      provider,
    });
    model = retry.model;
    data = retry.data;
    text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("\n") || "";
    parsed = tryParseJson(text);
    rawCaption = String(parsed?.caption || "").trim();
  }
  if (isLlamaApplyingKnowledge && stripMarkdown(rawCaption).split(/\s+/).filter(Boolean).length < 300) {
    const retry = await postAiGenerateContent({
      prompt: [
        prompt,
        "",
        "EXPAND THE APPLYING KNOWLEDGE TO PRACTICE POST AGAIN.",
        "The current answer is still too short. Return only valid JSON with the same schema.",
        "Caption must be 320-650 Vietnamese words and at least 6 paragraphs.",
        "Add more depth by including:",
        "- one vivid real-life situation;",
        "- a clear explanation of the school concept;",
        "- one step-by-step mini example;",
        "- why this matters for students/parents;",
        "- a closing question that invites comments.",
        "Do not shorten the reel fields.",
        "",
        "Current caption to expand:",
        rawCaption,
      ].join("\n"),
      temperature: 0.82,
      provider,
    });
    model = retry.model;
    data = retry.data;
    text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("\n") || "";
    parsed = tryParseJson(text);
    rawCaption = String(parsed?.caption || "").trim();
  }
  const hashtags = normalizeHashtags(parsed?.hashtags);
  if (!hashtags.includes("#MindUp")) hashtags.unshift("#MindUp");
  if (!hashtags.includes("#MondayMindset") && !hashtags.includes("#PhatTrienTuDuy")) hashtags.push("#PhatTrienTuDuy");
  const quizRecord = (parsed?.quiz && typeof parsed.quiz === "object" ? parsed.quiz : {}) as JsonRecord;
  const quizAnswers = Array.isArray(quizRecord.answers)
    ? quizRecord.answers.map((answer: unknown) => String(answer || "").trim()).filter(Boolean).slice(0, 4)
    : [];
  const hardQuizRecord = (parsed?.hard_quiz && typeof parsed.hard_quiz === "object" ? parsed.hard_quiz : {}) as JsonRecord;
  const interestingQuestionRecord = (parsed?.interesting_question && typeof parsed.interesting_question === "object" ? parsed.interesting_question : {}) as JsonRecord;
  const realWorldPhenomenonRecord = (parsed?.real_world_phenomenon && typeof parsed.real_world_phenomenon === "object" ? parsed.real_world_phenomenon : {}) as JsonRecord;
  const reelRecord = (parsed?.reel && typeof parsed.reel === "object" ? parsed.reel : {}) as JsonRecord;
  const reelScenes = Array.isArray(reelRecord.scenes) ? reelRecord.scenes.slice(0, 10) : [];
  const sceneVoiceOver = reelScenes.map((scene: unknown) => {
    const record = (scene && typeof scene === "object" ? scene : {}) as JsonRecord;
    return String(record.voice_text || record.voiceText || record.voice_over || "").trim();
  }).filter(Boolean).join(" ");
  const reelVoiceOver = String(reelRecord.voice_over || sceneVoiceOver || "").trim();
  const reelVoiceWordCount = reelVoiceOver.split(/\s+/).filter(Boolean).length;
  const normalizedReelDuration = Math.max(55, Math.min(65, Number(reelRecord.duration_seconds || 0) || 60));
  const explainerRecord = (parsed?.explainer_video && typeof parsed.explainer_video === "object" ? parsed.explainer_video : {}) as JsonRecord;
  const explainerScenes = Array.isArray(explainerRecord.scenes) ? explainerRecord.scenes.slice(0, 28) : [];
  const explainerSceneVoiceOver = explainerScenes.map((scene: unknown) => {
    const record = (scene && typeof scene === "object" ? scene : {}) as JsonRecord;
    return String(record.voice_text || record.voiceText || record.voice_over || "").trim();
  }).filter(Boolean).join(" ");
  const explainerVoiceOver = String(explainerRecord.voice_over || explainerSceneVoiceOver || "").trim();
  const normalizedExplainerDuration = Math.max(210, Math.min(300, Number(explainerRecord.duration_seconds || 0) || 240));
  const reelSeries = Array.isArray(parsed?.reel_series)
    ? parsed.reel_series.slice(0, 5).map((item: unknown) => {
      const record = (item && typeof item === "object" ? item : {}) as JsonRecord;
      const scenes = Array.isArray(record.scenes) ? record.scenes.slice(0, 10) : [];
      const seriesSceneVoiceOver = scenes.map((scene: unknown) => {
        const sceneRecord = (scene && typeof scene === "object" ? scene : {}) as JsonRecord;
        return String(sceneRecord.voice_text || sceneRecord.voiceText || sceneRecord.voice_over || "").trim();
      }).filter(Boolean).join(" ");
      return {
        title: String(record.title || "").trim(),
        focus: String(record.focus || "").trim(),
        durationSeconds: Math.max(45, Math.min(75, Number(record.duration_seconds || 0) || 60)),
        voiceOver: String(record.voice_over || seriesSceneVoiceOver || "").trim(),
        scenes,
        caption: String(record.caption || "").trim(),
        hashtags: normalizeHashtags(record.hashtags),
      };
    })
    : [];
  const sourceInspiration = String(parsed?.source_inspiration || "").trim();
  const coreIdea = String(parsed?.core_idea || "").trim();
  const internalNoteParts = [
    String(parsed?.internal_note || "").trim(),
    sourceInspiration ? `Source inspiration: ${sourceInspiration}` : "",
    coreIdea ? `Core idea: ${coreIdea}` : "",
  ].filter(Boolean);
  return {
    model,
    caption: isStandaloneLearning ? sanitizeStandaloneLearningMethodCaption(rawCaption) : rawCaption,
    hashtags,
    quoteEn: String(parsed?.quote_en || "").trim(),
    quoteVi: String(parsed?.quote_vi || "").trim(),
    quoteSource: String(parsed?.quote_source || "").trim(),
    imagePrompt: String(parsed?.image_prompt || "").trim(),
    imageSearchKeywords: String(parsed?.image_search_keywords || "").trim(),
    imageBackgroundPrompt: String(parsed?.image_background_prompt || parsed?.image_prompt || "").trim(),
    imageOverlayText: String(parsed?.image_overlay_text || "").trim(),
    internalNote: internalNoteParts.join("\n"),
    quiz: {
      grade: Number(quizRecord.grade || 0) || null,
      subject: String(quizRecord.subject || "").trim(),
      curriculumTopic: String(quizRecord.curriculum_topic || "").trim(),
      question: String(quizRecord.question || parsed?.question || "").trim(),
      answers: quizAnswers,
      correctAnswer: String(quizRecord.correct_answer || parsed?.correct_answer || "").trim(),
      trap: String(quizRecord.trap || "").trim(),
      explanation: String(quizRecord.explanation || "").trim(),
    },
    hardQuiz: {
      grade: Number(hardQuizRecord.grade || 0) || null,
      subject: String(hardQuizRecord.subject || "").trim(),
      curriculumTopic: String(hardQuizRecord.curriculum_topic || "").trim(),
      question: String(hardQuizRecord.question || "").trim(),
      correctAnswer: String(hardQuizRecord.correct_answer || "").trim(),
      solution: String(hardQuizRecord.solution || hardQuizRecord.explanation || "").trim(),
      prizeAmount: Number(hardQuizRecord.prize_amount || 0) || 50000,
    },
    interestingQuestion: {
      subject: String(interestingQuestionRecord.subject || "").trim(),
      sourceName: String(interestingQuestionRecord.source_name || "").trim(),
      sourceTitle: String(interestingQuestionRecord.source_title || "").trim(),
      sourceUrl: String(interestingQuestionRecord.source_url || "").trim(),
      sourceImageUrl: String(interestingQuestionRecord.source_image_url || interestingQuestionRecord.image_url || "").trim(),
      questionFingerprint: String(interestingQuestionRecord.question_fingerprint || interestingQuestionRecord.fingerprint || "").trim(),
      question: String(interestingQuestionRecord.question || parsed?.question || "").trim(),
      answer: String(interestingQuestionRecord.answer || parsed?.answer || "").trim(),
      explanation: String(interestingQuestionRecord.explanation || "").trim(),
    },
    realWorldPhenomenon: {
      subject: String(realWorldPhenomenonRecord.subject || "").trim(),
      sourceName: String(realWorldPhenomenonRecord.source_name || "").trim(),
      sourceTitle: String(realWorldPhenomenonRecord.source_title || "").trim(),
      sourceUrl: String(realWorldPhenomenonRecord.source_url || "").trim(),
      sourceImageUrl: String(realWorldPhenomenonRecord.source_image_url || realWorldPhenomenonRecord.image_url || "").trim(),
      phenomenonFingerprint: String(realWorldPhenomenonRecord.phenomenon_fingerprint || realWorldPhenomenonRecord.fingerprint || "").trim(),
      phenomenon: String(realWorldPhenomenonRecord.phenomenon || "").trim(),
      coreIdea: String(realWorldPhenomenonRecord.core_idea || coreIdea || "").trim(),
    },
    reel: {
      hook3s: String(reelRecord.hook_3s || "").trim(),
      durationSeconds: normalizedReelDuration,
      voiceOver: reelVoiceWordCount >= 90 ? reelVoiceOver : (sceneVoiceOver || reelVoiceOver),
      scenes: reelScenes,
      caption: String(reelRecord.caption || "").trim(),
      hashtags: normalizeHashtags(reelRecord.hashtags),
    },
    explainerVideo: {
      title: String(explainerRecord.title || "").trim(),
      durationSeconds: normalizedExplainerDuration,
      voiceOver: explainerVoiceOver,
      scenes: explainerScenes,
      chapters: Array.isArray(explainerRecord.chapters) ? explainerRecord.chapters.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 8) : [],
      thumbnailText: String(explainerRecord.thumbnail_text || "").trim(),
    },
    reelSeries,
  };
}

function normalizeDraftPart(value: unknown, fallbackTags: string[] = []) {
  const record = (value && typeof value === "object" ? value : {}) as JsonRecord;
  const hashtags = normalizeHashtags(record.hashtags);
  for (const tag of fallbackTags) {
    if (tag && !hashtags.includes(tag)) hashtags.push(tag);
  }
  if (!hashtags.includes("#MindUp")) hashtags.unshift("#MindUp");
  const sourceInspiration = String(record.source_inspiration || "").trim();
  const coreIdea = String(record.core_idea || "").trim();
  const internalNoteParts = [
    String(record.internal_note || "").trim(),
    sourceInspiration ? `Source inspiration: ${sourceInspiration}` : "",
    coreIdea ? `Core idea: ${coreIdea}` : "",
  ].filter(Boolean);
  return {
    caption: String(record.caption || "").trim(),
    hashtags,
    imagePrompt: String(record.image_prompt || "").trim(),
    imageSearchKeywords: String(record.image_search_keywords || "").trim(),
    imageBackgroundPrompt: String(record.image_background_prompt || record.image_prompt || "").trim(),
    imageOverlayText: String(record.image_overlay_text || "").trim(),
    internalNote: internalNoteParts.join("\n"),
  };
}

async function generateProblemLearningPairDraft(prompt: string, provider = "") {
  const { model, data } = await postAiGenerateContent({ prompt, temperature: 0.82, provider });

  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("\n") || "";
  const parsed = tryParseJson(text) as JsonRecord;
  const series = (parsed.series && typeof parsed.series === "object" ? parsed.series : {}) as JsonRecord;
  const problemPost = normalizeDraftPart(parsed.problem_post, ["#VanDeHocTap"]);
  const learningPost = normalizeDraftPart(parsed.learning_method_post, ["#LearningMethod", "#PhuongPhapHocTap", "#PhatTrienTuDuy"]);

  if (!problemPost.caption || !learningPost.caption) {
    throw new Error("Gemini chưa trả đủ nội dung cho cả Problem và Learning Method.");
  }

  return {
    model,
    series: {
      problem: String(series.problem || "").trim(),
      method: String(series.method || "").trim(),
      audience: String(series.audience || "").trim(),
      sourceReference: String(series.source_reference || "").trim(),
    },
    problemPost,
    learningPost,
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function generatePexelsBackgroundImage(query: string) {
  const apiKey = env("PEXELS_API_KEY");
  if (!apiKey) throw new Error("Thiếu Supabase secret PEXELS_API_KEY.");
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) throw new Error("Gemini chưa trả từ khóa tìm ảnh Pexels.");

  const searchUrl = new URL("https://api.pexels.com/v1/search");
  searchUrl.searchParams.set("query", `${cleanQuery}, education, no text`);
  searchUrl.searchParams.set("orientation", "square");
  searchUrl.searchParams.set("per_page", "8");
  searchUrl.searchParams.set("page", "1");
  const searchRes = await fetch(searchUrl.toString(), {
    headers: { Authorization: apiKey },
  });
  const searchData = await searchRes.json().catch(() => ({}));
  if (!searchRes.ok) throw new Error(searchData?.error || searchData?.message || "Pexels search failed");
  const photos = Array.isArray(searchData?.photos) ? searchData.photos : [];
  const photo = photos.find((item: unknown) => {
    const record = item && typeof item === "object" ? item as JsonRecord : null;
    const src = record?.src && typeof record.src === "object" ? record.src as JsonRecord : null;
    return src?.large2x || src?.large || src?.original;
  }) as JsonRecord | undefined;
  if (!photo) throw new Error(`Pexels không tìm thấy ảnh phù hợp cho từ khóa: ${cleanQuery}`);
  const src = photo.src && typeof photo.src === "object" ? photo.src as JsonRecord : {};
  const imageUrl = String(src.large2x || src.large || src.original || "").trim();
  if (!imageUrl) throw new Error("Pexels không trả URL ảnh hợp lệ.");

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Không tải được ảnh Pexels: ${imageRes.status} ${imageRes.statusText}`);
  const contentType = imageRes.headers.get("content-type") || "image/jpeg";
  const bytes = new Uint8Array(await imageRes.arrayBuffer());
  return {
    model: "pexels-search",
    prompt: `Pexels query: ${cleanQuery}\nPexels photo: ${photo.url || imageUrl}\nPhotographer: ${photo.photographer || ""}`,
    data: bytesToBase64(bytes),
    mimeType: contentType.includes("image/") ? contentType : "image/jpeg",
  };
}

async function downloadRemoteImageAsBackground(url: string) {
  const cleanUrl = String(url || "").trim();
  if (!/^https?:\/\//i.test(cleanUrl)) throw new Error("source_image_url khÃ´ng pháº£i URL http/https há»£p lá»‡.");
  const res = await fetch(cleanUrl, {
    headers: {
      "User-Agent": "MindUpContentBot/1.0",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`KhÃ´ng táº£i Ä‘Æ°á»£c áº£nh nguá»“n: ${res.status} ${res.statusText}`);
  const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error(`URL nguá»“n khÃ´ng tráº£ vá» áº£nh: ${contentType || "unknown"}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) throw new Error("áº¢nh nguá»“n rá»—ng.");
  if (bytes.length > 8 * 1024 * 1024) throw new Error("áº¢nh nguá»“n quÃ¡ lá»›n Ä‘á»ƒ nhÃºng vÃ o template.");
  return {
    model: "source-page-image",
    prompt: `Source image: ${cleanUrl}`,
    data: bytesToBase64(bytes),
    mimeType: contentType,
  };
}

function absolutizeUrl(value: string, baseUrl: string) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return "";
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map(value => String(value || "").trim()).filter(Boolean)));
}

function extractImageUrlsFromHtml(html: string, pageUrl: string) {
  const candidates: string[] = [];
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/gi,
    /<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["'][^>]*>/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      const url = absolutizeUrl(match[1] || "", pageUrl);
      if (url && !/\.(?:gif|svg)(?:[?#].*)?$/i.test(url)) candidates.push(url);
    }
  }
  return uniqueStrings(candidates).slice(0, 8);
}

async function discoverSourcePageImageUrls(pageUrl: string) {
  const cleanUrl = String(pageUrl || "").trim();
  if (!/^https?:\/\//i.test(cleanUrl)) return [];
  const res = await fetch(cleanUrl, {
    headers: {
      "User-Agent": "MindUpContentBot/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Could not read source page for images: ${res.status} ${res.statusText}`);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return [];
  const html = await res.text();
  return extractImageUrlsFromHtml(html, cleanUrl);
}

let mindupLogoDataUriPromise: Promise<string> | null = null;

async function loadMindupLogoDataUri() {
  if (!mindupLogoDataUriPromise) {
    mindupLogoDataUriPromise = (async () => {
      const logoUrl = env("MINDUP_LOGO_URL") || "https://www.mindup.edu.vn/assets/mindup-logo-round.png";
      const res = await fetch(logoUrl);
      if (!res.ok) throw new Error(`Could not download MindUp logo: ${res.status} ${res.statusText}`);
      const contentType = res.headers.get("content-type") || "image/png";
      const bytes = new Uint8Array(await res.arrayBuffer());
      return `data:${contentType.includes("image/") ? contentType : "image/png"};base64,${bytesToBase64(bytes)}`;
    })();
  }
  return mindupLogoDataUriPromise;
}

function escapeXml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripMarkdown(value: string) {
  return String(value || "")
    .replace(/[#*_`~>\[\]()]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapSvgText(text: string, maxChars: number, maxLines: number) {
  const words = stripMarkdown(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.length ? lines : ["MindUp - Tư Duy Toàn Diện"];
}

function wrapSvgTextWithMeta(text: string, maxChars: number, maxLines: number) {
  const words = stripMarkdown(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let truncated = false;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    if (lines.length >= maxLines) {
      truncated = true;
      line = "";
      break;
    }
    line = word;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (!truncated && lines.length > 1) {
    const lastWords = lines[lines.length - 1].split(/\s+/).filter(Boolean);
    const prevWords = lines[lines.length - 2].split(/\s+/).filter(Boolean);
    if (lastWords.length === 1 && prevWords.length > 1) {
      const moved = prevWords.pop() || "";
      const rebalancedLast = `${moved} ${lastWords[0]}`.trim();
      if (rebalancedLast.length <= maxChars) {
        lines[lines.length - 2] = prevWords.join(" ");
        lines[lines.length - 1] = rebalancedLast;
      }
    }
  }
  if (truncated && lines.length) {
    const last = lines[lines.length - 1].replace(/[.…]+$/g, "").trim();
    lines[lines.length - 1] = `${last}…`;
  }
  return {
    lines: lines.length ? lines : ["MindUp - Tư Duy Toàn Diện"],
    truncated,
  };
}

function fitOverlaySvgText(text: string, options: {
  boxWidth?: number;
  boxHeight?: number;
  maxLines?: number;
  maxFontSize?: number;
  minFontSize?: number;
  lineHeightRatio?: number;
} = {}) {
  const boxWidth = options.boxWidth || 820;
  const boxHeight = options.boxHeight || 350;
  const maxLines = options.maxLines || 5;
  const maxFontSize = options.maxFontSize || 58;
  const minFontSize = options.minFontSize || 34;
  const lineHeightRatio = options.lineHeightRatio || 1.18;
  const averageCharWidthRatio = 0.78;
  const clean = stripMarkdown(text);
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 2) {
    const maxChars = Math.max(14, Math.floor(boxWidth / (fontSize * averageCharWidthRatio)));
    const { lines, truncated } = wrapSvgTextWithMeta(clean, maxChars, maxLines);
    const lineHeight = Math.round(fontSize * lineHeightRatio);
    const totalHeight = lines.length * lineHeight;
    if (!truncated && totalHeight <= boxHeight) {
      return { lines, fontSize, lineHeight, totalHeight, truncated: false };
    }
  }
  const fontSize = minFontSize;
  const maxChars = Math.max(14, Math.floor(boxWidth / (fontSize * averageCharWidthRatio)));
  const { lines, truncated } = wrapSvgTextWithMeta(clean, maxChars, maxLines);
  const lineHeight = Math.round(fontSize * lineHeightRatio);
  return { lines, fontSize, lineHeight, totalHeight: lines.length * lineHeight, truncated };
}

function buildFallbackImage(args: {
  pageName: string;
  typeName: string;
  caption: string;
  imagePrompt: string;
  imageError: string;
}) {
  const titleLines = wrapSvgText(args.caption || args.imagePrompt || args.typeName, 28, 4);
  const subtitle = `${args.typeName} • ${args.pageName}`;
  const yStart = titleLines.length <= 2 ? 415 : 355;
  const titleTspans = titleLines
    .map((line, index) => `<tspan x="540" y="${yStart + index * 70}">${escapeXml(line)}</tspan>`)
    .join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e0f7ff"/>
      <stop offset="0.48" stop-color="#78c9ff"/>
      <stop offset="1" stop-color="#2d7be8"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffd76a"/>
      <stop offset="1" stop-color="#c8962a"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#0b2f69" flood-opacity="0.20"/>
    </filter>
  </defs>
  <rect width="1080" height="1080" rx="56" fill="url(#bg)"/>
  <circle cx="930" cy="150" r="190" fill="#ffffff" opacity="0.18"/>
  <circle cx="120" cy="950" r="260" fill="#ffffff" opacity="0.16"/>
  <path d="M0 240 C210 170 390 235 580 170 C770 105 920 115 1080 70 L1080 0 L0 0 Z" fill="#ffffff" opacity="0.22"/>
  <g filter="url(#shadow)">
    <rect x="105" y="205" width="870" height="640" rx="48" fill="#ffffff" opacity="0.96"/>
  </g>
  <circle cx="540" cy="172" r="86" fill="#063579" filter="url(#shadow)"/>
  <text x="540" y="158" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900" fill="#ffffff">MINDUP</text>
  <text x="540" y="196" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#ffd76a">Tư Duy Toàn Diện</text>
  <rect x="300" y="245" width="480" height="76" rx="38" fill="#063f9d"/>
  <text x="540" y="295" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="900" fill="#ffffff">${escapeXml(args.typeName || "Bài đăng MindUp")}</text>
  <text text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="900" fill="#092f6d">${titleTspans}</text>
  <text x="540" y="710" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#61718c">${escapeXml(subtitle)}</text>
  <rect x="205" y="775" width="670" height="64" rx="32" fill="url(#gold)"/>
  <text x="540" y="817" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900" fill="#092f6d">HIỂU BẢN CHẤT • ĐIỂM BỨT PHÁ</text>
  <text x="540" y="930" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="800" fill="#ffffff">MindUp - Tư Duy Toàn Diện</text>
  <text x="540" y="970" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="600" fill="#e8f4ff">Ảnh template tự động của MindUp</text>
</svg>`;
  const bytes = new TextEncoder().encode(svg);
  return {
    model: "mindup-template-svg",
    imagePrompt: [
      args.imagePrompt,
      args.imageError ? `Fallback reason: ${args.imageError}` : "",
    ].filter(Boolean).join("\n"),
    bytes,
    mimeType: "image/svg+xml",
  };
}

function cleanOverlayText(value: string) {
  return String(value || "")
    .replace(/#[\p{L}\p{N}_]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeCaptionForOverlay(value: string, maxWords = 20) {
  const clean = cleanOverlayText(value);
  const sentence = clean.split(/[.!?…]\s+/)[0] || clean;
  const words = sentence.split(/\s+/).filter(Boolean);
  const limitedWords = words.slice(0, Math.max(1, maxWords));
  const text = limitedWords.join(" ");
  return text || "Học đúng cách để hiểu sâu hơn mỗi ngày";
}

function sanitizeStandaloneLearningMethodCaption(value: string) {
  const caption = String(value || "").trim();
  if (!caption) return caption;
  const introPattern = /^(?:tuần trước|bài trước|hôm trước|lần trước|trong bài trước|như bài trước|như đã nói ở bài trước|chúng ta đã cùng trò chuyện|tuần vừa rồi)[\s\S]{0,420}?(?:\n\s*\n|(?<=[.!?…])\s+)/i;
  const sanitized = caption.replace(introPattern, "").trim();
  if (sanitized && sanitized !== caption) return sanitized;
  return caption
    .replace(/Tuần trước,\s*chúng ta đã cùng trò chuyện về\s*/i, "Một vấn đề rất phổ biến là ")
    .replace(/Tuần trước,\s*/i, "")
    .replace(/Bài trước,\s*/i, "")
    .replace(/Hôm trước,\s*/i, "")
    .trim();
}

function subjectVisualTheme(pageName: string) {
  const clean = stripVietnameseForTag(pageName).toLowerCase();
  if (clean.includes("sinh hoc")) return {
    c1: "#dffbea", c2: "#48b98f", c3: "#0e7c68",
    motifs: `<circle cx="210" cy="250" r="70" fill="#ffffff" opacity=".28"/><circle cx="238" cy="250" r="24" fill="#0e7c68" opacity=".18"/><circle cx="855" cy="760" r="92" fill="#ffffff" opacity=".22"/><path d="M760 230 C825 170 910 185 948 260 C875 286 808 282 760 230Z" fill="#ffffff" opacity=".22"/>`,
  };
  if (clean.includes("hoa hoc")) return {
    c1: "#e8fbff", c2: "#52b8ff", c3: "#0066b8",
    motifs: `<circle cx="235" cy="265" r="26" fill="#ffffff" opacity=".30"/><circle cx="315" cy="330" r="42" fill="#ffffff" opacity=".22"/><circle cx="825" cy="220" r="34" fill="#ffffff" opacity=".28"/><path d="M765 720 L865 720 L920 900 L710 900 Z" fill="#ffffff" opacity=".16"/>`,
  };
  if (clean.includes("vat ly")) return {
    c1: "#eaf3ff", c2: "#5ca8ff", c3: "#1246a0",
    motifs: `<path d="M170 320 C310 210 450 210 600 320 S890 430 990 300" fill="none" stroke="#ffffff" stroke-width="28" opacity=".18"/><circle cx="820" cy="285" r="70" fill="#ffffff" opacity=".22"/><path d="M818 220 L858 292 L805 292 L842 370" fill="none" stroke="#ffffff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity=".30"/>`,
  };
  if (clean.includes("toan hoc")) return {
    c1: "#eef7ff", c2: "#6bb7ff", c3: "#0f4aa6",
    motifs: `<circle cx="220" cy="260" r="82" fill="none" stroke="#ffffff" stroke-width="22" opacity=".24"/><path d="M740 250 L930 250 L835 410 Z" fill="#ffffff" opacity=".18"/><path d="M130 840 C300 650 470 920 650 720 S880 650 970 780" fill="none" stroke="#ffffff" stroke-width="24" opacity=".18"/>`,
  };
  return {
    c1: "#e9f8ff", c2: "#66bfff", c3: "#0d4ca6",
    motifs: `<circle cx="220" cy="250" r="96" fill="#ffffff" opacity=".18"/><circle cx="880" cy="760" r="130" fill="#ffffff" opacity=".16"/><path d="M690 230 C735 155 845 155 890 230 C830 270 755 270 690 230Z" fill="#ffffff" opacity=".18"/>`,
  };
}

function buildProblemLearningImage(args: {
  pageName: string;
  typeName: string;
  caption: string;
  imagePrompt: string;
  overlayText?: string;
  logoDataUri?: string;
  backgroundImage?: { data: string; mimeType: string; model: string; prompt: string } | null;
  imageError?: string;
}) {
  const theme = subjectVisualTheme(args.pageName);
  const logoHref = args.logoDataUri || env("MINDUP_LOGO_URL") || "https://www.mindup.edu.vn/assets/mindup-logo-round.png";
  const overlay = cleanOverlayText(args.overlayText) || summarizeCaptionForOverlay(args.caption, 20);
  const fittedTitle = fitOverlaySvgText(overlay, {
    boxWidth: 730,
    boxHeight: 560,
    maxLines: 20,
    maxFontSize: 48,
    minFontSize: 22,
  });
  const titleLines = fittedTitle.lines;
  const yStart = Math.round(540 - ((titleLines.length - 1) * fittedTitle.lineHeight) / 2);
  const boxHeight = Math.max(210, fittedTitle.totalHeight + 118);
  const boxY = Math.round(yStart - fittedTitle.lineHeight * 0.82 - 54);
  const titleTspans = titleLines
    .map((line, index) => `<tspan x="540" y="${yStart + index * fittedTitle.lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  const backgroundLayer = args.backgroundImage?.data
    ? `<image href="data:${escapeXml(args.backgroundImage.mimeType || "image/png")};base64,${args.backgroundImage.data}" x="0" y="0" width="1080" height="1080" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1080" height="1080" rx="54" fill="#061b3e" opacity=".26"/>
  <rect width="1080" height="1080" rx="54" fill="url(#centerGlow)" opacity=".28"/>`
    : `<rect width="1080" height="1080" rx="54" fill="url(#bg)"/>
  <g filter="url(#softBlur)" opacity=".82">
    <circle cx="130" cy="900" r="320" fill="#ffffff" opacity=".12"/>
    <circle cx="980" cy="80" r="280" fill="#ffffff" opacity=".14"/>
    <path d="M0 210 C170 125 335 200 520 135 C720 65 890 86 1080 30 L1080 0 L0 0 Z" fill="#ffffff" opacity=".22"/>
    ${theme.motifs}
  </g>
  <rect width="1080" height="1080" rx="54" fill="#061b3e" opacity=".22"/>`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${theme.c1}"/>
      <stop offset=".52" stop-color="${theme.c2}"/>
      <stop offset="1" stop-color="${theme.c3}"/>
    </linearGradient>
    <radialGradient id="centerGlow" cx="50%" cy="52%" r="55%">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".64"/>
      <stop offset=".58" stop-color="#ffffff" stop-opacity=".18"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="softBlur"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#041a3d" flood-opacity=".28"/>
    </filter>
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#001a44" flood-opacity=".45"/>
    </filter>
    <clipPath id="logoClip"><circle cx="540" cy="150" r="82"/></clipPath>
  </defs>
  ${backgroundLayer}
  <circle cx="540" cy="150" r="82" fill="#063579" filter="url(#shadow)"/>
  <image href="${escapeXml(logoHref)}" x="458" y="68" width="164" height="164" preserveAspectRatio="xMidYMid meet" clip-path="url(#logoClip)"/>
  <rect x="108" y="${boxY}" width="864" height="${boxHeight}" rx="46" fill="#061b3e" opacity=".38"/>
  <text text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fittedTitle.fontSize}" font-weight="900" fill="#ffffff" filter="url(#textShadow)">${titleTspans}</text>
  <rect x="220" y="820" width="640" height="72" rx="36" fill="#061b3e" opacity=".38"/>
  <text x="540" y="866" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="900" letter-spacing="6" fill="#ffffff">HIỂU BẢN CHẤT - ĐIỂM BỨT PHÁ</text>
</svg>`;
  return {
    model: args.backgroundImage?.model ? `mindup-overlay-svg; ${args.backgroundImage.model}` : "mindup-problem-learning-svg",
    imagePrompt: [
      args.imagePrompt,
      args.backgroundImage?.prompt ? `Background source: ${args.backgroundImage.prompt}` : "",
      `Overlay text: ${overlay}`,
      `Layout: blurred related background, MindUp logo top center, bold centered Vietnamese summary.`,
      args.imageError ? `Fallback reason: ${args.imageError}` : "",
    ].filter(Boolean).join("\n"),
    bytes: new TextEncoder().encode(svg),
    mimeType: "image/svg+xml",
  };
}

function buildInterestingQuestionImage(args: {
  pageName: string;
  caption: string;
  sourceImage: { data: string; mimeType: string; model: string; prompt: string };
  logoDataUri?: string;
  overlayText?: string;
  mode?: "question" | "phenomenon";
}) {
  const logoHref = args.logoDataUri || env("MINDUP_LOGO_URL") || "https://www.mindup.edu.vn/assets/mindup-logo-round.png";
  const mode = args.mode || "question";
  const overlay = cleanOverlayText(args.overlayText || "") || summarizeCaptionForOverlay(args.caption, mode === "phenomenon" ? 16 : 18);
  const fittedOverlay = fitOverlaySvgText(overlay, {
    boxWidth: 720,
    boxHeight: 280,
    maxLines: 4,
    maxFontSize: 50,
    minFontSize: 26,
  });
  const overlayY = Math.round(560 - ((fittedOverlay.lines.length - 1) * fittedOverlay.lineHeight) / 2);
  const overlayTspans = fittedOverlay.lines
    .map((line, index) => `<tspan x="540" y="${overlayY + index * fittedOverlay.lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  const centerContent = mode === "phenomenon"
    ? `<rect x="116" y="398" width="848" height="320" rx="46" fill="#063579" opacity=".76" filter="url(#shadow)"/>
  <text text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fittedOverlay.fontSize}" font-weight="900" fill="#ffffff" filter="url(#questionShadow)">${overlayTspans}</text>`
    : `<circle cx="540" cy="548" r="178" fill="#ffffff" opacity=".80" filter="url(#shadow)"/>
  <circle cx="540" cy="548" r="154" fill="#063579" opacity=".92"/>
  <text x="540" y="635" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="265" font-weight="900" fill="#ffffff" filter="url(#questionShadow)">?</text>`;
  const label = mode === "phenomenon" ? "MINDUP - HIỂU HIỆN TƯỢNG" : "MINDUP - CÂU HỎI THÚ VỊ";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <radialGradient id="centerGlow" cx="50%" cy="51%" r="45%">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".78"/>
      <stop offset=".54" stop-color="#ffffff" stop-opacity=".22"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#041a3d" flood-opacity=".34"/>
    </filter>
    <filter id="questionShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#001a44" flood-opacity=".42"/>
    </filter>
    <clipPath id="logoClip"><circle cx="540" cy="142" r="78"/></clipPath>
  </defs>
  <rect width="1080" height="1080" fill="#e8f5ff"/>
  <image href="data:${escapeXml(args.sourceImage.mimeType || "image/jpeg")};base64,${args.sourceImage.data}" x="0" y="0" width="1080" height="1080" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1080" height="1080" fill="#061b3e" opacity=".22"/>
  <rect width="1080" height="1080" fill="url(#centerGlow)" opacity=".95"/>
  <circle cx="540" cy="142" r="84" fill="#063579" opacity=".95" filter="url(#shadow)"/>
  <image href="${escapeXml(logoHref)}" x="462" y="64" width="156" height="156" preserveAspectRatio="xMidYMid meet" clip-path="url(#logoClip)"/>
  ${centerContent}
  <rect x="226" y="858" width="628" height="70" rx="35" fill="#063579" opacity=".76"/>
  <text x="540" y="903" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" letter-spacing="5" fill="#ffffff">${label}</text>
</svg>`;
  return {
    model: `mindup-${mode === "phenomenon" ? "phenomenon" : "interesting-question"}-svg; ${args.sourceImage.model}`,
    imagePrompt: [
      args.sourceImage.prompt,
      mode === "phenomenon"
        ? `Layout: source page image background, MindUp logo top center, short Vietnamese overlay text in the center.`
        : `Layout: source page image background, MindUp logo top center, large question mark in the center.`,
      `Caption context: ${overlay}`,
    ].filter(Boolean).join("\n"),
    bytes: new TextEncoder().encode(svg),
    mimeType: "image/svg+xml",
  };
}

async function loadPostBundle(postId: string) {
  const rows = await fetchJson<Array<{
    id: string;
    page_id: string;
    post_type_id: string | null;
    scheduled_at: string;
    content: string | null;
    image_url?: string | null;
    internal_note: string | null;
    task_id: string | null;
    metadata?: JsonRecord | string | null;
    page?: { page_name?: string } | null;
    type?: { name?: string; description?: string | null; ai_prompt?: string | null } | null;
  }>>(
    `facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}&select=id,page_id,post_type_id,scheduled_at,content,image_url,internal_note,task_id,metadata,page:facebook_pages(page_name),type:facebook_post_types(name,description,ai_prompt)&limit=1`,
  );
  const post = rows[0];
  if (!post?.id) throw new Error("Không tìm thấy bài đăng Facebook.");
  return post;
}

async function assertCanUsePost(userId: string, role: string, post: { task_id?: string | null }) {
  if (canAccessByRole(role)) return;
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
  if (cleanCaption && tagLine && cleanCaption.replace(/\s+/g, " ").trim() === tagLine) return tagLine.slice(0, 6000);
  if (cleanCaption && cleanTags.every(tag => cleanCaption.includes(tag))) return cleanCaption.slice(0, 6000);
  return [cleanCaption, tagLine].filter(Boolean).join("\n\n").slice(0, 6000);
}

function parseMetadata(value: unknown): JsonRecord {
  if (!value) return {};
  if (typeof value === "object") return value as JsonRecord;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

function sourceHistoryEntryFromMetadata(metadataValue: unknown, typeName: string) {
  const metadata = parseMetadata(metadataValue);
  const record = isInterestingQuestion(typeName)
    ? parseMetadata(metadata.interesting_question)
    : isRealWorldPhenomenon(typeName)
      ? parseMetadata(metadata.real_world_phenomenon)
      : {};
  const title = String(record.source_title || record.sourceTitle || record.question || record.phenomenon || "").trim();
  const url = String(record.source_url || record.sourceUrl || "").trim();
  const fingerprint = String(record.question_fingerprint || record.phenomenon_fingerprint || record.fingerprint || "").trim();
  return { title, url, fingerprint };
}

async function loadSourceHistoryForPost(post: {
  id: string;
  page_id: string;
  scheduled_at: string;
  type?: { name?: string } | null;
}) {
  const typeName = post.type?.name || "";
  if (!isInterestingQuestion(typeName) && !isRealWorldPhenomenon(typeName)) return "";
  const since = addDaysIso(post.scheduled_at || new Date().toISOString(), -180);
  const rows = await fetchJson<Array<{
    id: string;
    scheduled_at: string;
    content?: string | null;
    internal_note?: string | null;
    metadata?: JsonRecord | string | null;
    type?: { name?: string } | null;
  }>>(
    [
      "facebook_scheduled_posts",
      `page_id=eq.${encodeURIComponent(post.page_id)}`,
      `scheduled_at=gte.${encodeURIComponent(since)}`,
      `scheduled_at=lte.${encodeURIComponent(addDaysIso(post.scheduled_at || new Date().toISOString(), 1))}`,
      "select=id,scheduled_at,content,internal_note,metadata,type:facebook_post_types!inner(name)",
      `type.name=eq.${encodeURIComponent(typeName)}`,
      "order=scheduled_at.desc",
      "limit=30",
    ].join("&").replace("facebook_scheduled_posts&", "facebook_scheduled_posts?"),
  ).catch((error) => {
    console.warn("[Facebook AI Draft] Cannot load source history:", error instanceof Error ? error.message : String(error));
    return [];
  });
  const entries = rows
    .filter(row => String(row.id) !== String(post.id))
    .map(row => {
      const entry = sourceHistoryEntryFromMetadata(row.metadata, typeName);
      const fallback = String(row.internal_note || row.content || "").replace(/\s+/g, " ").trim().slice(0, 180);
      return {
        title: entry.title || fallback,
        url: entry.url,
        fingerprint: entry.fingerprint,
        scheduledAt: row.scheduled_at,
      };
    })
    .filter(entry => entry.title || entry.url || entry.fingerprint)
    .slice(0, 12);
  return entries.map((entry, index) => [
    `${index + 1}.`,
    entry.scheduledAt ? `date=${entry.scheduledAt}` : "",
    entry.fingerprint ? `fingerprint=${entry.fingerprint}` : "",
    entry.title ? `title=${entry.title}` : "",
    entry.url ? `url=${entry.url}` : "",
  ].filter(Boolean).join(" ")).join("\n");
}

function addDaysIso(dateValue: string, days: number) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

async function findPairedLearningMethodPost(starterPost: {
  id: string;
  page_id: string;
  scheduled_at: string;
}) {
  const rows = await fetchJson<Array<{
    id: string;
    page_id: string;
    post_type_id: string | null;
    scheduled_at: string;
    content: string | null;
    image_url?: string | null;
    internal_note: string | null;
    task_id: string | null;
    status?: string | null;
    metadata?: JsonRecord | string | null;
    page?: { page_name?: string } | null;
    type?: { name?: string; description?: string | null; ai_prompt?: string | null } | null;
  }>>(
    [
      "facebook_scheduled_posts",
      `page_id=eq.${encodeURIComponent(starterPost.page_id)}`,
      `scheduled_at=gte.${encodeURIComponent(addDaysIso(starterPost.scheduled_at, -7))}`,
      `scheduled_at=lte.${encodeURIComponent(addDaysIso(starterPost.scheduled_at, 14))}`,
      "select=id,page_id,post_type_id,scheduled_at,content,image_url,internal_note,task_id,status,metadata,page:facebook_pages(page_name),type:facebook_post_types!inner(name,description,ai_prompt)",
      "type.name=eq.Learning%20Method",
      "order=scheduled_at.asc",
    ].join("&").replace("facebook_scheduled_posts&", "facebook_scheduled_posts?"),
  );
  const starterTime = new Date(starterPost.scheduled_at).getTime();
  const candidates = rows
    .filter(row => String(row.id) !== String(starterPost.id))
    .filter(row => !["scheduled", "published", "cancelled"].includes(String(row.status || "")));
  const after = candidates
    .filter(row => new Date(row.scheduled_at).getTime() >= starterTime)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  if (after[0]) return after[0];
  return candidates
    .filter(row => new Date(row.scheduled_at).getTime() < starterTime)
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0] || null;
}

async function generateImageWithFallback(args: {
  pageName: string;
  typeName: string;
  caption: string;
  imagePrompt: string;
  textPrompt: string;
  backgroundPrompt?: string;
  searchKeywords?: string;
  overlayText?: string;
  sourceImageUrl?: string;
  sourcePageUrl?: string;
}) {
  let imageWarning = "";
  const typeKey = stripVietnameseForTag(args.typeName || "").toLowerCase();
  const shouldUseInterestingQuestionVisual = isInterestingQuestion(args.typeName);
  const shouldUsePhenomenonSourceVisual = isRealWorldPhenomenon(args.typeName);
  const shouldUseProblemLearningVisual = isProblemType(args.typeName) || isTeachingPhilosophy(args.typeName) || isApplyingKnowledge(args.typeName) || typeKey.includes("problem") || typeKey.includes("learning method") || typeKey.includes("teaching philosophy") || typeKey.includes("applying knowledge");
  let backgroundImage: Awaited<ReturnType<typeof generatePexelsBackgroundImage>> | null = null;
  let logoDataUri = "";
  if (shouldUseInterestingQuestionVisual || shouldUsePhenomenonSourceVisual) {
    const discoveredUrls = await discoverSourcePageImageUrls(args.sourcePageUrl || "").catch((error) => {
      console.warn("[Facebook AI Draft] Cannot discover source page images:", error instanceof Error ? error.message : String(error));
      return [];
    });
    const sourceImageUrls = uniqueStrings([args.sourceImageUrl || "", ...discoveredUrls]);
    const loadedLogo = await loadMindupLogoDataUri().catch(() => "");
    const sourceErrors: string[] = [];
    const sourceVisualMode = shouldUsePhenomenonSourceVisual ? "phenomenon" : "question";
    for (const imageUrl of sourceImageUrls) {
      try {
        const sourceImage = await downloadRemoteImageAsBackground(imageUrl);
        const image = buildInterestingQuestionImage({
          pageName: args.pageName,
          caption: args.caption,
          sourceImage,
          logoDataUri: loadedLogo || undefined,
          overlayText: args.overlayText,
          mode: sourceVisualMode,
        });
        const uploaded = await uploadBytesToDrive(
          image.bytes,
          shouldUsePhenomenonSourceVisual ? "mindup-real-world-phenomenon.svg" : "mindup-interesting-question.svg",
          image.mimeType,
        );
        return {
          image,
          imageWarning,
          imageUrl: uploaded.lh3Url || uploaded.url,
        };
      } catch (error) {
        sourceErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
    try {
      const sourceImage = await generatePexelsBackgroundImage(args.searchKeywords || args.backgroundPrompt || args.imagePrompt || args.textPrompt);
      const image = buildInterestingQuestionImage({
        pageName: args.pageName,
        caption: args.caption,
        sourceImage,
        logoDataUri: loadedLogo || undefined,
        overlayText: args.overlayText,
        mode: sourceVisualMode,
      });
      const uploaded = await uploadBytesToDrive(
        image.bytes,
        shouldUsePhenomenonSourceVisual ? "mindup-real-world-phenomenon.svg" : "mindup-interesting-question.svg",
        image.mimeType,
      );
      return {
        image,
        imageWarning,
        imageUrl: uploaded.lh3Url || uploaded.url,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      imageWarning = [
        sourceErrors.length ? `Source image failed: ${sourceErrors.slice(0, 2).join(" | ")}` : "",
        `Pexels fallback failed: ${message}`,
      ].filter(Boolean).join("\n");
    }
  }
  if (shouldUseProblemLearningVisual) {
    const overlayText = String(args.overlayText || "").trim();
    if (!overlayText) {
      return {
        image: null,
        imageWarning: "Chưa tạo được ảnh: Gemini chưa trả dòng tóm tắt ảnh tối đa 20 từ.",
        imageUrl: null,
      };
    }
    try {
      [backgroundImage, logoDataUri] = await Promise.all([
        generatePexelsBackgroundImage(args.searchKeywords || args.backgroundPrompt || args.imagePrompt || args.textPrompt),
        loadMindupLogoDataUri(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        image: null,
        imageWarning: `Chưa tạo được ảnh nền bằng Pexels: ${message}`,
        imageUrl: null,
      };
    }
  }
  const image = shouldUseProblemLearningVisual
    ? buildProblemLearningImage({
      pageName: args.pageName,
      typeName: args.typeName,
      caption: args.caption,
      imagePrompt: args.backgroundPrompt || args.imagePrompt || args.textPrompt,
      overlayText: args.overlayText,
      logoDataUri,
      backgroundImage,
      imageError: imageWarning,
    })
    : buildFallbackImage({
      pageName: args.pageName,
      typeName: args.typeName,
      caption: args.caption,
      imagePrompt: args.imagePrompt || args.textPrompt,
      imageError: imageWarning,
    });
  const uploaded = await uploadBytesToDrive(
    image.bytes,
    "mindup-facebook-template.svg",
    image.mimeType,
  );
  return {
    image,
    imageWarning,
    imageUrl: uploaded.lh3Url || uploaded.url,
  };
}

function buildPairMetadata(args: {
  existing: JsonRecord;
  pairId: string;
  role: "problem" | "learning_method";
  linkedPostId: string;
  series: { problem: string; method: string; audience: string; sourceReference: string };
}) {
  return {
    ...args.existing,
    series: {
      type: "problem_learning_method",
      pair_id: args.pairId,
      role: args.role,
      linked_post_id: args.linkedPostId,
      problem: args.series.problem,
      method: args.series.method,
      audience: args.series.audience,
      source_reference: args.series.sourceReference,
      updated_at: new Date().toISOString(),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let postId = "";
  let linkedPostId = "";
  try {
    const { user } = await requireAuthenticatedUser(req);
    const role = await getUserRole(user.id);
    assertAllowedRole(role);

    const body = await req.json().catch(() => ({}));
    postId = String(body?.post_id || "").trim();
    if (!postId) throw new Error("Thiếu post_id.");
    const provider = normalizeTextAiProvider(body?.provider);

    const post = await loadPostBundle(postId);
    await assertCanUsePost(user.id, role, post);
    await patchJson(`facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}`, {
      ai_status: "generating",
      ai_error: null,
      updated_at: new Date().toISOString(),
    });

    const sourceHistory = await loadSourceHistoryForPost(post);
    const textPrompt = await buildGeminiPrompt({
      pageName: post.page?.page_name || post.page_id,
      typeName: post.type?.name || "Facebook",
      scheduledAt: post.scheduled_at,
      typePrompt: post.type?.ai_prompt || post.type?.description || "",
      existingContent: post.content || "",
      internalNote: post.internal_note || "",
      provider,
      sourceHistory,
    });

    if (isProblemType(post.type?.name || "")) {
      const linkedPost = await findPairedLearningMethodPost(post);
      if (!linkedPost?.id) {
        throw new Error("Chưa có bài Learning Method phù hợp trong khoảng gần bài mở chuỗi này cùng fanpage. Hãy tạo lịch Learning Method trước/sau bài này, rồi bấm Gemini lại.");
      }
      linkedPostId = linkedPost.id;
      const selectedLearningMethod = learningMethodTopic(
        linkedPost.scheduled_at,
        linkedPost.page?.page_name || post.page?.page_name || linkedPost.page_id,
      );
      const pairTextPrompt = [
        textPrompt,
        "",
        "Thông tin bài Learning Method được ghép với bài mở chuỗi:",
        `- Thời gian đăng Learning Method: ${linkedPost.scheduled_at}`,
        learningMethodPromptBlock(selectedLearningMethod),
        "",
        subjectContextPromptBlock(linkedPost.page?.page_name || post.page?.page_name || linkedPost.page_id),
      ].join("\n");
      await patchJson(`facebook_scheduled_posts?id=eq.${encodeURIComponent(linkedPost.id)}`, {
        ai_status: "generating",
        ai_error: null,
        updated_at: new Date().toISOString(),
      });

      const pairDraft = await generateProblemLearningPairDraft(pairTextPrompt, provider);
      if (!pairDraft.series.method || stripVietnameseForTag(pairDraft.series.method).toLowerCase() !== stripVietnameseForTag(selectedLearningMethod.name).toLowerCase()) {
        pairDraft.series.method = selectedLearningMethod.name;
      }
      pairDraft.series.sourceReference = [
        pairDraft.series.sourceReference,
        `Learning Method ${selectedLearningMethod.methodNumber}/${selectedLearningMethod.totalMethods}; week ${selectedLearningMethod.week}/${selectedLearningMethod.year}; offset ${selectedLearningMethod.offset}; group ${selectedLearningMethod.group}`,
      ].filter(Boolean).join(" | ");
      const pairId = crypto.randomUUID();
      const problemContent = mergeCaptionAndHashtags(pairDraft.problemPost.caption, pairDraft.problemPost.hashtags);
      const learningContent = mergeCaptionAndHashtags(pairDraft.learningPost.caption, pairDraft.learningPost.hashtags);
      const [problemImage, learningImage] = await Promise.all([
        generateImageWithFallback({
          pageName: post.page?.page_name || post.page_id,
          typeName: post.type?.name || "Problem",
          caption: problemContent,
          imagePrompt: pairDraft.problemPost.imagePrompt,
          textPrompt: pairTextPrompt,
          backgroundPrompt: pairDraft.problemPost.imageBackgroundPrompt,
          searchKeywords: pairDraft.problemPost.imageSearchKeywords,
          overlayText: pairDraft.problemPost.imageOverlayText || pairDraft.series.problem,
        }),
        generateImageWithFallback({
          pageName: linkedPost.page?.page_name || post.page?.page_name || linkedPost.page_id,
          typeName: linkedPost.type?.name || "Learning Method",
          caption: learningContent,
          imagePrompt: pairDraft.learningPost.imagePrompt,
          textPrompt: pairTextPrompt,
          backgroundPrompt: pairDraft.learningPost.imageBackgroundPrompt,
          searchKeywords: pairDraft.learningPost.imageSearchKeywords,
          overlayText: pairDraft.learningPost.imageOverlayText || pairDraft.problemPost.imageOverlayText || pairDraft.series.problem,
        }),
      ]);

      const problemNote = [
        pairDraft.problemPost.internalNote,
        pairDraft.series.problem ? `Vấn đề: ${pairDraft.series.problem}` : "",
        pairDraft.series.method ? `Phương pháp giải đáp: ${pairDraft.series.method}` : "",
        pairDraft.series.audience ? `Đối tượng: ${pairDraft.series.audience}` : "",
        pairDraft.series.sourceReference ? `Nguồn/ý tưởng tham khảo: ${pairDraft.series.sourceReference}` : "",
        post.internal_note,
      ].filter(Boolean).join("\n\n").trim() || null;
      const learningNote = [
        pairDraft.learningPost.internalNote,
        pairDraft.series.problem ? `Giải đáp cho vấn đề: ${pairDraft.series.problem}` : "",
        pairDraft.series.method ? `Phương pháp: ${pairDraft.series.method}` : "",
        pairDraft.series.audience ? `Đối tượng: ${pairDraft.series.audience}` : "",
        pairDraft.series.sourceReference ? `Nguồn/ý tưởng tham khảo: ${pairDraft.series.sourceReference}` : "",
        linkedPost.internal_note,
      ].filter(Boolean).join("\n\n").trim() || null;

      const [problemRows, learningRows] = await Promise.all([
        patchJson<Array<JsonRecord>>(`facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}`, {
          content: problemContent,
          image_url: problemImage.imageUrl,
          internal_note: problemNote,
          metadata: buildPairMetadata({
            existing: parseMetadata(post.metadata),
            pairId,
            role: "problem",
            linkedPostId: linkedPost.id,
            series: pairDraft.series,
          }),
          status: "draft",
          content_status: "submitted",
          approval_status: "pending",
          ai_status: "drafted",
          ai_generated_at: new Date().toISOString(),
          ai_model: [pairDraft.model, problemImage.image?.model].filter(Boolean).join("; "),
          ai_prompt: pairTextPrompt,
          ai_image_prompt: problemImage.image?.imagePrompt || pairDraft.problemPost.imageSearchKeywords || pairDraft.problemPost.imageBackgroundPrompt || pairDraft.problemPost.imagePrompt || null,
          ai_image_url: problemImage.imageUrl,
          ai_error: problemImage.imageWarning || null,
          updated_at: new Date().toISOString(),
        }),
        patchJson<Array<JsonRecord>>(`facebook_scheduled_posts?id=eq.${encodeURIComponent(linkedPost.id)}`, {
          content: learningContent,
          image_url: learningImage.imageUrl,
          internal_note: learningNote,
          metadata: buildPairMetadata({
            existing: parseMetadata(linkedPost.metadata),
            pairId,
            role: "learning_method",
            linkedPostId: postId,
            series: pairDraft.series,
          }),
          status: "draft",
          content_status: "submitted",
          approval_status: "pending",
          ai_status: "drafted",
          ai_generated_at: new Date().toISOString(),
          ai_model: [pairDraft.model, learningImage.image?.model].filter(Boolean).join("; "),
          ai_prompt: pairTextPrompt,
          ai_image_prompt: learningImage.image?.imagePrompt || pairDraft.learningPost.imageSearchKeywords || pairDraft.learningPost.imageBackgroundPrompt || pairDraft.learningPost.imagePrompt || null,
          ai_image_url: learningImage.imageUrl,
          ai_error: learningImage.imageWarning || null,
          updated_at: new Date().toISOString(),
        }),
      ]);

      return jsonResponse({
        ok: true,
        post: problemRows?.[0] || null,
        related_post: learningRows?.[0] || null,
        pair_id: pairId,
        image_url: problemImage.imageUrl,
        related_image_url: learningImage.imageUrl,
        image_fallback: Boolean(problemImage.imageWarning || learningImage.imageWarning),
        image_warning: [problemImage.imageWarning, learningImage.imageWarning].filter(Boolean).join("\n"),
      });
    }

    const draft = await generateTextDraft(textPrompt, post.type?.name || "", provider);
    const postTypeNameForQuiz = post.type?.name || "Facebook";
    if (isQuizTypeName(postTypeNameForQuiz)) {
      const quiz = draft.quiz || {};
      const quizNote = [
        draft.internalNote,
        quiz.grade ? `Lớp: ${quiz.grade}` : "",
        quiz.subject ? `Môn: ${quiz.subject}` : "",
        quiz.curriculumTopic ? `Chủ đề: ${quiz.curriculumTopic}` : "",
        quiz.question ? `Câu hỏi: ${quiz.question}` : "",
        Array.isArray(quiz.answers) && quiz.answers.length ? `Đáp án: ${quiz.answers.join(" | ")}` : "",
        quiz.correctAnswer ? `Đáp án đúng: ${quiz.correctAnswer}` : "",
        quiz.trap ? `Bẫy: ${quiz.trap}` : "",
        quiz.explanation ? `Giải thích: ${quiz.explanation}` : "",
        post.internal_note,
      ].filter(Boolean).join("\n");
      const rows = await patchJson<Array<JsonRecord>>(`facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}`, {
        content: mergeCaptionAndHashtags(draft.caption, draft.hashtags),
        image_url: null,
        internal_note: quizNote || null,
        metadata: {
          ...parseMetadata(post.metadata),
          quiz: {
            enabled: true,
            grade: quiz.grade,
            subject: quiz.subject,
            curriculum_topic: quiz.curriculumTopic,
            question: quiz.question,
            answers: quiz.answers,
            correct_answer: quiz.correctAnswer,
            trap: quiz.trap,
            explanation: quiz.explanation,
            updated_at: new Date().toISOString(),
          },
        },
        status: "draft",
        content_status: "submitted",
        approval_status: "pending",
        ai_status: "drafted",
        ai_generated_at: new Date().toISOString(),
        ai_model: draft.model,
        ai_prompt: textPrompt,
        ai_image_prompt: "MindUp Quiz template",
        ai_image_url: null,
        ai_error: null,
        updated_at: new Date().toISOString(),
      });
      return jsonResponse({
        ok: true,
        post: rows?.[0] || null,
        quiz,
        image_url: null,
        image_fallback: false,
        image_warning: "",
      });
    }
    if (isHardQuizWithPrize(postTypeNameForQuiz)) {
      const hardQuiz = draft.hardQuiz || {};
      const hardQuizNote = [
        draft.internalNote,
        hardQuiz.grade ? `Lớp: ${hardQuiz.grade}` : "",
        hardQuiz.subject ? `Môn: ${hardQuiz.subject}` : "",
        hardQuiz.curriculumTopic ? `Chủ đề: ${hardQuiz.curriculumTopic}` : "",
        hardQuiz.question ? `Đề bài: ${hardQuiz.question}` : "",
        hardQuiz.correctAnswer ? `Đáp án đúng: ${hardQuiz.correctAnswer}` : "",
        hardQuiz.solution ? `Lời giải/ghi chú: ${hardQuiz.solution}` : "",
        hardQuiz.prizeAmount ? `Phần thưởng: ${hardQuiz.prizeAmount}` : "",
        post.internal_note,
      ].filter(Boolean).join("\n");
      const rows = await patchJson<Array<JsonRecord>>(`facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}`, {
        content: "",
        image_url: null,
        internal_note: hardQuizNote || null,
        metadata: {
          ...parseMetadata(post.metadata),
          hard_quiz: {
            enabled: true,
            grade: hardQuiz.grade,
            subject: hardQuiz.subject,
            curriculum_topic: hardQuiz.curriculumTopic,
            question: hardQuiz.question,
            correct_answer: hardQuiz.correctAnswer,
            solution: hardQuiz.solution,
            prize_amount: hardQuiz.prizeAmount || 50000,
            updated_at: new Date().toISOString(),
          },
        },
        status: "draft",
        content_status: "submitted",
        approval_status: "pending",
        ai_status: "drafted",
        ai_generated_at: new Date().toISOString(),
        ai_model: draft.model,
        ai_prompt: textPrompt,
        ai_image_prompt: "MindUp Hard Quiz template",
        ai_image_url: null,
        ai_error: null,
        updated_at: new Date().toISOString(),
      });
      return jsonResponse({
        ok: true,
        post: rows?.[0] || null,
        hard_quiz: hardQuiz,
        image_url: null,
        image_fallback: false,
        image_warning: "",
      });
    }
    const mondayDisplayText = isMondayMindset(post.type?.name || "") && draft.quoteVi
      ? `${draft.quoteVi}${draft.quoteSource ? ` — ${draft.quoteSource}` : ""}`
      : draft.caption;
    const typeName = post.type?.name || "Facebook";
    const generatedImage = await generateImageWithFallback({
      pageName: post.page?.page_name || post.page_id,
      typeName,
      caption: mondayDisplayText,
      imagePrompt: draft.imagePrompt || textPrompt,
      backgroundPrompt: draft.imageBackgroundPrompt || draft.imagePrompt || textPrompt,
      searchKeywords: draft.imageSearchKeywords,
      overlayText: draft.imageOverlayText,
      sourceImageUrl: draft.interestingQuestion?.sourceImageUrl || draft.realWorldPhenomenon?.sourceImageUrl || "",
      sourcePageUrl: draft.interestingQuestion?.sourceUrl || draft.realWorldPhenomenon?.sourceUrl || "",
      textPrompt,
    });
    const finalContent = mergeCaptionAndHashtags(draft.caption, draft.hashtags);
    const isApplyingKnowledgePost = isApplyingKnowledge(typeName);
    const isInterestingQuestionPost = isInterestingQuestion(typeName);
    const isRealWorldPhenomenonPost = isRealWorldPhenomenon(typeName);
    const reelNote = isApplyingKnowledgePost && draft.reel
      ? [
        "Reel draft:",
        draft.reel.hook3s ? `Hook 3s: ${draft.reel.hook3s}` : "",
        draft.reel.durationSeconds ? `Thời lượng gợi ý: ${draft.reel.durationSeconds}s` : "",
        draft.reel.voiceOver ? `Voice-over:\n${draft.reel.voiceOver}` : "",
        Array.isArray(draft.reel.scenes) && draft.reel.scenes.length
          ? `Scenes:\n${draft.reel.scenes.map((scene: unknown, index: number) => {
            const record = (scene && typeof scene === "object" ? scene : {}) as JsonRecord;
            const voiceText = String(record.voice_text || record.voiceText || record.voice_over || "").trim();
            return `${index + 1}. ${record.seconds || ""} | ${record.visual_type || "image/video"} | ${record.stock_video_keywords || ""} | ${record.overlay_text || ""}${voiceText ? ` | Voice: ${voiceText}` : ""}`;
          }).join("\n")}`
          : "",
        draft.reel.caption ? `Reel caption:\n${draft.reel.caption}` : "",
        draft.reel.hashtags?.length ? `Reel hashtags: ${draft.reel.hashtags.join(" ")}` : "",
      ].filter(Boolean).join("\n")
      : "";
    const explainerNote = isApplyingKnowledgePost && draft.explainerVideo?.scenes?.length
      ? [
        "Long explainer video draft:",
        draft.explainerVideo.title ? `Title: ${draft.explainerVideo.title}` : "",
        draft.explainerVideo.durationSeconds ? `Suggested duration: ${draft.explainerVideo.durationSeconds}s` : "",
        draft.explainerVideo.thumbnailText ? `Thumbnail text: ${draft.explainerVideo.thumbnailText}` : "",
        draft.explainerVideo.chapters?.length ? `Chapters: ${draft.explainerVideo.chapters.join(" | ")}` : "",
        draft.explainerVideo.voiceOver ? `Voice-over:\n${draft.explainerVideo.voiceOver}` : "",
        `Scenes:\n${draft.explainerVideo.scenes.map((scene: unknown, index: number) => {
          const record = (scene && typeof scene === "object" ? scene : {}) as JsonRecord;
          const voiceText = String(record.voice_text || record.voiceText || record.voice_over || "").trim();
          const objects = Array.isArray(record.visual_objects) ? record.visual_objects.join(", ") : String(record.visual_objects || "");
          return `${index + 1}. ${record.seconds || ""} | ${record.visual_type || "whiteboard"} | ${objects} | ${record.overlay_text || ""} | ${record.animation_notes || ""}${voiceText ? ` | Voice: ${voiceText}` : ""}`;
        }).join("\n")}`,
      ].filter(Boolean).join("\n")
      : "";
    const reelSeriesNote = isApplyingKnowledgePost && Array.isArray(draft.reelSeries) && draft.reelSeries.length
      ? [
        "Follow-up reel series drafts:",
        ...draft.reelSeries.map((item: JsonRecord, index: number) => [
          `${index + 1}. ${item.title || "Untitled reel"}${item.durationSeconds ? ` (${item.durationSeconds}s)` : ""}`,
          item.focus ? `Focus: ${item.focus}` : "",
          item.caption ? `Caption: ${item.caption}` : "",
          item.hashtags?.length ? `Hashtags: ${item.hashtags.join(" ")}` : "",
        ].filter(Boolean).join("\n")),
      ].join("\n\n")
      : "";
    const interestingQuestionNote = isInterestingQuestionPost && draft.interestingQuestion
      ? [
        "Interesting Question:",
        draft.interestingQuestion.sourceName ? `Source: ${draft.interestingQuestion.sourceName}` : "",
        draft.interestingQuestion.sourceTitle ? `Source title: ${draft.interestingQuestion.sourceTitle}` : "",
        draft.interestingQuestion.sourceUrl ? `Source URL: ${draft.interestingQuestion.sourceUrl}` : "",
        draft.interestingQuestion.sourceImageUrl ? `Source image URL: ${draft.interestingQuestion.sourceImageUrl}` : "",
        draft.interestingQuestion.questionFingerprint ? `Fingerprint: ${draft.interestingQuestion.questionFingerprint}` : "",
        draft.interestingQuestion.question ? `Question: ${draft.interestingQuestion.question}` : "",
        draft.interestingQuestion.answer ? `Answer: ${draft.interestingQuestion.answer}` : "",
        draft.interestingQuestion.explanation ? `Explanation: ${draft.interestingQuestion.explanation}` : "",
      ].filter(Boolean).join("\n")
      : "";
    const realWorldPhenomenonNote = isRealWorldPhenomenonPost && draft.realWorldPhenomenon
      ? [
        "Real-world Phenomenon:",
        draft.realWorldPhenomenon.sourceName ? `Source: ${draft.realWorldPhenomenon.sourceName}` : "",
        draft.realWorldPhenomenon.sourceTitle ? `Source title: ${draft.realWorldPhenomenon.sourceTitle}` : "",
        draft.realWorldPhenomenon.sourceUrl ? `Source URL: ${draft.realWorldPhenomenon.sourceUrl}` : "",
        draft.realWorldPhenomenon.sourceImageUrl ? `Source image URL: ${draft.realWorldPhenomenon.sourceImageUrl}` : "",
        draft.realWorldPhenomenon.phenomenonFingerprint ? `Fingerprint: ${draft.realWorldPhenomenon.phenomenonFingerprint}` : "",
        draft.realWorldPhenomenon.phenomenon ? `Phenomenon: ${draft.realWorldPhenomenon.phenomenon}` : "",
        draft.realWorldPhenomenon.coreIdea ? `Core idea: ${draft.realWorldPhenomenon.coreIdea}` : "",
      ].filter(Boolean).join("\n")
      : "";
    const finalNote = [
      draft.quoteEn ? `Quote EN: ${draft.quoteEn}` : "",
      draft.quoteVi ? `Quote VI: ${draft.quoteVi}` : "",
      draft.quoteSource ? `Nguồn: ${draft.quoteSource}` : "",
      draft.internalNote,
      reelNote,
      explainerNote,
      reelSeriesNote,
      interestingQuestionNote,
      realWorldPhenomenonNote,
      post.internal_note,
    ].filter(Boolean).join("\n\n").trim() || null;

    const rows = await patchJson<Array<JsonRecord>>(`facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}`, {
      content: finalContent,
      image_url: generatedImage.imageUrl,
      internal_note: finalNote,
      metadata: isApplyingKnowledgePost || isInterestingQuestionPost || isRealWorldPhenomenonPost
        ? {
          ...parseMetadata(post.metadata),
          ...(isApplyingKnowledgePost
            ? {
              applying_knowledge: {
                enabled: true,
                reel: draft.reel,
                explainer_video: draft.explainerVideo,
                reel_series: draft.reelSeries,
                image_search_keywords: draft.imageSearchKeywords,
                image_background_prompt: draft.imageBackgroundPrompt,
                image_overlay_text: draft.imageOverlayText,
                updated_at: new Date().toISOString(),
              },
            }
            : {}),
          ...(isInterestingQuestionPost
            ? {
              interesting_question: {
                enabled: true,
                ...draft.interestingQuestion,
                source_name: draft.interestingQuestion?.sourceName || "",
                source_title: draft.interestingQuestion?.sourceTitle || "",
                source_url: draft.interestingQuestion?.sourceUrl || "",
                source_image_url: draft.interestingQuestion?.sourceImageUrl || "",
                question_fingerprint: draft.interestingQuestion?.questionFingerprint || "",
                updated_at: new Date().toISOString(),
              },
            }
            : {}),
          ...(isRealWorldPhenomenonPost
            ? {
              real_world_phenomenon: {
                enabled: true,
                ...draft.realWorldPhenomenon,
                source_name: draft.realWorldPhenomenon?.sourceName || "",
                source_title: draft.realWorldPhenomenon?.sourceTitle || "",
                source_url: draft.realWorldPhenomenon?.sourceUrl || "",
                source_image_url: draft.realWorldPhenomenon?.sourceImageUrl || "",
                phenomenon_fingerprint: draft.realWorldPhenomenon?.phenomenonFingerprint || "",
                updated_at: new Date().toISOString(),
              },
            }
            : {}),
        }
        : post.metadata,
      status: "draft",
      content_status: "submitted",
      approval_status: "pending",
      ai_status: "drafted",
      ai_generated_at: new Date().toISOString(),
      ai_model: [draft.model, generatedImage.image?.model].filter(Boolean).join("; "),
      ai_prompt: textPrompt,
      ai_image_prompt: generatedImage.image?.imagePrompt || draft.imageSearchKeywords || draft.imageBackgroundPrompt || draft.imagePrompt || null,
      ai_image_url: generatedImage.imageUrl,
      ai_error: generatedImage.imageWarning || null,
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      ok: true,
      post: rows?.[0] || null,
      image_url: generatedImage.imageUrl,
      image_fallback: Boolean(generatedImage.imageWarning),
      image_warning: generatedImage.imageWarning,
    });
  } catch (error) {
    console.error(error);
    if (postId) {
      await patchJson(`facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}`, {
        ai_status: "error",
        ai_error: error instanceof Error ? error.message : String(error || "Gemini failed"),
        updated_at: new Date().toISOString(),
      }).catch(() => {});
    }
    if (linkedPostId) {
      await patchJson(`facebook_scheduled_posts?id=eq.${encodeURIComponent(linkedPostId)}`, {
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
