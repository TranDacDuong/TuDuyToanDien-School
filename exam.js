(function () {

  function getSb() {
    if (window.sb) return window.sb;
    if (typeof sb !== "undefined") return sb;
    throw new Error("Supabase chưa sẵn");
  }

  const TYPE_LABEL = {
    multi_choice: "Trắc nghiệm",
    true_false:   "Đúng/Sai",
    short_answer: "Trả lời ngắn",
    essay:        "Tự luận",
  };
  const TYPE_CLASS = {
    multi_choice: "type-mc",
    true_false:   "type-tf",
    short_answer: "type-sa",
    essay:        "type-essay",
  };
  const SECTION_ORDER  = ["multi_choice", "true_false", "short_answer", "essay"];
  const SECTION_TITLES = {
    multi_choice: "Phần I. Trắc nghiệm nhiều lựa chọn",
    true_false:   "Phần II. Câu hỏi Đúng / Sai",
    short_answer: "Phần III. Trả lời ngắn",
    essay:        "Phần IV. Tự luận",
  };

  function defaultPoints(type) {
    return { multi_choice: 0.25, true_false: 1, short_answer: 0.5, essay: 1 }[type] ?? 0.25;
  }
  function defaultPartial(type, answerCount, points) {
    if (type === "essay") return null;
    const n = Math.max(1, parseInt(answerCount) || 4);
    if (type === "true_false" && n === 4) {
      return [0, 0.1, 0.25, 0.5, 1].map(v => +(v * points).toFixed(4));
    }
    const arr = Array(n + 1).fill(0);
    arr[n] = points;
    return arr;
  }

  /* ── State ── */
  let currentUser   = null;
  let currentRole   = null;

  let editingExamId = null;
  let examItems     = [];
  let bankPage      = 0;
  const PAGE_SIZE   = 15;
  let bankTotal     = 0;
  let bankData      = [];

  /* ── Init ── */
  async function initUser() {
    const sb = getSb();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.href = "index.html"; return; }
    currentUser = user;
    const { data: profile } = await sb.from("users").select("role").eq("id", user.id).single();
    currentRole = String(profile?.role || "teacher");
  }

  /* ══════════════════════════════════════════════
     LIST — đề standalone (không gắn lớp)
  ══════════════════════════════════════════════ */
  async function loadExamList() {
    const sb = getSb();
    let query = sb
      .from("exams")
      .select("id, title, duration_minutes, total_points, created_by, created_at")
      .order("created_at", { ascending: false });

    const { data: data_raw } = await query;
    let data = data_raw || [];

    // Teacher chỉ thấy đề do mình tạo
    if (currentRole === "teacher") {
      data = data.filter(e => e.created_by === currentUser.id);
    }

    const grid = document.getElementById("examGrid");
    if (!data.length) {
      grid.innerHTML = `<p style="color:var(--muted);font-size:13px">
        Chưa có đề nào. Nhấn "+ Tạo đề mới" để bắt đầu.</p>`;
      return;
    }

    grid.innerHTML = "";
    data.forEach(e => {
      const canEdit = currentRole === "admin" || e.created_by === currentUser.id;
      const card = document.createElement("div");
      card.className = "exam-card";
      card.innerHTML = `
        <h3>${e.title || "Không tên"}</h3>
        <div class="meta">
          ⏱ ${e.duration_minutes} phút &nbsp;•&nbsp; 🏆 ${e.total_points ?? 10}đ
          ${!canEdit ? `<br><span style="font-size:11px;color:var(--muted)">👁 Chỉ xem</span>` : ""}
        </div>
        <div class="actions">
          ${canEdit
            ? `<button class="edit-btn"   onclick="openEditor('${e.id}')">✏ Sửa</button>
               <button class="delete-btn" onclick="deleteExam('${e.id}')">🗑 Xóa</button>`
            : `<button class="edit-btn" onclick="openEditorReadOnly('${e.id}')">👁 Xem</button>`
          }
        </div>`;
      grid.appendChild(card);
    });
  }

  window.deleteExam = async function (id) {
    if (!confirm("Xóa đề này? Các lớp đang dùng đề này sẽ mất liên kết.")) return;
    const sb = getSb();
    const { data: exam } = await sb.from("exams").select("created_by").eq("id", id).single();
    if (currentRole === "teacher" && exam?.created_by !== currentUser.id) {
      alert("Bạn không có quyền xóa đề này."); return;
    }
    await sb.from("class_exams").delete().eq("exam_id", id);
    await sb.from("exam_questions").delete().eq("exam_id", id);
    const { error } = await sb.from("exams").delete().eq("id", id);
    if (error) { alert("Lỗi: " + error.message); return; }
    loadExamList();
  };

  window.openEditorReadOnly = async function (examId) {
    await openEditor(examId, true);
  };

  /* ══════════════════════════════════════════════
     EDITOR
  ══════════════════════════════════════════════ */
  window.openEditor = async function (examId, readOnly = false) {
    editingExamId = examId || null;
    examItems = [];
    bankPage  = 0;
    bankData  = [];

    if (examId && currentRole === "teacher") {
      const sb = getSb();
      const { data: exam } = await sb.from("exams").select("created_by").eq("id", examId).single();
      if (exam?.created_by !== currentUser.id) readOnly = true;
    }

    document.getElementById("editorOverlay").classList.add("open");
    document.getElementById("editorTitle").textContent = readOnly
      ? "Xem đề (chỉ đọc)"
      : examId ? "Sửa đề" : "Tạo đề mới";

    const saveBtn = document.getElementById("saveExamBtn");
    if (saveBtn) saveBtn.style.display = readOnly ? "none" : "";

    ["fTitle","fDuration","fTotal"].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (id === "fDuration") el.value = "45";
        else if (id === "fTotal") el.value = "10";
        else el.value = "";
        el.disabled = readOnly;
      }
    });

    const diff = document.getElementById("bDiff");
    diff.innerHTML = '<option value="">Mức độ</option>';
    for (let i = 1; i <= 10; i++) diff.appendChild(new Option(i, i));

    await loadBankGrades();
    if (examId) await loadExistingExam(examId);

    const bankPanel = document.getElementById("bankPanel");
    if (bankPanel) bankPanel.style.display = readOnly ? "none" : "";

    renderExamSections(readOnly);
    if (!readOnly) loadBank();
  };

  window.closeEditor = function () {
    document.getElementById("editorOverlay").classList.remove("open");
    loadExamList();
  };

  async function loadExistingExam(examId) {
    const sb = getSb();
    const { data: exam } = await sb.from("exams").select("*").eq("id", examId).single();
    if (!exam) return;

    document.getElementById("fTitle").value    = exam.title || "";
    document.getElementById("fDuration").value = exam.duration_minutes || 45;
    document.getElementById("fTotal").value    = exam.total_points ?? 10;

    const { data: eqs } = await sb
      .from("exam_questions")
      .select("*, question:question_bank(*)")
      .eq("exam_id", examId)
      .order("order_no");

    examItems = (eqs || []).map(eq => ({
      question:       eq.question,
      points:         eq.points,
      partial_points: eq.partial_points,
      order_no:       eq.order_no,
    }));
  }

  /* ══════════════════════════════════════════════
     BANK
  ══════════════════════════════════════════════ */
  async function loadBankGrades() {
    const sb = getSb();
    const { data } = await sb.from("grades").select("*").order("name");
    const sel = document.getElementById("bGrade");
    sel.innerHTML = '<option value="">Tất cả khối</option>';
    (data || []).forEach(g => sel.appendChild(new Option(g.name, g.id)));
  }

  window.bankGradeChange = async function () {
    const sb = getSb();
    const gradeId = document.getElementById("bGrade").value;
    const subSel  = document.getElementById("bSubject");
    const chapSel = document.getElementById("bChapter");
    subSel.innerHTML  = '<option value="">Tất cả môn</option>';
    chapSel.innerHTML = '<option value="">Tất cả chương</option>';
    if (gradeId) {
      const { data } = await sb.from("subjects").select("*").eq("grade_id", gradeId).order("name");
      (data || []).forEach(s => subSel.appendChild(new Option(s.name, s.id)));
    }
    bankPage = 0; loadBank();
  };

  window.bankSubjectChange = async function () {
    const sb = getSb();
    const subjectId = document.getElementById("bSubject").value;
    const chapSel   = document.getElementById("bChapter");
    chapSel.innerHTML = '<option value="">Tất cả chương</option>';
    if (subjectId) {
      const { data } = await sb.from("chapters").select("*").eq("subject_id", subjectId).order("name");
      (data || []).forEach(c => chapSel.appendChild(new Option(c.name, c.id)));
    }
    bankPage = 0; loadBank();
  };

  let _bankTimer;
  window.debounceLoadBank = () => {
    clearTimeout(_bankTimer);
    _bankTimer = setTimeout(() => { bankPage = 0; loadBank(); }, 320);
  };

  window.loadBank = async function () {
    const sb      = getSb();
    const gradeId = document.getElementById("bGrade").value;
    const subId   = document.getElementById("bSubject").value;
    const chapId  = document.getElementById("bChapter").value;
    const type    = document.getElementById("bType").value;
    const diff    = document.getElementById("bDiff").value;
    const search  = document.getElementById("bSearch").value.trim();
    const inExamIds = new Set(examItems.map(i => i.question.id));

    let query = sb
      .from("question_bank")
      .select("*, chapters(id,name,subjects(id,name,grades(id,name)))", { count: "exact" })
      .eq("hidden", false);

    if (currentRole === "teacher") {
      query = sb
        .from("question_bank")
        .select("*, chapters(id,name,subjects(id,name,grades(id,name)))", { count: "exact" })
        .or(`hidden.eq.false,created_by.eq.${currentUser.id}`);
    }

    if (chapId) {
      query = query.eq("chapter_id", chapId);
    } else if (subId) {
      const { data: chs } = await sb.from("chapters").select("id").eq("subject_id", subId);
      if (chs?.length) query = query.in("chapter_id", chs.map(c => c.id));
      else query = query.eq("chapter_id", "00000000-0000-0000-0000-000000000000");
    } else if (gradeId) {
      const { data: subs } = await sb.from("subjects").select("id").eq("grade_id", gradeId);
      if (subs?.length) {
        const { data: chs } = await sb.from("chapters").select("id").in("subject_id", subs.map(s => s.id));
        if (chs?.length) query = query.in("chapter_id", chs.map(c => c.id));
        else query = query.eq("chapter_id", "00000000-0000-0000-0000-000000000000");
      }
    }

    if (type)   query = query.eq("question_type", type);
    if (diff)   query = query.eq("difficulty", parseInt(diff));
    if (search) query = query.ilike("question_text", `%${search}%`);

    query = query
      .range(bankPage * PAGE_SIZE, (bankPage + 1) * PAGE_SIZE - 1)
      .order("created_at", { ascending: false });

    const { data, count } = await query;
    bankData  = data || [];
    bankTotal = count || 0;

    renderBank(inExamIds);
    renderBankPg();
  };

  function renderBank(inExamIds) {
    const list = document.getElementById("bankList");
    if (!bankData.length) {
      list.innerHTML = `<p style="color:var(--muted);padding:12px;font-size:12px">Không có câu hỏi nào</p>`;
      return;
    }
    list.innerHTML = "";
    bankData.forEach(q => {
      const inExam = inExamIds.has(q.id);
      const div = document.createElement("div");
      div.className = `bank-item${inExam ? " in-exam" : ""}`;
      // Bỏ padding-right nếu có ảnh để ảnh không bị che bởi nút
      const hasImg = !!q.question_img;
      div.innerHTML = `
        <span class="type-chip ${TYPE_CLASS[q.question_type] || ""}">${TYPE_LABEL[q.question_type] || q.question_type}</span>
        <div class="q-text">${q.question_text || "<i style='color:var(--muted)'>(Xem ảnh bên dưới)</i>"}</div>
        ${hasImg ? `<img src="${q.question_img}" style="width:100%;max-height:120px;object-fit:contain;border-radius:5px;margin-top:5px;display:block;border:1px solid var(--border)">` : ""}
        <div class="q-meta">Mức ${q.difficulty || "?"} • ${q.chapters?.name || ""}</div>
        ${!inExam ? `<button class="bank-add-btn" onclick="addFromBank('${q.id}')">+ Thêm</button>` : ""}`;
      // Nếu có ảnh thì nút Thêm nằm dưới, không absolute
      if (hasImg && !inExam) {
        div.style.paddingRight = "10px";
        const btn = div.querySelector(".bank-add-btn");
        if (btn) {
          btn.style.position = "static";
          btn.style.transform = "none";
          btn.style.marginTop = "6px";
          btn.style.display = "block";
          btn.style.width = "100%";
        }
      }
      list.appendChild(div);
    });
  }

  function renderBankPg() {
    const pg    = document.getElementById("bankPg");
    const pages = Math.ceil(bankTotal / PAGE_SIZE);
    if (pages <= 1) { pg.innerHTML = ""; return; }
    pg.innerHTML = "";

    const prev = document.createElement("button");
    prev.textContent = "‹"; prev.disabled = bankPage === 0;
    prev.onclick = () => { bankPage--; loadBank(); };
    pg.appendChild(prev);

    for (let i = 0; i < Math.min(pages, 7); i++) {
      const btn = document.createElement("button");
      btn.textContent = i + 1;
      if (i === bankPage) btn.className = "active";
      btn.onclick = () => { bankPage = i; loadBank(); };
      pg.appendChild(btn);
    }

    const next = document.createElement("button");
    next.textContent = "›"; next.disabled = bankPage >= pages - 1;
    next.onclick = () => { bankPage++; loadBank(); };
    pg.appendChild(next);
  }

  /* ── Thêm câu ── */
  window.addFromBank = function (qId) {
    const q = bankData.find(x => x.id === qId);
    if (!q || examItems.some(i => i.question.id === qId)) return;
    const pts = defaultPoints(q.question_type);
    examItems.push({
      question:       q,
      points:         pts,
      partial_points: defaultPartial(q.question_type, q.answer_count, pts),
      order_no:       examItems.length + 1,
    });
    renderExamSections();
    renderBank(new Set(examItems.map(i => i.question.id)));
  };

  window.openRandomModal  = () => { document.getElementById("randomModal").style.display = "flex"; };
  window.closeRandomModal = () => { document.getElementById("randomModal").style.display = "none"; };

  window.addRandom = async function () {
    const count = parseInt(document.getElementById("randCount").value) || 5;
    const type  = document.getElementById("randType").value;
    const sb    = getSb();

    const gradeId   = document.getElementById("bGrade").value;
    const subId     = document.getElementById("bSubject").value;
    const chapId    = document.getElementById("bChapter").value;
    const inExamIds = new Set(examItems.map(i => i.question.id));

    let query = sb.from("question_bank").select("*, chapters(id,name)").eq("hidden", false);
    if (chapId) query = query.eq("chapter_id", chapId);
    else if (subId) {
      const { data: chs } = await sb.from("chapters").select("id").eq("subject_id", subId);
      if (chs?.length) query = query.in("chapter_id", chs.map(c => c.id));
    } else if (gradeId) {
      const { data: subs } = await sb.from("subjects").select("id").eq("grade_id", gradeId);
      if (subs?.length) {
        const { data: chs } = await sb.from("chapters").select("id").in("subject_id", subs.map(s => s.id));
        if (chs?.length) query = query.in("chapter_id", chs.map(c => c.id));
      }
    }
    if (type) query = query.eq("question_type", type);

    const { data } = await query.limit(300);
    const pool = (data || []).filter(q => !inExamIds.has(q.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.slice(0, count).forEach(q => {
      const pts = defaultPoints(q.question_type);
      examItems.push({
        question: q, points: pts,
        partial_points: defaultPartial(q.question_type, q.answer_count, pts),
        order_no: examItems.length + 1,
      });
    });
    renderExamSections();
    loadBank();
    closeRandomModal();
  };

  /* ══════════════════════════════════════════════
     RENDER EXAM
  ══════════════════════════════════════════════ */
  function renderExamSections(readOnly = false) {
    const container = document.getElementById("examSections");
    if (!examItems.length) {
      container.innerHTML = `<div class="empty-exam">
        Chưa có câu hỏi nào.<br>
        ${readOnly ? "" : "Chọn câu từ ngân hàng bên trái hoặc dùng 🎲 Thêm ngẫu nhiên."}
      </div>`;
      updateStats(); return;
    }

    examItems.sort((a, b) => a.order_no - b.order_no);
    examItems.forEach((item, i) => { item.order_no = i + 1; });

    const groups = {};
    SECTION_ORDER.forEach(t => { groups[t] = []; });
    examItems.forEach(item => {
      const t = item.question.question_type;
      if (!groups[t]) groups[t] = [];
      groups[t].push(item);
    });

    container.innerHTML = "";
    let globalNum = 0;

    SECTION_ORDER.forEach(type => {
      const items = groups[type];
      if (!items.length) return;

      const block = document.createElement("div");
      block.className = "sec-block";

      const titleEl = document.createElement("div");
      titleEl.className = "sec-title";
      titleEl.textContent = SECTION_TITLES[type];
      block.appendChild(titleEl);

      items.forEach(item => {
        globalNum++;
        block.appendChild(buildEqRow(item, globalNum, readOnly));
      });

      if (!readOnly) {
        const addBtn = document.createElement("button");
        addBtn.className = "add-row-btn";
        addBtn.innerHTML = `＋ Thêm câu ${TYPE_LABEL[type]}`;
        addBtn.onclick = () => {
          document.getElementById("bType").value = type;
          loadBank();
        };
        block.appendChild(addBtn);
      }

      container.appendChild(block);
    });

    updateStats();
  }

  function buildEqRow(item, displayNum, readOnly = false) {
    const q    = item.question;
    const type = q.question_type;
    const row  = document.createElement("div");
    row.className = "eq-row";

    if (!readOnly) {
      row.draggable = true;
      row.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", String(examItems.indexOf(item)));
        setTimeout(() => row.style.opacity = ".4", 0);
      });
      row.addEventListener("dragend",  () => { row.style.opacity = ""; });
      row.addEventListener("dragover", e => { e.preventDefault(); row.classList.add("drag-over"); });
      row.addEventListener("dragleave",() => row.classList.remove("drag-over"));
      row.addEventListener("drop", e => {
        e.preventDefault(); row.classList.remove("drag-over");
        const fromIdx = parseInt(e.dataTransfer.getData("text/plain"));
        const toIdx   = examItems.indexOf(item);
        if (fromIdx === toIdx || isNaN(fromIdx)) return;
        const [moved] = examItems.splice(fromIdx, 1);
        examItems.splice(toIdx, 0, moved);
        examItems.forEach((it, i) => { it.order_no = i + 1; });
        renderExamSections();
      });

      const handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.innerHTML = "⠿";
      handle.title = "Kéo để sắp xếp";
      row.appendChild(handle);

      const orderInput = document.createElement("input");
      orderInput.className = "order-input";
      orderInput.type = "number"; orderInput.min = "1";
      orderInput.value = item.order_no;
      orderInput.title = "Nhập số để di chuyển";
      orderInput.onchange = () => {
        const newPos = Math.max(1, Math.min(parseInt(orderInput.value) || 1, examItems.length));
        const idx = examItems.indexOf(item);
        const [moved] = examItems.splice(idx, 1);
        examItems.splice(newPos - 1, 0, moved);
        examItems.forEach((it, i) => { it.order_no = i + 1; });
        renderExamSections();
      };
      row.appendChild(orderInput);
    } else {
      const numSpan = document.createElement("span");
      numSpan.style.cssText = "font-size:12px;color:var(--muted);min-width:30px;text-align:center";
      numSpan.textContent = item.order_no;
      row.appendChild(numSpan);
    }

    const main = document.createElement("div");
    main.className = "eq-main";

    const qtext = document.createElement("div");
    qtext.className = "eq-qtext";
    qtext.innerHTML = `<b>Câu ${displayNum}:</b> ${q.question_text || "<i>(Câu hỏi bằng ảnh)</i>"}`;
    main.appendChild(qtext);

    if (q.question_img) {
      const img = document.createElement("img");
      img.src = q.question_img; img.className = "eq-qimg";
      main.appendChild(img);
    }

    if (type !== "essay") {
      const ansRow = document.createElement("div");
      ansRow.className = "ans-row";
      buildAnswerChips(q, ansRow);
      main.appendChild(ansRow);
    } else {
      const note = document.createElement("div");
      note.style.cssText = "font-size:12px;color:var(--muted);margin-top:4px;font-style:italic";
      note.textContent = "Tự luận — học sinh viết câu trả lời";
      main.appendChild(note);
    }

    if (q.answer_text) {
      const at = document.createElement("div");
      at.style.cssText = "font-size:11px;color:var(--muted);margin-top:5px;padding-top:5px;border-top:1px dashed #e2e8f0";
      at.textContent = "💡 " + q.answer_text.slice(0, 100) + (q.answer_text.length > 100 ? "…" : "");
      main.appendChild(at);
    }

    row.appendChild(main);

    const scoring = document.createElement("div");
    scoring.className = "scoring";
    buildScoringPanel(item, scoring, readOnly);
    row.appendChild(scoring);

    if (!readOnly) {
      const rm = document.createElement("span");
      rm.className = "remove-btn"; rm.innerHTML = "✕"; rm.title = "Xóa khỏi đề";
      rm.onclick = () => {
        examItems.splice(examItems.indexOf(item), 1);
        examItems.forEach((it, i) => { it.order_no = i + 1; });
        renderExamSections();
        renderBank(new Set(examItems.map(i => i.question.id)));
      };
      row.appendChild(rm);
    }

    return row;
  }

  function buildAnswerChips(q, container) {
    const type    = q.question_type;
    const n       = Math.max(1, parseInt(q.answer_count) || 4);
    const correct = q.answer || "";

    if (type === "multi_choice") {
      for (let i = 0; i < n; i++) {
        const letter = String.fromCharCode(65 + i);
        const chip   = document.createElement("span");
        chip.className = `ans-chip${correct.includes(letter) ? " correct" : ""}`;
        chip.textContent = letter;
        container.appendChild(chip);
      }
    } else if (type === "true_false") {
      for (let i = 0; i < n; i++) {
        const letter = String.fromCharCode(97 + i);
        const isTrue = correct.includes(letter);
        const chip   = document.createElement("span");
        chip.className   = `ans-chip ${isTrue ? "correct" : "wrong"}`;
        chip.textContent = `${letter}) ${isTrue ? "Đúng" : "Sai"}`;
        container.appendChild(chip);
      }
    } else if (type === "short_answer") {
      correct.split(";").filter(Boolean).forEach(a => {
        const chip = document.createElement("span");
        chip.className = "ans-chip correct";
        chip.textContent = a;
        container.appendChild(chip);
      });
    }
  }

  function buildScoringPanel(item, container, readOnly = false) {
    container.innerHTML = "";
    const type = item.question.question_type;
    const n    = Math.max(1, parseInt(item.question.answer_count) || 4);

    const ptLabel = document.createElement("label");
    ptLabel.textContent = "Điểm câu";
    container.appendChild(ptLabel);

    const ptInput = document.createElement("input");
    ptInput.className = "score-input";
    ptInput.type = "number"; ptInput.step = "0.25"; ptInput.min = "0";
    ptInput.value    = item.points;
    ptInput.disabled = readOnly;
    if (!readOnly) {
      ptInput.onchange = () => {
        item.points         = parseFloat(ptInput.value) || 0;
        item.partial_points = defaultPartial(type, n, item.points);
        buildScoringPanel(item, container, readOnly);
        updateStats();
      };
    }
    container.appendChild(ptInput);

    if (type === "essay") {
      const note = document.createElement("div");
      note.style.cssText = "font-size:11px;color:var(--muted);margin-top:5px";
      note.textContent = "✏ Giáo viên tự chấm";
      container.appendChild(note);
      return;
    }

    if (!item.partial_points) item.partial_points = defaultPartial(type, n, item.points);
    const partial = item.partial_points;

    const lbl2 = document.createElement("label");
    lbl2.style.marginTop = "8px";
    lbl2.textContent = "Điểm theo số ý đúng";
    container.appendChild(lbl2);

    const tbl   = document.createElement("table");
    tbl.className = "partial-tbl";
    const thead = document.createElement("thead");
    const hrow  = document.createElement("tr");
    for (let i = 0; i <= n; i++) {
      const th = document.createElement("th");
      th.textContent = i + " ý";
      hrow.appendChild(th);
    }
    thead.appendChild(hrow); tbl.appendChild(thead);

    const tbody = document.createElement("tbody");
    const drow  = document.createElement("tr");
    for (let i = 0; i <= n; i++) {
      const td  = document.createElement("td");
      const inp = document.createElement("input");
      inp.type = "number"; inp.step = "0.01"; inp.min = "0";
      inp.value    = partial[i] ?? 0;
      inp.disabled = readOnly;
      if (!readOnly) inp.onchange = () => { partial[i] = parseFloat(inp.value) || 0; };
      td.appendChild(inp); drow.appendChild(td);
    }
    tbody.appendChild(drow); tbl.appendChild(tbody);

    const wrap = document.createElement("div");
    wrap.className = "partial-tbl-wrap";
    wrap.appendChild(tbl);
    container.appendChild(wrap);
  }

  function updateStats() {
    const total = examItems.reduce((s, i) => s + (i.points || 0), 0);
    const el    = document.getElementById("examStats");
    if (el) el.textContent = `${examItems.length} câu • ${total.toFixed(2)}đ`;
  }

  /* ══════════════════════════════════════════════
     SAVE — đề standalone, không gắn lớp
  ══════════════════════════════════════════════ */
  window.saveExam = async function () {
    const title    = document.getElementById("fTitle").value.trim();
    const duration = parseInt(document.getElementById("fDuration").value) || 45;
    const total    = parseFloat(document.getElementById("fTotal").value) || 10;

    if (!title) { alert("Vui lòng nhập tên đề!"); return; }

    const sb = getSb();
    const payload = {
      title,
      duration_minutes: duration,
      total_points: total,
      created_by: currentUser.id,
    };

    let examId = editingExamId;
    if (examId) {
      const { data: existing } = await sb.from("exams").select("created_by").eq("id", examId).single();
      if (currentRole === "teacher" && existing?.created_by !== currentUser.id) {
        alert("Bạn không có quyền sửa đề này."); return;
      }
      const { error } = await sb.from("exams").update(payload).eq("id", examId);
      if (error) { alert("Lỗi: " + error.message); return; }
    } else {
      const { data, error } = await sb.from("exams").insert([payload]).select("id").single();
      if (error) { alert("Lỗi: " + error.message); return; }
      examId        = data.id;
      editingExamId = examId;
      document.getElementById("editorTitle").textContent = "Sửa đề";
    }

    await sb.from("exam_questions").delete().eq("exam_id", examId);
    if (examItems.length) {
      const rows = examItems.map((item, idx) => ({
        exam_id:        examId,
        question_id:    item.question.id,
        order_no:       item.order_no ?? idx + 1,
        points:         item.points,
        partial_points: item.partial_points,
      }));
      const { error } = await sb.from("exam_questions").insert(rows);
      if (error) { alert("Lỗi lưu câu: " + error.message); return; }
    }

    alert("Đã lưu đề thành công! ✓");
  };

  initUser().then(() => loadExamList());

})();
