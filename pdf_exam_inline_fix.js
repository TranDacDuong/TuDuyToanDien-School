function openPdfQuestionModal() {
  addPdfDraftQuestionInline();
}

async function submitPdfQuestionForm(ev) {
  ev.preventDefault();
  renderDraftQuestionList();
}

function closePdfQuestionModal() {
  if (window.PDF_EL?.questionModal) PDF_EL.questionModal.classList.remove("show");
}

function renderPartialScoreEditor() {
  return;
}

function renderPdfTypeToggle(q) {
  const items = [
    ["multi_choice", "Trắc nghiệm"],
    ["true_false", "Đúng Sai"],
    ["short_answer", "Trả lời ngắn"],
    ["essay", "Tự luận"],
  ];
  return `<div class="draft-type-toggle">
    ${items.map(([value, label]) => `
      <button
        class="draft-type-btn ${q.question_type === value ? "active" : ""}"
        type="button"
        onclick="updatePdfDraftType('${q.id}','${value}')"
      >${label}</button>
    `).join("")}
  </div>`;
}

function renderInlinePdfAnswerEditor(q) {
  const count = Math.max(1, Number(q.answer_count || 1));

  if (q.question_type === "essay") {
    return `<div class="hint">Tự luận không có đáp án chấm tự động.</div>`;
  }

  if (q.question_type === "multi_choice") {
    const selected = new Set(String(q.answer || "").split("").map((x) => x.trim().toUpperCase()).filter(Boolean));
    return `<div class="draft-inline-group">
      <span class="draft-inline-label">Đáp án:</span>
      <div class="count-stepper">
        <button class="icon-btn" type="button" onclick="updatePdfDraftAnswerCount('${q.id}',-1)">-</button>
        <button class="icon-btn" type="button" onclick="updatePdfDraftAnswerCount('${q.id}',1)">+</button>
      </div>
      ${Array.from({ length: count }, (_, idx) => {
        const letter = String.fromCharCode(65 + idx);
        const checked = selected.has(letter) ? "checked" : "";
        return `<label class="draft-inline-option">
          <input type="checkbox" ${checked} onchange="
            (function() {
              const current = new Set(String('${escAttr(q.answer || "")}').split('').map(x => x.trim().toUpperCase()).filter(Boolean));
              if (this.checked) current.add('${letter}'); else current.delete('${letter}');
              updatePdfDraftField('${q.id}','answer',Array.from(current).sort().join(''));
            }).call(this)
          ">
          <span>${letter}</span>
        </label>`;
      }).join("")}
    </div>`;
  }

  if (q.question_type === "true_false") {
    const map = {};
    const raw = String(q.answer || "");
    for (let i = 0; i < raw.length; i += 2) {
      map[raw[i]] = raw[i + 1] || "Đ";
    }
    return `<div class="draft-inline-group">
      <span class="draft-inline-label">Đáp án:</span>
      <div class="count-stepper">
        <button class="icon-btn" type="button" onclick="updatePdfDraftAnswerCount('${q.id}',-1)">-</button>
        <button class="icon-btn" type="button" onclick="updatePdfDraftAnswerCount('${q.id}',1)">+</button>
      </div>
      ${Array.from({ length: count }, (_, idx) => {
        const letter = String.fromCharCode(65 + idx);
        const value = map[letter.toLowerCase()] || map[letter] || "Đ";
        return `<label class="draft-inline-option">
          <span>${letter}</span>
          <select class="select" style="width:48px" onchange="
            (function() {
              const current = {};
              const src = String('${escAttr(q.answer || "")}');
              for (let i = 0; i < src.length; i += 2) current[src[i].toLowerCase()] = src[i + 1] || 'Đ';
              current['${letter.toLowerCase()}'] = this.value;
              const merged = Object.keys(current).sort().map(key => key + current[key]).join('');
              updatePdfDraftField('${q.id}','answer',merged);
            }).call(this)
          ">
            <option value="Đ" ${value === "Đ" ? "selected" : ""}>Đ</option>
            <option value="S" ${value === "S" ? "selected" : ""}>S</option>
          </select>
        </label>`;
      }).join("")}
    </div>`;
  }

  const values = String(q.answer || "").split("|");
  return `<div class="draft-inline-group">
    <span class="draft-inline-label">Đáp án:</span>
    <div class="count-stepper">
      <button class="icon-btn" type="button" onclick="updatePdfDraftAnswerCount('${q.id}',-1)">-</button>
      <button class="icon-btn" type="button" onclick="updatePdfDraftAnswerCount('${q.id}',1)">+</button>
    </div>
    ${Array.from({ length: count }, (_, idx) => {
      const value = escAttr(values[idx] || "");
      return `<input class="input draft-inline-text" type="text" value="${value}" oninput="
        (function() {
          const arr = String('${escAttr(q.answer || "")}').split('|');
          arr[${idx}] = this.value.trim();
          updatePdfDraftField('${q.id}','answer',arr.filter(Boolean).join('|'));
        }).call(this)
      " placeholder="Ý ${idx + 1}">`;
    }).join("")}
  </div>`;
}

function renderInlinePdfPartialEditor(q) {
  if (q.question_type === "essay") {
    return `<div class="hint">Tự luận chấm thủ công.</div>`;
  }

  const count = Math.max(1, Number(q.answer_count || 1));
  const points = Number(q.points || 0);
  const partial = q.partial_points || {};
  const range = q.question_type === "true_false"
    ? Array.from({ length: count + 1 }, (_, idx) => idx)
    : Array.from({ length: count }, (_, idx) => idx + 1);

  return `<div class="draft-inline-partials">
    <span class="draft-inline-label">Điểm chi tiết:</span>
    ${range.map((num) => {
      const value = partial[String(num)] ?? (num === count ? points : "");
      return `<label class="draft-inline-partial">
        <span>${num} ý</span>
        <input class="input" type="number" min="0" step="0.05" value="${value}" oninput="updatePdfDraftPartial('${q.id}',${num},this.value)">
      </label>`;
    }).join("")}
  </div>`;
}

function renderDraftQuestionList() {
  PDF_EL.draftQuestionList.className = "draft-answer-list";
  PDF_EL.draftQuestionList.innerHTML = PDF_STATE.draftQuestions.length
    ? PDF_STATE.draftQuestions
      .sort((a, b) => (a.order_no || 0) - (b.order_no || 0))
      .map((item, idx) => {
        const q = withPdfPartialDefaults({ ...item, order_no: idx + 1 });
        return `<div class="draft-answer-item" id="pdfDraftRow_${q.id}">
          <div class="draft-answer-topline">
            <div class="draft-inline-title">Câu ${idx + 1}</div>
            <div class="draft-inline-group">
              <span class="draft-inline-label">Loại câu:</span>
              ${renderPdfTypeToggle(q)}
              ${renderInlinePdfAnswerEditor(q)}
            </div>
            <button class="btn btn-danger btn-sm" type="button" onclick="deletePdfQuestion('${q.id}')">Xóa</button>
          </div>
          <div class="draft-answer-bottomline">
            <div class="draft-inline-group">
              <span class="draft-inline-label">Điểm câu:</span>
              <input class="input draft-inline-point" type="number" min="0" step="0.05" value="${q.points ?? 0}" oninput="updatePdfDraftField('${q.id}','points',this.value)">
            </div>
            <div></div>
            ${renderInlinePdfPartialEditor(q)}
          </div>
        </div>`;
      }).join("")
    : `<div class="empty"><strong>Chưa có đáp án nào</strong><div>Hãy bấm + Thêm đáp án để thêm trực tiếp từng câu bên dưới.</div></div>`;
}

window.addEventListener("DOMContentLoaded", () => {
  if (window.PDF_EL?.questionModal) {
    PDF_EL.questionModal.remove();
    PDF_EL.questionModal = null;
    PDF_EL.questionForm = null;
    PDF_EL.questionOrder = null;
    PDF_EL.questionLabel = null;
    PDF_EL.questionType = null;
    PDF_EL.questionPoints = null;
    PDF_EL.questionAnswerCount = null;
    PDF_EL.answerEditor = null;
    PDF_EL.partialScoreWrap = null;
  }
});
