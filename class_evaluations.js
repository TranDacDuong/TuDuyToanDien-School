(function () {
  const state = {
    sessionId: null,
    session: null,
    classInfo: null,
    evaluator: null,
    statuses: [],
    templates: [],
    students: [],
    parents: new Map(),
    parentIds: new Map(),
    evaluations: new Map(),
  };

  function getSb() {
    if (window.sb) return window.sb;
    if (typeof sb !== "undefined") return sb;
    throw new Error("Supabase chưa sẵn sàng.");
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function injectStyles() {
    if (document.getElementById("sessionEvaluationStyles")) return;
    const style = document.createElement("style");
    style.id = "sessionEvaluationStyles";
    style.textContent = `
      .se-overlay{position:fixed;inset:0;z-index:950;background:rgba(15,31,61,.58);display:flex;align-items:center;justify-content:center;padding:16px}
      .se-modal{width:min(1120px,100%);max-height:calc(100dvh - 32px);background:#f7f8fb;border-radius:8px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(15,31,61,.3)}
      .se-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;background:#fff;border-bottom:1px solid #e2e8f0}
      .se-title{margin:0;color:var(--navy,#0f1f3d);font-size:1.12rem}.se-sub{margin:5px 0 0;color:#64748b;font-size:.84rem}
      .se-icon-btn{width:34px;height:34px;flex:0 0 34px;border:1px solid #cbd5e1;background:#fff;border-radius:7px;display:grid;place-items:center;font-size:1.2rem;cursor:pointer;color:#334155}
      .se-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 20px;background:#fff;border-bottom:1px solid #e2e8f0}
      .se-progress{font-size:.82rem;color:#475569;font-weight:700}.se-list{padding:16px 20px 28px;overflow:auto;display:grid;gap:12px}
      .se-card{background:#fff;border:1px solid #dbe3ee;border-radius:8px;padding:15px}
      .se-card-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
      .se-name{font-weight:800;color:#0f1f3d}.se-state{font-size:.74rem;font-weight:800;padding:4px 9px;border-radius:999px;background:#f1f5f9;color:#475569}
      .se-state.sent{background:#dcfce7;color:#166534}.se-state.failed{background:#fee2e2;color:#b91c1c}
      .se-statuses{display:flex;gap:7px;flex-wrap:wrap}.se-chip{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:999px;padding:7px 10px;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}
      .se-chip.active{border-color:#1d6bd1;background:#eaf3ff;color:#174779}.se-chip.attention.active{border-color:#f59e0b;background:#fff7ed;color:#9a3412}
      .se-status-groups{display:grid;gap:12px}.se-status-group{display:grid;gap:7px}.se-status-label{font-size:.72rem;font-weight:800;letter-spacing:.02em;text-transform:uppercase;color:#64748b}
      .se-editor{margin-top:12px;display:none}.se-editor.open{display:block}.se-editor textarea{width:100%;min-height:150px;resize:vertical;border:1px solid #cbd5e1;border-radius:7px;padding:11px 12px;line-height:1.55;font:inherit;color:#1e293b;background:#fff}
      .se-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.se-btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:7px;padding:8px 11px;font:inherit;font-size:.8rem;font-weight:800;cursor:pointer}
      .se-btn.primary{background:#174779;border-color:#174779;color:#fff}.se-btn.send{background:#15803d;border-color:#15803d;color:#fff}.se-btn:disabled{opacity:.5;cursor:not-allowed}
      .se-empty{padding:34px;text-align:center;color:#64748b}.se-loading{padding:50px;text-align:center;color:#475569;font-weight:700}
      @media(max-width:700px){
        .se-overlay{padding:0;align-items:stretch}.se-modal{max-height:100dvh;width:100%;border-radius:0}.se-head{padding:14px 15px}.se-toolbar{padding:9px 15px}.se-list{padding:12px 12px calc(22px + env(safe-area-inset-bottom))}
        .se-card{padding:13px}.se-chip{padding:7px 9px;font-size:.75rem}.se-actions .se-btn{flex:1}.se-editor textarea{min-height:180px}
      }
    `;
    document.head.appendChild(style);
  }

  function modal() {
    let overlay = document.getElementById("sessionEvaluationOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "sessionEvaluationOverlay";
      overlay.className = "se-overlay";
      overlay.innerHTML = `
        <section class="se-modal" role="dialog" aria-modal="true" aria-labelledby="sessionEvaluationTitle">
          <header class="se-head">
            <div><h2 class="se-title" id="sessionEvaluationTitle">Đánh giá buổi học</h2><p class="se-sub" id="sessionEvaluationSubtitle"></p></div>
            <button class="se-icon-btn" type="button" onclick="closeSessionEvaluation()" aria-label="Đóng" title="Đóng">×</button>
          </header>
          <div class="se-toolbar">
            <span class="se-progress" id="sessionEvaluationProgress">Đang tải...</span>
            <button class="se-btn" type="button" id="sessionEvaluationSaveAll" onclick="saveAllSessionEvaluationDrafts()">Lưu tất cả bản nháp</button>
          </div>
          <div class="se-list" id="sessionEvaluationList"><div class="se-loading">Đang tải danh sách học sinh...</div></div>
        </section>`;
      overlay.addEventListener("click", event => {
        if (event.target === overlay) window.closeSessionEvaluation();
      });
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
      .format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
  }

  function getWeekday(dateValue) {
    const day = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`).getDay();
    return day === 0 ? 7 : day;
  }

  function pickEffectiveSchedules(schedules, sessionDate) {
    const eligible = (schedules || []).filter(item => String(item.effective_from || "2000-01-01").slice(0, 10) <= sessionDate);
    if (!eligible.length) return [];
    const maxEffective = eligible.reduce((max, item) => {
      const value = String(item.effective_from || "2000-01-01").slice(0, 10);
      return value > max ? value : max;
    }, "2000-01-01");
    return eligible.filter(item => String(item.effective_from || "2000-01-01").slice(0, 10) === maxEffective);
  }

  function scheduleKey(schedule) {
    if (!schedule) return "";
    return [
      Number(schedule.session_no || 1),
      Number(schedule.weekday || 0),
      String(schedule.start_time || "").slice(0, 5),
      String(schedule.end_time || "").slice(0, 5),
    ].join("|");
  }

  function selectedScheduleMatchesDay(selectedIds, daySchedules, allSchedules) {
    if (!selectedIds || !selectedIds.size) return true;
    const dayIds = new Set((daySchedules || []).map(item => Number(item.id)));
    if ([...selectedIds].some(id => dayIds.has(Number(id)))) return true;

    const selectedRows = [...selectedIds]
      .map(id => (allSchedules || []).find(item => Number(item.id) === Number(id)))
      .filter(Boolean);
    return selectedRows.some(selected => {
      const sameSession = (daySchedules || []).filter(item => Number(item.session_no || 1) === Number(selected.session_no || 1));
      if (!sameSession.length) return false;
      return sameSession.some(item => scheduleKey(item) === scheduleKey(selected))
        || sameSession.some(item => Number(item.weekday || 0) === Number(selected.weekday || 0))
        || sameSession.length > 0;
    });
  }

  async function getSessionStudentIds(client, session, activeLinks) {
    const sessionDate = String(session.session_date || "").slice(0, 10);
    const activeIds = new Set((activeLinks || []).map(link => link.student_id).filter(Boolean));
    if (!sessionDate || !activeIds.size) return [];

    const { data: schedules, error: scheduleError } = await client
      .from("class_schedules")
      .select("id,session_no,weekday,start_time,end_time,effective_from")
      .eq("class_id", session.class_id);
    if (scheduleError) return [...activeIds];

    const weekday = getWeekday(sessionDate);
    const daySchedules = pickEffectiveSchedules(schedules || [], sessionDate)
      .filter(item => Number(item.weekday) === weekday);
    if (!daySchedules.length) return [];

    const { data: studentSchedules, error: studentScheduleError } = await client
      .from("class_student_schedules")
      .select("student_id,schedule_id")
      .eq("class_id", session.class_id);
    if (studentScheduleError) return [...activeIds];

    const selectedByStudent = new Map();
    (studentSchedules || []).forEach(row => {
      if (!selectedByStudent.has(row.student_id)) selectedByStudent.set(row.student_id, new Set());
      selectedByStudent.get(row.student_id).add(Number(row.schedule_id));
    });

    return [...activeIds].filter(studentId => {
      const selected = selectedByStudent.get(studentId);
      return selectedScheduleMatchesDay(selected, daySchedules, schedules || []);
    });
  }

  async function loadData(sessionId) {
    const client = getSb();
    const [{ data: session, error: sessionError }, authResult] = await Promise.all([
      client.from("class_sessions").select("*").eq("id", sessionId).single(),
      client.auth.getUser(),
    ]);
    if (sessionError) throw sessionError;
    const userId = authResult.data?.user?.id;
    if (!userId) throw new Error("Không xác định được tài khoản đang đăng nhập.");

    const [
      classResult,
      lessonResult,
      evaluatorResult,
      statusesResult,
      templatesResult,
      linksResult,
      evaluationsResult,
    ] = await Promise.all([
      client.from("classes").select("id,class_name,subjects(name)").eq("id", session.class_id).single(),
      session.lesson_id
        ? client.from("lessons").select("id,name").eq("id", session.lesson_id).maybeSingle()
        : Promise.resolve({ data: null }),
      client.from("users").select("id,full_name,role").eq("id", userId).single(),
      client.from("evaluation_statuses").select("*").eq("active", true).order("display_order"),
      client.from("evaluation_message_templates").select("*").eq("active", true),
      client.from("class_students").select("student_id,joined_at,left_at").eq("class_id", session.class_id),
      client.from("session_student_evaluations")
        .select("*,selected:session_student_evaluation_statuses(status_id)")
        .eq("class_session_id", sessionId),
    ]);
    const firstError = [
      classResult.error,
      lessonResult.error,
      evaluatorResult.error,
      statusesResult.error,
      templatesResult.error,
      linksResult.error,
      evaluationsResult.error,
    ].find(Boolean);
    if (firstError) throw firstError;

    const activeLinks = (linksResult.data || []).filter(link => {
      const sessionDate = String(session.session_date || "").slice(0, 10);
      return (!link.joined_at || String(link.joined_at).slice(0, 10) <= sessionDate)
        && (!link.left_at || String(link.left_at).slice(0, 10) >= sessionDate);
    });
    const studentIds = await getSessionStudentIds(client, session, activeLinks);
    const [{ data: users, error: usersError }, { data: parentLinks }] = await Promise.all([
      studentIds.length
        ? client.from("users").select("id,full_name,email").in("id", studentIds).order("full_name")
        : Promise.resolve({ data: [] }),
      studentIds.length
        ? client.from("parent_students").select("parent_id,student_id").in("student_id", studentIds).is("revoked_at", null)
        : Promise.resolve({ data: [] }),
    ]);
    if (usersError) throw usersError;
    const parentIds = [...new Set((parentLinks || []).map(link => link.parent_id).filter(Boolean))];
    const { data: parentUsers } = parentIds.length
      ? await client.from("users").select("id,full_name").in("id", parentIds)
      : { data: [] };
    const parentNames = new Map((parentUsers || []).map(user => [user.id, user.full_name]));
    const parents = new Map();
    const parentIdsByStudent = new Map();
    (parentLinks || []).forEach(link => {
      if (!parentIdsByStudent.has(link.student_id)) parentIdsByStudent.set(link.student_id, []);
      parentIdsByStudent.get(link.student_id).push(link.parent_id);
      if (!parents.has(link.student_id) && parentNames.get(link.parent_id)) {
        parents.set(link.student_id, parentNames.get(link.parent_id));
      }
    });

    state.sessionId = sessionId;
    state.session = { ...session, lesson: lessonResult.data };
    state.classInfo = classResult.data;
    state.evaluator = evaluatorResult.data;
    state.statuses = statusesResult.data || [];
    state.templates = templatesResult.data || [];
    state.students = users || [];
    state.parents = parents;
    state.parentIds = parentIdsByStudent;
    state.evaluations = new Map((evaluationsResult.data || []).map(item => [
      item.student_id,
      {
        ...item,
        statusIds: new Set((item.selected || []).map(row => row.status_id)),
        message: item.final_message || item.generated_message || "",
      },
    ]));
    state.students.forEach(student => {
      if (!state.evaluations.has(student.id)) {
        state.evaluations.set(student.id, {
          id: null,
          student_id: student.id,
          statusIds: new Set(),
          message: "",
          state: "draft",
          template_selection: {},
        });
      }
    });
  }

  function render() {
    const title = document.getElementById("sessionEvaluationTitle");
    const subtitle = document.getElementById("sessionEvaluationSubtitle");
    if (title) title.textContent = `Đánh giá buổi học - ${state.classInfo?.class_name || ""}`;
    if (subtitle) {
      subtitle.textContent = `${formatDate(state.session?.session_date)} · ${state.session?.lesson?.name || state.classInfo?.subjects?.name || "Buổi học"}`;
    }
    const list = document.getElementById("sessionEvaluationList");
    if (!state.students.length) {
      list.innerHTML = '<div class="se-empty">Buổi học này chưa có học sinh.</div>';
      updateProgress();
      return;
    }
    list.innerHTML = state.students.map(student => studentCard(student)).join("");
    updateProgress();
  }

  function studentCard(student) {
    const evaluation = state.evaluations.get(student.id);
    const sent = evaluation.state === "sent";
    const hasMessage = Boolean(evaluation.message);
    const stateLabel = sent ? "Đã gửi" : evaluation.state === "failed" ? "Gửi lỗi" : evaluation.id ? "Bản nháp" : "Chưa đánh giá";
    return `
      <article class="se-card" id="se-card-${student.id}">
        <div class="se-card-head">
          <div class="se-name">${esc(student.full_name || student.email)}</div>
          <span class="se-state ${esc(evaluation.state)}" id="se-state-${student.id}">${stateLabel}</span>
        </div>
        <div class="se-status-groups">
          ${statusGroup("Điểm tích cực", state.statuses.filter(status => status.category !== "needs_attention"), evaluation, student, sent)}
          ${statusGroup("Điểm cần khắc phục", state.statuses.filter(status => status.category === "needs_attention"), evaluation, student, sent)}
        </div>
        <div class="se-editor ${hasMessage ? "open" : ""}" id="se-editor-${student.id}">
          <textarea id="se-message-${student.id}" ${sent ? "readonly" : ""} oninput="updateSessionEvaluationMessage('${student.id}',this.value)">${esc(evaluation.message)}</textarea>
        </div>
        <div class="se-actions">
          <button type="button" class="se-btn" onclick="generateSessionEvaluationMessage('${student.id}')" ${sent ? "disabled" : ""}>${hasMessage ? "Đổi mẫu" : "Tạo nội dung"}</button>
          <button type="button" class="se-btn primary" onclick="saveSessionEvaluationDraft('${student.id}')" ${sent ? "disabled" : ""}>Lưu nháp</button>
          <button type="button" class="se-btn send" onclick="sendSessionEvaluation('${student.id}')" ${sent ? "disabled" : ""}>Gửi phụ huynh</button>
        </div>
      </article>`;
  }

  function statusGroup(label, statuses, evaluation, student, sent) {
    if (!statuses.length) return "";
    return `<div class="se-status-group">
      <div class="se-status-label">${esc(label)}</div>
      <div class="se-statuses">${statuses.map(status => `
        <button type="button"
          class="se-chip ${status.category === "needs_attention" ? "attention" : ""} ${evaluation.statusIds.has(status.id) ? "active" : ""}"
          data-student="${student.id}" data-status="${status.id}"
          onclick="toggleSessionEvaluationStatus('${student.id}','${status.id}')"
          ${sent ? "disabled" : ""}>${esc(status.name)}</button>
      `).join("")}</div>
    </div>`;
  }

  function updateProgress() {
    const values = [...state.evaluations.values()];
    const sent = values.filter(item => item.state === "sent").length;
    const drafted = values.filter(item => item.id && item.state !== "sent").length;
    const el = document.getElementById("sessionEvaluationProgress");
    if (el) el.textContent = `${state.students.length} học sinh · ${sent} đã gửi · ${drafted} bản nháp`;
  }

  function choose(items, previousIds = []) {
    const available = items.filter(item => !previousIds.includes(item.id));
    const pool = available.length ? available : items;
    const weighted = pool.flatMap(item => Array(Math.max(1, Number(item.weight || 1))).fill(item));
    return weighted[Math.floor(Math.random() * weighted.length)] || null;
  }

  function applyVariables(content, student) {
    const values = {
      ten_hoc_sinh: student.full_name || "học sinh",
      ten_phu_huynh: state.parents.get(student.id) || "",
      ngay_hoc: formatDate(state.session?.session_date),
      mon_hoc: state.classInfo?.subjects?.name || state.session?.lesson?.name || "hôm nay",
      ten_lop: state.classInfo?.class_name || "",
      ten_giao_vien: state.evaluator?.full_name || "",
    };
    let result = String(content || "").replace(/\{([a-z_]+)\}/g, (_, key) => values[key] ?? "");
    result = result.replace(/phụ huynh\s*,/gi, "Quý phụ huynh,").replace(/\s{2,}/g, " ");
    return result.trim();
  }

  function trimSentencePunctuation(value) {
    return String(value || "").trim().replace(/[.!?;,\s]+$/g, "");
  }

  function joinVietnamesePhrases(values) {
    const phrases = values.map(trimSentencePunctuation).filter(Boolean);
    if (phrases.length < 2) return phrases[0] || "";
    if (phrases.length === 2) return `${phrases[0]} và ${phrases[1]}`;
    return `${phrases.slice(0, -1).join(", ")} và ${phrases.at(-1)}`;
  }

  function buildSessionEvaluationMessage({
    parentName, subject, date, studentName, positivePhrases, attentionPhrases, closing,
  }) {
    const positivePhrase = joinVietnamesePhrases(positivePhrases || []);
    const attentionPhrase = joinVietnamesePhrases(attentionPhrases || []);
    const greeting = String(parentName || "").trim()
      ? `Kính gửi anh/chị ${String(parentName).trim()},`
      : "Kính gửi Quý phụ huynh,";
    const intro = positivePhrase
      ? `Trong buổi học môn ${subject || "buổi học"} ngày ${date || ""}, em ${studentName || "học sinh"} ${positivePhrase}.`
      : `Trong buổi học môn ${subject || "buổi học"} ngày ${date || ""}, giáo viên đã theo dõi và ghi nhận quá trình học tập của em ${studentName || "học sinh"}.`;
    const paragraphs = [greeting, intro];
    if (attentionPhrase) paragraphs.push(`Tuy nhiên, con ${attentionPhrase}.`);
    paragraphs.push(trimSentencePunctuation(closing) + ".");
    return paragraphs.join("\n\n");
  }

  window.SessionEvaluationMessage = Object.freeze({
    build: buildSessionEvaluationMessage,
    joinPhrases: joinVietnamesePhrases,
  });

  window.toggleSessionEvaluationStatus = function (studentId, statusId) {
    const evaluation = state.evaluations.get(studentId);
    if (!evaluation || evaluation.state === "sent") return;
    const status = state.statuses.find(item => item.id === statusId);
    if (!status) return;
    if (evaluation.statusIds.has(statusId)) {
      evaluation.statusIds.delete(statusId);
    } else {
      evaluation.statusIds.add(statusId);
    }
    evaluation.message = "";
    evaluation.template_selection = {};
    document.getElementById(`se-card-${studentId}`).outerHTML = studentCard(state.students.find(item => item.id === studentId));
  };

  window.updateSessionEvaluationMessage = function (studentId, value) {
    const evaluation = state.evaluations.get(studentId);
    if (evaluation) evaluation.message = value;
  };

  window.generateSessionEvaluationMessage = function (studentId) {
    const student = state.students.find(item => item.id === studentId);
    const evaluation = state.evaluations.get(studentId);
    if (!student || !evaluation || evaluation.state === "sent") return;
    const selected = state.statuses.filter(status => evaluation.statusIds.has(status.id));
    if (!selected.length) {
      alert("Hãy chọn ít nhất một trạng thái cho học sinh.");
      return;
    }
    const previous = evaluation.template_selection?.format_version === 2 ? evaluation.template_selection : {};
    const positiveStatuses = selected.filter(status => status.category !== "needs_attention");
    const attentionStatuses = selected.filter(status => status.category === "needs_attention");
    const positiveDescriptions = positiveStatuses.map(status => choose(
      state.templates.filter(item => item.section_type === "status" && item.status_id === status.id),
      previous.positive_descriptions || [],
    )).filter(Boolean);
    const attentionDescriptions = attentionStatuses.map(status => choose(
      state.templates.filter(item => item.section_type === "status" && item.status_id === status.id),
      previous.attention_descriptions || [],
    )).filter(Boolean);
    if (positiveDescriptions.length !== positiveStatuses.length || attentionDescriptions.length !== attentionStatuses.length) {
      alert("Một trạng thái đang thiếu mẫu câu. Vui lòng báo quản trị viên bổ sung thư viện nhận xét.");
      return;
    }
    const closingSection = attentionStatuses.length ? "closing" : "opening";
    const closing = choose(state.templates.filter(item => item.section_type === closingSection), [previous.closing]);
    if (!closing) {
      alert("Thư viện đang thiếu câu kết thúc phù hợp.");
      return;
    }

    evaluation.message = buildSessionEvaluationMessage({
      parentName: state.parents.get(student.id),
      subject: state.classInfo?.subjects?.name || state.session?.lesson?.name || "buổi học",
      date: formatDate(state.session?.session_date),
      studentName: student.full_name,
      positivePhrases: positiveDescriptions.map(item => applyVariables(item.content, student)),
      attentionPhrases: attentionDescriptions.map(item => applyVariables(item.content, student)),
      closing: applyVariables(closing.content, student),
    });
    evaluation.template_selection = {
      format_version: 2,
      positive_descriptions: positiveDescriptions.map(item => item.id),
      attention_descriptions: attentionDescriptions.map(item => item.id),
      closing: closing?.id || null,
    };
    const editor = document.getElementById(`se-editor-${studentId}`);
    const textarea = document.getElementById(`se-message-${studentId}`);
    if (editor) editor.classList.add("open");
    if (textarea) textarea.value = evaluation.message;
  };

  async function persist(studentId, nextState) {
    const evaluation = state.evaluations.get(studentId);
    if (!evaluation) throw new Error("Không tìm thấy đánh giá.");
    if (evaluation.state === "sent") throw new Error("Nhận xét này đã được gửi.");
    if (!evaluation.statusIds.size) throw new Error("Hãy chọn ít nhất một trạng thái.");
    const textarea = document.getElementById(`se-message-${studentId}`);
    if (textarea) evaluation.message = textarea.value.trim();
    if (!evaluation.message) window.generateSessionEvaluationMessage(studentId);
    if (!evaluation.message) throw new Error("Chưa có nội dung nhận xét.");

    const client = getSb();
    const payload = {
      class_session_id: state.sessionId,
      class_id: state.session.class_id,
      student_id: studentId,
      evaluator_id: state.evaluator.id,
      generated_message: evaluation.message,
      final_message: evaluation.message,
      template_selection: evaluation.template_selection || {},
      state: nextState,
      sent_at: nextState === "sent" ? new Date().toISOString() : null,
    };
    const { data, error } = await client
      .from("session_student_evaluations")
      .upsert(payload, { onConflict: "class_session_id,student_id" })
      .select()
      .single();
    if (error) throw error;
    const { error: deleteError } = await client
      .from("session_student_evaluation_statuses")
      .delete()
      .eq("evaluation_id", data.id);
    if (deleteError) throw deleteError;
    const statusRows = [...evaluation.statusIds].map(statusId => ({
      evaluation_id: data.id,
      status_id: statusId,
    }));
    const { error: statusError } = await client.from("session_student_evaluation_statuses").insert(statusRows);
    if (statusError) throw statusError;
    Object.assign(evaluation, data, { message: data.final_message, statusIds: new Set(evaluation.statusIds) });
    return data;
  }

  function setBusy(studentId, busy) {
    const card = document.getElementById(`se-card-${studentId}`);
    if (!card) return;
    card.querySelectorAll("button,textarea").forEach(element => {
      if (busy) element.setAttribute("disabled", "");
      else element.removeAttribute("disabled");
    });
  }

  window.saveSessionEvaluationDraft = async function (studentId, silent = false) {
    try {
      setBusy(studentId, true);
      await persist(studentId, "draft");
      if (!silent) alert("Đã lưu bản nháp.");
      const student = state.students.find(item => item.id === studentId);
      document.getElementById(`se-card-${studentId}`).outerHTML = studentCard(student);
      updateProgress();
      return true;
    } catch (error) {
      if (!silent) alert(`Chưa lưu được: ${error.message}`);
      setBusy(studentId, false);
      return false;
    }
  };

  window.saveAllSessionEvaluationDrafts = async function () {
    const candidates = state.students.filter(student => {
      const item = state.evaluations.get(student.id);
      return item.state !== "sent" && item.statusIds.size;
    });
    if (!candidates.length) {
      alert("Chưa có đánh giá nào cần lưu.");
      return;
    }
    const button = document.getElementById("sessionEvaluationSaveAll");
    if (button) button.disabled = true;
    let saved = 0;
    for (const student of candidates) {
      if (await window.saveSessionEvaluationDraft(student.id, true)) saved += 1;
    }
    if (button) button.disabled = false;
    alert(`Đã lưu ${saved}/${candidates.length} bản nháp.`);
  };

  window.sendSessionEvaluation = async function (studentId) {
    const student = state.students.find(item => item.id === studentId);
    const evaluation = state.evaluations.get(studentId);
    if (!student || !evaluation) return;
    if (!confirm(`Gửi nhận xét buổi học của ${student.full_name} tới phụ huynh? Sau khi gửi sẽ không thể gửi trùng.`)) return;
    try {
      setBusy(studentId, true);
      const saved = await persist(studentId, "sent");
      const parentIds = [...new Set(state.parentIds.get(studentId) || [])];
      if (!parentIds.length) throw new Error("Học sinh chưa được liên kết với tài khoản phụ huynh.");
      await window.NotificationHelper.createBulkNotifications(parentIds.map(parentId => ({
        userId: parentId,
        type: "session_evaluation",
        title: "MindUp - Tư duy Toàn Diện",
        message: evaluation.message,
        refId: saved.id,
        targetUrl: `class.html?openClassId=${encodeURIComponent(state.session.class_id)}&className=${encodeURIComponent(state.classInfo?.class_name || "Lớp học")}`,
        meta: {
          student_id: studentId,
          class_id: state.session.class_id,
          class_session_id: state.sessionId,
          evaluation_id: saved.id,
          session_date: state.session.session_date,
          sender_name: "MindUp - Tư duy Toàn Diện",
          sender_avatar: "pwa-icon-192.png",
          branded_sender: true,
        },
      })));
      evaluation.state = "sent";
      evaluation.sent_at = saved.sent_at;
      document.getElementById(`se-card-${studentId}`).outerHTML = studentCard(student);
      updateProgress();
      alert("Đã gửi nhận xét và thông báo tới phụ huynh.");
    } catch (error) {
      evaluation.state = "failed";
      if (evaluation.id) {
        await getSb().from("session_student_evaluations").update({ state: "failed", sent_at: null }).eq("id", evaluation.id);
      }
      document.getElementById(`se-card-${studentId}`).outerHTML = studentCard(student);
      updateProgress();
      alert(`Chưa gửi được: ${error.message}`);
    }
  };

  window.openSessionEvaluation = async function (sessionId) {
    const role = window._currentRole || "";
    if (!["admin", "teacher", "assistant"].includes(role)) {
      alert("Bạn không có quyền đánh giá buổi học.");
      return;
    }
    injectStyles();
    const overlay = modal();
    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";
    document.getElementById("sessionEvaluationList").innerHTML = '<div class="se-loading">Đang tải danh sách học sinh...</div>';
    try {
      await loadData(sessionId);
      render();
    } catch (error) {
      const missingTables = /evaluation_statuses|evaluation_message_templates|session_student_evaluations/i.test(error.message || "");
      document.getElementById("sessionEvaluationList").innerHTML = `
        <div class="se-empty">${missingTables
          ? "Cơ sở dữ liệu đánh giá chưa được cài đặt. Hãy chạy file SQL session evaluations.sql."
          : `Chưa tải được dữ liệu: ${esc(error.message)}`}</div>`;
    }
  };

  window.closeSessionEvaluation = function () {
    const overlay = document.getElementById("sessionEvaluationOverlay");
    if (overlay) overlay.style.display = "none";
    document.body.style.overflow = "";
  };
})();
