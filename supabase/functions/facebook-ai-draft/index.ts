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

function parseGeminiJsonCandidate(value: string) {
  try {
    return JSON.parse(value);
  } catch (firstError) {
    const repaired = escapeControlCharsInsideJsonStrings(value);
    try {
      return JSON.parse(repaired);
    } catch (_) {
      throw firstError;
    }
  }
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
  return normalized === "problem" || normalized === "teaching philosophy";
}

function isLearningMethod(typeName: string) {
  return String(typeName || "").trim().toLowerCase() === "learning method";
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
  ].join("\n");
}


const CONTENT_TOPIC_POOLS: Record<string, string[]> = {
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

function buildGeminiPrompt(args: {
  pageName: string;
  typeName: string;
  scheduledAt: string;
  typePrompt: string;
  existingContent: string;
  internalNote: string;
}) {
  if (isMondayMindset(args.typeName)) {
    const monday = mondayMindsetTopic(args.scheduledAt, args.pageName);
    const fanpageTag = pageHashtag(args.pageName);
    const isCountdown = monday.mode === "year_countdown";
    return [
      "Bạn là trợ lý nội dung cho MindUp - Tư Duy Toàn Diện.",
      "Nhiệm vụ: tạo bài Monday Mindset dạng quote-card, không viết caption phân tích dài.",
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

  if (scheduledTopic.key === "qna") {
    const fanpageTag = pageHashtag(args.pageName);
    return [
      "Bạn là chuyên gia content giáo dục cho MindUp - Tư Duy Toàn Diện.",
      "Nhiệm vụ: tạo bài Q&A/Tìm hiểu kiến thức môn học trong thực tế. Bài phải làm người đọc thấy: hóa ra kiến thức trên lớp có thật trong đời sống.",
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
    return [
      "Bạn là giáo viên ra câu hỏi tương tác nhanh cho MindUp - Tư Duy Toàn Diện.",
      "Nhiệm vụ: tạo bài Quiz cực nhanh, học sinh có thể làm trong 10-30 giây, nhưng có một bẫy nhỏ khiến học sinh dễ sai nếu đọc vội.",
      "",
      contentTopicBlock(scheduledTopic),
      "",
      "Yêu cầu câu hỏi:",
      "- Câu hỏi ngắn, rõ, không cần tính toán dài.",
      "- Có 2-4 đáp án, không ghi A/B/C/D trong nội dung đáp án.",
      "- Có một bẫy tư duy/đọc đề/đơn vị/dấu/điều kiện.",
      "- Caption không được lộ đáp án.",
      "- Internal note phải ghi đáp án đúng và giải thích ngắn để nhân viên kiểm tra.",
      "",
      "Hãy trả về duy nhất JSON hợp lệ, không markdown, theo schema:",
      JSON.stringify({
        caption: "Caption Quiz ngắn bằng tiếng Việt, kêu gọi comment đáp án, không lộ đáp án.",
        hashtags: ["#MindUp", "#Quiz", "#PhatTrienTuDuy", fanpageTag],
        image_prompt: "Template Quiz MindUp: nền xanh, logo MindUp, vùng câu hỏi lớn, 2-4 ô đáp án ngắn, font lớn, dễ đọc trên điện thoại.",
        internal_note: "Câu hỏi; các đáp án; đáp án đúng; bẫy nằm ở đâu; giải thích 2-3 câu.",
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  if (isHardQuizWithPrize(args.typeName)) {
    const fanpageTag = pageHashtag(args.pageName);
    return [
      "Bạn là trợ lý nội dung cho MindUp - Tư Duy Toàn Diện.",
      "Nhiệm vụ: tạo bài Facebook cho chương trình Hard Quiz with Prize, tên hiển thị là HỎI NHANH ĐỚP TRỌN.",
      "",
      contentTopicBlock(scheduledTopic),
      "",
      "Thông tin bài đăng:",
      `- Fanpage: ${args.pageName}`,
      `- Hashtag fanpage bắt buộc: ${fanpageTag}`,
      `- Thời gian đăng: ${args.scheduledAt}`,
      args.existingContent ? `- Nội dung nháp/câu hỏi hiện có: ${args.existingContent}` : "",
      args.internalNote ? `- Ghi chú nội bộ/đáp án/lời giải nếu có: ${args.internalNote}` : "",
      "",
      "Yêu cầu cực kỳ quan trọng:",
      "- Câu hỏi phải ở mức vận dụng, hơi khó, học sinh bắt buộc phải đặt bút viết khoảng 10 dòng mới giải chắc được.",
      "- Không tạo câu hỏi mẹo quá ngắn; phải có dữ kiện đủ rõ để giải bằng kiến thức môn học.",
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
        image_prompt: "Prompt tiếng Anh để tạo ảnh theo template Hỏi nhanh đớp trọn của MindUp: nền xanh, logo MindUp, headline Hỏi nhanh đớp trọn, vùng trắng lớn chỉ chứa đề bài, phần thưởng 50.000đ, typography rõ, dễ đọc trên điện thoại.",
        internal_note: "Ghi đáp án đúng/lời giải nội bộ nếu có, không đưa vào caption.",
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  if (isLearningMethod(args.typeName)) {
    const fanpageTag = pageHashtag(args.pageName);
    const method = learningMethodTopic(args.scheduledAt, args.pageName);
    return [
      "Bạn là chuyên gia content marketing giáo dục cho MindUp - Tư Duy Toàn Diện.",
      "Nhiệm vụ: tạo bài Learning Method chia sẻ một phương pháp học tập cụ thể, dễ hiểu, có thể áp dụng ngay.",
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
      "- Có thể tham khảo insight/quy tắc học tập phổ biến từ nguồn tiếng Anh, nhưng phải viết lại thành bài gốc theo giọng MindUp; không copy nguyên văn.",
      "- Bài cần có: vấn đề thường gặp, tên phương pháp, vì sao hiệu quả, cách áp dụng 3-5 bước, ví dụ cụ thể.",
      "- Ví dụ thực tế bắt buộc phải liên quan đến môn/trục nội dung của fanpage.",
      "- Nếu có bài Problem liên quan trước đó thì hãy viết như một bài giải đáp tiếp nối.",
      "- Ảnh: Gemini chỉ mô tả nền ảnh liên quan đến bài viết, mờ phía sau, không có chữ và không có logo. Hệ thống sẽ tự chèn logo MindUp phía trên giữa ảnh và chữ tóm tắt khoảng 20 từ ở chính giữa.",
      "",
      "Hãy trả về duy nhất JSON hợp lệ, không markdown, theo schema:",
      JSON.stringify({
        caption: "Caption bài Learning Method bằng tiếng Việt, giải thích phương pháp học cụ thể và cách áp dụng.",
        hashtags: ["#MindUp", "#LearningMethod", "#PhuongPhapHocTap", "#PhatTrienTuDuy", fanpageTag],
        image_prompt: "Prompt tiếng Anh tạo ảnh nền 1:1 cho bài Learning Method, không chữ, không logo, liên quan đến phương pháp học và môn học của fanpage.",
        image_search_keywords: "Từ khóa tiếng Anh để tìm ảnh nền phù hợp trên Pexels, không chữ, liên quan đến bài viết và môn học.",
        image_background_prompt: "Prompt/từ khóa tiếng Anh cho ảnh nền mờ, không chữ, không logo.",
        image_overlay_text: "Một câu tóm tắt tiếng Việt khoảng 20 từ để hệ thống đặt ở giữa ảnh.",
        internal_note: `Learning Method tuần ${method.week}/${method.year}; fanpage ${args.pageName}; offset ${method.offset}; method ${method.methodNumber}/${method.totalMethods}: ${method.name} (${method.group})`,
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
      "- Không copy nguyên văn bài nước ngoài. Có thể tham khảo insight/phương pháp học phổ biến bằng tiếng Anh, rồi viết lại thành bài gốc tiếng Việt theo giọng MindUp.",
      "- Problem: đồng cảm, chạm nỗi đau, ví dụ đời thường, không giải pháp quá sâu, hẹn bài Learning Method.",
      "- Learning Method: nhắc lại vấn đề, nêu phương pháp học, vì sao hiệu quả, cách áp dụng 3-5 bước, ví dụ cụ thể cho học sinh/phụ huynh.",
      "- Ví dụ trong Learning Method bắt buộc phải liên quan đến môn/trục nội dung của fanpage.",
      "- Hệ thống sẽ bổ sung riêng phương pháp học bắt buộc cho bài Learning Method theo tuần và offset fanpage. Không tự chọn ngẫu nhiên nếu đã có phương pháp bắt buộc.",
      "- Ảnh của cả Problem và Learning Method: Gemini chỉ mô tả nền ảnh liên quan đến bài viết, mờ phía sau, không có chữ và không có logo. Hệ thống sẽ tự chèn logo MindUp phía trên giữa ảnh và chữ tóm tắt vấn đề khoảng 20 từ ở chính giữa.",
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
          image_overlay_text: "Một câu tóm tắt vấn đề bằng tiếng Việt khoảng 20 từ để hệ thống đặt ở giữa ảnh.",
          internal_note: "Ghi chú nội bộ cho người kiểm tra bài Problem.",
        },
        learning_method_post: {
          caption: "Caption bài Learning Method bằng tiếng Việt, giải đáp vấn đề bằng phương pháp học cụ thể.",
          hashtags: ["#MindUp", "#LearningMethod", "#PhuongPhapHocTap", "#PhatTrienTuDuy", fanpageTag],
          image_prompt: "Prompt tiếng Anh tạo ảnh nền 1:1 cho bài Learning Method, không chữ, không logo, liên quan đến phương pháp học và môn học fanpage.",
          image_search_keywords: "Từ khóa tiếng Anh để tìm ảnh nền phù hợp trên Pexels, không chữ, liên quan đến phương pháp học và môn học.",
          image_background_prompt: "Prompt/từ khóa tiếng Anh cho ảnh nền mờ, không chữ, không logo.",
          image_overlay_text: "Một câu tóm tắt vấn đề đã nêu trong bài Problem bằng tiếng Việt khoảng 20 từ để hệ thống đặt ở giữa ảnh.",
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
  if (!hashtags.includes("#MondayMindset") && !hashtags.includes("#PhatTrienTuDuy")) hashtags.push("#PhatTrienTuDuy");
  return {
    model,
    caption: String(parsed?.caption || "").trim(),
    hashtags,
    quoteEn: String(parsed?.quote_en || "").trim(),
    quoteVi: String(parsed?.quote_vi || "").trim(),
    quoteSource: String(parsed?.quote_source || "").trim(),
    imagePrompt: String(parsed?.image_prompt || "").trim(),
    imageSearchKeywords: String(parsed?.image_search_keywords || "").trim(),
    imageBackgroundPrompt: String(parsed?.image_background_prompt || parsed?.image_prompt || "").trim(),
    imageOverlayText: String(parsed?.image_overlay_text || "").trim(),
    internalNote: String(parsed?.internal_note || "").trim(),
  };
}

function normalizeDraftPart(value: unknown, fallbackTags: string[] = []) {
  const record = (value && typeof value === "object" ? value : {}) as JsonRecord;
  const hashtags = normalizeHashtags(record.hashtags);
  for (const tag of fallbackTags) {
    if (tag && !hashtags.includes(tag)) hashtags.push(tag);
  }
  if (!hashtags.includes("#MindUp")) hashtags.unshift("#MindUp");
  return {
    caption: String(record.caption || "").trim(),
    hashtags,
    imagePrompt: String(record.image_prompt || "").trim(),
    imageSearchKeywords: String(record.image_search_keywords || "").trim(),
    imageBackgroundPrompt: String(record.image_background_prompt || record.image_prompt || "").trim(),
    imageOverlayText: String(record.image_overlay_text || "").trim(),
    internalNote: String(record.internal_note || "").trim(),
  };
}

async function generateProblemLearningPairDraft(prompt: string) {
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
        temperature: 0.82,
        response_mime_type: "application/json",
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Gemini text generation failed");

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

function summarizeOverlayText(value: string, maxWords = 20) {
  const clean = String(value || "")
    .replace(/#[\p{L}\p{N}_]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = clean.split(/[.!?…]\s+/)[0] || clean;
  const words = sentence.split(/\s+/).filter(Boolean).slice(0, maxWords);
  return words.join(" ") || "Học đúng cách để hiểu sâu hơn mỗi ngày";
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
  const overlay = summarizeOverlayText(args.overlayText || args.caption, 20);
  const titleLines = wrapSvgText(overlay, 24, 4);
  const yStart = titleLines.length <= 2 ? 500 : 440;
  const titleTspans = titleLines
    .map((line, index) => `<tspan x="540" y="${yStart + index * 70}">${escapeXml(line)}</tspan>`)
    .join("");
  const backgroundLayer = args.backgroundImage?.data
    ? `<image href="data:${escapeXml(args.backgroundImage.mimeType || "image/png")};base64,${args.backgroundImage.data}" x="0" y="0" width="1080" height="1080" preserveAspectRatio="xMidYMid slice" filter="url(#softBlur)"/>
  <rect width="1080" height="1080" rx="54" fill="#061b3e" opacity=".24"/>
  <rect width="1080" height="1080" rx="54" fill="url(#centerGlow)" opacity=".72"/>`
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
  <rect x="108" y="${yStart - 58}" width="864" height="${Math.max(180, titleLines.length * 78 + 68)}" rx="46" fill="#061b3e" opacity=".38"/>
  <text text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="900" fill="#ffffff" filter="url(#textShadow)">${titleTspans}</text>
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
}) {
  let imageWarning = "";
  const typeKey = stripVietnameseForTag(args.typeName || "").toLowerCase();
  const shouldUseProblemLearningVisual = isProblemType(args.typeName) || typeKey.includes("problem") || typeKey.includes("learning method");
  let backgroundImage: Awaited<ReturnType<typeof generatePexelsBackgroundImage>> | null = null;
  let logoDataUri = "";
  if (shouldUseProblemLearningVisual) {
    const overlayText = String(args.overlayText || "").trim();
    if (!overlayText) {
      return {
        image: null,
        imageWarning: "Chưa tạo được ảnh: Gemini chưa trả dòng tóm tắt ảnh khoảng 20 từ.",
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
      imageError: "",
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

      const pairDraft = await generateProblemLearningPairDraft(pairTextPrompt);
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

    const draft = await generateTextDraft(textPrompt);
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
      textPrompt,
    });
    const finalContent = mergeCaptionAndHashtags(draft.caption, draft.hashtags);
    const finalNote = [
      draft.quoteEn ? `Quote EN: ${draft.quoteEn}` : "",
      draft.quoteVi ? `Quote VI: ${draft.quoteVi}` : "",
      draft.quoteSource ? `Nguồn: ${draft.quoteSource}` : "",
      draft.internalNote,
      post.internal_note,
    ].filter(Boolean).join("\n\n").trim() || null;

    const rows = await patchJson<Array<JsonRecord>>(`facebook_scheduled_posts?id=eq.${encodeURIComponent(postId)}`, {
      content: finalContent,
      image_url: generatedImage.imageUrl,
      internal_note: finalNote,
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
