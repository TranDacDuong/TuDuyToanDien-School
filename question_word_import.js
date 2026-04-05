(function () {
  const importInput = document.getElementById("wordImportInput");
  if (!importInput) return;

  importInput.addEventListener("change", handleWordImport);

  async function handleWordImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!/\.docx$/i.test(file.name)) {
      alert("Hiá»‡n táº¡i chá»‰ há»— trá»£ file .docx");
      return;
    }

    if (!window.mammoth?.extractRawText || !window.mammoth?.convertToHtml) {
      alert("ChÆ°a táº£i Ä‘Æ°á»£c bá»™ Ä‘á»c file Word.");
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
        alert("KhÃ´ng tÃ¬m tháº¥y cÃ¢u há»i há»£p lá»‡ trong file Word. HÃ£y kiá»ƒm tra file cÃ³ má»‘c nhÆ° 'CÃ¢u 1', 'A.', 'B.' khÃ´ng.");
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
      alert("KhÃ´ng Ä‘á»c Ä‘Æ°á»£c file Word: " + (error?.message || error));
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

      if (tag === "img") {
        pieces.push("[HINH]");
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
      if (text || child.querySelector?.("img")) {
        const prefix = child.querySelector?.("img") ? "[HINH] " : "";
        pieces.push(tag === "li" ? `- ${prefix}${text}`.trim() : `${prefix}${text}`.trim());
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

        if (tag === "img") {
          textParts.push("[HINH]");
          continue;
        }

        const text = cleanInlineText(child.textContent);
        if (text || child.querySelector?.("img")) {
          textParts.push(`${child.querySelector?.("img") ? "[HINH] " : ""}${text}`.trim());
        }
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
    if (markerType === "question-number") return `CÃ¢u ${index}:`;
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
            matrix[targetRow][columnIndex + c] = r === 0 && c === 0 ? text : "â†³";
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
          cells.push(value || (rowIndex === 0 ? " " : "âˆ…"));
        }
        return cells;
      })
      .filter((row) => row.some((cell) => cell && cell !== "âˆ…"));

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
      .replace(/[â€â€‘â€’â€“â€”]/g, "-")
      .replace(/[â€œâ€]/g, "\"")
      .replace(/[â€˜â€™]/g, "'")
      .replace(/\s+(?=(?:PH\S*N|PHAN)\s+[IVX]+)/gu, "\n")
      .replace(/([.?!])\s+(?=(?:C\S*u|Cau)\s*\d+\b)/gu, "$1\n")
      .replace(/(\$)\s+(?=(?:C\S*u|Cau)\s*\d+\b)/gu, "$1\n")
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
    const parts = source
      .split(/\s+(?=(?:C\S*u|Cau)\s*\d+\b\s*[:.)-]?)/giu)
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.length ? parts : [source];
  }

  function parseQuestionBlock(block, index) {
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
      return { question: null, warnings: [`CÃ¢u ${index + 1} trá»‘ng nÃªn Ä‘Ã£ bá»‹ bá» qua.`] };
    }

    const answerMatch = content.match(/(?:^|\n|\s)(?:ÄÃ¡p Ã¡n Ä‘Ãºng|ÄÃ¡p Ã¡n|Dap an dung|Dap an|DAP AN|ÄA|DA)\s*[:\-]?\s*([^\n]+)/iu);
    const rawAnswer = String(answerMatch?.[1] || "").trim();
    const answer = normalizeChoiceAnswer(rawAnswer);
    const hadImage = /\[HINH\]/u.test(content);
    const body = normalizeMathText((answerMatch ? content.replace(answerMatch[0], " ").trim() : content).replace(/\[HINH\]/gu, "").trim());
    const trueFalseParsed = tryParseTrueFalseQuestion(body, rawAnswer, index, warnings);
    if (trueFalseParsed) {
      if (hadImage) {
        trueFalseParsed.question._importWarnings.push(`CÃ¢u ${index + 1}: cÃ³ áº£nh trong file Word, báº¡n nÃªn kiá»ƒm tra láº¡i hÃ¬nh trÆ°á»›c khi lÆ°u.`);
        trueFalseParsed.warnings.push(`CÃ¢u ${index + 1}: cÃ³ áº£nh trong file Word, báº¡n nÃªn kiá»ƒm tra láº¡i hÃ¬nh trÆ°á»›c khi lÆ°u.`);
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
      const shortAnswerParsed = tryParseShortAnswerQuestion(body, rawAnswer, index, warnings);
      if (shortAnswerParsed) {
        if (hadImage) {
          shortAnswerParsed.question._importWarnings.push(`CÃ¢u ${index + 1}: cÃ³ áº£nh trong file Word, báº¡n nÃªn kiá»ƒm tra láº¡i hÃ¬nh trÆ°á»›c khi lÆ°u.`);
          shortAnswerParsed.warnings.push(`CÃ¢u ${index + 1}: cÃ³ áº£nh trong file Word, báº¡n nÃªn kiá»ƒm tra láº¡i hÃ¬nh trÆ°á»›c khi lÆ°u.`);
          shortAnswerParsed.question._importConfidence = Math.max(0.3, Number((shortAnswerParsed.question._importConfidence - 0.08).toFixed(2)));
        }
        return shortAnswerParsed;
      }
      warnings.push(`CÃ¢u ${index + 1}: chÆ°a tÃ¡ch Ä‘Æ°á»£c Ä‘á»§ A, B, C, D nÃªn Ä‘ang Ä‘á»ƒ dáº¡ng tráº£ lá»i ngáº¯n Ä‘á»ƒ báº¡n rÃ  láº¡i.`);
      return {
        question: {
          question_type: "short_answer",
          question_text: normalizeMathText(body),
          options: [],
          difficulty: 5,
          answer: "",
          answer_count: 1,
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

    const required = orderedLabels.filter((label, idx) => idx === 0 || label.charCodeAt(0) === orderedLabels[idx - 1].charCodeAt(0) + 1);
    if (required.some((label) => !optionMap.has(label))) {
      warnings.push(`CÃ¢u ${index + 1}: thiáº¿u Ã­t nháº¥t má»™t Ä‘Ã¡p Ã¡n A/B/C/D, cáº§n kiá»ƒm tra láº¡i.`);
      return {
        question: {
          question_type: "short_answer",
          question_text: normalizeMathText(body),
          options: [],
          difficulty: 5,
          answer: "",
          answer_count: 1,
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
      warnings.push(`CÃ¢u ${index + 1}: khÃ´ng nháº­n ra rÃµ pháº§n Ä‘á» bÃ i, báº¡n nÃªn kiá»ƒm tra láº¡i.`);
      confidence -= 0.18;
    }

    if (!answer) {
      warnings.push(`CÃ¢u ${index + 1}: chÆ°a tÃ¬m tháº¥y Ä‘Ã¡p Ã¡n Ä‘Ãºng, báº¡n cáº§n bá»• sung trÆ°á»›c khi lÆ°u.`);
      confidence -= 0.12;
    }

    if (hasTable) {
      warnings.push(`CÃ¢u ${index + 1}: cÃ³ báº£ng trong ná»™i dung, nÃªn rÃ  láº¡i layout trÆ°á»›c khi lÆ°u.`);
      confidence -= 0.08;
    }

    if (hadImage) {
      warnings.push(`CÃ¢u ${index + 1}: cÃ³ áº£nh trong file Word, báº¡n nÃªn kiá»ƒm tra láº¡i hÃ¬nh trÆ°á»›c khi lÆ°u.`);
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
        has_figure: false,
        _importConfidence: Math.max(0.3, Math.min(0.99, Number(confidence.toFixed(2)))),
        _importWarnings: warnings.slice(),
      },
      warnings,
    };
  }

  function findOptionMatches(body) {
    const matches = [];
    const regex = /(^|[\s\n])(A|B|C|D|E|F)([.)\]:-])(?=\s+)/g;
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
      .replace(/\bVÃ€\b/g, "")
      .replace(/[^A-F]/g, "");
  }

  function normalizeFreeAnswer(value) {
    return normalizeMathText(String(value || ""))
      .replace(/^[=:,\-\s]+/, "")
      .trim();
  }

  function tryParseShortAnswerQuestion(body, rawAnswer, index, warnings) {
    const normalizedAnswer = normalizeFreeAnswer(rawAnswer);
    if (!normalizedAnswer) {
      warnings.push(`CÃ¢u ${index + 1}: há»‡ thá»‘ng Ä‘ang Ä‘á»ƒ máº·c Ä‘á»‹nh lÃ  cÃ¢u tráº£ lá»i ngáº¯n vÃ¬ chÆ°a tháº¥y Ä‘Ã¡p Ã¡n hay Ä‘Ã¡p Ã¡n lá»±a chá»n.`);
      return {
        question: {
          question_type: "short_answer",
          question_text: normalizeMathText(body),
          options: [],
          difficulty: 5,
          answer: "",
          answer_count: 1,
          has_figure: false,
          _importConfidence: 0.58,
          _importWarnings: warnings.slice(),
        },
        warnings,
      };
    }
    if (/^[A-F]+$/u.test(normalizedAnswer)) return null;
    warnings.push(`CÃ¢u ${index + 1}: há»‡ thá»‘ng nháº­n Ä‘Ã¢y lÃ  cÃ¢u tráº£ lá»i ngáº¯n, báº¡n nÃªn rÃ  láº¡i Ä‘Ã¡p Ã¡n trÆ°á»›c khi lÆ°u.`);
    return {
      question: {
        question_type: "short_answer",
        question_text: normalizeMathText(body),
        options: [],
        difficulty: 5,
        answer: normalizedAnswer,
        answer_count: 1,
        has_figure: false,
        _importConfidence: 0.68,
        _importWarnings: warnings.slice(),
      },
      warnings,
    };
  }

  function tryParseTrueFalseQuestion(body, rawAnswer, index, warnings) {
    const matches = [];
    const regex = /(^|\n)\s*([a-d])([.)\]:-])\s+([\s\S]*?)(?=(?:\n\s*[a-d][.)\]:-]\s+)|$)/g;
    let match;
    while ((match = regex.exec(body)) !== null) {
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
        || /^(?:[a-d](?:t|f|Ä‘|s|1|0|true|false|dung|sai))+$/u.test(normalizedAnswer)
        || /(?:Ä‘Ãºng|sai|dung|sai)/iu.test(rawAnswer || "")
      );
    if (!looksLikeTrueFalse) return null;

    const answerTokens = matches
      .map((item) => {
        const token = extractTrueFalseToken(item.label, rawAnswer);
        return token ? `${item.label}${token}` : "";
      })
      .join("");
    warnings.push(`CÃ¢u ${index + 1}: há»‡ thá»‘ng nháº­n Ä‘Ã¢y lÃ  cÃ¢u ÄÃºng/Sai, báº¡n nÃªn rÃ  láº¡i tá»«ng má»‡nh Ä‘á» trÆ°á»›c khi lÆ°u.`);
    const questionStem = normalizeMathText(body.slice(0, matches[0]?.index || 0).trim());
    return {
      question: {
        question_type: "true_false",
        question_text: questionStem,
        options: matches.map((item) => item.text),
        difficulty: 5,
        answer: answerTokens,
        answer_count: matches.length,
        has_figure: false,
        _importConfidence: 0.72,
        _importWarnings: warnings.slice(),
      },
      warnings,
    };
  }

  function extractTrueFalseToken(label, rawAnswer) {
    const source = String(rawAnswer || "").toLowerCase();
    const direct = source.match(new RegExp(`${label}\\s*(Ä‘Ãºng|dung|true|t|1|sai|false|f|0)`, "u"));
    const token = direct?.[1] || "";
    if (/^(Ä‘Ãºng|dung|true|t|1)$/u.test(token)) return "T";
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
        hint.textContent = `ÄÃ£ import ${questions.length} cÃ¢u. CÃ³ ${warnings.length} chá»— cáº§n rÃ  láº¡i, ${lowConfidenceCount} cÃ¢u á»Ÿ má»©c nháº­n diá»‡n chÆ°a cháº¯c.`;
        hint.style.cssText = "font-size:.75rem;color:#b45309;background:#fef3c7;padding:5px 10px;border-radius:7px";
      } else {
        hint.textContent = `ÄÃ£ import ${questions.length} cÃ¢u tá»« Word. GiÃ¡o viÃªn kiá»ƒm tra rá»“i lÆ°u tá»«ng cÃ¢u.`;
        hint.style.cssText = "font-size:.75rem;color:var(--green);font-weight:700";
      }
    }

    const title = document.getElementById("formTitle");
    if (title) title.textContent = "Táº¡o cÃ¢u há»i tá»« file Word";
  }
})();
