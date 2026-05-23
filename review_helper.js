(function(){

  const SECTION_ORDER = ["multi_choice", "true_false", "short_answer", "essay"];
  const SECTION_TITLES = {
    multi_choice: "Phần I. Trắc nghiệm",
    true_false: "Phần II. Đúng / Sai",
    short_answer: "Phần III. Trả lời ngắn",
    essay: "Phần IV. Tự luận",
  };
  const TYPE_LABEL = {
    multi_choice: "Trắc nghiệm",
    true_false: "Đúng/Sai",
    short_answer: "Trả lời ngắn",
    essay: "Tự luận",
  };

  window.buildReviewCards = function(eqs, ansMap, canGradeEssay = false, options = {}) {
    const frag = document.createDocumentFragment();
    const groups = {};
    SECTION_ORDER.forEach(type => { groups[type] = []; });

    (eqs || []).filter(eq => eq.question).forEach(eq => {
      const type = eq.question.question_type;
      if (groups[type]) groups[type].push(eq);
    });

    let globalNum = 0;
    const pendingCards = [];

    SECTION_ORDER.forEach(type => {
      if (!groups[type].length) return;

      const section = document.createElement("div");
      section.style.cssText = "margin-bottom:24px";

      const secTitle = document.createElement("div");
      secTitle.style.cssText =
        "font-family:var(--font-display);font-size:.88rem;font-weight:700;" +
        "padding:8px 14px;background:var(--navy);color:#fff;border-radius:8px;margin-bottom:10px";
      secTitle.textContent = SECTION_TITLES[type];
      section.appendChild(secTitle);

      groups[type].forEach(eq => {
        globalNum++;
        const card = buildCard(eq, globalNum, ansMap[eq.question.id], canGradeEssay, options);
        section.appendChild(card);
        pendingCards.push(card);
      });

      frag.appendChild(section);
    });

    typesetWhenReady(pendingCards);

    return frag;
  };

  function normalizeReviewText(value) {
    return String(value || "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\\\\([()[\]])/g, "\\$1")
      .replace(/\\\\([a-zA-Z]+)/g, "\\$1")
      .replace(/\\\$/g, "$");
  }

  function parseQuestionLayout(questionText, type, answerCount) {
    const normalizedQuestionText = normalizeReviewText(questionText);
    const rawLines = normalizedQuestionText.split(/\r?\n/);
    const stemLines = [];
    const parsedOptions = [];
    const optionPattern = /^([a-d])(?:[\)\.\:\-])\s+(.+)$/i;

    rawLines.forEach(line => {
      const match = line.match(optionPattern);
      if (match) {
        parsedOptions.push({ key: match[1], text: match[2].trim() });
      } else {
        stemLines.push(line);
      }
    });

    const expectedCount = Math.max(1, parseInt(answerCount, 10) || 0);
    if (!["multi_choice", "true_false"].includes(type) ||
        parsedOptions.length < Math.min(2, expectedCount)) {
      return { stem: normalizedQuestionText.trim(), options: [] };
    }

    const options = [];
    for (let i = 0; i < expectedCount; i++) {
      const key = type === "true_false" ? String.fromCharCode(97 + i) : String.fromCharCode(65 + i);
      const found = parsedOptions.find(option => option.key.toLowerCase() === key.toLowerCase());
      options.push({ key: found?.key || key, text: found?.text || "" });
    }

    return {
      stem: stemLines.join("\n").trim() || normalizedQuestionText.trim(),
      options,
    };
  }

  function buildCard(eq, globalNum, ans, canGradeEssay, options = {}) {
    const q = eq.question;
    const type = q.question_type;
    const hasImg = !!q.question_img;
    const isEssay = type === "essay";
    const answerCount = Math.max(2, parseInt(q.answer_count, 10) || 4);
    const layout = parseQuestionLayout(q.question_text, type, answerCount);
    const earned = ans?.score_earned ?? 0;
    const scoreText = ans?.score_earned == null && isEssay
      ? `Chưa chấm/${eq.points} điểm`
      : `${earned}/${eq.points} điểm`;

    const card = document.createElement("div");
    card.style.cssText =
      "background:var(--white);border:1px solid var(--border);border-radius:10px;" +
      "margin-bottom:10px;overflow:hidden";

    const hdr = document.createElement("div");
    hdr.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:8px 14px;" +
      "background:var(--surface);border-bottom:1px solid var(--border)";
    hdr.innerHTML =
      `<span style="width:26px;height:26px;border-radius:50%;background:var(--navy);color:var(--gold-light);
        display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;flex-shrink:0">${globalNum}</span>
       <span style="font-size:.75rem;font-weight:600;color:var(--ink-mid)">Câu ${globalNum}</span>
       <span style="font-size:.72rem;color:var(--ink-light);margin-left:4px">· ${TYPE_LABEL[type] || type}</span>
       <span style="margin-left:auto;font-size:.75rem;font-weight:800;color:var(--navy)">${scoreText}</span>`;
    card.appendChild(hdr);

    const body = document.createElement("div");
    body.style.cssText = "display:flex;flex-direction:column";

    const isCompactMobile = window.matchMedia?.("(max-width: 768px)")?.matches || false;
    const qPart = document.createElement("div");
    qPart.style.cssText = "padding:16px 18px;display:flex;flex-direction:column;gap:12px";
    const questionText = (type === "multi_choice" || type === "true_false") ? layout.stem : normalizeReviewText(q.question_text);
    const qText = buildQuestionText(questionText, hasImg ? 2 : 1);

    if (hasImg) {
      qPart.style.flexDirection = isCompactMobile ? "column" : "row";
      qPart.style.alignItems = "flex-start";
      qPart.style.gap = "16px";
      qPart.appendChild(qText);
      qPart.appendChild(buildImageColumn(q.question_img, 1, isCompactMobile));
    } else {
      qPart.appendChild(qText);
    }

    if (options.enableQuestionReport) {
      const reportButton = buildQuestionReportButton(q, options);
      if (reportButton) qPart.appendChild(reportButton);
    }
    body.appendChild(qPart);

    const aPart = document.createElement("div");
    aPart.style.cssText =
      "padding:14px 18px;background:var(--surface);border-top:1px solid var(--border);min-width:0;" +
      "display:flex;flex-direction:column;gap:8px";

    if (!isEssay) {
      buildNonEssayReview(aPart, q, ans, layout);
    } else if (canGradeEssay) {
      buildEssayGrade(aPart, ans, eq, q.id, options);
    } else {
      buildEssayView(aPart, ans, eq);
    }

    body.appendChild(aPart);
    card.appendChild(body);

    if (options.enableAiSolution && window.aiAddSolutionBtn) {
      window.aiAddSolutionBtn(card, q, ans?.answer || "");
    }

    return card;
  }

  function buildQuestionText(text, flexVal) {
    const el = document.createElement("div");
    el.style.cssText =
      `flex:${flexVal || 1};font-size:1.08rem;line-height:1.85;color:var(--navy);white-space:pre-line`;
    el.textContent = normalizeReviewText(text);
    return el;
  }

  function buildQuestionReportButton(question, options = {}) {
    if (!question?.id || !window.PublicExamSupport?.openQuestionReportModal) return null;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Báo lỗi";
    button.style.cssText =
      "align-self:flex-start;margin-top:6px;border:1px solid rgba(245,158,11,.28);background:#fff7ed;" +
      "color:#b45309;padding:4px 8px;border-radius:999px;font-size:.68rem;font-weight:800;" +
      "cursor:pointer;font-family:var(--font-body);line-height:1.2";
    button.addEventListener("click", () => {
      window.PublicExamSupport.openQuestionReportModal({
        questionId: question.id,
        questionStem: String(question.question_text || "").split(/\r?\n/).slice(0, 6).join("\n"),
        publicExamId: options.publicExamId || null,
        examResultId: options.examResultId || null,
        sourceMode: options.reportSourceMode || "review",
      });
    });
    return button;
  }

  function typesetWhenReady(elements, attempt = 0) {
    if (!elements?.length) return;
    requestAnimationFrame(() => {
      if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise(elements).catch(() => {});
      } else if (attempt < 20) {
        setTimeout(() => typesetWhenReady(elements, attempt + 1), 150);
      }
    });
  }

  function buildImageColumn(src, flexVal, isCompactMobile = false) {
    const col = document.createElement("div");
    col.style.cssText = isCompactMobile
      ? "width:100%;display:flex;align-items:flex-start;justify-content:center"
      : `flex:${flexVal};display:flex;align-items:flex-start;justify-content:flex-end`;
    const img = document.createElement("img");
    img.src = src;
    img.style.cssText = "max-width:100%;max-height:240px;object-fit:contain;border-radius:8px;cursor:zoom-in";
    img.onclick = () => window.open(src, "_blank", "noopener");
    col.appendChild(img);
    return col;
  }

  function buildNonEssayReview(container, q, ans, layout) {
    if (q.question_type === "multi_choice") {
      buildMultipleChoiceReview(container, q, ans, layout);
      return;
    }
    if (q.question_type === "true_false") {
      buildTrueFalseReview(container, q, ans, layout);
      return;
    }
    buildShortAnswerReview(container, q, ans);
  }

  function buildAnswerTitle(container, text = "Nội dung đáp án") {
    const title = document.createElement("div");
    title.style.cssText =
      "font-size:.74rem;font-weight:800;color:var(--ink-light);text-transform:uppercase;" +
      "letter-spacing:.06em;margin-bottom:2px";
    title.textContent = text;
    container.appendChild(title);
  }

  function buildCorrectLine(container, text) {
    if (!String(text || "").trim()) return;
    const line = document.createElement("div");
    line.style.cssText =
      "margin-top:4px;padding:9px 12px;border-radius:8px;background:#dcfce7;border:1px solid #86efac;" +
      "color:#15803d;font-size:.84rem;font-weight:700;white-space:pre-line";
    line.textContent = "Đáp án đúng: " + normalizeReviewText(text);
    container.appendChild(line);
  }

  function buildSkippedLine(container, text = "Chưa chọn đáp án.") {
    const line = document.createElement("div");
    line.style.cssText = "font-size:.8rem;color:var(--ink-light);font-style:italic;margin-top:2px";
    line.textContent = text;
    container.appendChild(line);
  }

  function buildMultipleChoiceReview(container, q, ans, layout) {
    const count = Math.max(2, parseInt(q.answer_count, 10) || 4);
    const selected = String(ans?.answer || "");
    const correct = String(q.answer || "");
    const options = layout.options.length
      ? layout.options
      : Array.from({ length: count }, (_, i) => ({ key: String.fromCharCode(65 + i), text: "" }));

    buildAnswerTitle(container);
    options.forEach((option, index) => {
      const key = option.key || String.fromCharCode(65 + index);
      const picked = selected.toUpperCase().includes(key.toUpperCase());
      const isCorrect = correct.toUpperCase().includes(key.toUpperCase());
      container.appendChild(buildOptionRow({
        key,
        text: normalizeReviewText(option.text),
        picked,
        isCorrect,
        pickedLabel: "Bạn chọn",
      }));
    });

    if (!selected.trim()) buildSkippedLine(container);
    buildCorrectLine(container, correct);
  }

  function buildTrueFalseReview(container, q, ans, layout) {
    const count = Math.max(2, parseInt(q.answer_count, 10) || 4);
    const student = normalizeTrueFalse(ans?.answer || "", count);
    const correct = normalizeTrueFalse(q.answer || "", count);
    const options = layout.options.length
      ? layout.options
      : Array.from({ length: count }, (_, i) => ({ key: String.fromCharCode(97 + i), text: "" }));

    buildAnswerTitle(container);
    options.forEach((option, index) => {
      const key = option.key || String.fromCharCode(97 + index);
      const studentValue = student[index] || "";
      const correctValue = correct[index] || "";
      const picked = !!studentValue;
      const isCorrect = picked && studentValue === correctValue;
      container.appendChild(buildOptionRow({
        key: key + ")",
        text: normalizeReviewText(option.text),
        picked,
        isCorrect,
        pickedLabel: picked ? "Bạn chọn: " + labelTrueFalse(studentValue) : "",
      }));
    });

    if (!String(ans?.answer || "").trim()) buildSkippedLine(container);
    buildCorrectLine(container, formatTrueFalseAnswer(correct));
  }

  function buildOptionRow({ key, text, picked, isCorrect, pickedLabel }) {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:flex-start;gap:12px;padding:11px 12px;border-radius:8px;margin-bottom:6px;" +
      "border:1.5px solid " + (picked ? (isCorrect ? "#86efac" : "#fca5a5") : "var(--border)") + ";" +
      "background:" + (picked ? (isCorrect ? "#f0fdf4" : "#fef2f2") : "var(--white)");

    const body = document.createElement("div");
    body.style.cssText = "flex:1;min-width:0";

    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:" + (text ? "4px" : "0") + ";flex-wrap:wrap";
    const keyEl = document.createElement("span");
    keyEl.style.cssText = "font-weight:700;font-size:.92rem;color:var(--navy);min-width:22px;flex-shrink:0";
    keyEl.textContent = key;
    head.appendChild(keyEl);

    if (pickedLabel) {
      const pickedEl = document.createElement("span");
      pickedEl.style.cssText = "font-size:.72rem;font-weight:800;color:" + (isCorrect ? "#15803d" : "#b91c1c");
      pickedEl.textContent = pickedLabel;
      head.appendChild(pickedEl);
    }
    body.appendChild(head);

    if (text) {
      const textEl = document.createElement("div");
      textEl.style.cssText = "font-size:.94rem;line-height:1.55;color:var(--ink);white-space:pre-line";
      textEl.textContent = normalizeReviewText(text);
      body.appendChild(textEl);
    }

    row.appendChild(body);
    return row;
  }

  function buildShortAnswerReview(container, q, ans) {
    buildAnswerTitle(container, "Câu trả lời");
    const box = document.createElement("div");
    box.style.cssText =
      "width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;" +
      "background:var(--white);font-size:.9rem;color:var(--ink);white-space:pre-wrap;min-height:40px";
    const answer = String(ans?.answer || "");
    if (answer.trim()) {
      box.textContent = answer;
    } else {
      box.style.color = "var(--ink-light)";
      box.style.fontStyle = "italic";
      box.textContent = "Không trả lời";
    }
    container.appendChild(box);
    buildCorrectLine(container, q.answer || "");
  }

  function buildEssayView(container, ans, eq) {
    buildAnswerTitle(container, "Câu trả lời");
    const ansEl = document.createElement("div");
    ansEl.style.cssText =
      "font-size:.9rem;background:var(--white);border:1.5px solid var(--border);" +
      "border-radius:8px;padding:10px 12px;white-space:pre-wrap;min-height:90px;max-height:220px;overflow-y:auto";
    if (ans?.answer) {
      ansEl.textContent = ans.answer;
    } else {
      ansEl.style.color = "var(--ink-light)";
      ansEl.style.fontStyle = "italic";
      ansEl.textContent = "Không trả lời";
    }
    container.appendChild(ansEl);
    buildCorrectLine(container, eq.question?.answer || "");
  }

  function buildEssayGrade(container, ans, eq, qid, options = {}) {
    buildEssayView(container, ans, eq);

    const inputPrefix = options.essayInputPrefix || "cv_essay_";
    const updateHandler = options.essayUpdateHandler || "cvUpdateEssayTotal";
    const inputId = inputPrefix + qid;

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap";
    row.innerHTML =
      `<label style="font-size:.72rem;font-weight:700;color:var(--ink-mid)">Điểm:</label>
       <input type="number" id="${inputId}" value="${ans?.score_earned || 0}"
         min="0" max="${eq.points}" step="0.5"
         style="width:70px;padding:5px 8px;border:1.5px solid var(--border);border-radius:7px;
           font-size:.85rem;text-align:center;outline:none"
         onfocus="this.style.borderColor='var(--gold)'"
         onblur="this.style.borderColor='var(--border)'"
         oninput="${updateHandler}()">
       <span style="font-size:.78rem;color:var(--ink-mid)">/ ${eq.points} điểm</span>`;
    container.appendChild(row);
  }

  function normalizeTrueFalse(value, count) {
    if (window.QuestionAnswerFormat?.normalizeTrueFalseAnswer) {
      return window.QuestionAnswerFormat.normalizeTrueFalseAnswer(value, count) || "";
    }
    return String(value || "").toUpperCase().replace(/[^TF]/g, "").slice(0, count);
  }

  function labelTrueFalse(value) {
    if (value === "T") return "Đúng";
    if (value === "F") return "Sai";
    return "-";
  }

  function formatTrueFalseAnswer(value) {
    return String(value || "")
      .split("")
      .map((item, index) => `${String.fromCharCode(97 + index)}) ${labelTrueFalse(item)}`)
      .join("; ");
  }

})();
