(function () {

  function getSb() { return window.sb || sb; }
  function fmtDT(iso) {
    return new Date(iso).toLocaleString("vi-VN", {
      day:"2-digit", month:"2-digit", year:"numeric",
      hour:"2-digit", minute:"2-digit"
    });
  }
  function fmtMoney(v) { return new Intl.NumberFormat("vi-VN").format(v); }
  function parseQuestionLayout(questionText, type, answerCount) {
    const rawLines = String(questionText || "").split(/\r?\n/);
    const stemLines = [];
    const options = [];
    const optionPattern = type === "true_false"
      ? /^([a-d])(?:[\)\.\:\-])\s+(.+)$/i
      : /^([a-d])(?:[\)\.\:\-])\s+(.+)$/i;

    rawLines.forEach(line => {
      const match = line.match(optionPattern);
      if (match) {
        options.push({
          key: match[1],
          text: match[2].trim(),
        });
      } else {
        stemLines.push(line);
      }
    });

    if (options.length < Math.min(2, Math.max(1, parseInt(answerCount, 10) || 0))) {
      return {
        stem: String(questionText || "").trim(),
        options: [],
      };
    }

    const expectedCount = Math.max(1, parseInt(answerCount, 10) || 0);
    const normalizedOptions = [];
    for (let i = 0; i < expectedCount; i++) {
      const key = type === "true_false"
        ? String.fromCharCode(97 + i)
        : String.fromCharCode(65 + i);
      const found = options.find(option => option.key.toLowerCase() === key.toLowerCase());
      normalizedOptions.push({ key: found?.key || key, text: found?.text || "" });
    }

    return {
      stem: stemLines.join("\n").trim() || String(questionText || "").trim(),
      options: normalizedOptions,
    };
  }

  /* â”€â”€ State â”€â”€ */
  let _role        = "student";
  let _uid         = null;
  let _currentTab  = "list";
  let _allExams    = [];

  /* â”€â”€ Exam state â”€â”€ */
  let _examTimer     = null;
  let _examSeconds   = 0;
  let _examResultId  = null;
  let _examQuestions = [];
  let _examAnswers   = {};
  let _examTotal     = 10;
  let _peId          = null;
  let _peType        = null;
  let _currentExamId = null;

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     INIT
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  async function init() {
    const sb = getSb();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.href = "index.html"; return; }
    _uid = user.id;

    const { data: profile } = await sb.from("users").select("role").eq("id", _uid).single();
    _role = profile?.role || "student";

    if (_role === "admin") {
      document.getElementById("adminToolbar").style.display = "";
    }

    await loadExamList();
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     TAB
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  window.switchTab = async function(tab) {
    _currentTab = tab;
    ["list","results"].forEach(t => {
      const btn = document.getElementById("tab_"+t);
      if (btn) btn.classList.toggle("active", t === tab);
    });
    if (tab === "list") {
      document.getElementById("examGrid").style.display = "grid";
      await loadExamList();
    } else {
      document.getElementById("examGrid").style.display = "none";
      await loadResultsView();
    }
  };

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     LOAD DANH SÃCH Äá»€
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  async function loadExamList() {
    const sb   = getSb();
    const grid = document.getElementById("examGrid");
    grid.innerHTML = '<div style="color:var(--ink-light);padding:20px">Đang tải...</div>';

    const { data, error } = await sb
      .from("public_exams")
      .select("id, exam_type, starts_at, ends_at, created_at, is_pinned, exam:exams(id,title,duration_minutes,total_points)")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) { grid.innerHTML = `<div style="color:var(--red)">${error.message}</div>`; return; }
    _allExams = (data || []).filter(pe => pe.exam);

    if (!_allExams.length) {
      grid.innerHTML = `<div class="empty-state">
        <div style="font-size:2.5rem;margin-bottom:10px">ðŸ“„</div>
        <p>Chưa có đề thi nào.</p>
      </div>`;
      return;
    }

    let myResultsMap = {};
    if (_role === "student") {
      const peIds = _allExams.map(pe => pe.id);
      const { data: myResults } = await sb
        .from("exam_results")
        .select("id,public_exam_id,submitted_at,score_total,score_auto,score_essay,seconds_left,attempt_no")
        .eq("student_id", _uid)
        .in("public_exam_id", peIds)
        .order("attempt_no", { ascending: false });
      (myResults || []).forEach(r => {
        if (!myResultsMap[r.public_exam_id]) myResultsMap[r.public_exam_id] = [];
        myResultsMap[r.public_exam_id].push(r);
      });
    }

    grid.innerHTML = "";
    const now = new Date();

    const officialExams = _allExams.filter(pe => pe.exam_type === "official");
    const trialExams    = _allExams.filter(pe => pe.exam_type === "trial");

    function buildSection(label, color, exams) {
      if (!exams.length) return null;
      const section = document.createElement("div");
      section.style.cssText = "margin-bottom:28px;grid-column:1/-1";
      section.innerHTML = `<div style="font-family:var(--font-display);font-size:1.05rem;color:var(--navy);
        margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <span>${label}</span>
        <span style="flex:1;height:1px;background:linear-gradient(90deg,${color},transparent)"></span>
      </div>`;
      const innerGrid = document.createElement("div");
      innerGrid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px";
      section.appendChild(innerGrid);
      return { section, innerGrid };
    }

    const officialSection = buildSection("Đề thi thật", "#ef4444", officialExams);
    const trialSection    = buildSection("Đề thi thử",  "var(--gold)", trialExams);

    function buildCard(pe) {
      const ex         = pe.exam;
      const isOfficial = pe.exam_type === "official";
      const card       = document.createElement("div");
      card.className   = "exam-card" + (isOfficial ? " official" : "");

      if (_role === "admin" || _role === "teacher") {
        card.style.cursor = "pointer";
        card.addEventListener("click", (e) => {
          if (e.target.tagName === "BUTTON" || e.target.closest("button")) return;
          openResultDetail(pe.id, ex.title, pe.exam_type);
        });
        card.addEventListener("mouseover", () => { card.style.boxShadow = "var(--shadow)"; card.style.transform = "translateY(-2px)"; });
        card.addEventListener("mouseout",  () => { card.style.boxShadow = ""; card.style.transform = ""; });
      }

      let timeStatus = "", canDo = true;
      if (pe.starts_at && pe.ends_at) {
        const s = new Date(pe.starts_at), e = new Date(pe.ends_at);
        if (now < s)      { canDo = false; timeStatus = "Chưa đến giờ thi"; }
        else if (now > e) { canDo = false; timeStatus = "Đã kết thúc"; }
        else              { timeStatus = "Đang mở"; }
      } else {
        timeStatus = "Không giới hạn";
      }

      const timeStr = pe.starts_at && pe.ends_at
        ? `${fmtDT(pe.starts_at)} -> ${fmtDT(pe.ends_at)}`
        : "Không giới hạn";

      let actionHtml = "";
      if (_role === "student") {
        const myResults  = myResultsMap[pe.id] || [];
        const submitted  = myResults.filter(r => r.submitted_at);
        const best       = submitted.sort((a,b) => {
          const sa = a.score_total ?? a.score_auto ?? -1;
          const sb2 = b.score_total ?? b.score_auto ?? -1;
          return sb2 - sa;
        })[0] || null;
        const inProgress = submitted.length === 0
          ? (myResults.find(r => !r.submitted_at && r.seconds_left > 0) || null)
          : null;

        let scoreBadge = "";
        if (best) {
          const score = best.score_total ?? best.score_auto ?? "?";
          scoreBadge = `<span style="background:#dcfce7;color:#15803d;font-size:.75rem;font-weight:700;
            padding:2px 9px;border-radius:10px">Đạt ${score}/${ex.total_points}đ</span> `;
        }

        let reviewBtn = "";
        if (best) {
          const canReview = !isOfficial || (pe.ends_at && now > new Date(pe.ends_at));
          if (canReview) {
            reviewBtn = `<button class="btn btn-outline btn-sm"
              onclick="openReview('${pe.id}','${best.id}','${ex.title.replace(/'/g,"\\'")}',${isOfficial})">
              Xem lại</button>`;
          } else {
            reviewBtn = `<span style="font-size:.75rem;color:var(--ink-light)">Xem lại sau khi hết giờ</span>`;
          }
        }

        if (!canDo) {
          actionHtml = scoreBadge
            ? `<div>${scoreBadge}${reviewBtn}</div>`
            : `<span style="font-size:.78rem;color:var(--ink-light)">${timeStatus}</span>`;
        } else if (inProgress) {
          const secsLeft = Math.max(0, (inProgress.seconds_left||0) - 300);
          const m = Math.floor(secsLeft/60), s2 = secsLeft%60;
          actionHtml = scoreBadge +
            `<button class="btn btn-sm" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none"
              onclick="resumePublicExam('${pe.id}','${ex.id}','${ex.title.replace(/'/g,"\\'")}',
                ${ex.duration_minutes},${ex.total_points},'${pe.exam_type}','${inProgress.id}',${secsLeft})">
              Làm tiếp (${m}:${String(s2).padStart(2,"0")})</button>`;
        } else if (best && isOfficial) {
          actionHtml = `${scoreBadge}${reviewBtn}`;
        } else {
          const btnLabel = best ? "Làm lại" : "Làm bài";
          actionHtml = scoreBadge +
            `<button class="btn btn-primary btn-sm"
              onclick="startPublicExam('${pe.id}','${ex.id}','${ex.title.replace(/'/g,"\\'")}',
                ${ex.duration_minutes},${ex.total_points},'${pe.exam_type}')">
              ${btnLabel}</button>` +
            reviewBtn;
        }
      }

      let adminHtml = "";
      if (_role === "admin") {
        const pinBtn = pe.is_pinned
          ? `<button class="btn btn-outline btn-sm" onclick="togglePin('${pe.id}',false)">Bỏ ghim</button>`
          : `<button class="btn btn-outline btn-sm" onclick="togglePin('${pe.id}',true)">Ghim</button>`;
        adminHtml = `
          <div class="admin-card-actions">
            ${pinBtn}
            <button class="btn btn-outline btn-sm" onclick="openEditExamModal('${pe.id}')">Sửa</button>
            <button class="btn btn-sm" style="background:var(--red-bg);color:var(--red);border:1px solid #fca5a5"
              onclick="deletePublicExam('${pe.id}','${ex.title.replace(/'/g,"\\'")}')">Xóa</button>
          </div>`;
      }

      card.innerHTML = `
        ${pe.is_pinned ? '<div style="font-size:.72rem;font-weight:700;color:var(--gold);margin-bottom:4px">Đã ghim</div>' : ""}
        <div class="exam-badge ${isOfficial ? "badge-official" : "badge-trial"}">
          ${isOfficial ? "Thi thật" : "Thi thử"}
        </div>
        <div class="exam-title">${ex.title}</div>
        <div class="exam-meta">
          ${ex.duration_minutes} phút &nbsp;•&nbsp; ${ex.total_points}đ<br>
          ${timeStr}<br>
          ${timeStatus ? `<span style="font-weight:600">${timeStatus}</span>` : ""}
        </div>
        <div class="exam-actions">
          ${actionHtml || adminHtml}
          ${actionHtml && _role === "admin" ? adminHtml : ""}
        </div>`;

      return card;
    }

    if (officialSection) {
      officialExams.forEach(pe => officialSection.innerGrid.appendChild(buildCard(pe)));
      grid.appendChild(officialSection.section);
    }
    if (trialSection) {
      trialExams.forEach(pe => trialSection.innerGrid.appendChild(buildCard(pe)));
      grid.appendChild(trialSection.section);
    }
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     ADMIN: THÃŠM / Sá»¬A / XÃ“A
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  let _editingPeId = null;

  window.togglePin = async function(peId, pin) {
    const sb = getSb();
    const { error } = await sb.from("public_exams").update({ is_pinned: pin }).eq("id", peId);
    if (error) { alert("Lỗi: " + error.message); return; }
    await loadExamList();
  };

  window.openAddExamModal = async function() {
    _editingPeId = null;
    document.querySelector("#addExamModal .modal-card h3").textContent = "Thêm đề thi công khai";
    document.getElementById("peExamId").value = "";
    document.getElementById("peType").value   = "trial";
    document.getElementById("peStartsAt").value = "";
    document.getElementById("peEndsAt").value   = "";

    const sb = getSb();
    const { data } = await sb.from("exams")
      .select("id,title,duration_minutes,total_points")
      .order("created_at", { ascending: false });
    const sel = document.getElementById("peExamId");
    sel.innerHTML = '<option value="">-- Chọn đề --</option>';
    (data||[]).forEach(e => sel.appendChild(new Option(`${e.title} (${e.duration_minutes}p / ${e.total_points}đ)`, e.id)));

    document.getElementById("addExamModal").classList.remove("hidden");
  };

  window.openEditExamModal = async function(peId) {
    _editingPeId = peId;
    const pe = _allExams.find(p => p.id === peId);
    if (!pe) return;

    await openAddExamModal();
    _editingPeId = peId;
    document.getElementById("peExamId").value   = pe.exam.id;
    document.getElementById("peType").value      = pe.exam_type;
    document.getElementById("peStartsAt").value  = pe.starts_at ? pe.starts_at.slice(0,16) : "";
    document.getElementById("peEndsAt").value    = pe.ends_at   ? pe.ends_at.slice(0,16)   : "";
  };

  window.closeAddExamModal = function() {
    document.getElementById("addExamModal").classList.add("hidden");
  };

  window.savePublicExam = async function() {
    const examId   = document.getElementById("peExamId").value;
    const examType = document.getElementById("peType").value;
    const startsAt = document.getElementById("peStartsAt").value || null;
    const endsAt   = document.getElementById("peEndsAt").value   || null;

    if (!examId) { alert("Vui lòng chọn đề!"); return; }
    if (startsAt && endsAt && startsAt >= endsAt) {
      alert("Thời gian kết thúc phải sau thời gian bắt đầu!"); return;
    }

    const sb = getSb();
    const payload = {
      exam_id:    examId,
      exam_type:  examType,
      starts_at:  startsAt ? new Date(startsAt).toISOString() : null,
      ends_at:    endsAt   ? new Date(endsAt).toISOString()   : null,
      created_by: _uid,
    };

    if (_editingPeId) {
      const { error } = await sb.from("public_exams").update(payload).eq("id", _editingPeId);
      if (error) { alert("Lỗi: " + error.message); return; }
    } else {
      const { error } = await sb.from("public_exams").insert([payload]);
      if (error) { alert("Lỗi: " + error.message); return; }
    }

    closeAddExamModal();
    await loadExamList();
  };

  window.deletePublicExam = async function(peId, title) {
    if (!confirm(`Xóa đề thi "${title}"? Toàn bộ kết quả liên quan sẽ bị xóa.`)) return;
    const sb = getSb();
    const { data: results } = await sb.from("exam_results").select("id").eq("public_exam_id", peId);
    if (results?.length) {
      const ids = results.map(r => r.id);
      await sb.from("exam_answers").delete().in("result_id", ids);
      await sb.from("exam_results").delete().in("id", ids);
    }
    const { error } = await sb.from("public_exams").delete().eq("id", peId);
    if (error) { alert("Lỗi: " + error.message); return; }
    await loadExamList();
  };

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     ADMIN/TEACHER: XEM Káº¾T QUáº¢
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  async function loadResultsView() {
    const grid = document.getElementById("examGrid");
    grid.style.display = "block";
    grid.innerHTML = '<div style="color:var(--ink-light);padding:20px">Đang tải...</div>';

    const sb = getSb();
    const { data: publicExams } = await sb
      .from("public_exams")
      .select("id,exam_type,starts_at,ends_at,exam:exams(id,title,total_points)")
      .order("created_at", { ascending: false });

    if (!publicExams?.length) {
      grid.innerHTML = '<p style="color:var(--ink-light)">Chưa có đề thi nào.</p>';
      return;
    }

    grid.innerHTML = publicExams.map(pe => `
      <div style="background:var(--white);border-radius:12px;padding:16px 18px;
        box-shadow:var(--shadow-sm);border:1px solid var(--border);margin-bottom:12px;
        cursor:pointer;transition:.15s;border-left:4px solid ${pe.exam_type==='official'?'#ef4444':'var(--gold-border)'}"
        onclick="openResultDetail('${pe.id}','${(pe.exam?.title||'').replace(/'/g,"\\'")}','${pe.exam_type}')"
        onmouseover="this.style.background='var(--gold-pale)'"
        onmouseout="this.style.background='var(--white)'">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <span class="exam-badge ${pe.exam_type==='official'?'badge-official':'badge-trial'}" style="margin-bottom:4px">
              ${pe.exam_type==='official'?'Thi thật':'Thi thử'}
            </span>
            <div style="font-weight:700;font-size:.95rem;color:var(--navy)">${pe.exam?.title||'â€”'}</div>
            <div style="font-size:.75rem;color:var(--ink-mid)">
              ${pe.exam?.total_points}đ &nbsp;•&nbsp;
              ${pe.starts_at&&pe.ends_at ? `${fmtDT(pe.starts_at)} -> ${fmtDT(pe.ends_at)}` : 'Không giới hạn'}
            </div>
          </div>
          <span style="color:var(--ink-light);font-size:1.2rem">></span>
        </div>
      </div>`).join("");
  }

  window.openResultDetail = async function(peId, examTitle, examType) {
    const grid = document.getElementById("examGrid");
    grid.style.display = "block";
    grid.innerHTML = `
      <div style="margin-bottom:16px">
        <button class="btn btn-outline btn-sm" onclick="loadExamList()">← Quay lại</button>
        <span style="font-weight:700;font-size:.95rem;color:var(--navy);margin-left:12px">${examTitle}</span>
      </div>
      <div style="color:var(--ink-light)">Đang tải kết quả...</div>`;

    const sb = getSb();
    const { data: results, error: rErr } = await sb
      .from("exam_results")
      .select("id,student_id,attempt_no,submitted_at,score_auto,score_essay,score_total")
      .eq("public_exam_id", peId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false });

    if (rErr) { grid.innerHTML = `<div style="color:var(--red)">Lỗi: ${rErr.message}</div>`; return; }

    const { data: pe } = await sb.from("public_exams")
      .select("exam:exams(total_points)").eq("id",peId).single();
    const totalPoints = pe?.exam?.total_points || 10;

    const studentIds = [...new Set((results||[]).map(r => r.student_id))];
    let nameMap = {};
    if (studentIds.length) {
      const { data: users } = await sb.from("users").select("id,full_name").in("id", studentIds);
      (users||[]).forEach(u => { nameMap[u.id] = u.full_name; });
    }

    const bestMap = {};
    (results||[]).forEach(r => {
      const score = r.score_total ?? r.score_auto ?? -1;
      const prev  = bestMap[r.student_id];
      if (!prev || score > (prev.score_total ?? prev.score_auto ?? -1)) bestMap[r.student_id] = r;
    });
    const ranked = Object.values(bestMap).sort((a,b) => {
      return (b.score_total??b.score_auto??-1) - (a.score_total??a.score_auto??-1);
    });

    grid.innerHTML = `
      <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="loadExamList()">← Quay lại</button>
        <div style="flex:1">
          <div style="font-family:var(--font-display);font-size:1.1rem;font-weight:700;color:var(--navy)">${examTitle}</div>
          <div style="font-size:.78rem;color:var(--ink-mid);margin-top:2px">${ranked.length} thí sinh đã nộp bài &nbsp;•&nbsp; Tổng điểm: ${totalPoints}</div>
        </div>
      </div>
      ${ranked.length === 0
        ? `<div class="empty-state"><div style="font-size:2rem;margin-bottom:8px">...</div><p>Chưa có thí sinh nào nộp bài.</p></div>`
        : `<div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">
          <table style="width:100%;border-collapse:collapse;font-size:.85rem">
            <thead><tr style="background:var(--navy)">
              <th style="padding:12px 14px;color:var(--gold-light);font-weight:600;text-align:center;width:52px">Hạng</th>
              <th style="padding:12px 14px;color:var(--gold-light);font-weight:600;text-align:left">Thí sinh</th>
              <th style="padding:12px 14px;color:var(--gold-light);font-weight:600;text-align:center">Tự động</th>
              <th style="padding:12px 14px;color:var(--gold-light);font-weight:600;text-align:center">Tự luận</th>
              <th style="padding:12px 14px;color:var(--gold-light);font-weight:600;text-align:center">Tổng điểm</th>
              <th style="padding:12px 14px;color:var(--gold-light);font-weight:600;text-align:center">Thời gian nộp</th>
              <th style="padding:12px 14px;color:var(--gold-light);font-weight:600;text-align:center">Chi tiết</th>
            </tr></thead>
            <tbody>
              ${ranked.map((r,i) => {
                const rank  = i+1;
                const icon  = rank===1?"ðŸ¥‡":rank===2?"ðŸ¥ˆ":rank===3?"ðŸ¥‰":rank;
                const score = r.score_total ?? r.score_auto ?? null;
                const pct   = score!==null ? Math.round(score/totalPoints*100) : null;
                const color = pct===null?"var(--ink-light)":pct>=80?"var(--green)":pct>=50?"var(--amber)":"var(--red)";
                const pending = r.score_essay===null && r.score_total===null;
                const name  = nameMap[r.student_id]||"-";
                const submittedAt = r.submitted_at
                  ? new Date(r.submitted_at).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})
                  : "-";
                return `<tr style="border-bottom:1px solid var(--surface)"
                  onmouseover="this.style.background='var(--gold-pale)'"
                  onmouseout="this.style.background=''">
                  <td style="text-align:center;padding:12px 8px;font-size:1.1rem">${icon}</td>
                  <td style="padding:12px 16px;font-weight:600;color:var(--navy)">${name}</td>
                  <td style="text-align:center;padding:12px 8px;color:var(--ink-mid)">${r.score_auto??'-'}</td>
                  <td style="text-align:center;padding:12px 8px">
                    ${pending
                      ? '<span style="color:var(--amber);font-size:.75rem;font-weight:600;background:#fef3c7;padding:2px 8px;border-radius:20px">Chờ chấm</span>'
                      : `<span style="color:var(--ink-mid)">${r.score_essay??'-'}</span>`}
                  </td>
                  <td style="text-align:center;padding:12px 8px;font-weight:800;font-size:1rem;color:${color}">
                    ${score!==null ? `${score}<span style="font-size:.72rem;font-weight:400;color:var(--ink-light)"> /${totalPoints}</span>` : '-'}
                  </td>
                  <td style="text-align:center;padding:12px 8px;font-size:.78rem;color:var(--ink-mid)">${submittedAt}</td>
                  <td style="text-align:center;padding:12px 8px">
                    <button class="btn btn-outline btn-sm" style="font-size:.78rem;padding:5px 12px"
                      onclick="openExamDetailAdmin('${r.id}','${name.replace(/'/g,"\\'")}','${peId}',${totalPoints})">
                      Xem bài</button>
                  </td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`
      }`;
  };

  window.openExamDetailAdmin = async function(resultId, studentName, peId, totalPts) {
    const grid = document.getElementById("examGrid");
    grid.style.display = "block";
    grid.innerHTML = '<div style="color:var(--ink-light)">Đang tải bài làm...</div>';
    const sb = getSb();

    const [{ data: result }, { data: answers }, { data: pe }] = await Promise.all([
      sb.from("exam_results").select("*").eq("id", resultId).single(),
      sb.from("exam_answers").select("*,question:question_bank(id,question_type,question_text,answer,answer_count,question_img)").eq("result_id", resultId),
      sb.from("public_exams").select("exam_id,exam:exams(title,total_points,exam_questions(*,question:question_bank(*)))").eq("id",peId).single(),
    ]);

    const eqs    = pe?.exam?.exam_questions || [];
    const ansMap = {};
    (answers||[]).forEach(a => { ansMap[a.question_id] = a; });

    const essayQs  = eqs.filter(eq => eq.question?.question_type === "essay");
    const hasEssay = essayQs.length > 0;
    const scoreAuto  = result?.score_auto ?? 0;
    const scoreEssay = result?.score_essay ?? 0;
    const typeLabel  = { multi_choice:"Trắc nghiệm", true_false:"Đ/Sai", short_answer:"Trả lời ngắn", essay:"Tự luận" };

    const qHtml = eqs.map((eq,i) => {
      const q = eq.question; if (!q) return "";
      const ans = ansMap[q.id];
      const isEssay = q.question_type === "essay";
      let ansDisplay = "";
      if (!isEssay) {
        if (ans?.answer) {
          const ok = ans.is_correct;
          ansDisplay = '<div style="margin-top:8px;padding:8px 12px;border-radius:8px;'
            + 'background:'+(ok?"#f0fdf4":"#fef2f2")+';border:1px solid '+(ok?"#86efac":"#fca5a5")+'>'
            + '<span style="font-weight:700;font-size:.8rem;color:'+(ok?"var(--green)":"var(--red)")+'">'+(ok?"✓ Đúng":"✗ Sai")+'</span>'
            + '<span style="font-size:.82rem;margin-left:8px">HS: <b>'+ans.answer+'</b>'+(q.answer&&!ok?' &nbsp;•&nbsp; Đáp án: <b>'+q.answer+'</b>':"")+'</span>'
            + '<span style="float:right;font-size:.8rem;font-weight:700;color:'+(ok?"var(--green)":"var(--red)")+'">'+(ans.score_earned??0)+'/'+eq.points+'đ</span>'
            + '</div>';
        } else {
          ansDisplay = '<div style="margin-top:8px;font-size:.8rem;color:var(--ink-light);padding:8px 12px;'
            + 'background:var(--surface);border-radius:8px">— Không có câu trả lời</div>';
        }
      } else {
        ansDisplay = '<div style="margin-top:8px;padding:10px 12px;background:var(--surface);'
          + 'border-radius:8px;border:1px solid var(--border);white-space:pre-wrap;font-size:.85rem;min-height:40px">'
          + (ans?.answer || '<span style="color:var(--ink-light);font-style:italic">Học sinh không trả lời</span>')
          + '</div>'
          + '<div style="margin-top:8px;display:flex;align-items:center;gap:10px">'
          + '<label style="font-size:.78rem;font-weight:700;color:var(--ink-mid)">Điểm:</label>'
          + '<input type="number" id="pe_essay_'+q.id+'" value="'+(ans?.score_earned||0)+'"'
          + ' min="0" max="'+eq.points+'" step="0.5"'
          + ' style="width:70px;padding:5px 8px;border:1.5px solid var(--border);border-radius:7px;font-size:.85rem;text-align:center"'
          + ' oninput="peUpdateEssayTotal()">'
          + '<span style="font-size:.78rem;color:var(--ink-mid)">/ '+eq.points+' điểm</span>'
          + '</div>';
      }
      return '<div style="padding:14px 16px;background:var(--white);border:1px solid var(--border);border-radius:10px;margin-bottom:8px">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
        + '<span style="width:26px;height:26px;border-radius:50%;background:var(--navy);color:var(--gold-light);'
        + 'display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;flex-shrink:0">'+(i+1)+'</span>'
        + '<span style="font-size:.72rem;color:var(--ink-light);font-weight:600">'+typeLabel[q.question_type]+'</span>'
        + '<span style="margin-left:auto;font-size:.75rem;color:var(--ink-mid)">'+eq.points+' điểm</span>'
        + '</div>'
        + (q.question_img ? '<img src="'+q.question_img+'" style="max-width:100%;border-radius:6px;margin-bottom:8px;display:block">' : "")
        + '<div style="font-size:.88rem;line-height:1.6;color:var(--navy);white-space:pre-line">'+(q.question_text||"")+'</div>'
        + ansDisplay
        + '</div>';
    }).join("");

    const backTitle = (pe?.exam?.title||"").replace(/'/g,"\\'");
    const headerRight = hasEssay
      ? '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        + '<div style="text-align:right;font-size:.8rem;color:var(--ink-mid)">'
        + 'Tự động: <b>'+scoreAuto+'</b><br>'
        + 'Tự luận: <b id="pe_essayTotal">'+(scoreEssay||0)+'</b><br>'
        + '<b style="color:var(--navy)">Tổng: <span id="pe_grandTotal">'+(result?.score_total??"Chưa chấm")+'</span>/'+totalPts+'</b>'
        + '</div>'
        + '<button class="btn btn-primary btn-sm" id="peSaveBtn">💾 Lưu điểm</button>'
        + '</div>'
      : '<div style="font-size:.9rem;font-weight:700;color:var(--navy)">Tổng: '+(result?.score_total??scoreAuto)+'/'+totalPts+'</div>';

    grid.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">'
      + '<button class="btn btn-outline btn-sm" id="peBackBtn">← Quay lại</button>'
      + '<div style="flex:1">'
      + '<div style="font-weight:700;font-size:.95rem;color:var(--navy)">'+studentName+'</div>'
      + '<div style="font-size:.75rem;color:var(--ink-mid)">'+(pe?.exam?.title||"")+'&nbsp;•&nbsp; Nộp: '+(result?.submitted_at?fmtDT(result.submitted_at):"—")+'</div>'
      + '</div>'
      + headerRight
      + '</div>'
      + qHtml;

    const backBtn = document.getElementById('peBackBtn');
    if (backBtn) backBtn.addEventListener('click', () => openResultDetail(peId, pe?.exam?.title||'', pe?.exam_type||''));
    const saveBtn = document.getElementById('peSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => peSaveEssay(resultId, scoreAuto, peId, studentName, totalPts));

    window._peEssayQIds      = essayQs.map(eq=>({qid:eq.question.id,pts:eq.points}));
    window._peEssayAutoScore = scoreAuto;
  };

  window.peUpdateEssayTotal = function() {
    let sum = 0;
    (window._peEssayQIds||[]).forEach(({qid}) => {
      sum += parseFloat(document.getElementById("pe_essay_"+qid)?.value||0);
    });
    const grand = (window._peEssayAutoScore||0) + sum;
    const dd = document.getElementById("pe_essayTotal"), gd = document.getElementById("pe_grandTotal");
    if (dd) dd.textContent = Math.round(sum*100)/100;
    if (gd) gd.textContent = Math.round(grand*100)/100;
  };

  window.peSaveEssay = async function(resultId, scoreAuto, peId, studentName, totalPts) {
    const sb = getSb(); let essaySum = 0;
    for (const {qid} of (window._peEssayQIds||[])) {
      const val = parseFloat(document.getElementById("pe_essay_"+qid)?.value||0);
      essaySum += val;
      await sb.from("exam_answers").update({score_earned:val}).eq("result_id",resultId).eq("question_id",qid);
    }
    const grand = Math.round((scoreAuto+essaySum)*100)/100;
    await sb.from("exam_results").update({
      score_essay: Math.round(essaySum*100)/100,
      score_total: grand,
    }).eq("id", resultId);
    const toast = document.createElement("div");
    toast.textContent = "✅ Đã lưu điểm " + studentName + ": " + grand + "/" + totalPts;
    toast.style.cssText = "position:fixed;bottom:24px;right:24px;background:var(--navy);color:var(--gold-light);"+
      "padding:10px 18px;border-radius:10px;font-size:.85rem;font-weight:600;z-index:9999;box-shadow:var(--shadow-lg)";
    document.body.appendChild(toast); setTimeout(()=>toast.remove(),2500);
  };

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     STUDENT: LÃ€M BÃ€I
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function getOverlay() { return document.getElementById("examOverlay"); }

  window.startPublicExam = async function(peId, examId, examTitle, durationMin, totalPoints, examType) {
    const sb = getSb();
    _peId = peId; _peType = examType; _currentExamId = examId;
    _examTotal = totalPoints; _examAnswers = {};

    const { data: eqs, error } = await sb
      .from("exam_questions").select("*, question:question_bank(*)")
      .eq("exam_id", examId).order("order_no");

    if (error || !eqs?.length) { alert("Lỗi tải đề hoặc đề chưa có câu hỏi."); return; }
    _examQuestions = eqs.filter(eq => eq.question !== null);

    const { data: stale } = await sb.from("exam_results").select("id")
      .eq("public_exam_id", peId).eq("student_id", _uid).is("submitted_at",null).is("seconds_left",null);
    if (stale?.length) {
      const ids = stale.map(r=>r.id);
      await sb.from("exam_answers").delete().in("result_id",ids);
      await sb.from("exam_results").delete().in("id",ids);
    }

    const { data: prev } = await sb.from("exam_results").select("attempt_no")
      .eq("public_exam_id",peId).eq("student_id",_uid).not("submitted_at","is",null)
      .order("attempt_no",{ascending:false}).limit(1);
    const nextAttempt = prev?.length ? prev[0].attempt_no+1 : 1;

    let newResult = null, tryAttempt = nextAttempt;
    for (let i=0; i<5; i++) {
      const {data,error:re} = await sb.from("exam_results")
        .insert({exam_id:examId,student_id:_uid,attempt_no:tryAttempt,public_exam_id:peId})
        .select("id").single();
      if (!re) { newResult=data; break; }
      if (re.code==="23505") { tryAttempt++; continue; }
      alert("Lỗi: "+re.message); return;
    }
    if (!newResult) { alert("Không thể tạo bài thi."); return; }
    _examResultId = newResult.id;
    _examSeconds  = durationMin * 60;

    renderPublicExamUI(examTitle, durationMin);
    startExamTimer();
  };

  window.resumePublicExam = async function(peId, examId, examTitle, durationMin, totalPoints, examType, resultId, secsLeft) {
    const sb = getSb();
    _peId = peId; _peType = examType; _currentExamId = examId;
    _examTotal = totalPoints; _examResultId = resultId; _examAnswers = {};

    if (secsLeft <= 0) { await submitPublicExam(true); return; }

    const { data: eqs } = await sb.from("exam_questions").select("*, question:question_bank(*)")
      .eq("exam_id",examId).order("order_no");
    _examQuestions = (eqs||[]).filter(eq=>eq.question!==null);

    const { data: saved } = await sb.from("exam_answers").select("question_id,answer").eq("result_id",resultId);
    (saved||[]).forEach(a => { if(a.answer) _examAnswers[a.question_id]=a.answer; });

    _examSeconds = secsLeft;
    renderPublicExamUI(examTitle, durationMin);
    startExamTimer();
  };

  function startExamTimer() {
    clearInterval(_examTimer);
    _examTimer = setInterval(() => {
      _examSeconds--;
      updateClock();
      if (_examSeconds % 60 === 0) saveProgress();
      if (_examSeconds <= 0) { clearInterval(_examTimer); submitPublicExam(true); }
    }, 1000);
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     RENDER GIAO DIá»†N LÃ€M BÃ€I
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function renderPublicExamUI(examTitle, durationMin) {
    const overlay = getOverlay();
    overlay.style.display = "flex";

    const SECTION_ORDER  = ["multi_choice","true_false","short_answer","essay"];
    const SECTION_TITLES = {
      multi_choice: "Phần I. Trắc nghiệm",
      true_false:   "Phần II. Đ / Sai",
      short_answer: "Phần III. Trả lời ngắn",
      essay:        "Phần IV. Tự luận",
    };

    const groups = {};
    SECTION_ORDER.forEach(t => { groups[t] = []; });
    _examQuestions.forEach(eq => {
      const t = eq.question.question_type;
      if (groups[t]) groups[t].push(eq);
    });

    /* â”€â”€ FIX 1: Nav chá»‰ lÃ  cÃ¡c Ã´ trÃ²n sá»‘ â”€â”€ */
    let navHtml = "", globalNum = 0;
    SECTION_ORDER.forEach(type => {
      if (!groups[type].length) return;
      navHtml += `<div style="font-size:.68rem;font-weight:700;text-transform:uppercase;
        letter-spacing:.06em;color:var(--ink-light);margin:12px 0 6px;padding:0 2px">
        ${SECTION_TITLES[type]}</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:4px">`;
      groups[type].forEach(eq => {
        globalNum++;
        navHtml += `<div id="nav_${eq.question.id}"
          onclick="window.peScrollToQ('${eq.question.id}')"
          title="Câu ${globalNum}"
          style="width:32px;height:32px;border-radius:50%;background:var(--navy);
            color:var(--gold-light);display:flex;align-items:center;justify-content:center;
            font-size:.72rem;font-weight:700;cursor:pointer;position:relative;
            border:2px solid transparent;transition:.15s;flex-shrink:0"
          onmouseover="this.style.borderColor='var(--gold)'"
          onmouseout="this.style.borderColor='transparent'">
          ${globalNum}
          <span id="navdot_${eq.question.id}"
            style="position:absolute;top:1px;right:1px;width:8px;height:8px;
              border-radius:50%;background:var(--border);border:1.5px solid var(--white)"></span>
        </div>`;
      });
      navHtml += `</div>`;
    });

    /* â”€â”€ Render cÃ¢u há»i â”€â”€ */
    let sectionsHtml = "";
    const _pendingCards = [];
    globalNum = 0;

    SECTION_ORDER.forEach(type => {
      if (!groups[type].length) return;
      sectionsHtml += `<div style="margin-bottom:24px">
        <div style="font-family:var(--font-display);font-size:1.02rem;font-weight:700;
          padding:10px 16px;background:var(--navy);color:#fff;border-radius:8px;margin-bottom:12px">
          ${SECTION_TITLES[type]}</div>`;

      groups[type].forEach(eq => {
        globalNum++;
        const q   = eq.question;
        const qid = q.id;
        const n   = Math.max(2, parseInt(q.answer_count)||4);
        const hasImg = !!q.question_img;
        const layout = parseQuestionLayout(q.question_text, type, n);

        /* â”€â”€ Answer HTML â”€â”€ */
        let ansHtml = "";
        if (type === "multi_choice") {
          const opts = []; for (let i=0;i<n;i++) opts.push(String.fromCharCode(65+i));
          const saved = _examAnswers[qid] || "";
          ansHtml = `<div style="font-size:.74rem;font-weight:800;color:var(--ink-light);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Nội dung đáp án và chọn đáp án</div>${opts.map((opt, index) => `
            <label id="lbl_${qid}_${opt}"
              style="display:flex;align-items:flex-start;gap:12px;padding:11px 12px;
                border-radius:8px;border:1.5px solid ${saved.includes(opt)?"var(--navy)":"var(--border)"};
                background:${saved.includes(opt)?"#eff6ff":"var(--white)"};
                cursor:pointer;margin-bottom:6px;transition:.15s;user-select:none"
              onmouseover="this.style.borderColor='var(--navy)'"
              onmouseout="window.peRefreshMC('${qid}','${opt}')">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:${layout.options[index]?.text ? "4px" : "0"}">
                  <span style="font-weight:700;font-size:.92rem;color:var(--navy);width:22px;flex-shrink:0">${layout.options[index]?.key || opt}</span>
                  <span style="font-size:.72rem;font-weight:700;color:var(--ink-light);text-transform:uppercase;letter-spacing:.05em">Chọn đáp án</span>
                </div>
                ${layout.options[index]?.text ? `<div style="font-size:.94rem;line-height:1.55;color:var(--ink);white-space:pre-line;text-transform:none">${layout.options[index].text}</div>` : ""}
              </div>
              <input type="checkbox" value="${opt}" id="cb_${qid}_${opt}" ${saved.includes(opt)?"checked":""}
                onchange="window.peMC('${qid}')"
                style="width:18px;height:18px;accent-color:var(--navy);flex-shrink:0;margin-top:2px">
            </label>`).join("")}`;
        } else if (type === "true_false") {
          const lbls = []; for (let i=0;i<n;i++) lbls.push(String.fromCharCode(97+i));
          const saved = _examAnswers[qid] || "";
          ansHtml = `<div style="font-size:.74rem;font-weight:800;color:var(--ink-light);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Nội dung đáp án và chọn đáp án</div>${lbls.map((lbl, index) => `
            <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 12px;
              background:var(--white);border-radius:6px;border:1px solid var(--border);margin-bottom:6px">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:${layout.options[index]?.text ? "4px" : "0"}">
                  <span style="font-weight:700;min-width:22px;color:var(--navy);flex-shrink:0;font-size:.9rem">${lbl})</span>
                  <span style="font-size:.72rem;font-weight:700;color:var(--ink-light);text-transform:uppercase;letter-spacing:.05em">Chọn đáp án</span>
                </div>
                ${layout.options[index]?.text ? `<div style="font-size:.94rem;color:var(--ink);line-height:1.5;white-space:pre-line;text-transform:none">${layout.options[index].text}</div>` : ""}
              </div>
              <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;white-space:nowrap;padding-top:2px">
                <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-size:.86rem;color:#15803d;font-weight:700">
                  <input type="radio" name="tf_${qid}_${lbl}" value="T" onchange="window.peTF('${qid}')"
                    ${saved.includes(lbl+"T")?"checked":""} style="accent-color:#16a34a;width:16px;height:16px"> Đúng
                </label>
                <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-size:.86rem;color:#b91c1c;font-weight:700">
                  <input type="radio" name="tf_${qid}_${lbl}" value="F" onchange="window.peTF('${qid}')"
                    ${saved.includes(lbl+"F")?"checked":""} style="accent-color:#dc2626;width:16px;height:16px"> Sai
                </label>
              </div>
            </div>`).join("")}`;
        } else if (type === "short_answer") {
          ansHtml = `<div style="font-size:.74rem;font-weight:800;color:var(--ink-light);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Câu trả lời</div><input type="text" placeholder="Nhập câu trả lời..."
            value="${(_examAnswers[qid]||"").replace(/"/g,"&quot;")}"
            oninput="window._peAnswers('${qid}',this.value)"
            style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;
              font-family:var(--font-body);font-size:.9rem;box-sizing:border-box;outline:none"
            onfocus="this.style.borderColor='var(--navy)'" onblur="this.style.borderColor='var(--border)'">`;
        } else if (type === "essay") {
          ansHtml = `<div style="font-size:.74rem;font-weight:800;color:var(--ink-light);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Câu trả lời</div><textarea placeholder="Viết câu trả lời của bạn..."
            oninput="window._peAnswers('${qid}',this.value)"
            style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;
              font-family:var(--font-body);font-size:.9rem;resize:vertical;min-height:120px;
              box-sizing:border-box;outline:none"
            onfocus="this.style.borderColor='var(--navy)'" onblur="this.style.borderColor='var(--border)'"
            >${_examAnswers[qid]||""}</textarea>`;
        }

        /* â”€â”€ FIX 2: Build card vá»›i layout 10 pháº§n â”€â”€ */
        const card = document.createElement("div");
        card.id = "qcard_" + qid;
        card.style.cssText = "background:var(--white);border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden";

        /* Header */
        const header = document.createElement("div");
        header.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--surface);border-bottom:1px solid var(--border)";
        header.innerHTML = `
          <span style="width:26px;height:26px;border-radius:50%;background:var(--navy);color:var(--gold-light);
            display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;flex-shrink:0">${globalNum}</span>
          <span style="font-size:1.1rem;font-weight:700;color:var(--ink-mid)">Câu ${globalNum}</span>
          <span style="margin-left:auto;font-size:.75rem;color:var(--ink-mid)">${eq.points} điểm</span>`;
        card.appendChild(header);

        const body = document.createElement("div");
        body.style.cssText = "display:flex;flex-direction:column";

        const questionPart = document.createElement("div");
        questionPart.style.cssText = "padding:16px 18px;display:flex;flex-direction:column;gap:12px";

        const qEl = document.createElement("div");
        qEl.style.cssText = `font-size:1.18rem;line-height:1.9;color:var(--navy);white-space:pre-line;flex:${hasImg ? 2 : 1}`;
        qEl.textContent = (type === "multi_choice" || type === "true_false") ? layout.stem : (q.question_text||"");
        if (hasImg) {
          questionPart.style.flexDirection = "row";
          questionPart.style.alignItems = "flex-start";
          questionPart.style.gap = "16px";
           const imgWrap = document.createElement("div");
          imgWrap.style.cssText = "flex:1;display:flex;justify-content:flex-end;align-items:flex-start";
          const imgEl = document.createElement("img");
          imgEl.src = q.question_img;
          imgEl.style.cssText = "max-width:100%;max-height:240px;object-fit:contain;border-radius:8px";
          questionPart.appendChild(qEl);
          imgWrap.appendChild(imgEl);
          questionPart.appendChild(imgWrap);
        } else {
          questionPart.appendChild(qEl);
        }

        const answerPart = document.createElement("div");
        answerPart.style.cssText = "padding:14px 18px;background:var(--surface);border-top:1px solid var(--border)";
        answerPart.innerHTML = ansHtml;

        body.appendChild(questionPart);
        body.appendChild(answerPart);

        card.appendChild(body);
        _pendingCards.push(card);
        sectionsHtml += `<div id="qslot_${qid}"></div>`;
      });

      sectionsHtml += `</div>`;
    });

    /* â”€â”€ Overlay HTML â”€â”€ */
    overlay.innerHTML =
      `<div style="height:64px;background:var(--navy);color:#fff;display:flex;align-items:center;
        gap:14px;padding:0 20px;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.2)">
        <button onclick="peExitExam()" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);
          color:#fff;padding:5px 12px;border-radius:7px;font-size:12px;font-weight:600;
          cursor:pointer;font-family:var(--font-body)">← Thoát</button>
        <span style="font-family:var(--font-display);font-size:1.2rem;flex:1">${examTitle}</span>
        <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);
          padding:7px 16px;border-radius:8px">
          <span style="font-size:.8rem;color:rgba(255,255,255,.7)">Thời gian</span>
          <span id="peClock" style="font-size:1.22rem;font-weight:700;font-family:monospace;
            color:var(--gold-light);min-width:72px;text-align:center">${formatClock(_examSeconds)}</span>
        </div>
        <button onclick="submitPublicExam(false)" style="background:var(--gold);color:var(--navy);
          border:none;padding:9px 20px;border-radius:8px;font-size:.95rem;font-weight:700;
          cursor:pointer;font-family:var(--font-body)">Nộp bài</button>
      </div>
      <div style="flex:1;display:flex;overflow:hidden;min-height:0">
        <!-- Nav: chá»‰ Ã´ trÃ²n sá»‘ -->
        <div style="width:120px;flex-shrink:0;background:var(--white);border-right:1px solid var(--border);
          overflow-y:auto;padding:10px 8px">
          <div style="font-size:.82rem;font-weight:700;color:var(--ink-light);text-transform:uppercase;
            letter-spacing:.05em;margin-bottom:8px">Danh sách câu</div>
          ${navHtml}
          <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
            <button onclick="submitPublicExam(false)"
              style="width:100%;background:var(--navy);color:var(--gold-light);border:none;
              padding:10px;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;
              font-family:var(--font-body)">Nộp bài</button>
          </div>
        </div>
        <!-- Main content -->
        <div style="flex:1;overflow-y:auto;padding:18px 20px;background:#f8fafc">${sectionsHtml}</div>
      </div>`;

    updateClock();

    /* Mount DOM cards vÃ o slots */
    _pendingCards.forEach(cardEl => {
      const qid  = cardEl.id.replace("qcard_", "");
      const slot = document.getElementById("qslot_" + qid);
      if (slot) slot.replaceWith(cardEl);
    });

    /* MathJax */
    const mainArea = overlay.querySelector(`div[style*="overflow-y:auto;padding:18px"]`);
    if (mainArea && window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([mainArea]).catch(()=>{});
    }
  }

  function formatClock(secs) {
    const m = String(Math.floor(Math.max(0,secs)/60)).padStart(2,"0");
    const s = String(Math.max(0,secs)%60).padStart(2,"0");
    return m+":"+s;
  }
  function updateClock() {
    const el = document.getElementById("peClock");
    if (!el) return;
    el.textContent = formatClock(_examSeconds);
    el.style.color = _examSeconds < 300 ? "#ef4444" : "var(--gold-light)";
  }

  window._peAnswers = function(qid, val) {
    _examAnswers[qid] = val;
    peUpdateNavDot(qid);
  };
  window.peTF = function(qid) {
    const radios = document.querySelectorAll(`input[name^="tf_${qid}_"]`);
    let val=""; const seen=new Set();
    radios.forEach(r=>{
      if(r.checked){ const lbl=r.name.split("_").pop(); if(!seen.has(lbl)){seen.add(lbl);val+=lbl+r.value;} }
    });
    _examAnswers[qid]=val; peUpdateNavDot(qid);
  };
  window.peMC = function(qid) {
    const cbs = document.querySelectorAll(`input[id^="cb_${qid}_"]`);
    let val="";
    cbs.forEach(cb=>{ if(cb.checked) val+=cb.value; });
    _examAnswers[qid]=val;
    cbs.forEach(cb=>{
      const lbl=document.getElementById("lbl_"+qid+"_"+cb.value);
      if(lbl){
        lbl.style.borderColor=cb.checked?"var(--navy)":"var(--border)";
        lbl.style.background=cb.checked?"#eff6ff":"var(--white)";
      }
    });
    peUpdateNavDot(qid);
  };
  window.peRefreshMC = function(qid,opt) {
    const cb=document.getElementById("cb_"+qid+"_"+opt);
    const lbl=document.getElementById("lbl_"+qid+"_"+opt);
    if(!cb||!lbl) return;
    lbl.style.borderColor=cb.checked?"var(--navy)":"var(--border)";
    lbl.style.background=cb.checked?"#eff6ff":"var(--white)";
  };
  function peUpdateNavDot(qid) {
    const dot=document.getElementById("navdot_"+qid);
    if(dot) dot.style.background=(_examAnswers[qid]||"").trim()?"var(--green)":"var(--border)";
  }
  window.peScrollToQ = function(qid) {
    document.getElementById("qcard_"+qid)?.scrollIntoView({behavior:"smooth",block:"start"});
  };

  async function saveProgress() {
    if (!_examResultId) return;
    const sb = getSb();
    await sb.from("exam_results").update({seconds_left:_examSeconds}).eq("id",_examResultId);
    const rows = Object.entries(_examAnswers)
      .filter(([,a])=>a&&a.trim())
      .map(([question_id,answer])=>({result_id:_examResultId,question_id,answer}));
    if (rows.length) await sb.from("exam_answers").upsert(rows,{onConflict:"result_id,question_id"});
  }

  window.peExitExam = async function() {
    if (!confirm("Thoát? Tiến trình được lưu, thời gian bị trừ 5 phút khi vào lại.")) return;
    clearInterval(_examTimer);
    if (_examResultId) { await saveProgress(); _examResultId=null; }
    getOverlay().style.display="none";
    await loadExamList();
  };

  window.submitPublicExam = async function(auto=false) {
    if (!auto && !confirm("Bạn chắc chắn muốn nộp bài?")) return;
    clearInterval(_examTimer);
    const sb=getSb();
    let scoreAuto=0;
    const answerRows=[];

    for (const eq of _examQuestions) {
      const q=eq.question, type=q.question_type, qid=q.id;
      const ans=(_examAnswers[qid]||"").trim();
      const correct=(q.answer||"").trim();
      let isCorrect=null, scoreEarned=0;
      const partial=eq.partial_points;
      const n=Math.max(1,parseInt(q.answer_count)||4);

      if (type==="multi_choice") {
        const sSet=new Set(ans.toUpperCase().split("").filter(c=>/[A-Z]/.test(c)));
        const cSet=new Set(correct.toUpperCase().split("").filter(c=>/[A-Z]/.test(c)));
        isCorrect=sSet.size===cSet.size&&[...sSet].every(c=>cSet.has(c));
        scoreEarned=isCorrect?(eq.points||0):0;
      } else if (type==="true_false") {
        const lbls=[]; for(let i=0;i<n;i++) lbls.push(String.fromCharCode(97+i));
        let cnt=0;
        lbls.forEach(lbl=>{
          const sc=ans.includes(lbl+"T")?"T":(ans.includes(lbl+"F")?"F":"");
          const cc=correct.includes(lbl)?"T":"F";
          if(sc===cc) cnt++;
        });
        isCorrect=cnt===n;
        scoreEarned=(partial&&partial[cnt]!==undefined)?partial[cnt]:(isCorrect?eq.points:0);
      } else if (type==="short_answer") {
        const corrects=correct.split(";").map(s=>s.trim().toLowerCase()).filter(Boolean);
        isCorrect=corrects.some(c=>ans.toLowerCase()===c);
        scoreEarned=isCorrect?(eq.points||0):0;
      } else if (type==="essay") {
        isCorrect=null; scoreEarned=0;
      }

      if (type!=="essay") scoreAuto+=scoreEarned;
      answerRows.push({result_id:_examResultId,question_id:qid,answer:ans,is_correct:isCorrect,score_earned:scoreEarned});
    }

    if (answerRows.length) await sb.from("exam_answers").upsert(answerRows,{onConflict:"result_id,question_id"});
    const hasEssay=_examQuestions.some(eq=>eq.question.question_type==="essay");
    await sb.from("exam_results").update({
      submitted_at: new Date().toISOString(),
      score_auto:   Math.round(scoreAuto*100)/100,
      score_total:  hasEssay ? null : Math.round(scoreAuto*100)/100,
      seconds_left: null,
    }).eq("id",_examResultId);

    const { data: stale } = await sb.from("exam_results").select("id")
      .eq("public_exam_id",_peId).eq("student_id",_uid).is("submitted_at",null);
    if (stale?.length) {
      const ids=stale.map(r=>r.id);
      await sb.from("exam_answers").delete().in("result_id",ids);
      await sb.from("exam_results").delete().in("id",ids);
    }
    _examResultId=null;
    showPublicExamResult(scoreAuto, hasEssay);
  };

  function showPublicExamResult(scoreAuto, hasEssay) {
    getOverlay().style.display="none";
    const pct=Math.round((scoreAuto/_examTotal)*100);
    const color=pct>=80?"var(--green)":pct>=50?"var(--amber)":"var(--red)";
    const msg=pct>=80?"Xuất sắc! 🎉":pct>=50?"Khá tốt! 👍":"Cần cố gắng thêm 💪";

    const grid=document.getElementById("examGrid");
    grid.style.display="block";
    grid.innerHTML=`
      <div style="max-width:480px;margin:40px auto;text-align:center">
        <div style="font-size:4rem;margin-bottom:8px">${pct>=80?"🏆":pct>=50?"📝":"📖"}</div>
        <div style="font-family:var(--font-display);font-size:1.5rem;color:var(--navy);margin-bottom:4px">${msg}</div>
        <div style="font-size:.9rem;color:var(--ink-mid);margin-bottom:24px">Bài thi đã được nộp thành công</div>
        <div style="background:var(--white);border-radius:16px;padding:28px;box-shadow:0 8px 30px rgba(0,0,0,.08);margin-bottom:20px">
          <div style="font-size:3rem;font-weight:800;color:${color};line-height:1">
            ${Math.round(scoreAuto*100)/100}<span style="font-size:1.4rem">/${_examTotal}</span>
          </div>
          <div style="font-size:.9rem;color:var(--ink-mid);margin-top:4px">Điểm tự động</div>
          ${hasEssay?`<div style="margin-top:14px;padding:10px 14px;background:#fef3c7;border-radius:8px;font-size:.82rem;color:#b45309">⏳ Phần tự luận sẽ được giáo viên chấm sau</div>`:""}
        </div>
        <button onclick="loadExamList()" style="background:var(--navy);color:var(--gold-light);border:none;
          padding:12px 32px;border-radius:10px;font-size:.9rem;font-weight:700;cursor:pointer;font-family:var(--font-body)">
          ← Quay lại danh sách đề thi</button>
      </div>`;
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     STUDENT: XEM Láº I BÃ€I THI
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  window.openReview = async function(peId, resultId, examTitle, isOfficial) {
    const grid = document.getElementById("examGrid");
    grid.style.display = "block";
    grid.innerHTML = '<div style="color:var(--ink-light)">Đang tải bài làm...</div>';
    const sb = getSb();

    const [{data:result},{data:answers},{data:pe}] = await Promise.all([
      sb.from("exam_results").select("*").eq("id", resultId).single(),
      sb.from("exam_answers").select("*").eq("result_id", resultId),
      sb.from("public_exams").select("exam:exams(total_points,exam_questions(*,question:question_bank(*)))").eq("id", peId).single(),
    ]);

    /* Đ thá»© tá»± lÃºc thi: sort theo order_no rá»“i group theo loáº¡i */
    const eqs = (pe?.exam?.exam_questions||[]).slice().sort((a,b)=>(a.order_no??0)-(b.order_no??0)).filter(eq=>eq.question);
    const ansMap = {};
    (answers||[]).forEach(a => { ansMap[a.question_id] = a; });
    const totalPts  = pe?.exam?.total_points || 10;
    const score     = result?.score_total ?? result?.score_auto;

    const SECTION_ORDER  = ["multi_choice","true_false","short_answer","essay"];
    const SECTION_TITLES = {
      multi_choice: "Phần I. Trắc nghiệm",
      true_false:   "Phần II. Đ / Sai",
      short_answer: "Phần III. Trả lời ngắn",
      essay:        "Phần IV. Tự luận",
    };
    const TYPE_LABEL = { multi_choice:"Trắc nghiệm", true_false:"Đ/Sai", short_answer:"Trả lời ngắn", essay:"Tự luận" };

    const groups = {};
    SECTION_ORDER.forEach(t => { groups[t] = []; });
    eqs.forEach(eq => { const t = eq.question.question_type; if (groups[t]) groups[t].push(eq); });

    /* Header */
    grid.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap">'
      + '<button class="btn btn-outline btn-sm" onclick="loadExamList()">← Quay lại</button>'
      + '<div style="flex:1">'
      + '<div style="font-weight:700;font-size:.95rem;color:var(--navy)">' + examTitle + '</div>'
      + '<div style="font-size:.75rem;color:var(--ink-mid)">Nộp: ' + (result?.submitted_at ? fmtDT(result.submitted_at) : "—")
      + ' &nbsp;•&nbsp; Điểm: <b style="color:var(--navy)">' + (score ?? 'Chưa chấm') + '/' + totalPts + '</b></div>'
      + '</div></div>';

    /* Build cards â€” giá»‘ng há»‡t layout lÃºc thi */
    let globalNum = 0;
    const pendingCards = []; // Ä‘á»ƒ MathJax xá»­ lÃ½ sau

    SECTION_ORDER.forEach(type => {
      if (!groups[type].length) return;

      /* Section wrapper */
      const section = document.createElement("div");
      section.style.cssText = "margin-bottom:24px";
      const secTitle = document.createElement("div");
      secTitle.style.cssText = "font-family:var(--font-display);font-size:.88rem;font-weight:700;padding:8px 14px;background:var(--navy);color:#fff;border-radius:8px;margin-bottom:10px";
      secTitle.textContent = SECTION_TITLES[type];
      section.appendChild(secTitle);
      grid.appendChild(section);

      groups[type].forEach(eq => {
        globalNum++;
        const q      = eq.question;
        const ans    = ansMap[q.id];
        const hasImg = !!q.question_img;
        const layout = parseQuestionLayout(q.question_text, type, Math.max(2, parseInt(q.answer_count)||4));

        /* â”€â”€ Card â”€â”€ */
        const card = document.createElement("div");
        card.style.cssText = "background:var(--white);border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden";

        /* Header */
        const hdr = document.createElement("div");
        hdr.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--surface);border-bottom:1px solid var(--border)";
        hdr.innerHTML =
          '<span style="width:26px;height:26px;border-radius:50%;background:var(--navy);color:var(--gold-light);'
          + 'display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;flex-shrink:0">' + globalNum + '</span>'
          + '<span style="font-size:1.1rem;font-weight:700;color:var(--ink-mid)">Câu ' + globalNum + '</span>'
          + '<span style="font-size:.72rem;color:var(--ink-light);margin-left:4px">· ' + TYPE_LABEL[type] + '</span>'
          + '<span style="margin-left:auto;font-size:.75rem;color:var(--ink-mid)">' + eq.points + ' điểm</span>';
        card.appendChild(hdr);

        const body = document.createElement("div");
        body.style.cssText = "display:flex;flex-direction:column";

        const qPart = document.createElement("div");
        qPart.style.cssText = "padding:16px 18px;display:flex;flex-direction:column;gap:12px";

        const buildQText = (text) => {
          const el = document.createElement("div");
          el.style.cssText = "flex:1;font-size:1rem;line-height:1.8;color:var(--navy);white-space:pre-line";
          el.textContent = text || "";
          return el;
        };

        const qTextEl = buildQText((type === "multi_choice" || type === "true_false") ? layout.stem : q.question_text);
        qTextEl.style.flex = hasImg ? "2" : "1";
        if (hasImg) {
          const imgCol = document.createElement("div");
          imgCol.style.cssText = "flex:1;display:flex;align-items:flex-start;justify-content:flex-end";
          const imgEl = document.createElement("img");
          imgEl.src = q.question_img;
          imgEl.style.cssText = "max-width:100%;max-height:220px;object-fit:contain;border-radius:8px";
          qPart.style.flexDirection = "row";
          qPart.style.alignItems = "flex-start";
          imgCol.appendChild(imgEl);
          qPart.appendChild(qTextEl);
          qPart.appendChild(imgCol);
        } else {
          qPart.appendChild(qTextEl);
        }
        body.appendChild(qPart);

        const aPart = document.createElement("div");
        aPart.style.cssText = "padding:14px 18px;background:var(--surface);border-top:1px solid var(--border);min-width:0;display:flex;flex-direction:column;gap:8px;justify-content:center";

        const isEssay = type === "essay";
        if (!isEssay) {
          if (ans?.answer) {
            const ok = ans.is_correct;
            /* Káº¿t quáº£ Ä‘Ãºng/sai */
            const res = document.createElement("div");
            res.style.cssText = "padding:6px 8px;border-radius:7px;background:" + (ok?"#f0fdf4":"#fef2f2") + ";border:1px solid " + (ok?"#86efac":"#fca5a5");
            res.innerHTML =
              '<div style="font-weight:700;font-size:.8rem;color:' + (ok?"var(--green)":"var(--red)") + '">' + (ok?"Đúng":"Sai") + '</div>'
              + '<div style="font-size:.78rem;margin-top:2px">Bạn: <b>' + ans.answer + '</b></div>'
              + (!ok && q.answer ? '<div style="font-size:.78rem;color:var(--green);margin-top:2px">Đúng: <b>' + q.answer + '</b></div>' : '')
              + '<div style="font-size:.78rem;font-weight:700;color:' + (ok?"var(--green)":"var(--red)") + ';margin-top:4px">' + (ans.score_earned??0) + '/' + eq.points + 'đ</div>';
            aPart.appendChild(res);
          } else {
            const res = document.createElement("div");
            res.style.cssText = "padding:6px 8px;border-radius:7px;background:var(--surface);border:1px solid var(--border);font-size:.78rem;color:var(--ink-light)";
            res.innerHTML = '— Bỏ qua'
              + (q.answer ? '<div style="color:var(--green);margin-top:2px">Đúng: <b>' + q.answer + '</b></div>' : '')
              + '<div style="font-weight:700;color:var(--red);margin-top:4px">0/' + eq.points + 'đ</div>';
            aPart.appendChild(res);
          }
        } else {
          /* Essay */
          const ansEl = document.createElement("div");
          ansEl.style.cssText = "font-size:.8rem;background:var(--white);border:1px solid var(--border);border-radius:7px;padding:6px 8px;white-space:pre-wrap;max-height:140px;overflow-y:auto";
          if (ans?.answer) {
            ansEl.textContent = ans.answer;
          } else {
            ansEl.innerHTML = '<span style="color:var(--ink-light);font-style:italic">Không trả lời</span>';
          }
          aPart.appendChild(ansEl);

          const scored = ans?.score_earned != null;
          const scoreEl = document.createElement("div");
          scoreEl.style.cssText = "font-size:.78rem;font-weight:700;" + (scored ? "color:var(--navy)" : "color:var(--amber)");
          scoreEl.textContent = scored ? "Điểm: " + (ans.score_earned||0) + "/" + eq.points + "đ" : "⏳ Chưa chấm";
          aPart.appendChild(scoreEl);
        }

        body.appendChild(aPart);
        card.appendChild(body);

        /* NÃºt AI lá»i giáº£i (náº¿u cÃ³) */
        if (window.aiAddSolutionBtn) {
          window.aiAddSolutionBtn(card, q, ans?.answer||"");
        }

        section.appendChild(card);
        pendingCards.push(card);
      });
    });

    /* MathJax render sau khi táº¥t cáº£ card Ä‘Ã£ vÃ o DOM */
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise(pendingCards).catch(()=>{});
    }
  };

  window.loadExamList = loadExamList;
  init();
})();

