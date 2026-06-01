/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
   CLASS_STUDENT.JS
   Full-screen view cho student khi nhÃ¡ÂºÂ¥n vÃƒÂ o lÃ¡Â»â€ºp hÃ¡Â»Âc
   HiÃ¡Â»Æ’n thÃ¡Â»â€¹: thÃƒÂ´ng tin lÃ¡Â»â€ºp, Ã„â€˜iÃ¡Â»Æ’m danh cÃƒÂ¡ nhÃƒÂ¢n, danh sÃƒÂ¡ch
   hÃ¡Â»Âc sinh, danh sÃƒÂ¡ch Ã„â€˜Ã¡Â»Â thi (lÃƒÂ m bÃƒÂ i)
Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */
(function () {

  function getSb() {
    if (window.sb) return window.sb;
    if (typeof sb !== "undefined") return sb;
  }

  const daysMap = { 1:"T2", 2:"T3", 3:"T4", 4:"T5", 5:"T6", 6:"T7", 7:"CN" };

  function fmt(v) { return new Intl.NumberFormat("vi-VN").format(v); }
  const tuitionLabel = { per_session:"buổi", per_month:"tháng", per_course:"khóa" };
  function fmtTuition(fee, type) { return fmt(fee) + "đ/" + (tuitionLabel[type]||type); }

  function todayStr() {
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth()+1).padStart(2,"0") + "-" + String(n.getDate()).padStart(2,"0");
  }

  function getSchedulesForMonth(all, classId) {
    const now    = new Date();
    const mStart = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-01";
    const eligible = all.filter(s => s.class_id === classId && (s.effective_from||"2000-01-01") <= mStart);
    if (!eligible.length) return [];
    const maxEf = eligible.reduce((m,s) => { const e=s.effective_from||"2000-01-01"; return e>m?e:m; }, "2000-01-01");
    return eligible.filter(s => (s.effective_from||"2000-01-01") === maxEf);
  }

  /* Ã¢â€â‚¬Ã¢â€â‚¬ DÃƒÂ¹ng unified overlay tÃ¡Â»Â« class_manage.js Ã¢â€â‚¬Ã¢â€â‚¬ */
  function getOrCreateOverlay() {
    let overlay = document.getElementById("classViewOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "classViewOverlay";
      overlay.style.cssText =
        "display:none;position:fixed;inset:0;background:var(--cream);z-index:200;" +
        "flex-direction:column;overflow:hidden;font-family:var(--font-body);min-height:0";
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function buildClassQuestionReportButton(question) {
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
        examResultId: _examResultId || null,
        sourceMode: "class_exam",
      });
    });
    return button;
  }

  /* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
     OPEN Ã¢â‚¬â€ entry point
  Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */
  window.openStudentClassView = async function (classId, className) {
    const overlay = getOrCreateOverlay();
    overlay.style.display = "flex";
    overlay.dataset.classId   = classId;
    overlay.dataset.className = className;

    overlay.innerHTML =
      '<div style="height:54px;background:var(--navy);color:#fff;display:flex;' +
      'align-items:center;gap:12px;padding:0 18px;flex-shrink:0;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.2)">' +
        '<button onclick="closeStudentClassView()" style="background:rgba(255,255,255,.12);' +
        'border:1px solid rgba(255,255,255,.2);color:#fff;padding:5px 14px;border-radius:7px;' +
        'font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-body)">← Quay lại</button>' +
        '<span style="font-family:var(--font-display);font-size:1.1rem;flex:1">' + className + "</span>" +
        '<span id="scv-date" style="font-size:.8rem;color:rgba(255,255,255,.6)">' + todayStr() + "</span>" +
      "</div>" +
      '<div id="scv-body" style="flex:1;overflow-y:auto;padding:22px 24px;min-height:0">' +
        '<p style="color:var(--ink-light);padding:20px">Đang tải...</p>' +
      "</div>";

    await loadStudentView(classId);
  };

  /* Ã¢â€â‚¬Ã¢â€â‚¬ ThoÃƒÂ¡t khÃ¡Â»Âi bÃƒÂ i thi: lÃ†Â°u tiÃ¡ÂºÂ¿n trÃƒÂ¬nh rÃ¡Â»â€œi vÃ¡Â»Â trang lÃ¡Â»â€ºp Ã¢â€â‚¬Ã¢â€â‚¬ */
  window.exitExam = async function () {
    if (!confirm("Bạn muốn thoát? Tiến trình sẽ được lưu lại, thời gian làm bài sẽ bị trừ 5 phút khi vào lại.")) return;

    const btn = document.getElementById("examExitBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Đang lưu..."; }

    clearInterval(_examTimer);

    try {
      if (_examResultId) await _saveProgressToDB();
    } catch (error) {
      console.error("[exitExam] save failed:", error);
    } finally {
      _examResultId = null;
      const sysTopbar = document.getElementById('topbar') || document.querySelector('header') || document.querySelector('nav');
      if (sysTopbar) sysTopbar.style.display = '';
      if (window.openClassView && window._classId) {
        await window.openClassView(window._classId, window._className || '');
      }
      if (window.cvSwitchTab) await window.cvSwitchTab('exams');
    }
  };

  window.closeStudentClassView = async function () {
    clearInterval(_examTimer);
    if (_examResultId) {
      await _saveProgressToDB();
      _examResultId = null;
    }
    const overlay = document.getElementById("studentClassOverlay");
    if (overlay) overlay.style.display = "none";
    const sysTopbar = document.getElementById('topbar') || document.querySelector('header') || document.querySelector('nav');
    if (sysTopbar) sysTopbar.style.display = '';
  };

  /* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
     LOAD DATA
  Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */
  async function loadStudentView(classId) {
    const sb   = getSb();
    const body = document.getElementById("scv-body");

    const { data:{ user } } = await sb.auth.getUser();
    if (!user) return;

    const now    = new Date();
    const mStart = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-01";
    const mEnd   = (() => {
      const last = new Date(now.getFullYear(), now.getMonth()+1, 0);
      return last.getFullYear() + "-" + String(last.getMonth()+1).padStart(2,"0") + "-" + String(last.getDate()).padStart(2,"0");
      /* Ã¢â€â‚¬Ã¢â€â‚¬ LÃ†Â°u tiÃ¡ÂºÂ¿n trÃƒÂ¬nh khi reload/Ã„â€˜ÃƒÂ³ng tab Ã¢â€â‚¬Ã¢â€â‚¬ */
  window.addEventListener("beforeunload", function () {
    if (!_examResultId) return;
    // DÃƒÂ¹ng sendBeacon Ã„â€˜Ã¡Â»Æ’ gÃ¡Â»Â­i request ngay cÃ¡ÂºÂ£ khi trang Ã„â€˜ang Ã„â€˜ÃƒÂ³ng
    // LÃ†Â°u seconds_left = hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i (khÃƒÂ´ng trÃ¡Â»Â« 5 phÃƒÂºt Ã¢â‚¬â€ sÃ¡ÂºÂ½ trÃ¡Â»Â« khi hiÃ¡Â»Æ’n thÃ¡Â»â€¹)
    const sb = getSb();
    // KhÃƒÂ´ng thÃ¡Â»Æ’ await trong beforeunload, dÃƒÂ¹ng sync approach
    // LÃ†Â°u vÃƒÂ o localStorage lÃƒÂ m backup phÃƒÂ²ng trÃ†Â°Ã¡Â»Âng hÃ¡Â»Â£p beacon fail
    try {
      localStorage.setItem("examBackup_" + _examResultId, JSON.stringify({
        resultId: _examResultId,
        examId: _currentExamId,
        secondsLeft: _examSeconds,
        answers: _collectAnswersFromDOM(),
        savedAt: Date.now(),
      }));
    } catch(e) {}
  });

  /* Ã¢â€â‚¬Ã¢â€â‚¬ Khi tÃ¡ÂºÂ£i lÃ¡ÂºÂ¡i trang, khÃƒÂ´i phÃ¡Â»Â¥c backup tÃ¡Â»Â« localStorage vÃƒÂ o DB Ã¢â€â‚¬Ã¢â€â‚¬ */
  (async function restoreBackup() {
    const sb = getSb();
    const { data: { user } } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));
    if (!user) return;

    const keys = Object.keys(localStorage).filter(k => k.startsWith("examBackup_"));
    for (const key of keys) {
      try {
        const backup = JSON.parse(localStorage.getItem(key));
        if (!backup || !backup.resultId) { localStorage.removeItem(key); continue; }

        // KiÃ¡Â»Æ’m tra record cÃƒÂ²n tÃ¡Â»â€œn tÃ¡ÂºÂ¡i vÃƒÂ  chÃ†Â°a nÃ¡Â»â„¢p
        const { data: rec } = await sb
          .from("exam_results")
          .select("id, submitted_at")
          .eq("id", backup.resultId)
          .eq("student_id", user.id)
          .single();

        if (!rec || rec.submitted_at) {
          localStorage.removeItem(key); continue;
        }

        // CÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t seconds_left vÃƒÂ o DB
        await sb.from("exam_results")
          .update({ seconds_left: backup.secondsLeft })
          .eq("id", backup.resultId);

        // Upsert cÃƒÂ¢u trÃ¡ÂºÂ£ lÃ¡Â»Âi
        const rows = Object.entries(backup.answers || {})
          .filter(([, ans]) => ans && ans.trim())
          .map(([question_id, answer]) => ({
            result_id: backup.resultId,
            question_id,
            answer,
          }));
        if (rows.length) {
          await sb.from("exam_answers")
            .upsert(rows, { onConflict: "result_id,question_id" });
        }

        localStorage.removeItem(key);
      } catch(e) {
        localStorage.removeItem(key);
      }
    }
  })();

})();

    const [
      { data: cls },
      { data: schedules },
      { data: attData },
      { data: classStudents },
      { data: exams },
    ] = await Promise.all([
      sb.from("classes").select("*, grades(name), subjects(name)").eq("id", classId).single(),
      sb.from("class_schedules").select("*, rooms(room_name)").eq("class_id", classId),
      sb.from("attendance").select("date,status")
        .eq("class_id", classId).eq("student_id", user.id)
        .gte("date", mStart).lte("date", mEnd),
      sb.from("class_students")
        .select("student_id, joined_at, left_at")
        .eq("class_id", classId)
        .order("joined_at"),
      sb.from("exams")
        .select("id, title, duration_minutes, starts_at, ends_at, total_points, exam_questions(question_id, question:question_bank(question_type))")
        .eq("class_id", classId)
        .order("starts_at", { ascending: true }),
    ]);

    const monthSchedules = getSchedulesForMonth(
      (schedules||[]).map(s => ({ ...s, class_id: classId })), classId
    );

    const activeStudents = (classStudents||[]).filter(cs => !cs.left_at);

    let studentsWithInfo = activeStudents;
    if (activeStudents.length > 0) {
      const studentIds = activeStudents.map(cs => cs.student_id);
      const { data: usersData } = await sb
        .from("users").select("id, full_name, avatar_url").in("id", studentIds);
      const userMap = {};
      (usersData||[]).forEach(u => { userMap[u.id] = u; });
      studentsWithInfo = activeStudents.map(cs => ({
        ...cs, user: userMap[cs.student_id] || { full_name: "—" }
      }));
    }

    // LÃ¡ÂºÂ¥y kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ thi cÃ¡Â»Â§a hÃ¡Â»Âc sinh nÃƒÂ y
    const examIds = (exams||[]).map(e => e.id);
    let resultsMap = {}; // examId Ã¢â€ â€™ result[]
    if (examIds.length > 0) {
      const { data: results } = await sb
        .from("exam_results")
        .select("id, exam_id, attempt_no, submitted_at, score_auto, score_essay, score_total, seconds_left")
        .eq("student_id", user.id)
        .in("exam_id", examIds)
        .order("attempt_no", { ascending: false });
      (results||[]).forEach(r => {
        if (!resultsMap[r.exam_id]) resultsMap[r.exam_id] = [];
        resultsMap[r.exam_id].push(r);
      });
    }

    renderStudentView(body, {
      cls, monthSchedules, attData: attData||[],
      classStudents: studentsWithInfo, exams: exams||[],
      resultsMap,
      userId: user.id, classId, mStart, mEnd,
    });
  }

  /* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
     RENDER
  Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */
  function renderStudentView(body, { cls, monthSchedules, attData, classStudents, exams, resultsMap, userId, classId }) {
    const now = new Date();

    const attMap = {};
    attData.forEach(a => { attMap[a.date] = a.status; });

    let presentCount = 0, absentCount = 0, makeupCount = 0;
    attData.forEach(a => {
      if (a.status === "present") presentCount++;
      else if (a.status === "absent") absentCount++;
      else if (a.status === "makeup") makeupCount++;
    });
    const totalSessions = presentCount + absentCount + makeupCount;

    /* Ã¢â€â‚¬Ã¢â€â‚¬ Schedule pills Ã¢â€â‚¬Ã¢â€â‚¬ */
    const schHtml = monthSchedules.length
      ? monthSchedules.map(s =>
          '<span style="background:var(--blue-bg);color:var(--blue);padding:3px 11px;' +
          'border-radius:12px;font-size:.78rem;font-weight:600;margin-right:6px;display:inline-block;margin-bottom:4px">' +
          daysMap[s.weekday] + " " + s.start_time.slice(0,5) + "–" + s.end_time.slice(0,5) +
          (s.rooms ? " • " + s.rooms.room_name : "") + "</span>"
        ).join("")
      : '<span style="color:var(--ink-light);font-size:.82rem">Chưa có lịch</span>';

    /* Ã¢â€â‚¬Ã¢â€â‚¬ Attendance Ã¢â€â‚¬Ã¢â€â‚¬ */
    const attColor = { present:"var(--green)", absent:"var(--red)", makeup:"var(--amber)" };
    const attLabel = { present:"Có mặt", absent:"Vắng", makeup:"Học bù" };

    const attHtml = totalSessions > 0
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        [["present",presentCount],["absent",absentCount],["makeup",makeupCount]]
          .map(([s,n]) =>
            '<div style="flex:1;min-width:80px;background:' + attColor[s] + '20;' +
            'border:1px solid ' + attColor[s] + '40;border-radius:8px;padding:10px 12px;text-align:center">' +
            '<div style="font-size:1.4rem;font-weight:700;color:' + attColor[s] + '">' + n + "</div>" +
            '<div style="font-size:.72rem;color:var(--ink-mid);margin-top:2px">' + attLabel[s] + "</div>" +
            "</div>"
          ).join("") +
        "</div>"
      : '<p style="color:var(--ink-light);font-size:.85rem">Chưa có dữ liệu điểm danh tháng này.</p>';

    /* Ã¢â€â‚¬Ã¢â€â‚¬ Danh sÃƒÂ¡ch hÃ¡Â»Âc sinh Ã¢â€â‚¬Ã¢â€â‚¬ */
    const studentsHtml = classStudents.length
      ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">' +
        classStudents.map((cs, i) => {
          const isMe = cs.student_id === userId;
          return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;' +
            'background:' + (isMe ? "var(--gold-pale)" : "var(--surface)") + ';' +
            'border:1px solid ' + (isMe ? "var(--gold-border)" : "var(--border)") + ';' +
            'border-radius:8px">' +
            '<div style="width:28px;height:28px;border-radius:50%;background:var(--navy);' +
            'color:var(--gold-light);display:flex;align-items:center;justify-content:center;' +
            'font-size:.75rem;font-weight:700;flex-shrink:0">' + (i+1) + "</div>" +
            '<span style="font-size:.82rem;font-weight:' + (isMe ? "700" : "500") + ';color:var(--navy)">' +
            (cs.user?.full_name || "—") + (isMe ? " (Tôi)" : "") + "</span>" +
            "</div>";
        }).join("") +
        "</div>"
      : '<p style="color:var(--ink-light);font-size:.85rem">Không có học sinh.</p>';

    /* Ã¢â€â‚¬Ã¢â€â‚¬ Danh sÃƒÂ¡ch Ã„â€˜Ã¡Â»Â thi Ã¢â€â‚¬Ã¢â€â‚¬ */
    const examsHtml = exams.length
      ? '<div style="display:flex;flex-direction:column;gap:10px">' +
        exams.map(ex => {
          const results      = resultsMap[ex.id] || [];
          const submitted    = results.filter(r => r.submitted_at);
          const lastResult   = submitted[0];
          const attemptCount = submitted.length;
          const inProgress = (submitted.length === 0)
            ? (results.find(r => !r.submitted_at && r.seconds_left > 0) || null)
            : null;

          const now = new Date();
          let canDo = true;
          let scheduleNote = "";
          if (ex.starts_at && ex.ends_at) {
            const startDt = new Date(ex.starts_at);
            const endDt   = new Date(ex.ends_at);
            if (now < startDt)    { canDo = false; scheduleNote = "Chưa đến giờ thi"; }
            else if (now > endDt) { canDo = false; scheduleNote = "Đã hết giờ thi";  }
            else                  { scheduleNote = "Đang trong giờ thi"; }
          }

          const fmtDT = iso => new Date(iso).toLocaleString("vi-VN", {
            day:"2-digit", month:"2-digit", year:"numeric",
            hour:"2-digit", minute:"2-digit"
          });
          let scheduleStr = "";
          if (ex.starts_at && ex.ends_at) {
            scheduleStr = "🕐 " + fmtDT(ex.starts_at) + " → " + fmtDT(ex.ends_at);
          } else {
            scheduleStr = "📅 Không giới hạn";
          }

          const examHasEssay = (ex.exam_questions || [])
            .some(eq => eq.question?.question_type === "essay");

          let scoreBadge = "";
          if (lastResult) {
            const score           = lastResult.score_total ?? lastResult.score_auto ?? "?";
            const pendingEssay    = examHasEssay && lastResult.score_essay === null;
            scoreBadge =
              '<span style="background:#dcfce7;color:#15803d;font-size:.78rem;font-weight:700;' +
              'padding:3px 10px;border-radius:20px;white-space:nowrap">✓ ' + score + ' / ' + ex.total_points + ' đ</span>' +
              (pendingEssay ? ' <span style="background:#fef3c7;color:#b45309;font-size:.72rem;padding:2px 8px;border-radius:20px">⏳ Chờ chấm tự luận</span>' : "");
          }

          let actionBtn = "";
          if (!canDo && (ex.starts_at || ex.ends_at)) {
            actionBtn = '<div style="font-size:.75rem;color:var(--ink-mid);padding:6px 10px;' +
              'background:var(--surface);border-radius:8px;white-space:nowrap">' + scheduleNote + "</div>";
          } else if (inProgress) {
            const secsLeft = Math.max(0, (inProgress.seconds_left || 0) - 300);
            const minLeft  = Math.floor(secsLeft / 60);
            const secLeft2 = secsLeft % 60;
            const timeStr  = minLeft + ":" + String(secLeft2).padStart(2,"0");
            actionBtn =
              '<button onclick="resumeExam(\'' + ex.id + '\',\'' + ex.title.replace(/'/g,"\\'") + '\',' + ex.total_points + ',\'' + inProgress.id + '\',' + secsLeft + ')" ' +
              'style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;' +
              'border:none;padding:8px 14px;border-radius:8px;font-size:.82rem;font-weight:600;' +
              'cursor:pointer;white-space:nowrap;font-family:var(--font-body);flex-shrink:0">' +
              "▶ Làm bài tiếp (" + timeStr + ")</button>";
          } else if (lastResult && !examHasEssay) {
            actionBtn =
              '<div style="font-size:.78rem;font-weight:600;color:var(--green);padding:6px 12px;' +
              'background:#dcfce7;border-radius:8px;white-space:nowrap">✔ Đã hoàn thành</div>';
          } else {
            actionBtn =
              '<button onclick="startExam(\'' + ex.id + '\',\'' + ex.title.replace(/'/g,"\\'") + '\',' + ex.duration_minutes + ',' + ex.total_points + ')" ' +
              'style="background:linear-gradient(135deg,var(--navy),var(--navy-mid));color:var(--gold-light);' +
              'border:none;padding:8px 16px;border-radius:8px;font-size:.82rem;font-weight:600;' +
              'cursor:pointer;white-space:nowrap;font-family:var(--font-body);flex-shrink:0">' +
              (attemptCount > 0 ? "🔄 Làm lại" : "📝 Làm bài") + "</button>";
          }

          return '<div style="padding:14px 16px;background:var(--white);border:1px solid var(--border);' +
            'border-radius:10px;' + (lastResult ? "border-left:3px solid var(--green)" : "") + '">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
              '<div style="flex:1;min-width:0">' +
                '<div style="font-weight:600;font-size:.9rem;color:var(--navy);margin-bottom:3px">' + ex.title + "</div>" +
                '<div style="font-size:.75rem;color:var(--ink-mid)">' +
                "⏱ " + ex.duration_minutes + " phút &nbsp;•&nbsp; 🏆 " + ex.total_points + "đ &nbsp;•&nbsp; " + scheduleStr +
                "</div>" +
                (scheduleNote && canDo ? '<div style="font-size:.72rem;color:#16a34a;margin-top:2px">' + scheduleNote + "</div>" : "") +
              "</div>" +
              '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap">' +
                scoreBadge + actionBtn +
              "</div>" +
            "</div>" +
            "</div>";
        }).join("") +
        "</div>"
      : '<p style="color:var(--ink-light);font-size:.85rem">Chưa có đề thi nào.</p>';

    body.innerHTML =
      '<div style="background:var(--white);border-radius:12px;padding:18px 20px;' +
      'box-shadow:var(--shadow-sm);margin-bottom:18px;border-top:3px solid var(--gold)">' +
        '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:200px">' +
            '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;' +
            'color:var(--ink-light);margin-bottom:6px">Thông tin lớp</div>' +
            '<div style="margin-bottom:4px">' + schHtml + "</div>" +
            '<div style="font-size:.82rem;color:var(--ink-mid)">' +
            "💰 " + fmtTuition(cls?.tuition_fee||0, cls?.tuition_type) + " &nbsp;•&nbsp; " +
            "👨‍🎓 " + classStudents.length + " học sinh" +
            (cls?.subjects?.name ? " &nbsp;•&nbsp; 📚 " + cls.subjects.name : "") +
            (cls?.grades?.name   ? " &nbsp;•&nbsp; 🏫 Khối " + cls.grades.name : "") +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div style="background:var(--white);border-radius:12px;padding:18px 20px;' +
      'box-shadow:var(--shadow-sm);margin-bottom:18px">' +
        '<h3 style="font-family:var(--font-display);font-size:1rem;color:var(--navy);margin-bottom:12px">' +
        "📋 Điểm danh tháng này</h3>" +
        attHtml +
      "</div>" +
      '<div style="background:var(--white);border-radius:12px;padding:18px 20px;' +
      'box-shadow:var(--shadow-sm);margin-bottom:18px">' +
        '<h3 style="font-family:var(--font-display);font-size:1rem;color:var(--navy);margin-bottom:12px">' +
        "👥 Danh sách học sinh (" + classStudents.length + ")</h3>" +
        studentsHtml +
      "</div>" +
      '<div style="background:var(--white);border-radius:12px;padding:18px 20px;' +
      'box-shadow:var(--shadow-sm);margin-bottom:18px">' +
        '<h3 style="font-family:var(--font-display);font-size:1rem;color:var(--navy);margin-bottom:12px">' +
        "📝 Đề kiểm tra (" + exams.length + ")</h3>" +
        examsHtml +
      "</div>";
  }

  /* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
     GIAO DIÃ¡Â»â€ N THI
  Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */

  let _examTimer      = null;
  let _examSeconds    = 0;
  let _examResultId   = null;
  let _examQuestions  = [];
  let _examAnswers    = {};
  window._examAnswers = _examAnswers;
  let _examTotal      = 10;
  let _currentExamId  = null;

  window.startExam = async function (examId, examTitle, durationMin, totalPoints, classId) {
    const sb      = getSb();
    const overlay = getOrCreateOverlay();
    overlay.style.display = "flex";

    const sysTopbar = document.getElementById('topbar') || document.querySelector('header') || document.querySelector('nav');
    if (sysTopbar) sysTopbar.style.display = 'none';

    _currentExamId = examId;
    _examTotal     = totalPoints;
    _examAnswers   = {}; window._examAnswers = _examAnswers;

    const { data: eqs, error } = await sb
      .from("exam_questions")
      .select("*, question:question_bank(*)")
      .eq("exam_id", examId)
      .order("order_no");

    console.log("[startExam] eqs raw:", eqs?.length, "first question:", eqs?.[0]?.question, "error:", error?.message);

    if (error || !eqs?.length) {
      alert("Lỗi tải đề hoặc đề chưa có câu hỏi.\n" + (error?.message||"Không có câu hỏi nào.")); return;
    }
    _examQuestions = eqs.filter(eq => eq.question !== null);
    console.log("[startExam] _examQuestions:", _examQuestions.length);

    const { data:{ user } } = await sb.auth.getUser();

    const { data: staleResults } = await sb
      .from("exam_results").select("id")
      .eq("exam_id", examId).eq("student_id", user.id)
      .is("submitted_at", null).is("seconds_left", null);
    if (staleResults?.length) {
      const staleIds = staleResults.map(r => r.id);
      await sb.from("exam_answers").delete().in("result_id", staleIds);
      await sb.from("exam_results").delete().in("id", staleIds);
    }

    const { data: prevResults } = await sb
      .from("exam_results").select("attempt_no")
      .eq("exam_id", examId).eq("student_id", user.id)
      .not("submitted_at", "is", null)
      .order("attempt_no", { ascending: false }).limit(1);
    const nextAttempt = prevResults?.length ? prevResults[0].attempt_no + 1 : 1;

    let newResult = null;
    let tryAttempt = nextAttempt;
    for (let i = 0; i < 5; i++) {
      const { data, error: re } = await sb
        .from("exam_results")
        .insert({ exam_id: examId, student_id: user.id, attempt_no: tryAttempt, class_id: classId || null })
        .select("id").single();
      if (!re) { newResult = data; break; }
      if (re.code === "23505") { tryAttempt++; continue; }
      alert("Lỗi tạo bài thi: " + re.message); return;
    }
    if (!newResult) { alert("Không thể tạo bài thi, vui lòng thử lại."); return; }
    _examResultId = newResult.id;
    console.log("[startExam] result created:", _examResultId, "classId:", classId);

    _examSeconds = durationMin * 60;
    console.log("[startExam] calling renderExamUI, questions:", _examQuestions.length);
    renderExamUI(overlay, examTitle, durationMin);

    clearInterval(_examTimer);
    _examTimer = setInterval(() => {
      _examSeconds--;
      updateClock();
      if (_examSeconds % 60 === 0) { _saveProgressToDB(); }
      if (_examSeconds <= 0) { clearInterval(_examTimer); submitExam(true); }
    }, 1000);
  };
  /* Ã¢â€â‚¬Ã¢â€â‚¬ Render giao diÃ¡Â»â€¡n thi Ã¢â‚¬â€ giÃ¡Â»â€˜ng hÃ¡Â»â€¡t renderPublicExamUI Ã¢â€â‚¬Ã¢â€â‚¬ */
  function renderExamUI(overlay, examTitle, durationMin) {
    if (window.ExamUIHelper?.renderStandardExam) {
      window.ExamUIHelper.renderStandardExam({
        mount: overlay,
        title: examTitle,
        questions: _examQuestions,
        answers: _examAnswers,
        seconds: _examSeconds,
        clockId: "examClock",
        navPanelId: "classExamNavPanel",
        mainAreaId: "classExamMainArea",
        exitButtonId: "examExitBtn",
        handlers: {
          exit: "exitExam",
          submit: "submitExam",
          toggleNav: "toggleClassExamNav",
          scroll: "peScrollToQ",
          updateMC: "peMC",
          updateTF: "peTF",
          updateText: "_peAnswers",
          refreshMC: "peRefreshMC",
        },
        reportButtonBuilder(question, body) {
          if (!body) return;
          const button = buildClassQuestionReportButton(question);
          if (button) body.appendChild(button);
        },
      });
      updateClock();
      return;
    }

    overlay.innerHTML = '<div style="padding:32px"><strong>Không tải được giao diện làm bài.</strong></div>';
  }
  /* Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã„â€˜Ã¡Â»â€œng hÃ¡Â»â€œ Ã¢â€â‚¬Ã¢â€â‚¬ */
  function formatClock(secs) {
    const m = String(Math.floor(Math.max(0,secs) / 60)).padStart(2,"0");
    const s = String(Math.max(0,secs) % 60).padStart(2,"0");
    return m + ":" + s;
  }
  function updateClock() {
    const el = document.getElementById("examClock");
    if (!el) return;
    el.textContent = formatClock(_examSeconds);
    el.style.color = _examSeconds < 300 ? "#ef4444" : "var(--gold-light)";
  }

  window.toggleClassExamNav = function() {
    const panel = document.getElementById("classExamNavPanel");
    if (!panel) return;
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  };

  /* Ã¢â€â‚¬Ã¢â€â‚¬ Helpers tÃ†Â°Ã†Â¡ng tÃƒÂ¡c Ã¢â‚¬â€ pe* (giÃ¡Â»â€˜ng public_exam.js) Ã¢â€â‚¬Ã¢â€â‚¬ */
  window._peAnswers = function(qid, val) { _examAnswers[qid] = val; peUpdateNavDot(qid); };
  window.peTF = function(qid) {
    const radios = document.querySelectorAll(`input[name^="tf_${qid}_"]`);
    let val = ""; const seen = new Set();
    radios.forEach(r => {
      if (r.checked) { const lbl = r.name.split("_").pop(); if (!seen.has(lbl)) { seen.add(lbl); val += lbl + r.value; } }
    });
    _examAnswers[qid] = val; peUpdateNavDot(qid);
  };
  window.peMC = function(qid) {
    const cbs = document.querySelectorAll(`input[id^="cb_${qid}_"]`);
    let val = "";
    cbs.forEach(cb => { if (cb.checked) val += cb.value; });
    _examAnswers[qid] = val;
    cbs.forEach(cb => {
      const lbl = document.getElementById("lbl_" + qid + "_" + cb.value);
      if (lbl) { lbl.style.borderColor = cb.checked?"var(--navy)":"var(--border)"; lbl.style.background = cb.checked?"#eff6ff":"var(--white)"; }
    });
    peUpdateNavDot(qid);
  };
  window.peRefreshMC = function(qid, opt) {
    const cb  = document.getElementById("cb_"  + qid + "_" + opt);
    const lbl = document.getElementById("lbl_" + qid + "_" + opt);
    if (!cb || !lbl) return;
    lbl.style.borderColor = cb.checked ? "var(--navy)" : "var(--border)";
    lbl.style.background  = cb.checked ? "#eff6ff"     : "var(--white)";
  };
  function peUpdateNavDot(qid) {
    const dot = document.getElementById("navdot_" + qid);
    if (dot) dot.style.background = (_examAnswers[qid]||"").trim() ? "var(--green)" : "var(--border)";
  }
  window.peScrollToQ = function(qid) {
    document.getElementById("qcard_" + qid)?.scrollIntoView({ behavior:"smooth", block:"start" });
    const panel = document.getElementById("classExamNavPanel");
    if (panel && window.matchMedia("(max-width: 768px)").matches) {
      panel.style.display = "none";
    }
  };
  /* Aliases Ã„â€˜Ã¡Â»Æ’ _collectAnswersFromDOM khÃƒÂ´ng lÃ¡Â»â€”i */
  window.updateTF     = window.peTF;
  window.updateMC     = window.peMC;
  window.updateNavDot = peUpdateNavDot;
  window.scrollToQ    = window.peScrollToQ;
  window.refreshMCLabel = window.peRefreshMC;

  /* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
     NÃ¡Â»ËœP BÃƒâ‚¬I
  Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */
  function _collectAnswersFromDOM() {
    const answers = {};
    _examQuestions.forEach(eq => {
      const q    = eq.question;
      const qid  = q.id;
      const type = q.question_type;
      const n    = Math.max(2, parseInt(q.answer_count) || 4);

      if (type === "multi_choice") {
        let val = "";
        for (let i = 0; i < n; i++) {
          const opt = String.fromCharCode(65 + i);
          const cb  = document.getElementById("cb_" + qid + "_" + opt);
          if (cb?.checked) val += opt;
        }
        if (val) answers[qid] = val;

      } else if (type === "true_false") {
          const tfStates = [];
          for (let i = 0; i < n; i++) {
            const lbl = String.fromCharCode(97 + i);
            const rT  = document.querySelector(`input[name="tf_${qid}_${lbl}"][value="T"]`);
            const rF  = document.querySelector(`input[name="tf_${qid}_${lbl}"][value="F"]`);
            tfStates.push(rT?.checked ? "T" : "F");
          }
          const val = window.QuestionAnswerFormat?.encodeTrueFalseSelections?.(tfStates, n) || tfStates.join("");
          if (val) answers[qid] = val;

      } else if (type === "short_answer") {
        const inputs = document.querySelectorAll(`input[oninput*="${qid}"]`);
        let found = null;
        inputs.forEach(el => { if (el.value.trim()) found = el.value.trim(); });
        if (!found && _examAnswers[qid]) found = _examAnswers[qid];
        if (found) answers[qid] = found;

      } else if (type === "essay") {
        const tas = document.querySelectorAll(`textarea[oninput*="${qid}"]`);
        let found = null;
        tas.forEach(el => { if (el.value.trim()) found = el.value.trim(); });
        if (!found && _examAnswers[qid]) found = _examAnswers[qid];
        if (found) answers[qid] = found;
      }
    });
    Object.entries(_examAnswers).forEach(([qid, ans]) => {
      if (ans && ans.trim() && !answers[qid]) answers[qid] = ans;
    });
    return answers;
  }

  async function _saveProgressToDB() {
    if (!_examResultId) return;
    const sb = getSb();
    const answers = _collectAnswersFromDOM();
    Object.assign(_examAnswers, answers);
    await sb.from("exam_results")
      .update({ seconds_left: _examSeconds })
      .eq("id", _examResultId);
    const rows = Object.entries(answers)
      .map(([question_id, answer]) => ({ result_id: _examResultId, question_id, answer }));
    if (rows.length) {
      await sb.from("exam_answers").upsert(rows, { onConflict: "result_id,question_id" });
    }
  }

  window.resumeExam = async function (examId, examTitle, totalPoints, resultId, secsLeft) {
    const sb      = getSb();
    const overlay = getOrCreateOverlay();
    overlay.style.display = "flex";

    _currentExamId = examId;
    _examTotal     = totalPoints;
    _examResultId  = resultId;
    _examAnswers   = {}; window._examAnswers = _examAnswers;

    const sysTopbar = document.getElementById('topbar') || document.querySelector('header') || document.querySelector('nav');
    if (sysTopbar) sysTopbar.style.display = 'none';

    if (secsLeft <= 0) { await submitExam(true); return; }

    const { data: eqs, error } = await sb
      .from("exam_questions").select("*, question:question_bank(*)")
      .eq("exam_id", examId).order("order_no");
    if (error || !eqs?.length) { alert("Lỗi tải đề."); return; }
    _examQuestions = eqs.filter(eq => eq.question !== null);

    const { data: savedAnswers } = await sb
      .from("exam_answers").select("question_id, answer").eq("result_id", resultId);
    (savedAnswers || []).forEach(a => { if (a.answer) _examAnswers[a.question_id] = a.answer; });

    const { data: examMeta } = await sb
      .from("exams").select("duration_minutes").eq("id", examId).single();
    const durationMin = examMeta?.duration_minutes || 45;

    _examSeconds = secsLeft;
    renderExamUI(overlay, examTitle, durationMin);

    clearInterval(_examTimer);
    _examTimer = setInterval(() => {
      _examSeconds--;
      updateClock();
      if (_examSeconds % 60 === 0) _saveProgressToDB();
      if (_examSeconds <= 0) { clearInterval(_examTimer); submitExam(true); }
    }, 1000);
  };

  window.submitExam = async function (auto = false) {
    if (!auto && !confirm("Bạn chắc chắn muốn nộp bài?")) return;
    clearInterval(_examTimer);
    console.log("[submitExam] called, auto:", auto, "_examResultId:", _examResultId);

    const sb = getSb();
    let scoreAuto = 0;
    const answerRows = [];

    for (const eq of _examQuestions) {
      const q      = eq.question;
      const type   = q.question_type;
      const qid    = q.id;
      const ans    = (_examAnswers[qid] || "").trim();
      const correct = (q.answer || "").trim();
      let isCorrect  = null;
      let scoreEarned = 0;
      const partial  = eq.partial_points;
      const n        = Math.max(1, parseInt(q.answer_count)||4);

      if (type === "multi_choice") {
        const studentSet = new Set(ans.toUpperCase().split("").filter(c => /[A-Z]/.test(c)));
        const correctSet = new Set(correct.toUpperCase().split("").filter(c => /[A-Z]/.test(c)));
        isCorrect = studentSet.size === correctSet.size && [...studentSet].every(c => correctSet.has(c));
        scoreEarned = isCorrect ? (eq.points || 0) : 0;
      } else if (type === "true_false") {
        const labels = []; for (let i=0;i<n;i++) labels.push(String.fromCharCode(97+i));
        let correctCount = 0;
          const explicitStudent = new Map([...ans.matchAll(/([a-z])\s*([TF])/g)].map(([, label, value]) => [label.toLowerCase(), value.toUpperCase()]));
          const normalizedStudent = window.QuestionAnswerFormat?.normalizeTrueFalseAnswer?.(ans, n) || "";
          const normalizedCorrect = window.QuestionAnswerFormat?.normalizeTrueFalseAnswer?.(correct, n) || "";
          labels.forEach((lbl, index) => {
            const studentChoice = explicitStudent.size ? (explicitStudent.get(lbl) || "") : (normalizedStudent[index] || "");
            const correctChoice = normalizedCorrect[index] || "";
            if (studentChoice === correctChoice) correctCount++;
          });
        isCorrect   = (explicitStudent.size ? explicitStudent.size : normalizedStudent.length) === n && correctCount === n;
        scoreEarned = (partial && partial[correctCount] !== undefined) ? partial[correctCount] : (isCorrect ? eq.points : 0);
      } else if (type === "short_answer") {
        const corrects = correct.split(";").map(s=>s.trim().toLowerCase()).filter(Boolean);
        isCorrect   = corrects.some(c => ans.toLowerCase() === c);
        scoreEarned = isCorrect ? (eq.points || 0) : 0;
      } else if (type === "essay") {
        isCorrect = null; scoreEarned = 0;
      }

      if (type !== "essay") scoreAuto += scoreEarned;
      answerRows.push({ result_id:_examResultId, question_id:qid, answer:ans, is_correct:isCorrect, score_earned:scoreEarned });
    }

    if (answerRows.length) {
      await sb.from("exam_answers").upsert(answerRows, { onConflict: "result_id,question_id" });
    }

    const hasEssay = _examQuestions.some(eq => eq.question.question_type === "essay");
    await sb.from("exam_results").update({
      submitted_at: new Date().toISOString(),
      score_auto:   Math.round(scoreAuto * 100) / 100,
      score_total:  hasEssay ? null : Math.round(scoreAuto * 100) / 100,
      seconds_left: null,
    }).eq("id", _examResultId);

    const { data: staleAfter } = await sb
      .from("exam_results").select("id")
      .eq("exam_id", _currentExamId)
      .eq("student_id", (await sb.auth.getUser()).data.user.id)
      .is("submitted_at", null);
    if (staleAfter?.length) {
      const ids = staleAfter.map(r => r.id);
      await sb.from("exam_answers").delete().in("result_id", ids);
      await sb.from("exam_results").delete().in("id", ids);
    }

    _examResultId = null;
    console.log("[submitExam] done, calling showExamResult. scoreAuto:", scoreAuto, "hasEssay:", hasEssay);
    showExamResult(scoreAuto, hasEssay);
  };

  function showExamResult(scoreAuto, hasEssay) {
    const sysTopbar = document.getElementById('topbar') || document.querySelector('header') || document.querySelector('nav');
    if (sysTopbar) sysTopbar.style.display = '';
    _examResultId = null;
    const pct   = Math.round((scoreAuto / _examTotal) * 100);
    const color = pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--red)";
    const msg   = pct >= 80 ? "Xuất sắc! 🎉" : pct >= 50 ? "Khá tốt! 👍" : "Cần cố gắng thêm 💪";
    const scoreDisplay = Math.round(scoreAuto*100)/100;
    const resultHtml =
      '<div style="max-width:480px;width:100%;text-align:center;margin:40px auto">' +
        '<div style="font-size:4rem;margin-bottom:8px">' + (pct>=80?"🏆":pct>=50?"📝":"📖") + "</div>" +
        '<div style="font-family:var(--font-display);font-size:1.5rem;color:var(--navy);margin-bottom:4px">' + msg + "</div>" +
        '<div style="font-size:.9rem;color:var(--ink-mid);margin-bottom:24px">Bài thi đã được nộp thành công</div>' +
        '<div style="background:var(--white);border-radius:16px;padding:28px;box-shadow:0 8px 30px rgba(0,0,0,.08);margin-bottom:20px">' +
          '<div style="font-size:3rem;font-weight:800;color:' + color + ';line-height:1">' + scoreDisplay + "<span style='font-size:1.4rem'>/" + _examTotal + "</span></div>" +
          '<div style="font-size:.9rem;color:var(--ink-mid);margin-top:4px">Điểm tự động</div>' +
          (hasEssay ? '<div style="margin-top:14px;padding:10px 14px;background:#fef3c7;border-radius:8px;font-size:.82rem;color:#b45309">⏳ Phần tự luận sẽ được giáo viên chấm sau</div>' : "") +
        "</div>" +
        '<button onclick="cvGoBackToExams()" style="background:var(--navy);color:var(--gold-light);border:none;padding:12px 32px;border-radius:10px;font-size:.9rem;font-weight:700;cursor:pointer;font-family:var(--font-body);margin-right:10px">← Quay lại danh sách đề thi</button>' +
        '<button onclick="cvReviewExamDetail()" style="background:var(--surface);color:var(--navy);border:1.5px solid var(--border);padding:12px 24px;border-radius:10px;font-size:.9rem;font-weight:700;cursor:pointer;font-family:var(--font-body)">📋 Xem lại từng câu</button>' +
      "</div>";

    const doRender = async () => {
      let cvBody = document.getElementById("cvBody");
      console.log("[showExamResult] cvBody exists:", !!cvBody, "| _classId:", window._classId);
      if (!cvBody && window.openClassView && window._classId) {
        await window.openClassView(window._classId, window._className || "");
        cvBody = document.getElementById("cvBody");
        console.log("[showExamResult] after rebuild cvBody:", !!cvBody);
      }
      if (cvBody) {
        cvBody.innerHTML = resultHtml;
        console.log("[showExamResult] rendered into cvBody");
      } else {
        console.log("[showExamResult] fallback to overlay");
        const overlay = getOrCreateOverlay();
        overlay.innerHTML =
          '<div style="height:54px;background:var(--navy);color:#fff;display:flex;align-items:center;gap:12px;padding:0 18px;flex-shrink:0">' +
            '<span style="font-family:var(--font-display);font-size:1rem;flex:1">Kết quả bài thi</span>' +
          "</div>" +
          '<div id="cvBody" style="flex:1;overflow-y:auto;padding:40px 24px;background:#f8fafc">' + resultHtml + "</div>";
      }
    };
    doRender();
  }

  window.cvReviewExamDetail = async function() {
    const sb = getSb();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const { data: results } = await sb.from("exam_results")
      .select("id,score_auto,score_total,submitted_at")
      .eq("exam_id", _currentExamId).eq("student_id", user.id)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false }).limit(1);
    const result = results?.[0];
    if (!result) return;

    const [{ data: answers }, { data: eqs }] = await Promise.all([
      sb.from("exam_answers").select("question_id,answer,is_correct,score_earned").eq("result_id", result.id),
      sb.from("exam_questions").select("*, question:question_bank(*)").eq("exam_id", _currentExamId).order("order_no"),
    ]);

    const ansMap = {};
    (answers||[]).forEach(a => { ansMap[a.question_id] = a; });

    let cvBody = document.getElementById("cvBody");
    if (!cvBody && window.openClassView && window._classId) {
      await window.openClassView(window._classId, window._className || "");
      cvBody = document.getElementById("cvBody");
    }
    if (!cvBody) return;
    if (window.ExamUIHelper?.renderStandardReview?.({
      mount: cvBody,
      title: "Xem lại bài thi",
      subtitle: result.submitted_at ? `Nộp lúc ${new Date(result.submitted_at).toLocaleString("vi-VN")}` : "Kết quả bài làm",
      score: result.score_total ?? result.score_auto,
      totalPoints: _examTotal,
      backHandler: "cvGoBackToExams",
      questions: (eqs||[]).slice().sort((a,b)=>(a.order_no??0)-(b.order_no??0)).filter(eq=>eq.question),
      answers: ansMap,
      cardsOptions: {
        enableAiSolution: true,
        enableQuestionReport: true,
        examResultId: result.id,
        reportSourceMode: "class_review",
      },
    })) return;

    cvBody.innerHTML = '<div style="padding:32px"><strong>Không tải được giao diện xem lại bài.</strong></div>';
  };

  window.cvGoBackToExams = async function() {
    if (window.openClassView && window._classId) {
      await window.openClassView(window._classId, window._className || "");
      if (window.cvSwitchTab) await window.cvSwitchTab("exams");
    } else if (window.cvSwitchTab) {
      await window.cvSwitchTab("exams");
    }
  };

})();




