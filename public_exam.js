(function () {

  function getSb() { return window.sb || sb; }
  function fmtDT(iso) {
    return new Date(iso).toLocaleString("vi-VN", {
      day:"2-digit", month:"2-digit", year:"numeric",
      hour:"2-digit", minute:"2-digit"
    });
  }
  /* â”€â”€ State â”€â”€ */
  let _role        = "student";
  let _uid         = null;
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
  let _examTitle     = "";
  let _examLastSavedAt = "";
  let _examLocalDirty = false;
  let _examSyncState = "idle";
  let _examDraftNotice = "";
  let _essayReviewQueue = [];

  function requirePublicExamAdmin() {
    if (_role === "admin") return true;
    alert("Chỉ admin mới có quyền quản lý đề thi thử và đề thi thật.");
    return false;
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     INIT
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  async function init() {
    const sb = getSb();
    const user = await window.AppAuth?.getUser?.();
    if (!user) { location.href = "index.html"; return; }
    _uid = user.id;

    const { data: profile } = await sb.from("users").select("role").eq("id", _uid).single();
    _role = profile?.role || "student";

    if (_role === "admin") {
      document.getElementById("adminToolbar").style.display = "";
    }

    await loadExamList();
  }

  window.addEventListener("beforeunload", (event) => {
    if (!_examResultId) return;
    persistExamDraft();
    event.preventDefault();
    event.returnValue = "";
  });

  window.addEventListener("online", () => {
    if (_examResultId) saveProgress({ forceRemote: true, silent: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && _examResultId) {
      saveProgress({ forceRemote: navigator.onLine, silent: true });
    }
  });

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
    if (!requirePublicExamAdmin()) return;
    const sb = getSb();
    const { error } = await sb.from("public_exams").update({ is_pinned: pin }).eq("id", peId);
    if (error) { alert("Lỗi: " + error.message); return; }
    await loadExamList();
  };

  window.openAddExamModal = async function() {
    if (!requirePublicExamAdmin()) return;
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
    if (!requirePublicExamAdmin()) return;
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
    if (!requirePublicExamAdmin()) return;
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
    if (!requirePublicExamAdmin()) return;
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
      .select("id,student_id,class_id,attempt_no,submitted_at,score_auto,score_essay,score_total")
      .eq("public_exam_id", peId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false });

    if (rErr) { grid.innerHTML = `<div style="color:var(--red)">Lỗi: ${rErr.message}</div>`; return; }

    const [{ data: pe }, { data: classes }] = await Promise.all([
      sb.from("public_exams")
        .select("exam:exams(total_points,exam_questions(*,question:question_bank(*)))").eq("id",peId).single(),
      sb.from("classes").select("id,name"),
    ]);
    const totalPoints = pe?.exam?.total_points || 10;
    const classMap = {};
    (classes || []).forEach((item) => { classMap[item.id] = item.name; });

    const studentIds = [...new Set((results||[]).map(r => r.student_id))];
    let nameMap = {};
    if (studentIds.length) {
      const { data: users } = await sb.from("users").select("id,full_name").in("id", studentIds);
      (users||[]).forEach(u => { nameMap[u.id] = u.full_name; });
    }

    const resultIds = (results || []).map((item) => item.id);
    const { data: answerRows } = resultIds.length
      ? await sb.from("exam_answers").select("result_id,question_id,answer,is_correct,score_earned").in("result_id", resultIds)
      : { data: [] };

    const bestMap = {};
    (results||[]).forEach(r => {
      const score = r.score_total ?? r.score_auto ?? -1;
      const prev  = bestMap[r.student_id];
      if (!prev || score > (prev.score_total ?? prev.score_auto ?? -1)) bestMap[r.student_id] = r;
    });
    const ranked = Object.values(bestMap).sort((a,b) => {
      return (b.score_total??b.score_auto??-1) - (a.score_total??a.score_auto??-1);
    });
    _essayReviewQueue = ranked
      .filter((item) => item.score_total === null)
      .map((item) => ({
        resultId: item.id,
        studentName: nameMap[item.student_id] || "-",
      }));

    const analytics = window.PublicExamSupport?.computeAnalytics?.({
      results: ranked,
      answers: answerRows || [],
      examQuestions: pe?.exam?.exam_questions || [],
      totalPoints,
      nameMap,
      classMap,
    });
    grid.innerHTML = `
      <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="loadExamList()">← Quay lại</button>
        <div style="flex:1">
          <div style="font-family:var(--font-display);font-size:1.1rem;font-weight:700;color:var(--navy)">${examTitle}</div>
          <div style="font-size:.78rem;color:var(--ink-mid);margin-top:2px">${ranked.length} thí sinh đã nộp bài &nbsp;•&nbsp; Tổng điểm: ${totalPoints}</div>
        </div>
      </div>
      ${window.PublicExamReportSupport?.renderAnalyticsPanels?.({
        analytics,
        totalPoints,
        peId,
        essayReviewQueue: _essayReviewQueue,
      }) || ""}
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
                const icon  = rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":rank;
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
                      ${pending ? "Chấm bài" : "Xem bài"}</button>
                  </td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`
      }`;
    requestAnimationFrame(() => {
      if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([grid]).catch(() => {});
      }
    });
  };

  window.openExamDetailAdmin = async function(resultId, studentName, peId, totalPts, queueIndex = -1) {
    const grid = document.getElementById("examGrid");
    grid.style.display = "block";
    grid.innerHTML = '<div style="color:var(--ink-light)">Đang tải bài làm...</div>';
    const sb = getSb();

    const [{ data: result }, { data: answers }, { data: pe }] = await Promise.all([
      sb.from("exam_results").select("*").eq("id", resultId).single(),
      sb.from("exam_answers").select("*,question:question_bank(id,question_type,question_text,answer,answer_count,question_img)").eq("result_id", resultId),
      sb.from("public_exams").select("exam_id,exam:exams(title,total_points,exam_questions(*,question:question_bank(*)))").eq("id",peId).single(),
    ]);

    const eqs = (pe?.exam?.exam_questions || [])
      .slice()
      .sort((a,b) => (a.order_no ?? 0) - (b.order_no ?? 0))
      .filter(eq => eq.question);
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
    const hasNextPending = Number.isInteger(queueIndex) && queueIndex >= 0 && queueIndex < _essayReviewQueue.length - 1;
    const headerRight = hasEssay
      ? '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        + '<div style="text-align:right;font-size:.8rem;color:var(--ink-mid)">'
        + 'Tự động: <b>'+scoreAuto+'</b><br>'
        + 'Tự luận: <b id="pe_essayTotal">'+(scoreEssay||0)+'</b><br>'
        + '<b style="color:var(--navy)">Tổng: <span id="pe_grandTotal">'+(result?.score_total??"Chưa chấm")+'</span>/'+totalPts+'</b>'
        + '</div>'
        + '<button class="btn btn-primary btn-sm" id="peSaveBtn">💾 Lưu điểm</button>'
        + (hasNextPending ? '<button class="btn btn-outline btn-sm" id="peSaveNextBtn">Lưu & chấm tiếp</button>' : '')
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
      + '<div id="peReviewCards"></div>';

    const reviewWrap = document.getElementById("peReviewCards");
    if (window.buildReviewCards && reviewWrap) {
      reviewWrap.appendChild(window.buildReviewCards(eqs, ansMap, hasEssay, {
        essayInputPrefix: "pe_essay_",
        essayUpdateHandler: "peUpdateEssayTotal",
        examResultId: resultId,
        reportSourceMode: "public_teacher_review",
      }));
    } else if (reviewWrap) {
      reviewWrap.innerHTML = qHtml;
      if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([reviewWrap]).catch(() => {});
      }
    }

    const backBtn = document.getElementById('peBackBtn');
    if (backBtn) backBtn.addEventListener('click', () => openResultDetail(peId, pe?.exam?.title||'', pe?.exam_type||''));
    const saveBtn = document.getElementById('peSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => peSaveEssay(resultId, scoreAuto, peId, studentName, totalPts));
    const saveNextBtn = document.getElementById('peSaveNextBtn');
    if (saveNextBtn) {
      saveNextBtn.addEventListener('click', async () => {
        await peSaveEssay(resultId, scoreAuto, peId, studentName, totalPts);
        const nextItem = _essayReviewQueue[queueIndex + 1];
        if (nextItem) {
          openExamDetailAdmin(nextItem.resultId, nextItem.studentName, peId, totalPts, queueIndex + 1);
        } else {
          openResultDetail(peId, pe?.exam?.title||'', pe?.exam_type||'');
        }
      });
    }

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

  function persistExamDraft() {
    if (!_examResultId || !window.PublicExamSupport?.saveDraft) return;
    window.PublicExamSupport.saveDraft(_examResultId, {
      answers: _examAnswers,
      secondsLeft: _examSeconds,
      examId: _currentExamId,
      examTitle: _examTitle,
    });
  }

  function restoreDraftIfBetter(serverAnswers, serverSeconds) {
    const draft = window.PublicExamSupport?.getDraft?.(_examResultId);
    if (!draft) return { answers: serverAnswers || {}, secondsLeft: serverSeconds, restored: false };

    const draftAnswers = draft.answers && typeof draft.answers === "object" ? draft.answers : {};
    const mergedAnswers = { ...(serverAnswers || {}) };
    Object.entries(draftAnswers).forEach(([qid, answer]) => {
      if (String(answer || "").trim()) mergedAnswers[qid] = answer;
    });

    const mergedSeconds = Number.isFinite(draft.secondsLeft) && draft.secondsLeft > (serverSeconds || 0)
      ? draft.secondsLeft
      : serverSeconds;

    _examDraftNotice = `Đã khôi phục bản lưu cục bộ lúc ${window.PublicExamSupport?.formatSyncTime?.(draft.updatedAt) || "gần đây"}.`;
    return {
      answers: mergedAnswers,
      secondsLeft: mergedSeconds,
      restored: true,
    };
  }

  function setExamSyncState(state, message) {
    _examSyncState = state;
    if (message) _examDraftNotice = message;
    const badge = document.getElementById("peSyncStatus");
    if (!badge) return;
    const color = state === "error"
      ? "#fee2e2;color:#b91c1c;border-color:#fecaca"
      : state === "saving"
      ? "#eff6ff;color:#1d4ed8;border-color:#bfdbfe"
      : state === "offline"
      ? "#fff7ed;color:#c2410c;border-color:#fdba74"
      : "#ecfdf5;color:#15803d;border-color:#86efac";
    badge.textContent = message || (state === "ready"
      ? `Đã lưu ${window.PublicExamSupport?.formatSyncTime?.(_examLastSavedAt) || ""}`.trim()
      : state === "saving"
      ? "Đang lưu..."
      : state === "offline"
      ? "Mất mạng, đang giữ bản cục bộ"
      : "Chưa lưu");
    badge.style.cssText = `font-size:.75rem;font-weight:700;padding:7px 10px;border-radius:999px;background:#fff;border:1px solid transparent;${color}`;
  }

  window.peManualSave = async function() {
    await saveProgress({ forceRemote: navigator.onLine, silent: false, forceToast: true });
  };

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     STUDENT: LÃ€M BÃ€I
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function getOverlay() { return document.getElementById("examOverlay"); }

  function buildQuestionReportButton(question, context = {}) {
    if (_role !== "student" || !question?.id) return null
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = "Báo lỗi câu hỏi"
    button.style.cssText = "align-self:flex-start;margin-top:6px;border:1px solid rgba(245,158,11,.28);background:#fff7ed;color:#b45309;padding:4px 8px;border-radius:999px;font-size:.68rem;font-weight:800;cursor:pointer;font-family:var(--font-body);line-height:1.2"
    button.addEventListener("click", () => {
      window.PublicExamSupport?.openQuestionReportModal?.({
        questionId: question.id,
        questionStem: String(question.question_text || "").split(/\r?\n/).slice(0, 6).join("\n"),
        publicExamId: context.publicExamId || _peId || null,
        examResultId: context.examResultId || _examResultId || null,
        sourceMode: context.sourceMode || "review",
      })
    })
    return button
  }

  function setPublicExamFocusMode(active) {
    window.MindupEffects?.setExamMode?.(!!active);
    window.parent?.postMessage({ type: "mindup:exam-mode", active: !!active }, "*");
  }

  window.startPublicExam = async function(peId, examId, examTitle, durationMin, totalPoints, examType) {
    const sb = getSb();
    _peId = peId; _peType = examType; _currentExamId = examId;
    _examTotal = totalPoints; _examAnswers = {}; _examTitle = examTitle;
    _examLastSavedAt = ""; _examLocalDirty = false; _examDraftNotice = "";

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
        .insert({exam_id:examId,student_id:_uid,attempt_no:tryAttempt,public_exam_id:peId,seconds_left: durationMin * 60})
        .select("id").single();
      if (!re) { newResult=data; break; }
      if (re.code==="23505") { tryAttempt++; continue; }
      alert("Lỗi: "+re.message); return;
    }
    if (!newResult) { alert("Không thể tạo bài thi."); return; }
    _examResultId = newResult.id;
    _examSeconds  = durationMin * 60;
    persistExamDraft();

    renderPublicExamUI(examTitle, durationMin);
    setExamSyncState("ready", "Đã tạo phiên làm bài mới.");
    startExamTimer();
  };

  window.resumePublicExam = async function(peId, examId, examTitle, durationMin, totalPoints, examType, resultId, secsLeft) {
    const sb = getSb();
    _peId = peId; _peType = examType; _currentExamId = examId;
    _examTotal = totalPoints; _examResultId = resultId; _examAnswers = {}; _examTitle = examTitle;
    _examLastSavedAt = ""; _examLocalDirty = false;

    if (secsLeft <= 0) { await submitPublicExam(true); return; }

    const { data: eqs } = await sb.from("exam_questions").select("*, question:question_bank(*)")
      .eq("exam_id",examId).order("order_no");
    _examQuestions = (eqs||[]).filter(eq=>eq.question!==null);

    const { data: saved } = await sb.from("exam_answers").select("question_id,answer").eq("result_id",resultId);
    const serverAnswers = {};
    (saved||[]).forEach(a => { if(a.answer) serverAnswers[a.question_id]=a.answer; });

    const restored = restoreDraftIfBetter(serverAnswers, secsLeft);
    _examAnswers = restored.answers;
    _examSeconds = restored.secondsLeft;

    renderPublicExamUI(examTitle, durationMin);
    setExamSyncState("ready", restored.restored ? _examDraftNotice : "Đã khôi phục tiến trình làm bài.");
    startExamTimer();
  };

  function startExamTimer() {
    clearInterval(_examTimer);
    _examTimer = setInterval(() => {
      _examSeconds--;
      if (_examSeconds > 0 && _examSeconds % 15 === 0) persistExamDraft();
      updateClock();
      if (_examSeconds > 0 && _examSeconds % 30 === 0) saveProgress({ forceRemote: navigator.onLine, silent: true });
      if (_examSeconds <= 0) { clearInterval(_examTimer); submitPublicExam(true); }
    }, 1000);
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     RENDER GIAO DIá»†N LÃ€M BÃ€I
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function renderPublicExamUI(examTitle, durationMin) {
    const overlay = getOverlay();
    overlay.style.display = "flex";
    setPublicExamFocusMode(true);
    if (window.ExamUIHelper?.renderStandardExam) {
      window.ExamUIHelper.renderStandardExam({
        mount: overlay,
        title: examTitle,
        questions: _examQuestions,
        answers: _examAnswers,
        seconds: _examSeconds,
        clockId: "peClock",
        navPanelId: "peNavPanel",
        mainAreaId: "peMainArea",
        handlers: {
          exit: "peExitExam",
          submit: "submitPublicExam",
          toggleNav: "peToggleNav",
          scroll: "peScrollToQ",
          updateMC: "peMC",
          updateTF: "peTF",
          updateText: "_peAnswers",
          refreshMC: "peRefreshMC",
        },
        reportButtonBuilder(question, body) {
          if (_role !== "student" || !body) return;
          const button = buildQuestionReportButton(question, {
            sourceMode: "live_exam",
            publicExamId: _peId,
            examResultId: _examResultId,
          });
          if (button) body.appendChild(button);
        },
      });
      updateClock();
      setExamSyncState(_examSyncState === "offline" ? "offline" : "ready", _examDraftNotice || "Đã mở giao diện làm bài.");
      return;
    }

    overlay.innerHTML = '<div style="padding:32px"><strong>Không tải được giao diện làm bài.</strong></div>';
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

  window.peToggleNav = function(){
    const panel = document.getElementById("peNavPanel");
    if (!panel) return;
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  };

  window._peAnswers = function(qid, val) {
    _examAnswers[qid] = val;
    _examLocalDirty = true;
    persistExamDraft();
    setExamSyncState(navigator.onLine ? "saving" : "offline", navigator.onLine ? "Đã lưu cục bộ, chờ đồng bộ..." : "Mất mạng, đang giữ bản cục bộ");
    peUpdateNavDot(qid);
  };
  window.peTF = function(qid) {
    const radios = document.querySelectorAll(`input[name^="tf_${qid}_"]`);
    let value = "";
    const seen = new Set();
    radios.forEach(r=>{
      if (r.checked) {
        const lbl = r.name.split("_").pop();
        if (!seen.has(lbl)) {
          seen.add(lbl);
          value += lbl + (String(r.value || "F").toUpperCase() === "T" ? "T" : "F");
        }
      }
    });
    _examAnswers[qid] = value;
    _examLocalDirty = true;
    persistExamDraft();
    setExamSyncState(navigator.onLine ? "saving" : "offline", navigator.onLine ? "Đã lưu cục bộ, chờ đồng bộ..." : "Mất mạng, đang giữ bản cục bộ");
    peUpdateNavDot(qid);
  };
  window.peMC = function(qid) {
    const cbs = document.querySelectorAll(`input[id^="cb_${qid}_"]`);
    let val="";
    cbs.forEach(cb=>{ if(cb.checked) val+=cb.value; });
    _examAnswers[qid]=val;
    _examLocalDirty = true;
    persistExamDraft();
    setExamSyncState(navigator.onLine ? "saving" : "offline", navigator.onLine ? "Đã lưu cục bộ, chờ đồng bộ..." : "Mất mạng, đang giữ bản cục bộ");
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
    const panel = document.getElementById("peNavPanel");
    if (panel && window.matchMedia("(max-width: 768px)").matches) {
      panel.style.display = "none";
    }
  };

  async function saveProgress(options = {}) {
    if (!_examResultId) return;
    const { forceRemote = true, silent = false, forceToast = false } = options;
    const sb = getSb();
    persistExamDraft();
    if (!forceRemote || !navigator.onLine) {
      setExamSyncState("offline", "Mất mạng, đang giữ bản cục bộ");
      return;
    }
    setExamSyncState("saving");
    const { error: resultErr } = await sb.from("exam_results").update({seconds_left:_examSeconds}).eq("id",_examResultId);
    const rows = Object.entries(_examAnswers)
      .filter(([,a])=>a&&a.trim())
      .map(([question_id,answer])=>({result_id:_examResultId,question_id,answer}));
    let answerErr = null;
    if (rows.length) {
      const response = await sb.from("exam_answers").upsert(rows,{onConflict:"result_id,question_id"});
      answerErr = response.error;
    }
    if (resultErr || answerErr) {
      setExamSyncState("offline", "Chưa đồng bộ được, đang giữ bản cục bộ");
      if (!silent && forceToast) window.PublicExamSupport?.toast?.("Chưa lưu lên máy chủ, hệ thống vẫn giữ bản cục bộ.", "error");
      return;
    }
    _examLocalDirty = false;
    _examLastSavedAt = new Date().toISOString();
    setExamSyncState("ready", `Đã lưu ${window.PublicExamSupport?.formatSyncTime?.(_examLastSavedAt) || ""}`.trim());
    if (forceToast) window.PublicExamSupport?.toast?.("Đã lưu tiến trình làm bài.", "success");
  }

  window.peExitExam = async function() {
    if (!confirm("Thoát? Tiến trình được lưu, thời gian bị trừ 5 phút khi vào lại.")) return;
    clearInterval(_examTimer);
    try {
      if (_examResultId) await saveProgress({ forceRemote: navigator.onLine, silent: false });
    } catch (error) {
      console.error("[peExitExam] save failed:", error);
    } finally {
      _examResultId=null;
      getOverlay().style.display="none";
      setPublicExamFocusMode(false);
      await loadExamList();
    }
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
          const explicitStudent = new Map([...ans.matchAll(/([a-z])\s*([TF])/g)].map(([, label, value]) => [label.toLowerCase(), value.toUpperCase()]));
          const normalizedStudent = window.QuestionAnswerFormat?.normalizeTrueFalseAnswer?.(ans, n) || "";
          const normalizedCorrect = window.QuestionAnswerFormat?.normalizeTrueFalseAnswer?.(correct, n) || "";
          let cnt=0;
          lbls.forEach((lbl, index)=>{
            const sc = explicitStudent.size ? (explicitStudent.get(lbl) || "") : (normalizedStudent[index] || "");
            const cc = normalizedCorrect[index] || "";
            if(sc===cc) cnt++;
          });
        isCorrect=(explicitStudent.size ? explicitStudent.size : normalizedStudent.length)===n&&cnt===n;
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
    window.PublicExamSupport?.clearDraft?.(_examResultId);
    setPublicExamFocusMode(false);
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
    if (window.ExamUIHelper?.renderStandardReview?.({
      mount: grid,
      title: examTitle,
      subtitle: result?.submitted_at ? `Nộp lúc ${fmtDT(result.submitted_at)}` : "Kết quả bài làm",
      score,
      totalPoints: totalPts,
      backHandler: "loadExamList",
      questions: eqs,
      answers: ansMap,
      cardsOptions: {
        enableAiSolution: true,
        examResultId: result?.id || null,
        reportSourceMode: "public_review",
      },
    })) return;

    grid.innerHTML = '<div style="padding:32px"><strong>Không tải được giao diện xem lại bài.</strong></div>';
  };
  window.loadExamList = loadExamList;
  init();
})();

