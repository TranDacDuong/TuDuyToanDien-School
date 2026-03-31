(function () {

  function getSb() { return window.sb || sb; }

  /* ── State ── */
  let _uid           = null;
  let _questions     = [];   // mảng câu hỏi đã parse
  let _pastedImg     = null; // base64 ảnh paste vào ô trái
  let _lastSourceImg = null; // giữ lại ảnh gốc để crop hình vẽ
  let _rightImg      = null; // base64 ảnh hình vẽ ô phải

  const SUPABASE_URL = "https://lgydjaaqfxqzgbdpqvkp.supabase.co";
  const ANON_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxneWRqYWFxZnhxemdiZHBxdmtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxODY2NDQsImV4cCI6MjA4Nzc2MjY0NH0.l6ojk0fH5wYMK4H_RIGTepatUd1Uy2KHOTiRfAS1JD4";
  const EDGE_URL     = `${SUPABASE_URL}/functions/v1/ai-solution`;
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const MAX_PDF_BYTES   = 12 * 1024 * 1024;
  const ALLOWED_TYPES   = new Set(["multi_choice", "true_false", "short_answer", "essay"]);

  const TYPE_LABEL = {
    multi_choice: "Trắc nghiệm",
    true_false:   "Đúng/Sai",
    short_answer: "Trả lời ngắn",
    essay:        "Tự luận",
  };
  const TYPE_BADGE = {
    multi_choice: "badge-mc",
    true_false:   "badge-tf",
    short_answer: "badge-sa",
    essay:        "badge-essay",
  };

  function formatBytes(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getMaxBytes(kind) {
    return kind === "pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  }

  function getLimitMessage(kind, size) {
    const label = kind === "pdf" ? "PDF" : "ảnh";
    return `File ${label} quá nặng (${formatBytes(size)}). Giới hạn hiện tại là ${formatBytes(getMaxBytes(kind))}.`;
  }

  function validateFileSize(file, kind) {
    if (!file?.size) return { ok: true };
    if (file.size > getMaxBytes(kind)) {
      return { ok: false, message: getLimitMessage(kind, file.size) };
    }
    return { ok: true };
  }

  function estimateBase64Bytes(base64) {
    const clean = String(base64 || "").replace(/\s/g, "");
    if (!clean) return 0;
    const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
  }

  function getDataUrlBytes(dataUrl) {
    return estimateBase64Bytes(String(dataUrl || "").split(",")[1] || "");
  }

  function detectDataKind(dataUrl) {
    return String(dataUrl || "").startsWith("data:application/pdf") ? "pdf" : "image";
  }

  function validateDataUrlSize(dataUrl, kind) {
    const actualKind = kind || detectDataKind(dataUrl);
    const size = getDataUrlBytes(dataUrl);
    if (size > getMaxBytes(actualKind)) {
      return { ok: false, message: getLimitMessage(actualKind, size) };
    }
    return { ok: true };
  }

  async function readFileAsDataUrl(file) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target.result);
      reader.onerror = () => reject(new Error("Không đọc được file."));
      reader.readAsDataURL(file);
    });
  }

  function getMediaTypeFromDataUrl(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;]+);base64,/i);
    return match?.[1] || "image/png";
  }

  function getBase64FromDataUrl(dataUrl) {
    return String(dataUrl || "").split(",")[1] || "";
  }

  function normalizeQuestionText(text) {
    return String(text || "")
      .replace(/^\s*Câu\s*\d+\s*[:.)-]?\s*/i, "")
      .replace(/^\s*\d+\s*[:.)-]\s*/, "")
      .trim();
  }

  function normalizeLatexFractions(text) {
    return String(text || "").replace(/\\frac(?=\s*\{)/g, "\\dfrac");
  }

  function clampDifficulty(value) {
    const num = parseInt(value, 10);
    if (!Number.isFinite(num)) return 5;
    return Math.max(1, Math.min(10, num));
  }

  function normalizeAnswerCount(value, fallback) {
    const num = parseInt(value, 10);
    if (!Number.isFinite(num) || num <= 0) return fallback;
    return num;
  }

  function normalizeMultiChoiceAnswer(answer, count) {
    const letters = [...new Set((String(answer || "").toUpperCase().match(/[A-Z]/g) || []))];
    const maxIndex = letters.length
      ? Math.max(...letters.map(letter => letter.charCodeAt(0) - 64))
      : 4;
    const answerCount = Math.max(count || 4, maxIndex, 4);
    const normalizedAnswer = letters
      .map(letter => ({ letter, idx: letter.charCodeAt(0) - 64 }))
      .filter(item => item.idx >= 1 && item.idx <= answerCount)
      .sort((a, b) => a.idx - b.idx)
      .map(item => item.letter)
      .join("");
    return { answer: normalizedAnswer, answerCount };
  }

  function normalizeTrueFalseAnswer(answer, count) {
    const pairMap = new Map();
    [...String(answer || "").matchAll(/([a-z])\s*([TF])/gi)]
      .forEach(([, label, value]) => pairMap.set(label.toLowerCase(), value.toUpperCase()));
    const answerCount = Math.max(count || 4, 1);
    let normalizedAnswer = "";
    let missing = 0;
    for (let i = 0; i < answerCount; i++) {
      const label = String.fromCharCode(97 + i);
      const value = pairMap.get(label);
      if (!value) {
        missing++;
        normalizedAnswer += `${label}F`;
      } else {
        normalizedAnswer += `${label}${value}`;
      }
    }
    return { answer: normalizedAnswer, answerCount, missing };
  }

  function normalizeQuestionType(value, rawQuestion = {}) {
    const raw = String(value || "").trim().toLowerCase();
    const compact = raw.replace(/[\s\-]+/g, "_");
    const aliasMap = {
      multi_choice: "multi_choice",
      multiple_choice: "multi_choice",
      multiplechoice: "multi_choice",
      mcq: "multi_choice",
      trac_nghiem: "multi_choice",
      trắc_nghiệm: "multi_choice",
      choice: "multi_choice",
      true_false: "true_false",
      truefalse: "true_false",
      dung_sai: "true_false",
      đúng_sai: "true_false",
      short_answer: "short_answer",
      shortanswer: "short_answer",
      short: "short_answer",
      tra_loi_ngan: "short_answer",
      trả_lời_ngắn: "short_answer",
      essay: "essay",
      tu_luan: "essay",
      tự_luận: "essay",
      tl: "essay",
    };
    if (ALLOWED_TYPES.has(compact)) return compact;
    if (aliasMap[compact]) return aliasMap[compact];

    const answer = String(rawQuestion.answer || "").trim();
    const options = Array.isArray(rawQuestion.options) ? rawQuestion.options.filter(Boolean) : [];
    if (/[a-z]\s*[TF]/i.test(answer)) return "true_false";
    if (options.length && options.every(opt => /^\s*(ý|y)\s*[a-z]/i.test(String(opt)))) return "true_false";
    if (answer && !/[A-D]/i.test(answer.toUpperCase()) && options.length <= 1) return "short_answer";
    if (!answer && !options.length) return "essay";
    return "multi_choice";
  }

  function normalizeAiQuestion(rawQuestion, index) {
    if (!rawQuestion || typeof rawQuestion !== "object") {
      return { question: null, warnings: [`Câu ${index + 1} không đúng định dạng object.`] };
    }

    const warnings = [];
    const requestedType = String(rawQuestion.question_type || "").trim();
    const questionType = normalizeQuestionType(requestedType, rawQuestion);
    if (requestedType && !ALLOWED_TYPES.has(requestedType) && questionType === "multi_choice") {
      warnings.push(`Câu ${index + 1}: loại "${requestedType}" không hợp lệ, đã đổi sang trắc nghiệm.`);
    }

    const questionText = normalizeLatexFractions(
      normalizeQuestionText(rawQuestion.question_text || rawQuestion.content || rawQuestion.text)
    );
    if (!questionText) {
      return { question: null, warnings: [`Câu ${index + 1} bị bỏ qua vì thiếu nội dung.`] };
    }

    let options = Array.isArray(rawQuestion.options)
      ? rawQuestion.options.map(item => normalizeLatexFractions(String(item || "").trim())).filter(Boolean)
      : [];
    let answer = normalizeLatexFractions(String(rawQuestion.answer || "").trim());
    let answerCount = normalizeAnswerCount(
      rawQuestion.answer_count,
      questionType === "essay" ? 0 : questionType === "short_answer" ? 1 : options.length || 4
    );

    if (questionType === "multi_choice") {
      const normalized = normalizeMultiChoiceAnswer(answer, answerCount);
      answer = normalized.answer;
      answerCount = normalized.answerCount;
      options = [];
      if (!answer) {
        warnings.push(`Câu ${index + 1}: chưa xác định được đáp án A/B/C/D, vui lòng kiểm tra lại.`);
      }
    } else if (questionType === "true_false") {
      if (!options.length) {
        options = Array.from({ length: answerCount }, (_, optIndex) => `Ý ${String.fromCharCode(97 + optIndex)}`);
        warnings.push(`Câu ${index + 1}: AI chưa tạo đủ các ý a,b,c,d, mình đã tạo chỗ trống để bạn rà soát.`);
      }
      answerCount = Math.max(answerCount, options.length || 4);
      const normalized = normalizeTrueFalseAnswer(answer, answerCount);
      answer = normalized.answer;
      answerCount = normalized.answerCount;
      if (normalized.missing) {
        warnings.push(`Câu ${index + 1}: thiếu ${normalized.missing} giá trị đúng/sai, mình tạm điền "Sai" để bạn kiểm tra.`);
      }
    } else if (questionType === "short_answer") {
      answerCount = 1;
      options = [];
      if (!answer) {
        warnings.push(`Câu ${index + 1}: câu trả lời ngắn chưa có đáp án, vui lòng bổ sung trước khi lưu.`);
      }
    } else {
      answer = "";
      answerCount = 0;
      options = [];
    }

    return {
      question: {
        question_type: questionType,
        question_text: questionText,
        options,
        difficulty: clampDifficulty(rawQuestion.difficulty),
        answer,
        answer_count: answerCount,
        has_figure: rawQuestion.has_figure === true || String(rawQuestion.has_figure).toLowerCase() === "true",
        question_bbox: rawQuestion.question_bbox || null,
      },
      warnings,
    };
  }

  function extractBalancedJsonArray(raw) {
    const text = String(raw || "");
    const start = text.indexOf("[");
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }

  function extractTopLevelObjects(raw) {
    const text = String(raw || "");
    const objects = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && start >= 0) {
          objects.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
    return objects;
  }

  function parseRawAiQuestions(raw) {
    console.log("[AI raw response]:", String(raw || "").slice(0, 300));
    let parsed = [];
    try {
      const clean = String(raw || "").replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      const match = extractBalancedJsonArray(raw);
      if (match) {
        try {
          parsed = JSON.parse(match);
        } catch {
          const objs = [];
          for (const item of extractTopLevelObjects(raw)) {
            try { objs.push(JSON.parse(item)); } catch {}
          }
          if (objs.length) parsed = objs;
        }
      } else {
        const objs = extractTopLevelObjects(raw);
        if (objs.length) {
          try { parsed = objs.map(item => JSON.parse(item)); } catch {}
        }
      }
    }

    if (!Array.isArray(parsed) || !parsed.length) {
      throw new Error("AI trả về định dạng không đúng, thử lại.");
    }

    const questions = [];
    const warnings = [];
    parsed.forEach((item, index) => {
      const normalized = normalizeAiQuestion(item, index);
      if (normalized.question) questions.push(normalized.question);
      if (normalized.warnings.length) warnings.push(...normalized.warnings);
    });

    if (!questions.length) {
      throw new Error("Không tìm thấy câu hỏi hợp lệ. Thử lại với nội dung rõ ràng hơn.");
    }

    return { questions, warnings };
  }

  function buildQuestionKey(question) {
    return String(question?.question_text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\p{L}\p{N}$\\{}^_()+\-=/.,:; ]/gu, "")
      .trim()
      .slice(0, 220);
  }

  function mergeQuestionSets(chunks) {
    const seen = new Set();
    const questions = [];
    const warnings = [];
    for (const chunk of chunks) {
      if (Array.isArray(chunk?.warnings) && chunk.warnings.length) warnings.push(...chunk.warnings);
      for (const question of (chunk?.questions || [])) {
        const key = buildQuestionKey(question);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        questions.push(question);
      }
    }
    return { questions, warnings };
  }

  function dataUrlToUint8Array(dataUrl) {
    const base64 = getBase64FromDataUrl(dataUrl);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function dataUrlToBlob(dataUrl) {
    const bytes = dataUrlToUint8Array(dataUrl);
    return new Blob([bytes], { type: getMediaTypeFromDataUrl(dataUrl) || "image/png" });
  }

  async function loadRasterImage(dataUrl) {
    const src = String(dataUrl || "");
    if (!src) throw new Error("Không đọc được ảnh.");
    const blob = /^data:/i.test(src) ? dataUrlToBlob(src) : await (await fetch(src)).blob();
    if (typeof createImageBitmap === "function") {
      return await createImageBitmap(blob);
    }
    return await new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);
      const cleanup = () => URL.revokeObjectURL(objectUrl);
      img.onload = () => {
        cleanup();
        resolve(img);
      };
      img.onerror = () => {
        cleanup();
        reject(new Error("Không đọc được ảnh."));
      };
      img.src = objectUrl;
    });
  }

  function rasterWidth(img) {
    return img?.naturalWidth || img?.videoWidth || img?.width || 1;
  }

  function rasterHeight(img) {
    return img?.naturalHeight || img?.videoHeight || img?.height || 1;
  }

  async function renderPdfToPageImages(dataUrl) {
    if (!window.pdfjsLib?.getDocument) return [dataUrl];
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js";
    }
    const pdf = await window.pdfjsLib.getDocument({ data: dataUrlToUint8Array(dataUrl) }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1.9 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      pages.push(canvas.toDataURL("image/png"));
    }
    return pages;
  }

  async function stitchImagesVertically(dataUrls) {
    if (!Array.isArray(dataUrls) || !dataUrls.length) return null;
    if (dataUrls.length === 1) return dataUrls[0];
    const images = [];
    for (const dataUrl of dataUrls) {
      images.push(await loadRasterImage(dataUrl));
    }
    const maxWidth = Math.max(...images.map(img => rasterWidth(img)));
    const gap = 24;
    const scaledHeights = images.map(img => Math.max(1, Math.round(rasterHeight(img) * (maxWidth / rasterWidth(img)))));
    const totalHeight = scaledHeights.reduce((sum, h) => sum + h, 0) + gap * (images.length - 1);
    const canvas = document.createElement("canvas");
    canvas.width = maxWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let y = 0;
    images.forEach((img, index) => {
      const drawHeight = scaledHeights[index];
      ctx.drawImage(img, 0, y, maxWidth, drawHeight);
      y += drawHeight;
      if (index < images.length - 1) {
        ctx.fillStyle = "#f5f5f5";
        ctx.fillRect(0, y, maxWidth, gap);
        y += gap;
      }
    });
    return canvas.toDataURL("image/png");
  }

  async function loadImage(dataUrl) {
    const src = String(dataUrl || "");
    if (!src) throw new Error("Không đọc được ảnh.");
    return await new Promise(async (resolve, reject) => {
      const img = new Image();
      let objectUrl = null;
      const cleanup = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
      img.onload = () => {
        cleanup();
        resolve(img);
      };
      img.onerror = () => reject(new Error("Không đọc được ảnh."));
      img.src = dataUrl;
    });
  }

  async function loadImageSafe(dataUrl) {
    try {
      return await loadImage(dataUrl);
    } catch {
      const src = String(dataUrl || "");
      if (!/^data:/i.test(src)) throw new Error("Không đọc được ảnh.");
      const blob = dataUrlToBlob(src);
      return await new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(blob);
        const cleanup = () => URL.revokeObjectURL(objectUrl);
        img.onload = () => {
          cleanup();
          resolve(img);
        };
        img.onerror = () => {
          cleanup();
          reject(new Error("Không đọc được ảnh."));
        };
        img.src = objectUrl;
      });
    }
  }

  async function splitTallImageIntoChunks(dataUrl) {
    const img = await loadRasterImage(dataUrl);
    const maxChunkHeight = 1700;
    const overlap = 180;
    const imgWidth = rasterWidth(img);
    const imgHeight = rasterHeight(img);
    if (imgHeight <= maxChunkHeight * 1.15) return [dataUrl];
    const chunks = [];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    let startY = 0;
    while (startY < imgHeight) {
      const chunkHeight = Math.min(maxChunkHeight, imgHeight - startY);
      canvas.width = imgWidth;
      canvas.height = chunkHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, startY, imgWidth, chunkHeight, 0, 0, imgWidth, chunkHeight);
      chunks.push(canvas.toDataURL("image/png"));
      if (startY + chunkHeight >= imgHeight) break;
      startY += Math.max(1, chunkHeight - overlap);
    }
    return chunks;
  }

  async function extractQuestionsFromImageChunks(dataUrls, sourceKind) {
    const chunks = [];
    for (let i = 0; i < dataUrls.length; i++) {
      const raw = await callAI(buildAiMessages("", dataUrls[i], sourceKind));
      const parsed = parseRawAiQuestions(raw);
      chunks.push(parsed);
    }
    return mergeQuestionSets(chunks);
  }

  function buildAiMessages(text, dataUrl, sourceKind = null) {
    const parts = [];
    const kind = sourceKind || detectDataKind(dataUrl);
    if (dataUrl) {
      const validation = validateDataUrlSize(dataUrl);
      if (!validation.ok) throw new Error(validation.message);
      parts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: getMediaTypeFromDataUrl(dataUrl),
          data: getBase64FromDataUrl(dataUrl),
        },
      });
    }
    parts.push({ type: "text", text: `${text || ""}\n\n${buildExtractionPrompt(kind)}` });
    return [{ role: "user", content: parts }];
  }

  async function convertAiSourceToQuestions({ text = "", dataUrl = null } = {}) {
    if (!String(text || "").trim() && !dataUrl) {
      throw new Error("Vui lòng nhập nội dung hoặc chọn ảnh/PDF trước.");
    }
    const cleanText = String(text || "").trim();
    const sourceKind = detectDataKind(dataUrl);
    if (sourceKind === "pdf" && dataUrl) {
      const pageImages = await renderPdfToPageImages(dataUrl);
      const pageChunks = [];
      for (const pageImage of pageImages) {
        const imageChunks = await splitTallImageIntoChunks(pageImage);
        const parsedPage = await extractQuestionsFromImageChunks(imageChunks, "image");
        pageChunks.push(parsedPage);
      }
      const parsedPdf = mergeQuestionSets(pageChunks);
      if (parsedPdf.questions.length) return { ...parsedPdf, raw: "[pdf-pages-as-images]" };
    }
    if (sourceKind === "image" && dataUrl && !cleanText) {
      const imageChunks = await splitTallImageIntoChunks(dataUrl);
      if (imageChunks.length > 1) {
        const parsedChunks = await extractQuestionsFromImageChunks(imageChunks, "image");
        if (parsedChunks.questions.length > 1) return { ...parsedChunks, raw: "[image-chunks]" };
      }
    }
    const raw = await callAI(buildAiMessages(cleanText, dataUrl, sourceKind));
    let parsed = parseRawAiQuestions(raw);
    if (sourceKind === "pdf" && parsed.questions.length <= 1) {
      const retryRaw = await callAI(buildAiMessages(cleanText, dataUrl, "pdf_retry"));
      const retryParsed = parseRawAiQuestions(retryRaw);
      if (retryParsed.questions.length > parsed.questions.length) {
        parsed = retryParsed;
        return { ...parsed, raw: retryRaw };
      }
    }
    return { ...parsed, raw };
  }

  /* ══════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════ */
  async function init() {
    const sb = getSb();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.href = "index.html"; return; }
    _uid = user.id;

    await loadFilters();
    setupImageHandlers();
    setupPdfHandler();
    setupPasteHandler();

    // Difficulty options
    const diff = document.getElementById("aiDifficulty");
    for (let i = 1; i <= 10; i++) diff.appendChild(new Option("Độ khó " + i, i));
  }

  /* ── Load khối / môn / chương ── */
  async function loadFilters() {
    const sb = getSb();
    const { data: grades } = await sb.from("grades").select("*").order("name");
    const gradeEl = document.getElementById("aiGrade");
    (grades||[]).forEach(g => gradeEl.appendChild(new Option(g.name, g.id)));

    gradeEl.onchange = async () => {
      const subjEl = document.getElementById("aiSubject");
      const chapEl = document.getElementById("aiChapter");
      subjEl.innerHTML = '<option value="">Chọn môn</option>';
      chapEl.innerHTML = '<option value="">Chọn chương</option>';
      if (!gradeEl.value) return;
      const { data } = await sb.from("subjects").select("*").eq("grade_id", gradeEl.value).order("name");
      (data||[]).forEach(s => subjEl.appendChild(new Option(s.name, s.id)));
    };

    document.getElementById("aiSubject").onchange = async () => {
      const chapEl = document.getElementById("aiChapter");
      chapEl.innerHTML = '<option value="">Chọn chương</option>';
      const subjVal = document.getElementById("aiSubject").value;
      if (!subjVal) return;
      const { data } = await sb.from("chapters").select("*").eq("subject_id", subjVal).order("name");
      (data||[]).forEach(c => chapEl.appendChild(new Option(c.name, c.id)));
    };
  }

  /* ══════════════════════════════════════════════
     ẢNH HANDLERS
  ══════════════════════════════════════════════ */
  function setupImageHandlers() {
    const clear = document.getElementById("aiImgClear");
    clear.onclick = e => { e.stopPropagation(); clearRightImg(); };
  }

  function showRightImg(src) {
    const drop = document.getElementById("aiImgDrop");
    drop.querySelector(".drop-hint").style.display = "none";
    let img = drop.querySelector("img");
    if (!img) { img = document.createElement("img"); drop.insertBefore(img, drop.lastChild); }
    img.src = src;
  }

  function clearRightImg() {
    _rightImg = null;
    const drop = document.getElementById("aiImgDrop");
    drop.querySelector(".drop-hint").style.display = "";
    const img = drop.querySelector("img");
    if (img) img.remove();
  }

  /* ── Paste handler ── */
  function setupPasteHandler() {
    document.addEventListener("paste", e => {
      if (document.getElementById("modal")?.style.display === "flex") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          const validation = validateFileSize(file, "image");
          if (!validation.ok) {
            alert(validation.message);
            const hint = document.getElementById("convertHint");
            if (hint) {
              hint.textContent = validation.message;
              hint.style.color = "var(--red,#ef4444)";
            }
            e.preventDefault();
            break;
          }
          const reader = new FileReader();

          const focused = document.activeElement;
          const rightZone = document.getElementById("aiImgDrop");
          const isRightFocused = rightZone?.matches(":focus") || rightZone?.contains(focused);

          reader.onload = ev => {
            if (isRightFocused) {
              _rightImg = ev.target.result;
              showRightImg(_rightImg);
            } else {
              _pastedImg = ev.target.result;
              document.getElementById("aiTextInput").placeholder = "✅ Đã paste ảnh — bấm Chuyển đổi để AI nhận diện";
              document.getElementById("convertHint").textContent = "Đã có ảnh, bấm Chuyển đổi";
              document.getElementById("convertHint").style.color = "var(--green)";
            }
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          break;
        }
      }
    });

    const rightZone = document.getElementById("aiImgDrop");
    if (rightZone) {
      rightZone.tabIndex = 0;
      rightZone.style.outline = "none";
      rightZone.addEventListener("focus", () => rightZone.style.borderColor = "var(--gold)");
      rightZone.addEventListener("blur",  () => rightZone.style.borderColor = "");
    }
  }

  /* ══════════════════════════════════════════════
     PDF HANDLER
  ══════════════════════════════════════════════ */
  function setupPdfHandler() {
    document.getElementById("aiPdfFile").onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      await processPdf(file);
      e.target.value = "";
    };
  }

  async function processPdf(file) {
    const validation = validateFileSize(file, "pdf");
    if (!validation.ok) {
      alert(validation.message);
      return;
    }

    setProgress(0, "Đang đọc PDF...");
    const dataUrl = await readFileAsDataUrl(file);
    setProgress(20, "Đang gửi PDF lên AI...");

    try {
      setProgress(40, "AI đang phân tích PDF...");
      const result = await convertAiSourceToQuestions({ dataUrl });
      setProgress(80, "Đang xử lý kết quả...");
      appendQuestions(result.questions, result.warnings);
      setProgress(100, "Hoàn thành!");
      setTimeout(() => hideProgress(), 1000);
    } catch (err) {
      hideProgress();
      alert("Lỗi: " + err.message);
    }
  }

  /* ══════════════════════════════════════════════
     CONVERT WITH AI
  ══════════════════════════════════════════════ */
  window.convertWithAI = async function () {
    const text = document.getElementById("aiTextInput").value.trim();
    if (!text && !_pastedImg) {
      alert("Vui lòng nhập nội dung hoặc paste ảnh câu hỏi!"); return;
    }

    const btn = document.getElementById("convertBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spin">⟳</span> Đang phân tích...';
    setProgress(20, "Đang gửi lên AI...");

    try {
      _lastSourceImg = _pastedImg; // lưu trước khi gọi AI để crop sau
      setProgress(50, "AI đang phân tích...");
      const result = await convertAiSourceToQuestions({ text, dataUrl: _pastedImg });
      setProgress(90, "Đang xử lý...");
      appendQuestions(result.questions, result.warnings);
      setProgress(100, "Hoàn thành!");
      setTimeout(() => hideProgress(), 800);

      document.getElementById("aiTextInput").value = "";
      _pastedImg = null;
      document.getElementById("aiTextInput").placeholder = "Paste nội dung câu hỏi vào đây...";

    } catch (err) {
      hideProgress();
      alert("Lỗi: " + err.message);
    }

    btn.disabled = false;
    btn.innerHTML = "✨ Chuyển đổi với AI";
  };

  function buildExtractionPrompt(sourceKind = "image") {
    return `Trích xuất TẤT CẢ câu hỏi từ ảnh này. Trả về JSON array (không markdown, không backtick):

[
  {
    "question_type": "multi_choice | true_false | short_answer | essay",
    "question_text": "Nội dung câu hỏi, KHÔNG có Câu 1, Câu 2. Với multi_choice: gộp câu hỏi + A,B,C,D vào đây mỗi phương án 1 dòng. Với true_false: chỉ ghi nội dung câu hỏi chính. Công thức dùng LaTeX: $x^2$",
    "options": ["Ý a (chỉ dùng cho true_false)", "Ý b", "Ý c", "Ý d"],
    "difficulty": 5,
    "answer": "multi_choice: A/B/C/D. true_false: PHẢI điền đủ 4 cặp ví dụ aTbFcTdF (a đúng b sai c đúng d sai). short_answer: đáp án",
    "answer_count": 4,
    "has_figure": false,
    "question_bbox": { "x": 0, "y": 0, "w": 800, "h": 200 }
  }
]

QUY TẮC QUAN TRỌNG:
- Bỏ hoàn toàn Câu 1, Câu 2, số thứ tự
- true_false: 1 câu = 1 object DUY NHẤT, các ý a,b,c,d để trong options, KHÔNG tách thành nhiều object
- true_false answer: PHẢI điền đủ, ví dụ "aTbFcTdF" — 4 ý thì 4 cặp chữ
- multi_choice: gộp A,B,C,D vào question_text, để options là []
- difficulty: 1-3 dễ, 4-6 trung bình, 7-10 khó
- has_figure = true chỉ khi có hình vẽ/biểu đồ/đồ thị thực sự
- question_bbox: tọa độ pixel của toàn bộ câu hỏi trong ảnh
- Chỉ trả về JSON, không text thêm`;
  }

  /* ── Crop hình vẽ từ ảnh gốc theo tọa độ pixel ── */
  function buildExtractionPrompt(sourceKind = "image") {
    const isPdf = sourceKind === "pdf" || sourceKind === "pdf_retry";
    const intro = isPdf
      ? "Trích xuất TẤT CẢ câu hỏi từ TOÀN BỘ file PDF này, gồm mọi trang theo đúng thứ tự từ trên xuống dưới."
      : "Trích xuất TẤT CẢ câu hỏi từ ảnh này.";
    const pdfRules = isPdf ? `
- PDF có thể nhiều trang: phải đọc toàn bộ từ trang 1 đến trang cuối
- Không được chỉ lấy câu đầu tiên
- Mỗi câu hỏi là 1 object riêng
- Nếu có nhiều câu thì phải trả về mảng nhiều object theo đúng thứ tự` : "";
    const retryRules = sourceKind === "pdf_retry" ? `
- Đây là lần thử lại vì kết quả trước bị thiếu câu
- Kiểm tra lại từ đầu đến cuối và chỉ dừng khi đã liệt kê hết câu nhận diện được` : "";
    return `${intro} Trả về JSON array (không markdown, không backtick):

[
  {
    "question_type": "multi_choice | true_false | short_answer | essay",
    "question_text": "Nội dung câu hỏi, KHÔNG có Câu 1, Câu 2. Với multi_choice: gộp câu hỏi + A,B,C,D vào đây mỗi phương án 1 dòng. Với true_false: chỉ ghi nội dung câu hỏi chính. Công thức dùng LaTeX: $x^2$",
    "options": ["Ý a (chỉ dùng cho true_false)", "Ý b", "Ý c", "Ý d"],
    "difficulty": 5,
    "answer": "multi_choice: A/B/C/D. true_false: PHẢI điền đủ 4 cặp ví dụ aTbFcTdF (a đúng b sai c đúng d sai). short_answer: đáp án",
    "answer_count": 4,
    "has_figure": false,
    "question_bbox": { "x": 0, "y": 0, "w": 800, "h": 200 }
  }
]

QUY TẮC QUAN TRỌNG:
- Bỏ hoàn toàn Câu 1, Câu 2, số thứ tự
- true_false: 1 câu = 1 object DUY NHẤT, các ý a,b,c,d để trong options, KHÔNG tách thành nhiều object
- true_false answer: PHẢI điền đủ, ví dụ "aTbFcTdF" - 4 ý thì 4 cặp chữ
- multi_choice: gộp A,B,C,D vào question_text, để options là []
- difficulty: 1-3 dễ, 4-6 trung bình, 7-10 khó
- has_figure = true chỉ khi có hình vẽ/biểu đồ/đồ thị thực sự
- question_bbox: tọa độ pixel của toàn bộ câu hỏi trong ảnh
- Không được dừng sau câu đầu tiên nếu còn câu khác${pdfRules}${retryRules}
- Chỉ trả về JSON, không text thêm`;
  }

  function cropFigure(srcDataUrl, bbox) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const W = img.naturalWidth;
        const H = img.naturalHeight;

        // bbox là pixel — thêm padding 20px mỗi phía
        const PAD = 20;
        const x  = Math.max(0, bbox.x - PAD);
        const y  = Math.max(0, bbox.y - PAD);
        const x2 = Math.min(W, bbox.x + bbox.w + PAD);
        const y2 = Math.min(H, bbox.y + bbox.h + PAD);
        const w  = x2 - x;
        const h  = y2 - y;

        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(w);
        canvas.height = Math.round(h);
        canvas.getContext("2d").drawImage(img, x, y, w, h, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => resolve(null);
      img.src = srcDataUrl;
    });
  }

  async function callAI(messages) {
    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ messages }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Lỗi AI");
    return data.content?.[0]?.text || data.content?.map(c=>c.text||"").join("") || "";
  }

  /* ══════════════════════════════════════════════
     PARSE & RENDER
  ══════════════════════════════════════════════ */
  function appendQuestions(parsed, warnings = []) {
    // Không tự crop — chỉ đánh dấu câu có hình vẽ để giáo viên biết
    // Giáo viên tự Ctrl+V ảnh vào ô phải

    // Nếu giáo viên đã paste ảnh vào ô phải thủ công → gắn vào câu đầu
    if (_rightImg && parsed.length > 0 && !parsed[0]._rightImg) {
      parsed[0]._rightImg = _rightImg;
      clearRightImg();
    }

    const startIdx = _questions.length;
    _questions.push(...parsed);

    const section = document.getElementById("questionsSection");
    section.style.display = "";
    document.getElementById("qSectionTitle").textContent = `${_questions.length} câu hỏi`;

    parsed.forEach((q, i) => renderQuestionCard(q, startIdx + i));
    triggerMath();

    if (warnings.length) {
      console.warn("[AI validation warnings]", warnings);
      showToast(`AI đã chuẩn hóa ${warnings.length} chi tiết. Hãy rà soát lại trước khi lưu.`);
    }
  }

  function renderQuestionCard(q, idx) {
    const list = document.getElementById("questionsList");
    const type = q.question_type || "multi_choice";

    const card = document.createElement("div");
    card.className = "qcard";
    card.id = "qcard_" + idx;

    const hd = document.createElement("div");
    hd.className = "qcard-hd";
    hd.innerHTML = `
      <div class="qcard-num">${idx + 1}</div>
      <span class="qcard-type-badge ${TYPE_BADGE[type]||"badge-mc"}">${TYPE_LABEL[type]||type}</span>
      <select class="field-select" style="width:auto;flex-shrink:0;font-size:.8rem"
        onchange="changeQuestionType(${idx},this.value)">
        <option value="multi_choice" ${type==="multi_choice"?"selected":""}>Trắc nghiệm</option>
        <option value="true_false"   ${type==="true_false"?"selected":""}>Đúng/Sai</option>
        <option value="short_answer" ${type==="short_answer"?"selected":""}>Trả lời ngắn</option>
        <option value="essay"        ${type==="essay"?"selected":""}>Tự luận</option>
      </select>
      <select class="field-select" style="width:100px;flex-shrink:0;font-size:.8rem" id="diff_${idx}">
        ${[...Array(10)].map((_,i)=>`<option value="${i+1}" ${q.difficulty==i+1?"selected":""}>Độ khó ${i+1}</option>`).join("")}
      </select>
      <button class="qcard-del" onclick="deleteQuestion(${idx})" title="Xóa câu này">🗑</button>
      ${q.has_figure ? '<span style="font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:10px;background:#fef3c7;color:#b45309">⚠ Có hình vẽ — cần paste ảnh</span>' : ""}`;
    card.appendChild(hd);

    const body = document.createElement("div");
    body.className = "qcard-body";

    const left = document.createElement("div");
    left.className = "qcard-left";
    left.innerHTML = `
      <div>
        <label class="field-label">Nội dung câu hỏi</label>
        <textarea class="field-input" rows="3" id="qtext_${idx}"
          oninput="updateQuestion(${idx},'question_text',this.value);updatePreview(${idx})"
        >${escHtml(q.question_text||"")}</textarea>
        <div class="math-preview" id="preview_${idx}" style="margin-top:6px;white-space:pre-line">${q.question_text||""}</div>
      </div>`;

    const ansDiv = document.createElement("div");
    ansDiv.id = "ansarea_" + idx;
    renderAnswerArea(ansDiv, q, idx);
    left.appendChild(ansDiv);

    const right = document.createElement("div");
    right.className = "qcard-right";
    const rightImgSrc = q._rightImg || q.question_img || null;
    right.innerHTML = `
      <label class="field-label">🖼 Hình vẽ 
        <span style="font-weight:400;font-size:.7rem;color:var(--ink-light)">(Ctrl+V)</span>
        ${rightImgSrc?`<button onclick="startCropMode(${idx})" id="cropBtn_${idx}"
          style="margin-left:6px;padding:2px 8px;font-size:.7rem;border:1px solid var(--gold);
          border-radius:5px;background:var(--gold-pale);color:var(--navy);cursor:pointer;font-weight:600">
          ✂ Cắt lại</button>`:""}
      </label>
      <div class="img-drop-zone" id="rdrop_${idx}" style="min-height:120px;flex:1;cursor:default;position:relative" tabindex="0"
        onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor=''">
        <div class="drop-hint" ${rightImgSrc?"style='display:none'":""}>Ctrl+V để paste<br>hình vẽ</div>
        ${rightImgSrc?`<img src="${rightImgSrc}" id="rimg_${idx}" style="width:100%;height:100%;object-fit:contain;padding:6px;display:block">`:""}
        <button class="clear-img" onclick="clearCardImg(event,${idx})">✕</button>
        <canvas id="rcropcanvas_${idx}" style="display:none;position:absolute;inset:0;width:100%;height:100%;cursor:crosshair"></canvas>
      </div>`;

    body.appendChild(left);
    body.appendChild(right);
    card.appendChild(body);

    const rdrop = document.getElementById("rdrop_" + idx) || right.querySelector(".img-drop-zone");
    if (rdrop) {
      rdrop.addEventListener("paste", e => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = ev => {
              if (_questions[idx]) _questions[idx]._rightImg = ev.target.result;
              rdrop.querySelector(".drop-hint").style.display = "none";
              let img = rdrop.querySelector("img");
              if (!img) {
                img = document.createElement("img");
                img.id = "rimg_" + idx;
                img.style.cssText = "width:100%;height:100%;object-fit:contain;padding:6px;display:block";
                rdrop.insertBefore(img, rdrop.lastChild);
              }
              img.src = ev.target.result;
              // Thêm nút Cắt lại nếu chưa có
              const label = rdrop.closest(".qcard-right")?.querySelector(".field-label");
              if (label && !label.querySelector("#cropBtn_"+idx)) {
                const btn = document.createElement("button");
                btn.id = "cropBtn_" + idx;
                btn.innerHTML = "✂ Cắt lại";
                btn.style.cssText = "margin-left:6px;padding:2px 8px;font-size:.7rem;border:1px solid var(--gold);border-radius:5px;background:var(--gold-pale);color:var(--navy);cursor:pointer;font-weight:600";
                btn.onclick = () => window.startCropMode(idx);
                label.appendChild(btn);
              }
            };
            reader.readAsDataURL(item.getAsFile());
            e.preventDefault(); break;
          }
        }
      });
    }

    list.appendChild(card);
  }

  function renderAnswerArea(container, q, idx) {
    const type   = q.question_type || "multi_choice";
    const answer = q.answer || "";

    if (type === "multi_choice") {
      const n = q.answer_count || 4;
      let html = '<label class="field-label">Đáp án đúng <span style="font-weight:400;text-transform:none;font-size:.75rem;color:var(--ink-light)">(nội dung A,B,C,D đã có trong câu hỏi)</span></label><div class="answer-grid">';
      for (let i = 0; i < n; i++) {
        const letter  = String.fromCharCode(65 + i);
        const correct = answer.toUpperCase().includes(letter);
        html += `<div class="answer-row ${correct?"correct":""}" id="arow_${idx}_${i}">
          <div class="ans-label">${letter}</div>
          <input type="checkbox" title="Đáp án đúng" ${correct?"checked":""}
            onchange="updateCorrectMC(${idx},${i},this.checked)">
        </div>`;
      }
      html += "</div>";
      container.innerHTML = html;

    } else if (type === "true_false") {
      const n = q.answer_count || 4;
      let html = '<label class="field-label">Đúng/Sai <span style="font-weight:400;text-transform:none;font-size:.75rem;color:var(--ink-light)">(nội dung a,b,c,d đã có trong câu hỏi)</span></label><div class="answer-grid">';
      for (let i = 0; i < n; i++) {
        const lbl    = String.fromCharCode(97 + i);
        const isTrue = answer.includes(lbl + "T");
        html += `<div class="tf-row">
          <div class="ans-label" style="width:22px;text-align:center;font-size:.8rem;font-weight:700;color:var(--ink-mid)">${lbl})</div>
          <label class="tf-true"><input type="radio" name="tf_${idx}_${i}" value="T" ${isTrue?"checked":""} onchange="updateTF(${idx})"> Đúng</label>
          <label class="tf-false"><input type="radio" name="tf_${idx}_${i}" value="F" ${!isTrue?"checked":""} onchange="updateTF(${idx})"> Sai</label>
        </div>`;
      }
      html += "</div>";
      container.innerHTML = html;

    } else if (type === "short_answer") {
      container.innerHTML = `<label class="field-label">Đáp án đúng</label>
        <input type="text" class="field-input" value="${escHtml(answer)}"
          oninput="updateQuestion(${idx},'answer',this.value)"
          placeholder="Đáp án...">`;

    } else if (type === "essay") {
      container.innerHTML = `<label class="field-label" style="color:var(--ink-light)">Tự luận — giáo viên chấm thủ công</label>
        <div style="font-size:.8rem;color:var(--ink-light);padding:8px 10px;background:var(--surface);border-radius:8px">
          Không cần nhập đáp án cho câu tự luận
        </div>`;
    }
  }

  window.updateQuestion   = (idx,f,v) => { if (_questions[idx]) _questions[idx][f]=v; };
  window.updatePreview    = (idx) => {
    const el = document.getElementById("preview_"+idx); if(!el) return;
    el.textContent = document.getElementById("qtext_"+idx)?.value||"";
    if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([el]).catch(()=>{});
  };
  window.updateOption     = (idx,i,v) => { if(!_questions[idx]) return; if(!_questions[idx].options) _questions[idx].options=[]; _questions[idx].options[i]=v; };
  window.updateCorrectMC  = (idx,i,checked) => {
    if (!_questions[idx]) return;
    const l = String.fromCharCode(65+i);
    let a = (_questions[idx].answer||"").toUpperCase();
    a = checked ? (a.includes(l)?a:a+l) : a.replace(l,"");
    _questions[idx].answer = a;
    const row = document.getElementById("arow_"+idx+"_"+i);
    if (row) row.className = "answer-row"+(checked?" correct":"");
  };
  window.updateTF = (idx) => {
    if (!_questions[idx]) return;
    const n = _questions[idx].answer_count||4;
    let ans = "";
    for (let i=0;i<n;i++) {
      const lbl = String.fromCharCode(97+i);
      const val = document.querySelector(`input[name="tf_${idx}_${i}"]:checked`)?.value;
      if (val) ans += lbl+val;
    }
    _questions[idx].answer = ans;
  };
  window.changeQuestionType = (idx,t) => {
    if (!_questions[idx]) return;
    _questions[idx].question_type = t;
    const area = document.getElementById("ansarea_"+idx);
    if (area) renderAnswerArea(area, _questions[idx], idx);
    const card = document.getElementById("qcard_"+idx);
    if (card) {
      const badge = card.querySelector(".qcard-type-badge");
      if (badge) { badge.className="qcard-type-badge "+(TYPE_BADGE[t]||"badge-mc"); badge.textContent=TYPE_LABEL[t]||t; }
    }
  };
  window.deleteQuestion = (idx) => {
    _questions[idx] = null;
    document.getElementById("qcard_"+idx)?.remove();
    document.getElementById("qSectionTitle").textContent = _questions.filter(q=>q!==null).length+" câu hỏi";
  };
  window.clearCardImg = (e,idx) => {
    e.stopPropagation();
    if (_questions[idx]) { delete _questions[idx]._rightImg; delete _questions[idx].question_img; }
    const drop = document.getElementById("rdrop_"+idx);
    if (drop) { drop.querySelector(".drop-hint").style.display=""; const img=drop.querySelector("img"); if(img) img.remove(); }
    const canvas = document.getElementById("rcropcanvas_"+idx); if (canvas) canvas.style.display="none";
    const btn = document.getElementById("cropBtn_"+idx); if (btn) btn.remove();
  };

  /* ── Crop mode: kéo 4 góc để cắt ảnh ── */
  window.startCropMode = function(idx) {
    const drop   = document.getElementById("rdrop_" + idx);
    const img    = document.getElementById("rimg_" + idx);
    const canvas = document.getElementById("rcropcanvas_" + idx);
    if (!drop || !img || !canvas) return;

    const rect = drop.getBoundingClientRect();
    canvas.width  = rect.width;
    canvas.height = rect.height;
    canvas.style.display = "block";
    canvas.style.cursor  = "default";

    const ctx = canvas.getContext("2d");
    const tmpImg = new Image();
    const HANDLE = 16;
    let crop = { x: 0, y: 0, x2: canvas.width, y2: canvas.height };
    let dragging = null;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Ảnh mờ toàn vùng
      ctx.globalAlpha = 0.3;
      ctx.drawImage(tmpImg, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      // Vùng được giữ rõ
      const { x, y, x2, y2 } = crop;
      const sw = x2-x, sh = y2-y;
      ctx.drawImage(tmpImg,
        x/canvas.width*tmpImg.naturalWidth, y/canvas.height*tmpImg.naturalHeight,
        sw/canvas.width*tmpImg.naturalWidth, sh/canvas.height*tmpImg.naturalHeight,
        x, y, sw, sh
      );
      // Viền
      ctx.strokeStyle = "#c8962a"; ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.strokeRect(x, y, sw, sh);
      // 4 handle góc màu vàng
      ctx.fillStyle = "#c8962a";
      [ [x, y], [x2-HANDLE, y], [x, y2-HANDLE], [x2-HANDLE, y2-HANDLE] ]
        .forEach(([hx,hy]) => ctx.fillRect(hx, hy, HANDLE, HANDLE));
    }

    tmpImg.onload = () => { crop = { x:0, y:0, x2:canvas.width, y2:canvas.height }; draw(); };
    tmpImg.src = img.src;

    function getPos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function hitHandle(px, py) {
      const { x, y, x2, y2 } = crop;
      if (px>=x&&px<=x+HANDLE&&py>=y&&py<=y+HANDLE)       return "tl";
      if (px>=x2-HANDLE&&px<=x2&&py>=y&&py<=y+HANDLE)     return "tr";
      if (px>=x&&px<=x+HANDLE&&py>=y2-HANDLE&&py<=y2)     return "bl";
      if (px>=x2-HANDLE&&px<=x2&&py>=y2-HANDLE&&py<=y2)   return "br";
      return null;
    }

    canvas.onmousedown = e => { dragging = hitHandle(getPos(e).x, getPos(e).y); };
    canvas.onmousemove = e => {
      const p = getPos(e);
      canvas.style.cursor = hitHandle(p.x, p.y) ? "pointer" : "default";
      if (!dragging) return;
      const MIN = 20;
      if (dragging==="tl") { crop.x=Math.max(0,Math.min(p.x,crop.x2-MIN)); crop.y=Math.max(0,Math.min(p.y,crop.y2-MIN)); }
      if (dragging==="tr") { crop.x2=Math.min(canvas.width,Math.max(p.x,crop.x+MIN)); crop.y=Math.max(0,Math.min(p.y,crop.y2-MIN)); }
      if (dragging==="bl") { crop.x=Math.max(0,Math.min(p.x,crop.x2-MIN)); crop.y2=Math.min(canvas.height,Math.max(p.y,crop.y+MIN)); }
      if (dragging==="br") { crop.x2=Math.min(canvas.width,Math.max(p.x,crop.x+MIN)); crop.y2=Math.min(canvas.height,Math.max(p.y,crop.y+MIN)); }
      draw();
    };
    canvas.onmouseup = () => { dragging = null; };

    // Nút xác nhận
    let confirmBtn = document.getElementById("cropConfirm_" + idx);
    if (!confirmBtn) {
      confirmBtn = document.createElement("button");
      confirmBtn.id = "cropConfirm_" + idx;
      confirmBtn.innerHTML = "✓ Xong";
      confirmBtn.style.cssText = "position:absolute;bottom:6px;right:6px;z-index:20;padding:5px 14px;font-size:.8rem;font-weight:700;border:none;border-radius:7px;background:#c8962a;color:#fff;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.2)";
      drop.appendChild(confirmBtn);
    }
    confirmBtn.style.display = "block";
    confirmBtn.onclick = () => {
      const { x, y, x2, y2 } = crop;
      const sw=x2-x, sh=y2-y;
      if (sw<10||sh<10) return;
      const scaleX = tmpImg.naturalWidth/canvas.width;
      const scaleY = tmpImg.naturalHeight/canvas.height;
      const out = document.createElement("canvas");
      out.width  = Math.round(sw*scaleX);
      out.height = Math.round(sh*scaleY);
      // Vẽ lại từ src gốc để tránh ảnh đen
      const freshImg = new Image();
      freshImg.onload = () => {
        out.getContext("2d").drawImage(freshImg, x*scaleX, y*scaleY, sw*scaleX, sh*scaleY, 0, 0, out.width, out.height);
        const newSrc = out.toDataURL("image/jpeg", 0.92);
        if (_questions[idx]) _questions[idx]._rightImg = newSrc;
        img.src = newSrc;
        canvas.style.display = "none";
        confirmBtn.style.display = "none";
        canvas.onmousedown = canvas.onmousemove = canvas.onmouseup = null;
      };
      freshImg.src = tmpImg.src;
    };
  };

  function setProgress(pct, text) {
    document.getElementById("progressWrap").style.display = "";
    document.getElementById("progressText").style.display = "";
    document.getElementById("progressFill").style.width = pct + "%";
    document.getElementById("progressText").textContent = text;
  }
  function hideProgress() {
    document.getElementById("progressWrap").style.display = "none";
    document.getElementById("progressText").style.display = "none";
    document.getElementById("progressFill").style.width = "0%";
  }
  function triggerMath() {
    if (window.MathJax?.typesetPromise)
      window.MathJax.typesetPromise([document.getElementById("questionsList")]).catch(()=>{});
  }
  function showToast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity="0"; setTimeout(()=>t.remove(),300); }, 2500);
  }
  function escHtml(s) {
    return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  window.QuestionAIShared = {
    MAX_IMAGE_BYTES,
    MAX_PDF_BYTES,
    validateFileSize,
    validateDataUrlSize,
    readFileAsDataUrl,
    convertToQuestions: convertAiSourceToQuestions,
  };

  /* ══════════════════════════════════════════════
     LƯU TẤT CẢ
  ══════════════════════════════════════════════ */
  window.saveAllQuestions = async function() {
    const sb        = getSb();
    const chapterId = document.getElementById("aiChapter").value;
    const difficulty = document.getElementById("aiDifficulty").value;

    if (!chapterId) { alert("Vui lòng chọn Chương trước khi lưu!"); return; }

    const toSave = _questions.filter(q => q !== null && (q.question_text || q._rightImg));
    if (!toSave.length) { alert("Không có câu hỏi nào để lưu!"); return; }

    const btn = document.getElementById("saveAllBtn");
    btn.disabled = true; btn.textContent = "Đang lưu...";

    let saved = 0, errors = 0;

    for (let i = 0; i < _questions.length; i++) {
      const q = _questions[i]; if (!q) continue;

      let figureUrl = null;
      const imgData = q._rightImg || q.question_img;
      if (imgData && imgData.startsWith("data:")) {
        figureUrl = await uploadImage(imgData, `figure_${Date.now()}_${i}.jpg`);
      } else if (imgData) {
        figureUrl = imgData;
      }

      const diff = document.getElementById("diff_"+i)?.value || difficulty || null;
      const dataObj = {
        chapter_id:    chapterId,
        question_type: q.question_type || "multi_choice",
        difficulty:    diff ? parseInt(diff) : null,
        question_text: document.getElementById("qtext_"+i)?.value?.trim() || q.question_text || null,
        question_img:  figureUrl || null,
        answer:        q.answer || null,
        answer_count:  q.answer_count || (q.options?.length) || 4,
        answer_text:   null,
        answer_img:    null,
        created_by:    _uid,
        hidden:        false,
      };

      const { error } = await sb.from("question_bank").insert([dataObj]);
      if (error) { console.error("Câu "+(i+1)+":", error.message); errors++; }
      else saved++;
      btn.textContent = `Đang lưu... ${saved+errors}/${toSave.length}`;
    }

    btn.disabled = false;
    btn.innerHTML = "💾 Lưu tất cả";

    if (errors === 0) {
      showToast(`✅ Đã lưu ${saved} câu hỏi thành công!`);
      _questions = [];
      document.getElementById("questionsList").innerHTML = "";
      document.getElementById("questionsSection").style.display = "none";
    } else {
      showToast(`⚠ Lưu ${saved} câu thành công, ${errors} câu lỗi`);
    }
  };

  async function uploadImage(dataUrl, filename) {
    const sb = getSb();
    const arr = dataUrl.split(",");
    const mtype = arr[0].match(/:(.*?);/)[1];
    const bstr  = atob(arr[1]);
    const u8    = new Uint8Array(bstr.length);
    for (let i=0;i<bstr.length;i++) u8[i]=bstr.charCodeAt(i);
    const blob = new Blob([u8], { type: mtype });
    const path = `questions/${Date.now()}_${filename}`;
    const { error } = await sb.storage.from("question-images").upload(path, blob, { upsert: true });
    if (error) { console.error("Upload ảnh lỗi:", error.message); return null; }
    const { data: url } = sb.storage.from("question-images").getPublicUrl(path);
    return url.publicUrl;
  }

  init();
})();
