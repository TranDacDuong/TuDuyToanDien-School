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
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
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
    setProgress(0, "Đang đọc PDF...");
    const reader = new FileReader();
    const b64 = await new Promise(res => {
      reader.onload = ev => res(ev.target.result.split(",")[1]);
      reader.readAsDataURL(file);
    });

    setProgress(20, "Đang gửi PDF lên AI...");
    const prompt = buildExtractionPrompt();
    const messages = [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "application/pdf", data: b64 } },
        { type: "text", text: prompt },
      ],
    }];

    try {
      setProgress(40, "AI đang phân tích PDF...");
      const result = await callAI(messages);
      setProgress(80, "Đang xử lý kết quả...");
      await parseAndRenderQuestions(result);
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
      const parts = [];
      if (_pastedImg) {
        const mtype = _pastedImg.startsWith("data:image/png") ? "image/png" : "image/jpeg";
        parts.push({ type: "image", source: { type: "base64", media_type: mtype, data: _pastedImg.split(",")[1] } });
      }
      parts.push({ type: "text", text: (text || "") + "\n\n" + buildExtractionPrompt() });

      const messages = [{ role: "user", content: parts }];
      _lastSourceImg = _pastedImg; // lưu trước khi gọi AI để crop sau
      setProgress(50, "AI đang phân tích...");
      const result = await callAI(messages);
      setProgress(90, "Đang xử lý...");
      await parseAndRenderQuestions(result);
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

  function buildExtractionPrompt() {
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
  async function parseAndRenderQuestions(raw) {
    console.log("[AI raw response]:", raw.slice(0, 300));
    let parsed = [];
    try {
      const clean = raw.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
      parsed = JSON.parse(clean);
    } catch {
      // Thử tìm JSON array hoàn chỉnh nhất có thể
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          // JSON bị cắt — thử parse từng object riêng lẻ
          const objs = [];
          const objMatches = raw.matchAll(/\{[\s\S]*?\}(?=\s*[,\]]|\s*$)/g);
          for (const m of objMatches) {
            try { objs.push(JSON.parse(m[0])); } catch {}
          }
          if (objs.length) { parsed = objs; }
          else { alert("AI trả về định dạng không đúng, thử lại."); return; }
        }
      } else {
        alert("AI trả về định dạng không đúng, thử lại."); return;
      }
    }

    if (!Array.isArray(parsed) || !parsed.length) {
      alert("Không tìm thấy câu hỏi nào. Thử lại với nội dung rõ ràng hơn."); return;
    }

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
