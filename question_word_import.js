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

      const sourceText = buildStructuredWordText(htmlResult?.value || "", rawResult?.value || "");
      const parsed = parseWordQuestions(sourceText);
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

  function buildStructuredWordText(html, rawFallback) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || "", "text/html");
    const pieces = extractBlockPieces(doc.body || doc.documentElement);
    const combined = normalizeWordText(pieces.join("\n"));
    return combined || normalizeWordText(rawFallback);
  }

  function extractBlockPieces(root) {
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
        pieces.push(...extractListPieces(child, getListDepth(child)));
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

      const nestedBlockChildren = Array.from(child.children || []).filter((el) =>
        isBlockLikeTag(el.tagName?.toLowerCase())
      );

      if (nestedBlockChildren.length) {
        pieces.push(...extractBlockPieces(child));
        continue;
      }

      const text = cleanInlineText(child.textContent);
      if (text) {
        pieces.push(tag === "li" ? `- ${text}` : text);
      }
    }

    return pieces;
  }

  function extractListPieces(listEl, depth) {
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
          const nested = extractListPieces(child, depth + 1);
          if (nested.length) textParts.push(nested.join("\n"));
          continue;
        }

        if (tag === "table") {
          const tableText = tableToText(child);
          if (tableText) textParts.push(tableText);
          continue;
        }

        const text = cleanInlineText(child.textContent);
        if (text) textParts.push(text);
      }

      const line = normalizeWordText(textParts.join("\n"));
      if (line) {
        pieces.push(`${marker} ${line}`.trim());
      }
    });

    return pieces;
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
    const rows = Array.from(tableEl.querySelectorAll("tr"));

    rows.forEach((row, rowIndex) => {
      matrix[rowIndex] = matrix[rowIndex] || [];
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
          for (let c = 0; c < colSpan; c++) {
            matrix[targetRow][columnIndex + c] = r === 0 && c === 0 ? text : "↳";
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

    const header = normalizedRows[0];
    const bodyRows = normalizedRows.slice(1);
    const lines = ["[BẢNG]"];
    if (header.length) lines.push(`| ${header.join(" | ")} |`);
    if (bodyRows.length) lines.push(`| ${header.map(() => "---").join(" | ")} |`);
    bodyRows.forEach((row) => lines.push(`| ${row.join(" | ")} |`));
    lines.push("[/BẢNG]");
    return lines.join("\n");
  }

  function parseWordQuestions(rawText) {
    const text = normalizeMathText(normalizeWordText(rawText));
    const blocks = splitQuestionBlocks(text);
    const questions = [];
    const warnings = [];

    blocks.forEach((block, index) => {
      const parsed = parseQuestionBlock(block, index);
      if (parsed.question) questions.push(parsed.question);
      if (parsed.warnings.length) warnings.push(...parsed.warnings);
    });

    return { questions, warnings };
  }

  function normalizeWordText(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[‐‑‒–—]/g, "-")
      .replace(/[“”]/g, "\"")
      .replace(/[‘’]/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/[ ]*\n[ ]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeMathText(text) {
    return String(text || "")
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
      .trim();
  }

  function cleanInlineText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function splitQuestionBlocks(text) {
    const regex = /(?:^|\n)\s*(?:Câu|Cau)\s*\d+\b\s*[:.)-]?/giu;
    const matches = [...text.matchAll(regex)];

    if (!matches.length) {
      const numberedBlocks = splitNumberedBlocks(text);
      return numberedBlocks.length ? numberedBlocks : (text ? [text] : []);
    }

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

  function parseQuestionBlock(block, index) {
    const warnings = [];
    const withoutHeader = block
      .replace(/^\s*(?:Câu|Cau)\s*\d+\b\s*[:.)-]?\s*/iu, "")
      .replace(/^\s*\d+\s*[:.)-]\s*/u, "")
      .trim();
    const content = withoutHeader || block.trim();
    if (!content) {
      return { question: null, warnings: [`Câu ${index + 1} trống nên đã bị bỏ qua.`] };
    }

    const answerMatch = content.match(/(?:^|\n|\s)(?:Đáp án đúng|Đáp án|Dap an dung|Dap an|DAP AN|ĐA|DA)\s*[:\-]?\s*([A-D])/iu);
    const answer = answerMatch?.[1]?.toUpperCase() || "";
    const body = answerMatch ? content.replace(answerMatch[0], " ").trim() : content;

    const optionMatches = findOptionMatches(body);
    const labels = optionMatches.map((match) => match.label).join("");
    const hasFullChoiceSet = /A.*B.*C.*D/.test(labels);
    const hasTable = /\[BẢNG\]/u.test(body);
    let confidence = hasTable ? 0.66 : 0.78;

    if (!hasFullChoiceSet) {
      warnings.push(`Câu ${index + 1}: chưa tách được đủ A, B, C, D nên đang để dạng tự luận để bạn rà lại.`);
      return {
        question: {
          question_type: "essay",
          question_text: normalizeMathText(body),
          options: [],
          difficulty: 5,
          answer: "",
          answer_count: 0,
          has_figure: false,
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

    const required = ["A", "B", "C", "D"];
    if (required.some((label) => !optionMap.has(label))) {
      warnings.push(`Câu ${index + 1}: thiếu ít nhất một đáp án A/B/C/D, cần kiểm tra lại.`);
      return {
        question: {
          question_type: "essay",
          question_text: normalizeMathText(body),
          options: [],
          difficulty: 5,
          answer: "",
          answer_count: 0,
          has_figure: false,
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

    const inlineOptionLayout = required.every((label) => body.includes(`${label}.`) || body.includes(`${label})`));
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
        answer_count: 4,
        has_figure: false,
        _importConfidence: Math.max(0.3, Math.min(0.99, Number(confidence.toFixed(2)))),
        _importWarnings: warnings.slice(),
      },
      warnings,
    };
  }

  function findOptionMatches(body) {
    const matches = [];
    const regex = /(^|[\s\n])([A-Da-d])([.)\]:-])(?=\s+)/g;
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
