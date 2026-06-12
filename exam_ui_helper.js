(function () {
  function isChoiceHint(node) {
    const text = String(node?.textContent || "").trim();
    return text === "Chọn đáp án" || text === "Nội dung đáp án và chọn đáp án";
  }

  function removeChoiceHints(root) {
    root.querySelectorAll("div, span").forEach((node) => {
      if (isChoiceHint(node)) node.remove();
    });
  }

  function removeShortAnswerTitle(root) {
    root.querySelectorAll('input[placeholder="Nhập câu trả lời..."]').forEach((input) => {
      const title = input.previousElementSibling;
      if (String(title?.textContent || "").trim() === "Câu trả lời") title.remove();
    });
  }

  function inlineOptionText(root) {
    root.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((input) => {
      let row = input.parentElement;
      let content = null;
      while (row && row !== root.parentElement) {
        content = row.querySelector?.("div[style*='flex:1']") || null;
        if (content) break;
        row = row.parentElement;
      }
      const head = content?.firstElementChild;
      const text = head?.nextElementSibling;
      if (!head || !text || text.tagName !== "DIV") return;
      head.style.display = "inline-flex";
      head.style.marginBottom = "0";
      head.style.marginRight = "8px";
      text.style.display = "inline";
      content.style.display = "flex";
      content.style.alignItems = "baseline";
      content.style.flexWrap = "wrap";
    });
  }

  function addClasses(root, selector, ...classes) {
    if (root.matches?.(selector)) root.classList.add(...classes);
    root.querySelectorAll?.(selector).forEach((node) => node.classList.add(...classes));
  }

  function tagAcademicSurfaces(root) {
    addClasses(root, ".toolbar, .filter-bar", "academic-toolbar");
    addClasses(root, ".exam-card, .class-card, .course-card, .card, .exam-box, .screen-panel, .detail-card", "academic-card");
    addClasses(root, ".screen, .editor-overlay, .exam-shell", "academic-screen");
    addClasses(root, ".stop, .editor-topbar, .exam-topbar, .topbar", "academic-topbar");
    addClasses(root, "#classViewOverlay, #examOverlay", "academic-overlay", "academic-screen");
  }

  const SECTION_ORDER = ["multi_choice", "true_false", "short_answer", "essay"];
  const SECTION_TITLES = {
    multi_choice: "Phần I. Trắc nghiệm",
    true_false: "Phần II. Đúng / Sai",
    short_answer: "Phần III. Trả lời ngắn",
    essay: "Phần IV. Tự luận",
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatClock(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  function parseQuestionLayout(questionText, type, answerCount) {
    const source = String(questionText || "");
    const stemLines = [];
    const parsedOptions = [];
    source.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^([a-z])(?:[\)\.\:\-])\s+(.+)$/i);
      if (match) parsedOptions.push({ key: match[1], text: match[2].trim() });
      else stemLines.push(line);
    });
    const count = Math.max(1, parseInt(answerCount, 10) || 0);
    if (!["multi_choice", "true_false"].includes(type) || parsedOptions.length < Math.min(2, count)) {
      return { stem: source.trim(), options: [] };
    }
    return {
      stem: stemLines.join("\n").trim() || source.trim(),
      options: Array.from({ length: count }, (_, index) => {
        const key = type === "true_false" ? String.fromCharCode(97 + index) : String.fromCharCode(65 + index);
        const found = parsedOptions.find((option) => option.key.toLowerCase() === key.toLowerCase());
        return { key: found?.key || key, text: found?.text || "" };
      }),
    };
  }

  function isTrueFalseChecked(answer, label, index, value, count) {
    const source = String(answer || "");
    if (!source.trim()) return false;
    const explicitPairs = [...source.matchAll(/([a-z])\s*([TF])/g)];
    if (explicitPairs.length) {
      return explicitPairs.some(([, pairLabel, pairValue]) => (
        pairLabel.toLowerCase() === label.toLowerCase() && pairValue.toUpperCase() === value
      ));
    }
    const normalized = window.QuestionAnswerFormat?.normalizeTrueFalseAnswer?.(source, count)
      || source.toUpperCase().replace(/[^TF]/g, "");
    return normalized[index] === value;
  }

  function renderAnswer(question, answer, handlers) {
    const type = question.question_type;
    const qid = question.id;
    const count = Math.max(2, parseInt(question.answer_count, 10) || 4);
    const layout = parseQuestionLayout(question.question_text, type, count);
    if (type === "multi_choice") {
      return Array.from({ length: count }, (_, index) => {
        const option = String.fromCharCode(65 + index);
        const checked = answer.includes(option);
        return `<label id="lbl_${qid}_${option}" class="standard-exam-option ${checked ? "active" : ""}"
          onmouseover="this.style.borderColor='var(--navy)'"
          onmouseout="${handlers.refreshMC}('${qid}','${option}')">
          <span class="standard-exam-option-key">${esc(layout.options[index]?.key || option)}</span>
          <span class="standard-exam-option-text">${esc(layout.options[index]?.text || "")}</span>
          <input type="checkbox" id="cb_${qid}_${option}" value="${option}" ${checked ? "checked" : ""}
            onchange="${handlers.updateMC}('${qid}')">
        </label>`;
      }).join("");
    }
    if (type === "true_false") {
      return Array.from({ length: count }, (_, index) => {
        const label = String.fromCharCode(97 + index);
        return `<div class="standard-exam-tf-row">
          <span class="standard-exam-option-key">${label})</span>
          <span class="standard-exam-option-text">${esc(layout.options[index]?.text || "")}</span>
          <div class="standard-exam-tf-actions">
            <label><input type="radio" name="tf_${qid}_${label}" value="T" ${isTrueFalseChecked(answer, label, index, "T", count) ? "checked" : ""} onchange="${handlers.updateTF}('${qid}')"> Đúng</label>
            <label><input type="radio" name="tf_${qid}_${label}" value="F" ${isTrueFalseChecked(answer, label, index, "F", count) ? "checked" : ""} onchange="${handlers.updateTF}('${qid}')"> Sai</label>
          </div>
        </div>`;
      }).join("");
    }
    if (type === "short_answer") {
      return `<input class="standard-exam-text" type="text" placeholder="Nhập câu trả lời..." value="${esc(answer)}"
        oninput="${handlers.updateText}('${qid}',this.value)">`;
    }
    return `<textarea class="standard-exam-text standard-exam-essay" placeholder="Viết câu trả lời của bạn..."
      oninput="${handlers.updateText}('${qid}',this.value)">${esc(answer)}</textarea>`;
  }

  function renderQuestionCard(eq, index, answers, handlers) {
    const q = eq.question;
    const type = q.question_type;
    const layout = parseQuestionLayout(q.question_text, type, Math.max(2, parseInt(q.answer_count, 10) || 4));
    const questionText = ["multi_choice", "true_false"].includes(type) ? layout.stem : q.question_text;
    return `<article class="standard-exam-card qcard" id="qcard_${q.id}">
      <header class="standard-exam-question-head">
        <span class="standard-exam-question-number">${index}</span>
        <strong>Câu ${index}</strong>
        <span>${eq.points || 0} điểm</span>
      </header>
      <div class="standard-exam-question-body">
        <div class="standard-exam-question-copy">${esc(questionText || "")}</div>
        ${q.question_img ? `<img class="standard-exam-question-image" src="${esc(q.question_img)}" alt="Hình minh họa câu ${index}">` : ""}
      </div>
      <div class="standard-exam-answer">${renderAnswer(q, String(answers[q.id] || ""), handlers)}</div>
    </article>`;
  }

  function renderStandardExam(options) {
    const mount = options.mount;
    if (!mount) return;
    const questions = (options.questions || []).filter((eq) => eq?.question);
    const answers = options.answers || {};
    const handlers = options.handlers;
    const grouped = Object.fromEntries(SECTION_ORDER.map((type) => [type, []]));
    questions.forEach((eq) => grouped[eq.question.question_type]?.push(eq));
    let index = 0;
    const nav = SECTION_ORDER.map((type) => {
      if (!grouped[type].length) return "";
      return `<div class="standard-exam-nav-title">${SECTION_TITLES[type]}</div><div class="standard-exam-nav-grid">${grouped[type].map((eq) => {
        index += 1;
        return `<button id="nav_${eq.question.id}" class="standard-exam-nav-pill" type="button" onclick="${handlers.scroll}('${eq.question.id}')">${index}<span id="navdot_${eq.question.id}"></span></button>`;
      }).join("")}</div>`;
    }).join("");
    index = 0;
    const sections = SECTION_ORDER.map((type) => {
      if (!grouped[type].length) return "";
      return `<section class="standard-exam-section"><h3>${SECTION_TITLES[type]}</h3>${grouped[type].map((eq) => {
        index += 1;
        return renderQuestionCard(eq, index, answers, handlers);
      }).join("")}</section>`;
    }).join("");
    mount.innerHTML = `<div class="standard-exam-shell exam-shell">
      <div class="standard-exam-topbar topbar">
        <div class="standard-exam-title-row">
          <button id="${options.exitButtonId || "standardExamExit"}" type="button" onclick="${handlers.exit}()" title="Thoát" aria-label="Thoát">⏻</button>
          <h1>${esc(options.title || "Làm bài")}</h1>
        </div>
        <div class="standard-exam-actions">
          <div class="standard-exam-clock"><span>Thời gian</span><strong id="${options.clockId}">${formatClock(options.seconds)}</strong></div>
          <button class="standard-exam-submit" type="button" onclick="${handlers.submit}(false)">Nộp bài</button>
        </div>
      </div>
      <div class="standard-exam-layout">
        <aside id="${options.navPanelId}" class="standard-exam-nav exam-nav">
          <div class="standard-exam-nav-heading">Danh sách câu</div>${nav}
          <button class="standard-exam-nav-submit" type="button" onclick="${handlers.submit}(false)">Nộp bài</button>
        </aside>
        <div class="standard-exam-mobile-nav">
          <button type="button" onclick="${handlers.toggleNav}()">Danh sách câu</button>
          <span>Chạm để chuyển nhanh giữa các câu.</span>
        </div>
        <main id="${options.mainAreaId}" class="standard-exam-main exam-main">${sections}</main>
      </div>
    </div>`;
    questions.forEach((eq) => options.reportButtonBuilder?.(eq.question, document.getElementById("qcard_" + eq.question.id)?.querySelector(".standard-exam-question-body")));
    Object.keys(answers).forEach((qid) => {
      const dot = document.getElementById("navdot_" + qid);
      if (dot) dot.style.background = String(answers[qid] || "").trim() ? "var(--green)" : "var(--border)";
    });
    enhance(mount);
    const main = document.getElementById(options.mainAreaId);
    if (main && window.MathJax?.typesetPromise) window.MathJax.typesetPromise([main]).catch(() => {});
  }

  function renderStandardReview(options) {
    const mount = options.mount;
    if (!mount || !window.buildReviewCards) return false;
    mount.innerHTML = `<div class="standard-review-shell">
      <div class="standard-review-topbar academic-topbar">
        <button type="button" onclick="${options.backHandler}()" title="Quay lại" aria-label="Quay lại">←</button>
        <div>
          <h1>${esc(options.title || "Xem lại bài thi")}</h1>
          <p>${esc(options.subtitle || "Kết quả bài làm")}</p>
        </div>
        <div class="standard-review-score"><span>Tổng điểm</span><strong>${esc(options.score ?? "Chưa chấm")} / ${esc(options.totalPoints ?? 0)}</strong></div>
      </div>
      <main class="standard-review-main">
        <div id="standardReviewCards"></div>
      </main>
    </div>`;
    document.getElementById("standardReviewCards")?.appendChild(
      window.buildReviewCards(options.questions || [], options.answers || {}, !!options.canGradeEssay, options.cardsOptions || {})
    );
    enhance(mount);
    return true;
  }

  function enhance(root = document) {
    removeChoiceHints(root);
    removeShortAnswerTitle(root);
    inlineOptionText(root);
    tagAcademicSurfaces(root);
  }

  window.ExamUIHelper = { enhance, renderStandardExam, renderStandardReview };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
      });
    });
  });

  function start() {
    enhance(document);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
