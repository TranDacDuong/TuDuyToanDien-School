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

function isMondayMindset(typeName: string) {
  return String(typeName || "").trim().toLowerCase() === "monday mindset";
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
      "Sau đó dịch câu quote sang tiếng Việt thật hay, giàu cảm hứng, tự nhiên, không dịch máy móc.",
      "",
      "Caption chỉ được là hashtag, không thêm mô tả:",
      `#MondayMindset #MindUp ${fanpageTag}`,
      "",
      "Hãy trả về duy nhất JSON hợp lệ, không markdown, theo schema:",
      JSON.stringify({
        caption: `#MondayMindset #MindUp ${fanpageTag}`,
        hashtags: ["#MondayMindset", "#MindUp", fanpageTag],
        quote_en: isCountdown ? "Short English countdown quote." : "English Jon Gordon quote or Jon Gordon-inspired quote.",
        quote_vi: "Bản dịch tiếng Việt thật hay của quote.",
        quote_source: isCountdown ? "MindUp" : "Jon Gordon / Jon Gordon-inspired",
        image_prompt: "Prompt tiếng Anh để tạo ảnh Facebook 16:9 hoặc 1:1 phong cách Monday Mindset: nền xanh MindUp, logo MindUp, quote tiếng Việt lớn ở vùng trống, tên tác giả nhỏ bên dưới, typography đẹp, dễ đọc trên điện thoại.",
        internal_note: `Monday Mindset tuần ${monday.week}/${monday.year}; fanpage ${args.pageName}; offset ${monday.offset}; content ${monday.contentNumber || "countdown"}: ${monday.topic}`,
      }, null, 2),
      "",
      "Yêu cầu ảnh:",
      "- Ảnh phải tập trung vào quote tiếng Việt.",
      "- Nền xanh sáng, giáo dục, hiện đại, có logo hoặc chữ MindUp - Tư Duy Toàn Diện.",
      "- Không viết sai tiếng Việt.",
      "- Nếu có quote tiếng Anh thì chỉ để nhỏ, quote tiếng Việt là chính.",
    ].join("\n");
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
  <text x="540" y="970" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="600" fill="#e8f4ff">Ảnh fallback tự động khi Gemini Image tạm hết quota</text>
</svg>`;
  const bytes = new TextEncoder().encode(svg);
  return {
    model: "mindup-fallback-svg",
    imagePrompt: [
      args.imagePrompt,
      args.imageError ? `Fallback reason: ${args.imageError}` : "",
    ].filter(Boolean).join("\n"),
    bytes,
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
  if (cleanCaption && tagLine && cleanCaption.replace(/\s+/g, " ").trim() === tagLine) return tagLine.slice(0, 6000);
  if (cleanCaption && cleanTags.every(tag => cleanCaption.includes(tag))) return cleanCaption.slice(0, 6000);
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
    const mondayDisplayText = isMondayMindset(post.type?.name || "") && draft.quoteVi
      ? `${draft.quoteVi}${draft.quoteSource ? ` — ${draft.quoteSource}` : ""}`
      : draft.caption;
    let image;
    let imageWarning = "";
    try {
      image = await generateImage(draft.imagePrompt || textPrompt);
    } catch (imageError) {
      imageWarning = imageError instanceof Error ? imageError.message : String(imageError || "Gemini image failed");
      image = buildFallbackImage({
        pageName: post.page?.page_name || post.page_id,
        typeName: post.type?.name || "Facebook",
        caption: mondayDisplayText,
        imagePrompt: draft.imagePrompt || textPrompt,
        imageError: imageWarning,
      });
    }
    const uploaded = await uploadBytesToDrive(
      image.bytes,
      image.mimeType === "image/svg+xml" ? "mindup-facebook-ai-fallback.svg" : "mindup-facebook-ai.png",
      image.mimeType,
    );
    const finalContent = mergeCaptionAndHashtags(draft.caption, draft.hashtags);
    const finalNote = [
      draft.quoteEn ? `Quote EN: ${draft.quoteEn}` : "",
      draft.quoteVi ? `Quote VI: ${draft.quoteVi}` : "",
      draft.quoteSource ? `Nguồn: ${draft.quoteSource}` : "",
      draft.internalNote,
      imageWarning ? `Lưu ý hệ thống: Gemini tạo ảnh bị lỗi/quota, đã dùng ảnh fallback MindUp. Chi tiết: ${imageWarning}` : "",
      post.internal_note,
    ].filter(Boolean).join("\n\n").trim() || null;

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
      ai_error: imageWarning || null,
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      ok: true,
      post: rows?.[0] || null,
      image_url: uploaded.lh3Url || uploaded.url,
      image_fallback: Boolean(imageWarning),
      image_warning: imageWarning,
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
    const message = error instanceof Error ? error.message : "Gemini draft failed";
    const status = message.includes("Authentication") ? 401 : message.includes("quyền") || message.includes("giao công việc") ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
