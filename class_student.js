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

    if (_examResultId) {
      await _saveProgressToDB();
      _examResultId = null;
    }

    // Quay vÃ¡Â»Â tab Ã„â€˜Ã¡Â»Â thi trong unified overlay
    const sysTopbar = document.getElementById('topbar') || document.querySelector('header') || document.querySelector('nav');
    if (sysTopbar) sysTopbar.style.display = '';

    if (window.cvSwitchTab) {
      // Rebuild shell trÃ†Â°Ã¡Â»â€ºc rÃ¡Â»â€œi chuyÃ¡Â»Æ’n sang tab exams
      if (window._cachedClassForView) {
        window.cvSwitchTab('exams');
      } else if (window.openClassView && window._cvCurrentClassId) {
        await window.openClassView(window._cvCurrentClassId, window._cvCurrentClassName || '');
      }
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

    /* Ã¢â€â‚¬Ã¢â€â‚¬ Nav: ÃƒÂ´ trÃƒÂ²n sÃ¡Â»â€˜ Ã¢â€â‚¬Ã¢â€â‚¬ */
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

    /* Ã¢â€â‚¬Ã¢â€â‚¬ CÃƒÂ¢u hÃ¡Â»Âi: DOM-based, layout 15 phÃ¡ÂºÂ§n ngang Ã¢â€â‚¬Ã¢â€â‚¬ */
    let sectionsHtml = "";
    const _pendingCards = [];
    globalNum = 0;

    SECTION_ORDER.forEach(type => {
      if (!groups[type].length) return;
      sectionsHtml += `<div style="margin-bottom:24px">
        <div style="font-family:var(--font-display);font-size:.88rem;font-weight:700;
          padding:8px 14px;background:var(--navy);color:#fff;border-radius:8px;margin-bottom:10px">
          ${SECTION_TITLES[type]}</div>`;

      groups[type].forEach(eq => {
        globalNum++;
        const q      = eq.question;
        const qid    = q.id;
        const n      = Math.max(2, parseInt(q.answer_count)||4);
        const hasImg = !!q.question_img;
        const layout = parseQuestionLayout(q.question_text, type, n);

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

        const card = document.createElement("div");
        card.id = "qcard_" + qid;
        card.style.cssText = "background:var(--white);border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden";

        const hdr = document.createElement("div");
        hdr.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--surface);border-bottom:1px solid var(--border)";
        hdr.innerHTML = `
          <span style="width:26px;height:26px;border-radius:50%;background:var(--navy);color:var(--gold-light);
            display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;flex-shrink:0">${globalNum}</span>
          <span style="font-size:1.1rem;font-weight:700;color:var(--ink-mid)">Câu ${globalNum}</span>
          <span style="margin-left:auto;font-size:.75rem;color:var(--ink-mid)">${eq.points} điểm</span>`;
        card.appendChild(hdr);

        const body = document.createElement("div");
        body.style.cssText = "display:flex;flex-direction:column";

        const qPart = document.createElement("div");
        qPart.style.cssText = "padding:16px 18px;display:flex;flex-direction:column;gap:12px";
        const qEl = document.createElement("div");
        qEl.style.cssText = `font-size:1.18rem;line-height:1.9;color:var(--navy);white-space:pre-line;flex:${hasImg ? 2 : 1}`;
        qEl.textContent = (type === "multi_choice" || type === "true_false") ? layout.stem : (q.question_text||"");
        if (hasImg) {
          qPart.style.flexDirection = "row";
          qPart.style.alignItems = "flex-start";
          qPart.style.gap = "16px";
          const imgCol = document.createElement("div");
          imgCol.style.cssText = "flex:1;display:flex;align-items:flex-start;justify-content:flex-end";
          const imgEl = document.createElement("img");
          imgEl.src = q.question_img;
          imgEl.style.cssText = "max-width:100%;max-height:240px;object-fit:contain;border-radius:8px";
          qPart.appendChild(qEl);
          imgCol.appendChild(imgEl);
          qPart.appendChild(imgCol);
        } else {
          qPart.appendChild(qEl);
        }

        const aPart = document.createElement("div");
        aPart.style.cssText = "padding:14px 18px;background:var(--surface);border-top:1px solid var(--border)";
        aPart.innerHTML = ansHtml;

        body.appendChild(qPart);
        body.appendChild(aPart);

        card.appendChild(body);
        _pendingCards.push(card);
        sectionsHtml += `<div id="qslot_${qid}"></div>`;
      });

      sectionsHtml += `</div>`;
    });

    overlay.innerHTML =
      `<div style="height:64px;background:var(--navy);color:#fff;display:flex;align-items:center;
        gap:14px;padding:0 20px;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.2)">
        <button id="examExitBtn" onclick="exitExam()" style="background:rgba(255,255,255,.12);
          border:1px solid rgba(255,255,255,.25);color:#fff;padding:5px 12px;border-radius:7px;
          font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-body)">← Thoát</button>
        <span style="font-family:var(--font-display);font-size:1.2rem;flex:1">${examTitle}</span>
        <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);padding:7px 16px;border-radius:8px">
          <span style="font-size:.8rem;color:rgba(255,255,255,.7)">Thời gian</span>
          <span id="examClock" style="font-size:1.22rem;font-weight:700;font-family:monospace;
            color:var(--gold-light);min-width:72px;text-align:center">${formatClock(_examSeconds)}</span>
        </div>
        <button onclick="submitExam(false)" style="background:var(--gold);color:var(--navy);
          border:none;padding:9px 20px;border-radius:8px;font-size:.95rem;font-weight:700;
          cursor:pointer;font-family:var(--font-body)">Nộp bài</button>
      </div>
      <div style="flex:1;display:flex;overflow:hidden;min-height:0">
        <div style="width:120px;flex-shrink:0;background:var(--white);border-right:1px solid var(--border);
          overflow-y:auto;padding:10px 8px">
          <div style="font-size:.82rem;font-weight:700;color:var(--ink-light);text-transform:uppercase;
            letter-spacing:.05em;margin-bottom:8px">Danh sách câu</div>
          ${navHtml}
          <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
            <button onclick="submitExam(false)"
              style="width:100%;background:var(--navy);color:var(--gold-light);border:none;
              padding:11px;border-radius:8px;font-size:.95rem;font-weight:700;cursor:pointer;
              font-family:var(--font-body)">Nộp bài</button>
          </div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:18px 20px;background:#f8fafc">${sectionsHtml}</div>
      </div>`;

    updateClock();

    _pendingCards.forEach(cardEl => {
      const qid  = cardEl.id.replace("qcard_", "");
      const slot = document.getElementById("qslot_" + qid);
      if (slot) slot.replaceWith(cardEl);
    });

    const mainArea = overlay.querySelector(`div[style*="overflow-y:auto;padding:18px"]`);
    if (mainArea && window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([mainArea]).catch(()=>{});
    }
  }

  /* Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã„â€˜Ã¡Â»â€œng hÃ¡Â»â€œ Ã¢â€â‚¬Ã¢â€â‚¬ */
  function formatClock(secs) {
    const m = String(Math.floor(Math.max(0,secs) / 60)).padStart(2,"0");
    const s = String(Math.max(0,secs) % 60).padStart(2,"0");
    return m + ":" + s;
  }
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
        options.push({ key: match[1], text: match[2].trim() });
      } else {
        stemLines.push(line);
      }
    });

    if (options.length < Math.min(2, Math.max(1, parseInt(answerCount, 10) || 0))) {
      return { stem: String(questionText || "").trim(), options: [] };
    }

    const expectedCount = Math.max(1, parseInt(answerCount, 10) || 0);
    const normalizedOptions = [];
    for (let i = 0; i < expectedCount; i++) {
      const key = type === "true_false" ? String.fromCharCode(97 + i) : String.fromCharCode(65 + i);
      const found = options.find(option => option.key.toLowerCase() === key.toLowerCase());
      normalizedOptions.push({ key: found?.key || key, text: found?.text || "" });
    }
    return {
      stem: stemLines.join("\n").trim() || String(questionText || "").trim(),
      options: normalizedOptions,
    };
  }
  function updateClock() {
    const el = document.getElementById("examClock");
    if (!el) return;
    el.textContent = formatClock(_examSeconds);
    el.style.color = _examSeconds < 300 ? "#ef4444" : "var(--gold-light)";
  }

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
        let val = "";
        for (let i = 0; i < n; i++) {
          const lbl = String.fromCharCode(97 + i);
          const rT  = document.querySelector(`input[name="tf_${qid}_${lbl}"][value="T"]`);
          const rF  = document.querySelector(`input[name="tf_${qid}_${lbl}"][value="F"]`);
          if (rT?.checked) val += lbl + "T";
          else if (rF?.checked) val += lbl + "F";
        }
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
        labels.forEach(lbl => {
          const studentChoice = ans.includes(lbl+"T") ? "T" : (ans.includes(lbl+"F") ? "F" : "");
          const correctChoice = correct.includes(lbl) ? "T" : "F";
          if (studentChoice === correctChoice) correctCount++;
        });
        isCorrect   = correctCount === n;
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

    const wrap = document.createElement("div");
    const hdr  = document.createElement("div");
    hdr.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:16px";
    hdr.innerHTML = '<button onclick="cvGoBackToExams()" class="btn btn-outline btn-sm">← Quay lại</button>'
      + '<div style="font-weight:700;font-size:.95rem;color:var(--navy)">Xem lại bài thi</div>';
    wrap.appendChild(hdr);

    const sortedEqs = (eqs||[]).slice().sort((a,b)=>(a.order_no??0)-(b.order_no??0)).filter(eq=>eq.question);
    if (window.buildReviewCards) {
      wrap.appendChild(window.buildReviewCards(sortedEqs, ansMap, false, { enableAiSolution: true }));
    }

    cvBody.innerHTML = "";
    cvBody.appendChild(wrap);
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




