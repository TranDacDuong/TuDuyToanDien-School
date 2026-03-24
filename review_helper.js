/* ══════════════════════════════════════════════════════════════
   REVIEW HELPER — dùng chung cho mọi chỗ xem lại bài thi
   Cùng layout 15 phần ngang như lúc thi
   window.buildReviewCards(eqs, ansMap, canGradeEssay, options) → DOM fragment
   window.buildReviewCard(eq, i, globalNum, ans) → DOM card element
══════════════════════════════════════════════════════════════ */
(function(){

  const SECTION_ORDER  = ["multi_choice","true_false","short_answer","essay"];
  const SECTION_TITLES = {
    multi_choice: "Phần I. Trắc nghiệm",
    true_false:   "Phần II. Đúng / Sai",
    short_answer: "Phần III. Trả lời ngắn",
    essay:        "Phần IV. Tự luận",
  };
  const TYPE_LABEL = {
    multi_choice:"Trắc nghiệm", true_false:"Đúng/Sai",
    short_answer:"Trả lời ngắn", essay:"Tự luận"
  };

  /*
    eqs   : mảng exam_questions đã sort theo order_no, mỗi item có .question
    ansMap: { [question_id]: { answer, is_correct, score_earned } }
    canGradeEssay: hiện input chấm điểm (cho admin/teacher), mặc định false
    options.enableAiSolution: hiện nút "Xem lời giải AI" ở card review của học sinh
    Returns: DocumentFragment chứa các section + card
  */
  window.buildReviewCards = function(eqs, ansMap, canGradeEssay = false, options = {}) {
    const frag = document.createDocumentFragment();

    // Group theo loại — giữ đúng thứ tự section
    const groups = {};
    SECTION_ORDER.forEach(t => { groups[t] = []; });
    eqs.filter(eq => eq.question).forEach(eq => {
      const t = eq.question.question_type;
      if (groups[t]) groups[t].push(eq);
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
        const card = _buildCard(eq, globalNum, ansMap[eq.question.id], canGradeEssay, options);
        section.appendChild(card);
        pendingCards.push(card);
      });

      frag.appendChild(section);
    });

    // MathJax sau khi mount
    requestAnimationFrame(() => {
      if (window.MathJax?.typesetPromise && pendingCards.length) {
        window.MathJax.typesetPromise(pendingCards).catch(() => {});
      }
    });

    return frag;
  };

  function _buildCard(eq, globalNum, ans, canGradeEssay, options = {}) {
    const q      = eq.question;
    const type   = q.question_type;
    const hasImg = !!q.question_img;
    const isEssay = type === "essay";

    /* ── Card wrapper ── */
    const card = document.createElement("div");
    card.style.cssText =
      "background:var(--white);border:1px solid var(--border);border-radius:10px;" +
      "margin-bottom:10px;overflow:hidden";

    /* ── Header ── */
    const hdr = document.createElement("div");
    hdr.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:8px 14px;" +
      "background:var(--surface);border-bottom:1px solid var(--border)";
    hdr.innerHTML =
      `<span style="width:26px;height:26px;border-radius:50%;background:var(--navy);color:var(--gold-light);
        display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;flex-shrink:0">${globalNum}</span>
       <span style="font-size:.75rem;font-weight:600;color:var(--ink-mid)">Câu ${globalNum}</span>
       <span style="font-size:.72rem;color:var(--ink-light);margin-left:4px">· ${TYPE_LABEL[type]||type}</span>
       <span style="margin-left:auto;font-size:.75rem;color:var(--ink-mid)">${eq.points} điểm</span>`;
    card.appendChild(hdr);

    /* ── Body: 15 phần ngang ── */
    const body = document.createElement("div");
    body.style.cssText = "display:flex;flex-direction:row;min-height:80px";

    /* Phần câu hỏi: flex:13 */
    const qPart = document.createElement("div");
    qPart.style.cssText =
      "flex:13;padding:14px 16px;border-right:1px solid var(--border);" +
      "display:flex;gap:12px;align-items:flex-start";

    const mkText = (text, flexVal) => {
      const el = document.createElement("div");
      el.style.cssText =
        `flex:${flexVal||1};font-size:.9rem;line-height:1.8;color:var(--navy);white-space:pre-line`;
      el.textContent = text || "";
      return el;
    };

    if (type === "true_false") {
      // Chỉ dòng đầu (không có a,b,c,d)
      const mainQ = (q.question_text||"").split("\n")[0];
      const qEl   = mkText(mainQ, hasImg ? 8 : 1);
      qPart.appendChild(qEl);
      if (hasImg) {
        const imgCol = _mkImgCol(q.question_img, 5);
        qPart.appendChild(imgCol);
      }
    } else if (hasImg) {
      qPart.appendChild(mkText(q.question_text, 8));
      qPart.appendChild(_mkImgCol(q.question_img, 5));
    } else {
      qPart.appendChild(mkText(q.question_text, 1));
    }
    body.appendChild(qPart);

    /* Phần đáp án + kết quả: flex:2 */
    const aPart = document.createElement("div");
    aPart.style.cssText =
      "flex:2;padding:10px 12px;background:var(--surface);min-width:0;" +
      "display:flex;flex-direction:column;gap:6px;justify-content:center";

    if (!isEssay) {
      _buildNonEssayResult(aPart, q, ans, eq);
    } else if (canGradeEssay) {
      _buildEssayGrade(aPart, q, ans, eq);
    } else {
      _buildEssayView(aPart, q, ans, eq);
    }

    body.appendChild(aPart);
    card.appendChild(body);

    if (options.enableAiSolution && window.aiAddSolutionBtn) {
      window.aiAddSolutionBtn(card, q, ans?.answer || "");
    }

    return card;
  }

  function _mkImgCol(src, flexVal) {
    const col = document.createElement("div");
    col.style.cssText = `flex:${flexVal};display:flex;align-items:center;justify-content:center`;
    const img = document.createElement("img");
    img.src = src;
    img.style.cssText = "max-width:100%;max-height:200px;object-fit:contain;border-radius:6px";
    col.appendChild(img);
    return col;
  }

  function _buildNonEssayResult(container, q, ans, eq) {
    if (ans?.answer) {
      const ok  = ans.is_correct;
      const box = document.createElement("div");
      box.style.cssText =
        `padding:6px 8px;border-radius:7px;background:${ok?"#f0fdf4":"#fef2f2"};` +
        `border:1px solid ${ok?"#86efac":"#fca5a5"}`;
      box.innerHTML =
        `<div style="font-weight:700;font-size:.8rem;color:${ok?"var(--green)":"var(--red)"}">${ok?"✓ Đúng":"✗ Sai"}</div>
         <div style="font-size:.78rem;margin-top:2px">Bạn: <b>${ans.answer}</b></div>` +
        (!ok && q.answer
          ? `<div style="font-size:.78rem;color:var(--green);margin-top:2px">Đúng: <b>${q.answer}</b></div>`
          : "") +
        `<div style="font-size:.78rem;font-weight:700;color:${ok?"var(--green)":"var(--red)"};margin-top:4px">${ans.score_earned??0}/${eq.points}đ</div>`;
      container.appendChild(box);
    } else {
      const box = document.createElement("div");
      box.style.cssText =
        "padding:6px 8px;border-radius:7px;background:var(--surface);" +
        "border:1px solid var(--border);font-size:.78rem;color:var(--ink-light)";
      box.innerHTML =
        "— Bỏ qua" +
        (q.answer ? `<div style="color:var(--green);margin-top:2px">Đúng: <b>${q.answer}</b></div>` : "") +
        `<div style="font-weight:700;color:var(--red);margin-top:4px">0/${eq.points}đ</div>`;
      container.appendChild(box);
    }
  }

  function _buildEssayView(container, q, ans, eq) {
    const ansEl = document.createElement("div");
    ansEl.style.cssText =
      "font-size:.8rem;background:var(--white);border:1px solid var(--border);" +
      "border-radius:7px;padding:6px 8px;white-space:pre-wrap;max-height:160px;overflow-y:auto";
    if (ans?.answer) {
      ansEl.textContent = ans.answer;
    } else {
      ansEl.innerHTML = '<span style="color:var(--ink-light);font-style:italic">Không trả lời</span>';
    }
    container.appendChild(ansEl);

    const scored = ans?.score_earned != null;
    const scoreEl = document.createElement("div");
    scoreEl.style.cssText =
      "font-size:.78rem;font-weight:700;" + (scored ? "color:var(--navy)" : "color:var(--amber)");
    scoreEl.textContent = scored
      ? `Điểm: ${ans.score_earned}/${eq.points}đ`
      : "⏳ Chưa chấm";
    container.appendChild(scoreEl);
  }

  function _buildEssayGrade(container, q, ans, eq) {
    // Bài làm
    const ansEl = document.createElement("div");
    ansEl.style.cssText =
      "font-size:.8rem;background:var(--white);border:1px solid var(--border);" +
      "border-radius:7px;padding:6px 8px;white-space:pre-wrap;max-height:120px;overflow-y:auto";
    if (ans?.answer) {
      ansEl.textContent = ans.answer;
    } else {
      ansEl.innerHTML = '<span style="color:var(--ink-light);font-style:italic">Không trả lời</span>';
    }
    container.appendChild(ansEl);

    // Input chấm điểm
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:4px";
    row.innerHTML =
      `<label style="font-size:.72rem;font-weight:700;color:var(--ink-mid)">Điểm:</label>
       <input type="number" id="cv_essay_${q.id}" value="${ans?.score_earned||0}"
         min="0" max="${eq.points}" step="0.5"
         style="width:60px;padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;
           font-size:.82rem;text-align:center;outline:none"
         onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--border)'"
         oninput="cvUpdateEssayTotal()">
       <span style="font-size:.72rem;color:var(--ink-mid)">/${eq.points}</span>`;
    container.appendChild(row);
  }

})();
