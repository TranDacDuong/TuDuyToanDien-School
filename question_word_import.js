(function () {
  const importInput = document.getElementById("wordImportInput");
  if (!importInput) return;

  importInput.addEventListener("change", handleWordImport);

  async function handleWordImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!/\.docx$/i.test(file.name)) {
      alert("Hiện tại chỉ hỗ trợ file .docx");
      return;
    }

    if (!window.mammoth?.extractRawText || !window.mammoth?.convertToHtml) {
      alert("Chưa tải được bộ đọc file Word.");
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const [rawResult, htmlResult] = await Promise.all([
        window.mammoth.extractRawText({ arrayBuffer }),
        window.mammoth.convertToHtml({ arrayBuffer }),
      ]);

      const source = buildStructuredWordSource(htmlResult?.value || "", rawResult?.value || "");
      const parsed = parseWordQuestions(source.text, source.images);
      if (!parsed.questions.length) {
        alert("Không tìm thấy câu hỏi hợp lệ trong file Word. Hãy kiểm tra file có mốc như 'Câu 1', 'A.', 'B.' không.");
        return;
      }

      const enrichedQuestions = window.QuestionDuplicateShared?.inspectImportedQuestions
        ? window.QuestionDuplicateShared.inspectImportedQuestions(parsed.questions)
        : parsed.questions;
      window.AppAdminTools?.recordAudit?.("word_question_import_parsed", {
        target_type: "question_import",
        details_source: "word",
        file_name: file.name,
        question_count: enrichedQuestions.length,
        warning_count: parsed.warnings?.length || 0,
      });
      openImportReviewModal(enrichedQuestions, parsed.warnings);
    } catch (error) {
      alert("Không đọc được file Word: " + (error?.message || error));
    }
  }

  function buildStructuredWordSource(html, rawFallback) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || "", "text/html");
    const images = {};
    const pieces = extractBlockPieces(doc.body || doc.documentElement, images);
    const combined = normalizeWordText(pieces.join("\n"));
    return { text: combined || normalizeWordText(rawFallback), images };
  }

  function extractBlockPieces(root, images) {
    const pieces = [];
    if (!root) return pieces;

    for (const child of Array.from(root.childNodes || [])) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = cleanInlineText(child.textContent);
        if (text) pieces.push(text);
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName.toLowerCase();

      if (tag === "ol" || tag === "ul") {
        pieces.push(...extractListPieces(child, getListDepth(child), images));
        continue;
      }

      if (tag === "table") {
        const tableText = tableToText(child);
        if (tableText) {
          pieces.push(tableText);
          pieces.push("");
        }
        continue;
      }

      if (tag === "br") {
        pieces.push("");
        continue;
      }

      if (tag === "img") {
        pieces.push(registerImageMarker(child, images));
        continue;
      }

      const nestedBlockChildren = Array.from(child.children || []).filter((el) =>
        isBlockLikeTag(el.tagName?.toLowerCase())
      );

      if (nestedBlockChildren.length) {
        pieces.push(...extractBlockPieces(child, images));
        continue;
      }

      const text = cleanInlineText(child.textContent);
      if (text || child.querySelector?.("img")) {
        const imgMarker = child.querySelector?.("img") ? registerImageMarker(child.querySelector("img"), images) : "";
        const prefix = imgMarker ? `${imgMarker} ` : "";
        pieces.push(tag === "li" ? `- ${prefix}${text}`.trim() : `${prefix}${text}`.trim());
      }
    }

    return pieces;
  }

  function extractListPieces(listEl, depth, images) {
    const pieces = [];
    const items = Array.from(listEl.children || []).filter(
      (child) => child.tagName && child.tagName.toLowerCase() === "li"
    );
    const markerType = getOrderedListMarkerType(listEl, depth);
    const start = Number.parseInt(listEl.getAttribute("start") || "1", 10) || 1;

    items.forEach((item, index) => {
      const marker = buildListMarker(markerType, start + index);
      const textParts = [];

      for (const child of Array.from(item.childNodes || [])) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = cleanInlineText(child.textContent);
          if (text) textParts.push(text);
          continue;
        }

        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = child.tagName.toLowerCase();

        if (tag === "ol" || tag === "ul") {
          const nested = extractListPieces(child, depth + 1, images);
          if (nested.length) textParts.push(nested.join("\n"));
          continue;
        }

        if (tag === "table") {
          const tableText = tableToText(child);
          if (tableText) textParts.push(tableText);
          continue;
        }

        if (tag === "img") {
          textParts.push(registerImageMarker(child, images));
          continue;
        }

        const text = cleanInlineText(child.textContent);
        if (text || child.querySelector?.("img")) {
          const imgMarker = child.querySelector?.("img") ? registerImageMarker(child.querySelector("img"), images) : "";
          textParts.push(`${imgMarker ? `${imgMarker} ` : ""}${text}`.trim());
        }
      }

      const line = normalizeWordText(textParts.join("\n"));
      if (line) {
        pieces.push(`${marker} ${line}`.trim());
      }
    });

    return pieces;
  }

  function registerImageMarker(imgEl, images) {
    const src = String(imgEl?.getAttribute?.("src") || imgEl?.src || "").trim();
    if (!src) return "[HINH]";
    const existingId = Object.keys(images).find((key) => images[key] === src);
    if (existingId) return `[HINH_${existingId}]`;
    const nextId = String(Object.keys(images).length + 1);
    images[nextId] = src;
    return `[HINH_${nextId}]`;
  }

  function isBlockLikeTag(tag) {
    return [
      "table",
      "p",
      "div",
      "section",
      "article",
      "header",
      "footer",
      "aside",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
    ].includes(tag);
  }

  function getListDepth(node) {
    let depth = 0;
    let current = node?.parentElement;
    while (current) {
      const tag = current.tagName?.toLowerCase();
      if (tag === "ol" || tag === "ul") depth += 1;
      current = current.parentElement;
    }
    return depth;
  }

  function getOrderedListMarkerType(listEl, depth) {
    const tag = listEl.tagName?.toLowerCase();
    if (tag === "ul") return "bullet";

    const typeAttr = (listEl.getAttribute("type") || "").toLowerCase();
    if (typeAttr === "a") return "upper-alpha";
    if (typeAttr === "A") return "upper-alpha";
    if (typeAttr === "i" || typeAttr === "I") return "roman";

    const style = (listEl.getAttribute("style") || "").toLowerCase();
    if (style.includes("lower-alpha") || style.includes("upper-alpha") || style.includes("alpha")) {
      return "upper-alpha";
    }
    if (style.includes("lower-roman") || style.includes("upper-roman") || style.includes("roman")) {
      return "roman";
    }

    return depth === 0 ? "question-number" : "upper-alpha";
  }

  function buildListMarker(markerType, index) {
    if (markerType === "question-number") return `Câu ${index}:`;
    if (markerType === "upper-alpha") return `${String.fromCharCode(64 + index)}.`;
    if (markerType === "roman") return `${toRoman(index)}.`;
    return "-";
  }

  function toRoman(num) {
    const map = [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ];

    let value = Math.max(1, Number(num) || 1);
    let result = "";
    for (const [arabic, roman] of map) {
      while (value >= arabic) {
        result += roman;
        value -= arabic;
      }
    }
    return result;
  }

  function tableToText(tableEl) {
    const matrix = [];
    const cellMeta = [];
    const rows = Array.from(tableEl.querySelectorAll("tr"));

    rows.forEach((row, rowIndex) => {
      matrix[rowIndex] = matrix[rowIndex] || [];
      cellMeta[rowIndex] = cellMeta[rowIndex] || [];
      let columnIndex = 0;
      while (matrix[rowIndex][columnIndex] !== undefined) columnIndex += 1;

      Array.from(row.children || []).forEach((cell) => {
        if (!/^(th|td)$/i.test(cell.tagName || "")) return;
        while (matrix[rowIndex][columnIndex] !== undefined) columnIndex += 1;

        const text = cleanInlineText(cell.textContent) || " ";
        const rowSpan = Math.max(1, Number.parseInt(cell.getAttribute("rowspan") || "1", 10) || 1);
        const colSpan = Math.max(1, Number.parseInt(cell.getAttribute("colspan") || "1", 10) || 1);

        for (let r = 0; r < rowSpan; r++) {
          const targetRow = rowIndex + r;
          matrix[targetRow] = matrix[targetRow] || [];
          cellMeta[targetRow] = cellMeta[targetRow] || [];
          for (let c = 0; c < colSpan; c++) {
            matrix[targetRow][columnIndex + c] = r === 0 && c === 0 ? text : "↳";
            cellMeta[targetRow][columnIndex + c] = {
              text,
              rowSpan,
              colSpan,
              isOrigin: r === 0 && c === 0,
            };
          }
        }

        columnIndex += colSpan;
      });
    });

    const columnCount = matrix.reduce((max, row) => Math.max(max, row?.length || 0), 0);
    const normalizedRows = matrix
      .map((row, rowIndex) => {
        const cells = [];
        for (let i = 0; i < columnCount; i++) {
          const value = cleanInlineText(row?.[i] || "");
          cells.push(value || (rowIndex === 0 ? " " : "∅"));
        }
        return cells;
      })
      .filter((row) => row.some((cell) => cell && cell !== "∅"));

    if (!normalizedRows.length) return "";

    const latexRows = [];
    for (let rowIndex = 0; rowIndex < normalizedRows.length; rowIndex++) {
      const rowLatex = [];
      for (let colIndex = 0; colIndex < columnCount; colIndex++) {
        const meta = cellMeta[rowIndex]?.[colIndex];
        const text = escapeLatexArrayText(normalizedRows[rowIndex]?.[colIndex] || "");
        if (!meta) {
          rowLatex.push(text || "\\text{ }");
          continue;
        }
        if (!meta.isOrigin) continue;
        if (meta.colSpan > 1) {
          rowLatex.push(`\\multicolumn{${meta.colSpan}}{|c|}{${text || "\\text{ }"}}`);
          continue;
        }
        rowLatex.push(text || "\\text{ }");
      }
      latexRows.push(`${rowLatex.join(" & ")} \\\\ \\hline`);
    }

    const columnSpec = `|${Array.from({ length: columnCount }, () => "c").join("|")}|`;
    return `\n\\[\\begin{array}{${columnSpec}} \\hline ${latexRows.join(" ")} \\end{array}\\]\n`;
  }

  function parseWordQuestions(rawText, imageMap = {}) {
    const text = normalizeMathText(normalizeWordText(rawText));
    const blocks = splitQuestionBlocks(text);
    const questions = [];
    const warnings = [];

    blocks.forEach((block, index) => {
      const parsed = parseQuestionBlock(block, index, imageMap);
      if (parsed.question) questions.push(parsed.question);
      if (parsed.warnings.length) warnings.push(...parsed.warnings);
    });

    return { questions, warnings };
  }

  function normalizeWordText(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, "-")
      .replace(/[\u201c\u201d]/g, "\"")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+(?=(?:PH\S*N|PHAN)\s+[IVX]+)/gu, "\n")
      .replace(/([.?!])\s*(?=(?:C\S*u|Cau)\s*\d+\b)/gu, "$1\n")
      .replace(/(\$)\s*(?=(?:C\S*u|Cau)\s*\d+\b)/gu, "$1\n")
      .replace(/(\\end\{(?:array|align\*?|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\}\$?)\s+(?=(?:C\S*u|Cau)\s*\d+\b)/giu, "$1\n")
      .replace(/(\\right\s*\.)\s+(?=(?:C\S*u|Cau)\s*\d+\b)/giu, "$1\n")
      .replace(/([.?!])\s*(?=(?:[A-F]|[a-d])[.)\]:-]\s+)/g, "$1\n")
      .replace(/[ \t]+/g, " ")
      .replace(/[ ]*\n[ ]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeMathText(text) {
    const inlineDisplayMath = String(text || "")
      .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, inner) => `$${String(inner || "").trim()}$`)
      .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, inner) => `$${String(inner || "").trim()}$`);

    return addSpacingAroundMathSegments(inlineDisplayMath
      .replace(/\\frac(?=\s*\{)/g, "\\dfrac")
      .replace(/\\left\s*/g, "\\left ")
      .replace(/\\right\s*/g, "\\right ")
      .replace(/\\(?:to|rightarrow)(?![a-zA-Z])/g, "\\rightarrow")
      .replace(/\\(?:leftrightarrow|Leftrightarrow)(?![a-zA-Z])/g, "\\Leftrightarrow")
      .replace(/\$\s+/g, "$")
      .replace(/\s+\$/g, "$")
      .replace(/\\\[\s+/g, "\\[")
      .replace(/\s+\\\]/g, "\\]")
      .replace(/\\\(\s+/g, "\\(")
      .replace(/\s+\\\)/g, "\\)")
      .replace(/\{\s+/g, "{")
      .replace(/\s+\}/g, "}")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim());
  }

  function addSpacingAroundMathSegments(text) {
    return String(text || "")
      .replace(/(\S)(\$[^$]+\$)(?=\S)/g, "$1 $2 ")
      .replace(/(\S)(\$[^$]+\$)/g, "$1 $2")
      .replace(/(\$[^$]+\$)(\S)/g, "$1 $2")
      .replace(/\s{2,}/g, " ")
      .replace(/[ ]*\n[ ]*/g, "\n")
      .trim();
  }

  function escapeLatexArrayText(text) {
    const source = String(text || "").replace(/\n+/g, " ").trim();
    if (!source) return "\\text{ }";

    const parts = [];
    let lastIndex = 0;
    const mathRegex = /\$([\s\S]*?)\$/g;
    let match;
    while ((match = mathRegex.exec(source)) !== null) {
      const plain = source.slice(lastIndex, match.index).trim();
      if (plain) parts.push(`\\text{${escapeLatexText(plain)}}`);
      const math = String(match[1] || "").trim();
      if (math) parts.push(math);
      lastIndex = match.index + match[0].length;
    }

    const tail = source.slice(lastIndex).trim();
    if (tail) parts.push(`\\text{${escapeLatexText(tail)}}`);
    return parts.join(" ");
  }

  function escapeLatexText(text) {
    return String(text || "")
      .replace(/\\/g, "\\textbackslash ")
      .replace(/&/g, "\\&")
      .replace(/%/g, "\\%")
      .replace(/#/g, "\\#")
      .replace(/_/g, "\\_")
      .replace(/\{/g, "\\{")
      .replace(/\}/g, "\\}")
      .replace(/\^/g, "\\textasciicircum ")
      .replace(/~/g, "\\textasciitilde ")
      .replace(/\$/g, "\\$")
      .trim();
  }

  function cleanInlineText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function splitQuestionBlocks(text) {
    const regex = /(?:^|\n)\s*(?:C\S*u|Cau)\s*\d+\b\s*[:.)-]?/giu;
    const matches = [...text.matchAll(regex)];

    if (!matches.length) {
      const numberedBlocks = splitNumberedBlocks(text);
      const baseBlocks = numberedBlocks.length ? numberedBlocks : (text ? [text] : []);
      return baseBlocks.flatMap(splitEmbeddedQuestionHeaders).filter(Boolean);

    }
    const blocks = [];
    for (let i = 0; i < matches.length; i++) {
      const matchText = matches[i][0];
      const start = matches[i].index + (matchText.startsWith("\n") ? 1 : 0);
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const block = text.slice(start, end).trim();
      if (block) blocks.push(block);
    }
    return blocks.flatMap(splitEmbeddedQuestionHeaders).filter(Boolean);
  }

  function splitNumberedBlocks(text) {
    const regex = /(?:^|\n)\s*\d+\s*[:.)-]\s+/g;
    const matches = [...String(text || "").matchAll(regex)];
    if (matches.length < 2) return [];

    const blocks = [];
    for (let i = 0; i < matches.length; i++) {
      const matchText = matches[i][0];
      const start = matches[i].index + (matchText.startsWith("\n") ? 1 : 0);
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const block = text.slice(start, end).trim();
      if (block) blocks.push(block);
    }
    return blocks;
  }

  function splitEmbeddedQuestionHeaders(block) {
    const source = String(block || "").trim();
    if (!source) return [];

    const headerRegex = /(?:C\S*u|Cau)\s*\d+\b\s*[:.)-]?/giu;
    const splitPoints = [0];
    let match;

    while ((match = headerRegex.exec(source)) !== null) {
      if (match.index === 0) continue;
      const prefix = source.slice(Math.max(0, match.index - 120), match.index);
      const hasHardBoundary = /(?:\$\s*|[.?!]\s*|\\right\s*\.\s*|\\end\{(?:array|align\*?|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\}\$?\s*)$/iu.test(prefix);
      if (hasHardBoundary) splitPoints.push(match.index);
    }

    if (splitPoints.length === 1) return [source];
    splitPoints.push(source.length);

    const parts = [];
    for (let i = 0; i < splitPoints.length - 1; i++) {
      const part = source.slice(splitPoints[i], splitPoints[i + 1]).trim();
      if (part) parts.push(part);
    }
    return parts;
  }

  function parseQuestionBlock(block, index, imageMap = {}) {
    const warnings = [];
    const withoutHeader = block
      .replace(/^\s*(?:C\S*u|Cau)\s*\d+\b\s*[:.)-]?\s*/iu, "")
      .replace(/^\s*\d+\s*[:.)-]\s*/u, "")
      .trim();
    const content = (withoutHeader || block.trim())
      .replace(/\n?(?:PH\S*N|PHAN)\s+[IVX]+[\s\S]*$/iu, "")
      .replace(/\n?-+\s*(?:H\S*T|HET)\s*-+$/iu, "")
      .trim();
    if (!content) {
      return { question: null, warnings: [`Câu ${index + 1} trống nên đã bị bỏ qua.`] };
    }

    const answerMatch = content.match(/(?:^|\n|\s)(?:Đáp án đúng|Đáp án|Dap an dung|Dap an|DAP AN|\bĐA\b|\bDA\b)\s*[:\-]?\s*([^\n]+)/iu);
    const rawAnswer = String(answerMatch?.[1] || "").trim();
    const answer = normalizeChoiceAnswer(rawAnswer);
    const contentWithoutAnswer = answerMatch ? content.replace(answerMatch[0], " ").trim() : content;
    const imageIds = Array.from(contentWithoutAnswer.matchAll(/\[HINH_(\d+)\]|\[HINH\]/gu))
      .map((match) => match[1] || "")
      .filter(Boolean);
    const questionImage = imageIds.length ? (imageMap[imageIds[0]] || null) : null;
    const hadImage = imageIds.length > 0 || /\[HINH\]/u.test(contentWithoutAnswer);
    const body = normalizeMathText(contentWithoutAnswer.replace(/\[HINH(?:_\d+)?\]/gu, "\n").trim());
    const imageMeta = { hadImage, questionImage };
    const trueFalseParsed = tryParseTrueFalseQuestion(body, rawAnswer, index, warnings, imageMeta);
    if (trueFalseParsed) {
      if (hadImage) {
        trueFalseParsed.question._importWarnings.push(`Câu ${index + 1}: có ảnh trong file Word, bạn nên kiểm tra lại hình trước khi lưu.`);
        trueFalseParsed.warnings.push(`Câu ${index + 1}: có ảnh trong file Word, bạn nên kiểm tra lại hình trước khi lưu.`);
        trueFalseParsed.question._importConfidence = Math.max(0.3, Number((trueFalseParsed.question._importConfidence - 0.08).toFixed(2)));
      }
      return trueFalseParsed;
    }

    const optionMatches = findOptionMatches(body);
    const labels = optionMatches.map((match) => match.label).join("");
    const orderedLabels = Array.from(new Set(optionMatches.map((match) => match.label)))
      .filter((label) => /^[A-F]$/.test(label))
      .sort();
    const hasChoiceSet = orderedLabels.length >= 4;
    const hasTable = /\\begin\{array\}/u.test(body);
    let confidence = hasTable ? 0.66 : 0.78;

    if (!hasChoiceSet) {
      const shortAnswerParsed = tryParseShortAnswerQuestion(body, rawAnswer, index, warnings, imageMeta);
      if (shortAnswerParsed) {
        if (hadImage) {
          shortAnswerParsed.question._importWarnings.push(`Câu ${index + 1}: có ảnh trong file Word, bạn nên kiểm tra lại hình trước khi lưu.`);
          shortAnswerParsed.warnings.push(`Câu ${index + 1}: có ảnh trong file Word, bạn nên kiểm tra lại hình trước khi lưu.`);
          shortAnswerParsed.question._importConfidence = Math.max(0.3, Number((shortAnswerParsed.question._importConfidence - 0.08).toFixed(2)));
        }
        return shortAnswerParsed;
      }
      warnings.push(`Câu ${index + 1}: chưa tách được đủ A, B, C, D nên đang để dạng trả lời ngắn để bạn rà lại.`);
      return {
        question: {
          question_type: "short_answer",
          question_text: normalizeMathText(body),
          options: [],
          difficulty: 5,
          answer: "",
          answer_count: 1,
          has_figure: hadImage,
          question_img: questionImage,
          _importConfidence: 0.45,
          _importWarnings: warnings.slice(),
        },
        warnings,
      };
    }

    const optionMap = new Map();
    for (const match of optionMatches) {
      const label = match.label;
      if (!optionMap.has(label)) {
        optionMap.set(label, match);
      }
      if (optionMap.size === 4) break;
    }

    const required = orderedLabels.filter((label, idx) => idx === 0 || label.charCodeAt(0) === orderedLabels[idx - 1].charCodeAt(0) + 1);
    if (required.some((label) => !optionMap.has(label))) {
      warnings.push(`Câu ${index + 1}: thiếu ít nhất một đáp án A/B/C/D, cần kiểm tra lại.`);
      return {
        question: {
          question_type: "short_answer",
          question_text: normalizeMathText(body),
          options: [],
          difficulty: 5,
          answer: "",
          answer_count: 1,
          has_figure: hadImage,
          question_img: questionImage,
          _importConfidence: 0.5,
          _importWarnings: warnings.slice(),
        },
        warnings,
      };
    }

    const questionText = normalizeMathText(body.slice(0, optionMap.get("A").index).trim());
    const options = required.map((label, i) => {
      const current = optionMap.get(label);
      const nextIndex = i + 1 < required.length ? optionMap.get(required[i + 1]).index : body.length;
      const optionText = normalizeMathText(body
        .slice(current.contentStart, nextIndex)
        .replace(/[ \t]+/g, " ")
        .trim());
      return `${label}. ${optionText}`;
    });

    if (!questionText) {
      warnings.push(`Câu ${index + 1}: không nhận ra rõ phần đề bài, bạn nên kiểm tra lại.`);
      confidence -= 0.18;
    }

    if (!answer) {
      warnings.push(`Câu ${index + 1}: chưa tìm thấy đáp án đúng, bạn cần bổ sung trước khi lưu.`);
      confidence -= 0.12;
    }

    if (hasTable) {
      warnings.push(`Câu ${index + 1}: có bảng trong nội dung, nên rà lại layout trước khi lưu.`);
      confidence -= 0.08;
    }

    if (hadImage) {
      warnings.push(`Câu ${index + 1}: có ảnh trong file Word, bạn nên kiểm tra lại hình trước khi lưu.`);
      confidence -= 0.08;
    }

    const inlineOptionLayout = required.every((label) => body.includes(`${label}.`) || body.includes(`${label})`) || body.includes(`${label}:`) || body.includes(`${label}-`));
    if (!inlineOptionLayout) {
      confidence -= 0.05;
    }

    return {
      question: {
        question_type: "multi_choice",
        question_text: [questionText, ...options].filter(Boolean).join("\n"),
        options: [],
        difficulty: 5,
        answer,
        answer_count: required.length,
        has_figure: hadImage,
        question_img: questionImage,
        _importConfidence: Math.max(0.3, Math.min(0.99, Number(confidence.toFixed(2)))),
        _importWarnings: warnings.slice(),
      },
      warnings,
    };
  }

  function findOptionMatches(body) {
    const matches = [];
    const regex = /(^|[\s\n])(A|B|C|D|E|F)([.)\]:-])(?=\s*(?:\$|\\|[A-Za-zÀ-ỹ0-9([{]))/gu;
    let match;

    while ((match = regex.exec(body)) !== null) {
      const label = match[2].toUpperCase();
      const prefixLength = match[1].length;
      const index = match.index + prefixLength;
      matches.push({
        label,
        index,
        contentStart: index + match[2].length + match[3].length,
      });
    }

    return matches;
  }

  function normalizeChoiceAnswer(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/\bVÀ\b/g, "")
      .replace(/[^A-F]/g, "");
  }

  function normalizeFreeAnswer(value) {
    return normalizeMathText(String(value || ""))
      .replace(/^[=:,\-\s]+/, "")
      .trim();
  }

  function tryParseShortAnswerQuestion(body, rawAnswer, index, warnings, imageMeta = {}) {
    const normalizedAnswer = normalizeFreeAnswer(rawAnswer);
    if (!normalizedAnswer) {
      warnings.push(`Câu ${index + 1}: hệ thống đang để mặc định là câu trả lời ngắn vì chưa thấy đáp án hay đáp án lựa chọn.`);
      return {
        question: {
          question_type: "short_answer",
          question_text: normalizeMathText(body),
          options: [],
          difficulty: 5,
          answer: "",
          answer_count: 1,
          has_figure: !!imageMeta.hadImage,
          question_img: imageMeta.questionImage || null,
          _importConfidence: 0.58,
          _importWarnings: warnings.slice(),
        },
        warnings,
      };
    }
    if (/^[A-F]+$/u.test(normalizedAnswer)) return null;
    warnings.push(`Câu ${index + 1}: hệ thống nhận đây là câu trả lời ngắn, bạn nên rà lại đáp án trước khi lưu.`);
    return {
      question: {
        question_type: "short_answer",
        question_text: normalizeMathText(body),
        options: [],
        difficulty: 5,
        answer: normalizedAnswer,
        answer_count: 1,
        has_figure: !!imageMeta.hadImage,
        question_img: imageMeta.questionImage || null,
        _importConfidence: 0.68,
        _importWarnings: warnings.slice(),
      },
      warnings,
    };
  }

  function tryParseTrueFalseQuestion(body, rawAnswer, index, warnings, imageMeta = {}) {
    const matches = [];
    const preparedBody = String(body || "")
      .replace(/(\$)\s*(?=[a-d][.)\]:-]\s+)/g, "$1\n")
      .replace(/([.?!])\s*(?=[a-d][.)\]:-]\s+)/g, "$1\n");
    const regex = /(^|\n)\s*([a-d])([.)\]:-])\s+([\s\S]*?)(?=(?:\n\s*[a-d][.)\]:-]\s+)|$)/g;
    let match;
    while ((match = regex.exec(preparedBody)) !== null) {
      matches.push({
        index: match.index + match[1].length,
        label: match[2].toLowerCase(),
        text: normalizeMathText(match[4].trim()),
      });
    }
    if (matches.length < 2) return null;

    const normalizedAnswer = String(rawAnswer || "").toLowerCase().replace(/\s+/g, "");
    const looksLikeTrueFalse = matches.every((item) => item.label >= "a" && item.label <= "d")
      && (
        matches.length >= 4
        || !normalizedAnswer
        || !String(rawAnswer || "").trim()
        || /^(?:[a-d](?:t|f|đ|s|1|0|true|false|dung|sai))+$/u.test(normalizedAnswer)
        || /(?:đúng|sai|dung|sai)/iu.test(rawAnswer || "")
      );
    if (!looksLikeTrueFalse) return null;

    const answerTokens = matches
      .map((item) => {
        const token = extractTrueFalseToken(item.label, rawAnswer);
        return token ? `${item.label}${token}` : "";
      })
      .join("");
    warnings.push(`Câu ${index + 1}: hệ thống nhận đây là câu Đúng/Sai, bạn nên rà lại từng mệnh đề trước khi lưu.`);
    const questionStem = normalizeMathText(preparedBody.slice(0, matches[0]?.index || 0).trim());
    return {
      question: {
        question_type: "true_false",
        question_text: questionStem,
        options: matches.map((item) => item.text),
        difficulty: 5,
        answer: answerTokens,
        answer_count: matches.length,
        has_figure: !!imageMeta.hadImage,
        question_img: imageMeta.questionImage || null,
        _importConfidence: 0.72,
        _importWarnings: warnings.slice(),
      },
      warnings,
    };
  }

  function extractTrueFalseToken(label, rawAnswer) {
    const source = String(rawAnswer || "").toLowerCase();
    const direct = source.match(new RegExp(`${label}\\s*(đúng|dung|true|t|1|sai|false|f|0)`, "u"));
    const token = direct?.[1] || "";
    if (/^(đúng|dung|true|t|1)$/u.test(token)) return "T";
    if (/^(sai|false|f|0)$/u.test(token)) return "F";
    return "";
  }

  function openImportReviewModal(questions, warnings) {
    if (typeof window.openModal === "function") {
      window.openModal(true);
    } else {
      document.getElementById("modal")?.style?.setProperty("display", "flex");
    }

    if (typeof window.startMultiQuestion === "function") {
      window.startMultiQuestion(questions);
    }

    const hint = document.getElementById("qAiHint");
    if (hint) {
      const lowConfidenceCount = questions.filter((item) => Number(item?._importConfidence || 0) < 0.7).length;
      if (warnings?.length) {
        hint.textContent = `Đã import ${questions.length} câu. Có ${warnings.length} chỗ cần rà lại, ${lowConfidenceCount} câu ở mức nhận diện chưa chắc.`;
        hint.style.cssText = "font-size:.75rem;color:#b45309;background:#fef3c7;padding:5px 10px;border-radius:7px";
      } else {
        hint.textContent = `Đã import ${questions.length} câu từ Word. Giáo viên kiểm tra rồi lưu từng câu.`;
        hint.style.cssText = "font-size:.75rem;color:var(--green);font-weight:700";
      }
    }

    const title = document.getElementById("formTitle");
    if (title) title.textContent = "Tạo câu hỏi từ file Word";
  }
})();
