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

    if (!window.mammoth?.extractRawText) {
      alert("Chưa tải được bộ đọc file Word.");
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer });
      const parsed = parseWordQuestions(result.value || "");
      if (!parsed.questions.length) {
        alert("Không tìm thấy câu hỏi hợp lệ trong file Word.");
        return;
      }

      openImportReviewArea();

      window.QuestionAIShared?.appendImportedQuestions?.(parsed.questions, parsed.warnings);

      const target = document.getElementById("questionsSection");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      alert("Không đọc được file Word: " + (error?.message || error));
    }
  }

  function parseWordQuestions(rawText) {
    const text = normalizeWordText(rawText);
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
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function splitQuestionBlocks(text) {
    const regex = /(?:^|\n)\s*(?:Câu|Cau)\s*\d+\s*[:.)-]/gi;
    const matches = [...text.matchAll(regex)];
    if (!matches.length) return [];

    const blocks = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + (matches[i][0].startsWith("\n") ? 1 : 0);
      const end = i + 1 < matches.length
        ? matches[i + 1].index
        : text.length;
      const block = text.slice(start, end).trim();
      if (block) blocks.push(block);
    }
    return blocks;
  }

  function parseQuestionBlock(block, index) {
    const warnings = [];
    const withoutHeader = block.replace(/^\s*(?:Câu|Cau)\s*\d+\s*[:.)-]?\s*/i, "").trim();
    if (!withoutHeader) {
      return { question: null, warnings: [`Câu ${index + 1} trống nên đã bị bỏ qua.`] };
    }

    const answerMatch = withoutHeader.match(/(?:^|\n|\s)(?:Đáp án|Dap an|DAP AN|DA)\s*[:\-]?\s*([A-D])/i);
    const answer = answerMatch?.[1]?.toUpperCase() || "";
    const body = answerMatch ? withoutHeader.replace(answerMatch[0], " ").trim() : withoutHeader;

    const optionMatches = findOptionMatches(body);
    const labels = optionMatches.map(match => match.label).join("");
    const hasFullChoiceSet = /A.*B.*C.*D/.test(labels);

    if (!hasFullChoiceSet) {
      warnings.push(`Câu ${index + 1}: không tách được đủ A, B, C, D nên đang để dạng tự luận để bạn rà lại.`);
      return {
        question: {
          question_type: "essay",
          question_text: body,
          options: [],
          difficulty: 5,
          answer: "",
          answer_count: 0,
          has_figure: false,
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
    if (required.some(label => !optionMap.has(label))) {
      warnings.push(`Câu ${index + 1}: thiếu ít nhất một đáp án A/B/C/D, cần kiểm tra lại.`);
      return {
        question: {
          question_type: "essay",
          question_text: body,
          options: [],
          difficulty: 5,
          answer: "",
          answer_count: 0,
          has_figure: false,
        },
        warnings,
      };
    }

    const aIndex = optionMap.get("A").index;
    const questionText = body.slice(0, aIndex).trim();
    if (!questionText) {
      warnings.push(`Câu ${index + 1}: không nhận ra phần đề bài, cần kiểm tra lại.`);
    }

    const options = [];
    for (let i = 0; i < required.length; i++) {
      const label = required[i];
      const current = optionMap.get(label);
      const next = i + 1 < required.length ? optionMap.get(required[i + 1]).index : body.length;
      const optionText = body
        .slice(current.contentStart, next)
        .replace(/\s+/g, " ")
        .trim();
      options.push(`${label}. ${optionText}`);
    }

    if (!answer) {
      warnings.push(`Câu ${index + 1}: chưa tìm thấy đáp án đúng, bạn cần bổ sung trước khi lưu.`);
    }

    return {
      question: {
        question_type: "multi_choice",
        question_text: [
          questionText,
          ...options,
        ].filter(Boolean).join("\n"),
        options: [],
        difficulty: 5,
        answer,
        answer_count: 4,
        has_figure: false,
      },
      warnings,
    };
  }

  function findOptionMatches(body) {
    const matches = [];
    const regex = /(^|[\s\n])([A-D])([.)\:])\s+/g;
    let match;
    while ((match = regex.exec(body)) !== null) {
      const prefixLength = match[1].length;
      const index = match.index + prefixLength;
      matches.push({
        label: match[2],
        index,
        contentStart: index + 2,
      });
    }
    return matches;
  }

  function openImportReviewArea() {
    if (typeof window.switchTab === "function") {
      try {
        window.switchTab("ai");
      } catch (_) {
        // Fallback below handles pages without a full tab wrapper.
      }
    }

    const aiTab = document.getElementById("tab-ai");
    if (aiTab) aiTab.classList.add("active");
  }
})();
