(function () {
  const S = {
    user: null,
    profile: null,
    assignments: [],
    users: [],
    selectedDate: "",
    viewMode: "today",
    selectedUserId: "all",
    preferences: null,
  };

  const E = {};
  const byId = id => document.getElementById(id);
  const INTERNAL_ROLES = new Set(["admin", "teacher", "assistant", "marketing"]);
  const REMINDER_TYPES = new Set(["class_schedule", "child_schedule", "attendance"]);
  const esc = value => String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function localDate(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(value);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function addDays(dateText, amount) {
    const date = dateText ? new Date(`${dateText}T00:00:00+07:00`) : new Date();
    date.setDate(date.getDate() + amount);
    return localDate(date);
  }

  function addMonths(dateText, amount) {
    const date = dateText ? new Date(`${dateText}T00:00:00+07:00`) : new Date();
    date.setMonth(date.getMonth() + amount);
    return localDate(date);
  }

  function monthStart(dateText) {
    return `${String(dateText || localDate()).slice(0, 7)}-01`;
  }

  function weekdayOf(dateText) {
    const date = new Date(`${dateText}T00:00:00+07:00`);
    return date.getDay() === 0 ? 7 : date.getDay();
  }

  function activeSchedulesForMonth(schedules, dateText) {
    const start = monthStart(dateText);
    const eligible = (schedules || []).filter(item => String(item.effective_from || "2000-01-01").slice(0, 10) <= start);
    if (!eligible.length) return [];
    const maxEffective = eligible.reduce((max, item) => {
      const value = String(item.effective_from || "2000-01-01").slice(0, 10);
      return value > max ? value : max;
    }, "2000-01-01");
    return eligible.filter(item => String(item.effective_from || "2000-01-01").slice(0, 10) === maxEffective);
  }

  function localDateTimeIso(dateText, timeText, fallbackHour = "07:00") {
    const time = String(timeText || fallbackHour).slice(0, 5) || fallbackHour;
    return new Date(`${dateText}T${time}:00+07:00`).toISOString();
  }

  function formatShortDate(value) {
    const date = value ? new Date(`${value}T00:00:00+07:00`) : new Date();
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
    }).format(date);
  }

  function toast(message) {
    E.toast.textContent = message;
    E.toast.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => E.toast.classList.remove("show"), 2200);
  }

  function formatDateTime(value) {
    if (!value) return "Không có thời hạn";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit",
      year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(value));
  }

  function formatDay(value) {
    const today = localDate();
    const tomorrow = localDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    if (value === today) return "Hôm nay";
    if (value === tomorrow) return "Ngày mai";
    const date = value ? new Date(`${value}T00:00:00+07:00`) : new Date();
    const label = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    }).format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function taskDay(item) {
    const task = item.task || {};
    if (task.due_at) return localDate(new Date(task.due_at));
    if (task.available_on) return task.available_on;
    return localDate();
  }

  function startOfWeek(dateText = localDate()) {
    const date = new Date(`${dateText}T00:00:00+07:00`);
    const day = date.getDay() === 0 ? 7 : date.getDay();
    date.setDate(date.getDate() - day + 1);
    return localDate(date);
  }

  function endOfMonth(dateText = localDate()) {
    const year = Number(String(dateText).slice(0, 4));
    const month = Number(String(dateText).slice(5, 7));
    return localDate(new Date(year, month, 0));
  }

  function inRange(day, start, end) {
    return day >= start && day <= end;
  }

  function isReminderTask(item) {
    return REMINDER_TYPES.has(item.task?.task_type);
  }

  function pct(current, total) {
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(current || 0) / Number(total || 0)) * 100)));
  }

  function uniq(values) {
    return [...new Set((values || []).filter(Boolean))];
  }

  function monthRange(dateText = localDate()) {
    const start = monthStart(dateText);
    return { start, end: endOfMonth(dateText) };
  }

  function statusInfo(item) {
    const task = item.task || {};
    if (REMINDER_TYPES.has(task.task_type)) return { className: "reminder", icon: "•", label: "Lời nhắc nhở" };
    if (item.status === "completed") return { className: "done", icon: "✓", label: "Đã hoàn thành" };
    return { className: "todo", icon: "✕", label: "Chưa hoàn thành" };
  }

  function isOverdue(item) {
    if (REMINDER_TYPES.has(item.task?.task_type)) return false;
    return item.status !== "completed" && item.status !== "cancelled"
      && item.task?.due_at && new Date(item.task.due_at) < new Date();
  }

  function visibleAssignments() {
    const selected = S.selectedDate || localDate();
    const start = S.viewMode === "month" ? monthStart(selected) : selected;
    const end = S.viewMode === "month" ? endOfMonth(selected) : selected;
    return S.assignments.filter(item => {
      const day = taskDay(item);
      if (S.profile?.role === "admin" && S.selectedUserId !== "all" && item.user_id !== S.selectedUserId) return false;
      return inRange(day, start, end);
    }).sort((a, b) => {
      const priority = { urgent: 0, important: 1, normal: 2 };
      const reminderDiff = Number(isReminderTask(a)) - Number(isReminderTask(b));
      if (reminderDiff) return reminderDiff;
      const status = Number(a.status === "completed") - Number(b.status === "completed");
      if (status) return status;
      const dayDiff = taskDay(a).localeCompare(taskDay(b));
      if (dayDiff && S.viewMode !== "today") return dayDiff;
      const priorityDiff = (priority[a.task?.priority] ?? 3) - (priority[b.task?.priority] ?? 3);
      if (priorityDiff) return priorityDiff;
      return new Date(a.task?.due_at || "2999-01-01") - new Date(b.task?.due_at || "2999-01-01");
    });
  }

  function priorityLabel(value) {
    return { urgent: "Khẩn cấp", important: "Quan trọng", normal: "Thông thường" }[value] || value;
  }

  function typeLabel(value) {
    return {
      class_schedule: "Lịch học", child_schedule: "Lịch của con", attendance: "Điểm danh",
      session_evaluation: "Đánh giá", student_exam: "Bài tập", tuition: "Học phí",
      course_session: "Khóa học",
      exam_grading: "Chấm bài", trial_request: "Học thử", parent_link: "Phụ huynh",
      class_staff: "Nhân sự", manual: "Được giao",
    }[value] || "Công việc";
  }

  function hasScheduleTaskFor(existingAssignments, userId, classId, dateText) {
    return (existingAssignments || []).some(item => {
      const task = item.task || {};
      return item.user_id === userId
        && task.task_type === "class_schedule"
        && task.available_on === dateText
        && String(task.metadata?.class_id || "") === String(classId || "");
    });
  }

  async function loadScheduleFallbackTasks(existingAssignments) {
    const today = localDate();
    const weekday = weekdayOf(today);
    let staffQuery = sb.from("class_teachers").select("class_id,teacher_id");
    if (S.profile.role !== "admin") staffQuery = staffQuery.eq("teacher_id", S.user.id);

    const { data: staffRows, error: staffError } = await staffQuery;
    if (staffError || !(staffRows || []).length) {
      if (staffError) console.warn("Schedule fallback staff:", staffError);
      return [];
    }

    const classIds = [...new Set(staffRows.map(row => row.class_id).filter(Boolean))];
    const userIds = [...new Set(staffRows.map(row => row.teacher_id).filter(Boolean))];
    if (!classIds.length || !userIds.length) return [];

    const [{ data: classes, error: classError }, { data: users, error: userError }] = await Promise.all([
      sb.from("classes")
        .select("id,class_name,hidden,class_schedules(id,class_id,session_no,weekday,start_time,end_time,effective_from,rooms(room_name))")
        .in("id", classIds)
        .eq("hidden", false),
      sb.from("users").select("id,full_name,email,role").in("id", userIds),
    ]);
    if (classError || userError) {
      console.warn("Schedule fallback:", classError || userError);
      return [];
    }

    const classById = new Map((classes || []).map(item => [item.id, item]));
    const userById = new Map((users || []).map(item => [item.id, item]));
    const fallbackRows = [];

    (staffRows || []).forEach(row => {
      const cls = classById.get(row.class_id);
      const assignee = userById.get(row.teacher_id);
      if (!cls || !assignee || !INTERNAL_ROLES.has(assignee.role)) return;
      if (hasScheduleTaskFor(existingAssignments, row.teacher_id, row.class_id, today)) return;

      activeSchedulesForMonth(cls.class_schedules || [], today)
        .filter(schedule => Number(schedule.weekday) === weekday)
        .forEach(schedule => {
          const start = String(schedule.start_time || "").slice(0, 5);
          const end = String(schedule.end_time || "").slice(0, 5);
          const timeRange = start ? ` • ${start}${end ? "-" + end : ""}` : "";
          const room = schedule.rooms?.room_name ? ` • ${schedule.rooms.room_name}` : "";
          fallbackRows.push({
            id: `schedule-fallback:${row.teacher_id}:${row.class_id}:${schedule.id}:${today}`,
            user_id: row.teacher_id,
            status: "open",
            assignee,
            task: {
              title: `Lịch phụ trách lớp ${cls.class_name || "Lớp học"}`,
              description: `Buổi ${schedule.session_no || 1} • ${formatShortDate(today)}${timeRange}${room}`,
              task_type: "class_schedule",
              priority: "normal",
              available_on: today,
              due_at: localDateTimeIso(today, schedule.start_time),
              action_url: `class.html?openClassId=${row.class_id}`,
              auto_generated: true,
              verification_mode: "manual",
              metadata: {
                fallback_from_schedule: true,
                class_id: row.class_id,
                schedule_id: schedule.id,
                session_no: schedule.session_no || 1,
              },
            },
          });
        });
    });

    return fallbackRows;
  }

  function renderSummary() {
    const today = localDate();
    const scoped = S.assignments.filter(item =>
      S.profile?.role !== "admin" || S.selectedUserId === "all" || item.user_id === S.selectedUserId
    );
    const open = scoped.filter(item => !["completed", "cancelled"].includes(item.status));
    E.todayCount.textContent = open.filter(item => taskDay(item) === today).length;
    E.importantCount.textContent = open.filter(item =>
      !REMINDER_TYPES.has(item.task?.task_type)
      && ["urgent", "important"].includes(item.task?.priority)
    ).length;
    E.overdueCount.textContent = open.filter(isOverdue).length;
    E.completedCount.textContent = scoped.filter(item => item.status === "completed").length;
  }

  function taskProgressHtml(item) {
    const progress = item.task?.progress;
    if (!progress || !Number(progress.total)) return "";
    const percent = pct(progress.current, progress.total);
    return `
      <div class="task-progress-row" style="margin-top:9px">
        <div class="task-progress-head">
          <span>${esc(progress.label || "Tiến độ")}</span>
          <span>${Number(progress.current || 0)}/${Number(progress.total || 0)} · ${percent}%</span>
        </div>
        <div class="task-progress-track"><div class="task-progress-fill" style="width:${percent}%"></div></div>
      </div>`;
  }

  function taskCard(item) {
    const task = item.task || {};
    const completed = item.status === "completed";
    const overdue = isOverdue(item);
    const state = statusInfo(item);
    return `
      <article class="task-card ${esc(task.priority)} ${completed ? "completed" : ""}" data-task="${item.id}">
        <div>
          <div class="task-card-head">
            <h3>${esc(task.title)}</h3>
            <span class="task-badge">${esc(typeLabel(task.task_type))}</span>
            <span class="task-badge ${esc(task.priority)}">${esc(priorityLabel(task.priority))}</span>
            ${overdue ? '<span class="task-badge overdue">Quá hạn</span>' : ""}
          </div>
          ${task.description ? `<p class="task-description">${esc(task.description)}</p>` : ""}
          ${taskProgressHtml(item)}
          <div class="task-meta">
            ${S.profile?.role === "admin" && item.assignee ? `<span>Người nhận: ${esc(item.assignee.full_name || item.assignee.email)}</span>` : ""}
            <span>${task.due_at ? `Hạn ${formatDateTime(task.due_at)}` : "Không có thời hạn"}</span>
            <span>${task.auto_generated ? "Hệ thống tự tạo" : "Admin giao"}</span>
            ${task.verification_mode !== "manual" ? "<span>Tự xác minh hoàn thành</span>" : ""}
          </div>
        </div>
        <div class="task-actions">
          <span class="task-status ${state.className}"><span>${state.icon}</span><span>${state.label}</span></span>
          ${task.action_url ? `<button class="task-btn primary" type="button" data-action-url="${esc(task.action_url)}">Mở</button>` : ""}
        </div>
      </article>`;
  }

  function renderGrouped(rows) {
    const groups = new Map();
    rows.forEach(item => {
      const key = taskDay(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return [...groups.entries()].map(([day, items]) => `
      <section class="task-day">
        <h2 class="task-day-title">${esc(formatDay(day))}</h2>
        ${items.map(taskCard).join("")}
      </section>
    `).join("");
  }

  function viewTitle() {
    const selected = S.selectedDate || localDate();
    if (S.viewMode === "month") return `Tháng ${String(selected).slice(5, 7)}/${String(selected).slice(0, 4)}`;
    return formatShortDate(selected);
  }

  function renderMonthOverview(rows) {
    const completed = rows.filter(item => item.status === "completed").length;
    const overdue = rows.filter(isOverdue).length;
    const targetLike = rows.filter(item => item.task?.task_type === "target" || item.task?.metadata?.metric_target || item.task?.metadata?.progress_target);
    return `
      <section class="task-month-overview">
        <div><span>Tổng công việc</span><strong>${rows.length}</strong></div>
        <div><span>Đã hoàn thành</span><strong>${completed}</strong></div>
        <div><span>Quá hạn</span><strong>${overdue}</strong></div>
        <div><span>Chỉ tiêu / tiến độ</span><strong>${targetLike.length}</strong></div>
      </section>`;
  }

  function renderProgressList(rows) {
    const progressRows = rows
      .filter(item => item.task?.progress?.total)
      .sort((a, b) => pct(a.task.progress.current, a.task.progress.total) - pct(b.task.progress.current, b.task.progress.total))
      .slice(0, 8);
    if (!progressRows.length) return '<div class="task-empty" style="padding:20px">Chưa có công việc nào có tiến độ đo được trong tháng này.</div>';
    return `<div class="task-progress-list">${progressRows.map(item => {
      const progress = item.task.progress;
      const percent = pct(progress.current, progress.total);
      return `
        <div class="task-progress-row">
          <div class="task-progress-head">
            <span>${esc(item.task?.title || "Công việc")}</span>
            <span>${Number(progress.current || 0)}/${Number(progress.total || 0)} · ${percent}%</span>
          </div>
          <div class="task-progress-track"><div class="task-progress-fill" style="width:${percent}%"></div></div>
        </div>`;
    }).join("")}</div>`;
  }

  function renderMiniChart(rows) {
    const { start, end } = monthRange(S.selectedDate || localDate());
    const days = [];
    for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
    const counts = days.map(day => rows.filter(item => !isReminderTask(item) && taskDay(item) === day).length);
    const max = Math.max(1, ...counts);
    return `
      <div class="task-mini-chart" style="--bars:${days.length}">
        ${days.map((day, idx) => {
          const height = Math.max(5, Math.round((counts[idx] / max) * 100));
          return `<div class="task-mini-bar" title="${esc(formatShortDate(day))}: ${counts[idx]} việc" style="height:${height}%"></div>`;
        }).join("")}
      </div>
      <div style="display:flex;justify-content:space-between;color:var(--ink-light);font-size:.72rem;margin-top:6px">
        <span>${esc(formatShortDate(start))}</span><span>${esc(formatShortDate(end))}</span>
      </div>`;
  }

  function renderMonthDashboard(rows) {
    const actionRows = rows.filter(item => !isReminderTask(item));
    const reminderRows = rows.filter(isReminderTask);
    const completed = actionRows.filter(item => item.status === "completed").length;
    const overdue = actionRows.filter(isOverdue).length;
    const progressRows = actionRows.filter(item => item.task?.progress?.total);
    const progressDone = progressRows.reduce((sum, item) => sum + Number(item.task.progress.current || 0), 0);
    const progressTotal = progressRows.reduce((sum, item) => sum + Number(item.task.progress.total || 0), 0);
    const unfinished = actionRows.filter(item => item.status !== "completed").slice(0, 12);
    const reminders = reminderRows.slice(0, 12);
    return `
      <section class="task-month-dashboard">
        <section class="task-month-overview">
          <div><span>Cần hoàn thiện</span><strong>${actionRows.filter(item => item.status !== "completed").length}</strong></div>
          <div><span>Đã hoàn thành</span><strong>${completed}/${actionRows.length}</strong></div>
          <div><span>Quá hạn</span><strong>${overdue}</strong></div>
          <div><span>Tiến độ đo được</span><strong>${progressTotal ? `${progressDone}/${progressTotal}` : "0/0"}</strong></div>
        </section>
        <section class="task-panel">
          <h2>Tiến độ cần hoàn thiện</h2>
          ${renderProgressList(actionRows)}
        </section>
        <section class="task-panel">
          <h2>Biểu đồ công việc trong tháng</h2>
          ${renderMiniChart(actionRows)}
        </section>
        <h2 class="task-month-section-title">Việc cần xử lý</h2>
        ${unfinished.length ? unfinished.map(taskCard).join("") : '<div class="task-empty" style="padding:22px">Không còn công việc cần hoàn thiện trong tháng này.</div>'}
        <section class="task-reminder-group">
          <h2 class="task-month-section-title">Nhắc nhở trong tháng</h2>
          ${reminders.length ? reminders.map(taskCard).join("") : '<div class="task-empty" style="padding:22px">Không có nhắc nhở trong tháng này.</div>'}
        </section>
      </section>`;
  }

  function emptyLabel() {
    if (S.viewMode === "month") return "tháng này";
    return `ngày ${formatShortDate(S.selectedDate || localDate())}`;
  }

  function roleLabel(value) {
    return {
      admin: "Admin",
      teacher: "Giáo viên",
      assistant: "Trợ giảng",
      marketing: "Marketing",
    }[value] || value || "Nhân viên";
  }

  function mergedStaffUsers() {
    const map = new Map();
    (S.users || []).forEach(user => {
      if (user?.id && INTERNAL_ROLES.has(user.role)) map.set(user.id, user);
    });
    (S.assignments || []).forEach(item => {
      const user = item.assignee;
      if (user?.id && INTERNAL_ROLES.has(user.role)) map.set(user.id, user);
    });
    return [...map.values()].sort((a, b) =>
      String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""), "vi")
    );
  }

  function renderStaffFilter() {
    if (!E.adminFilter || !E.staffFilter) return;
    const isAdmin = S.profile?.role === "admin";
    E.adminFilter.classList.toggle("show", isAdmin);
    if (!isAdmin) return;
    const selected = S.selectedUserId || "all";
    const options = mergedStaffUsers().map(user =>
      `<option value="${esc(user.id)}">${esc(user.full_name || user.email)} - ${esc(roleLabel(user.role))}</option>`
    ).join("");
    E.staffFilter.innerHTML = `<option value="all">Tất cả nhân viên</option>${options}`;
    E.staffFilter.value = selected;
    if (E.staffFilter.value !== selected) {
      S.selectedUserId = "all";
      E.staffFilter.value = "all";
    }
  }

  function render() {
    renderSummary();
    renderStaffFilter();
    syncDatebar();
    const rows = visibleAssignments();
    const overview = S.viewMode === "month" ? renderMonthOverview(rows) : "";
    if (S.viewMode === "month" && rows.length) {
      E.list.innerHTML = renderMonthDashboard(rows);
      return;
    }
    if (!rows.length) {
      E.list.innerHTML = `<div class="task-empty">Không có công việc trong ${esc(emptyLabel())}.</div>`;
      return;
    }
    E.list.innerHTML = rows.length
      ? overview + renderGrouped(rows)
      : `<div class="task-empty">Không có công việc trong ngày ${esc(formatShortDate(S.selectedDate || localDate()))}.</div>`;
  }

  function syncDatebar() {
    if (E.currentDay) E.currentDay.textContent = viewTitle();
    document.querySelectorAll("[data-task-view]").forEach(button => {
      button.classList.toggle("active", button.dataset.taskView === S.viewMode);
    });
    if (E.staffFilter) E.staffFilter.value = S.selectedUserId || "all";
  }

  function shiftSelectedDate(amount) {
    const selected = S.selectedDate || localDate();
    if (S.viewMode === "month") return addMonths(selected, amount);
    return addDays(selected, amount);
  }

  async function loadInternalUsers() {
    if (S.users.length) return;
    const { data, error } = await sb.from("users")
      .select("id,full_name,email,role")
      .in("role", [...INTERNAL_ROLES])
      .order("full_name");
    if (error) {
      console.warn("Load task staff users:", error);
      return;
    }
    S.users = data || [];
  }

  async function enrichTaskProgress(assignments) {
    const rows = (assignments || []).filter(item => {
      const task = item.task || {};
      return task.metadata && task.task_type === "session_evaluation";
    });
    if (!rows.length) return;

    const classIds = uniq(rows.map(item => item.task?.metadata?.class_id));
    const sessionIds = uniq(rows.map(item => item.task?.metadata?.session_id));

    const [studentsRes, evaluationsRes] = await Promise.all([
      classIds.length
        ? sb.from("class_students").select("class_id,student_id,joined_at,left_at").in("class_id", classIds)
        : Promise.resolve({ data: [], error: null }),
      sessionIds.length
        ? sb.from("session_student_evaluations").select("class_session_id,student_id,state").in("class_session_id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (studentsRes.error || evaluationsRes.error) {
      console.warn("Task progress:", studentsRes.error || evaluationsRes.error);
      return;
    }

    const studentsByClass = new Map();
    (studentsRes.data || []).forEach(row => {
      if (!studentsByClass.has(row.class_id)) studentsByClass.set(row.class_id, []);
      studentsByClass.get(row.class_id).push(row);
    });
    const evaluationMap = new Map();
    (evaluationsRes.data || []).forEach(row => {
      if (row.state !== "sent") return;
      const key = String(row.class_session_id);
      if (!evaluationMap.has(key)) evaluationMap.set(key, new Set());
      evaluationMap.get(key).add(row.student_id);
    });
    const activeStudentCount = (classId, dateText) => (studentsByClass.get(classId) || []).filter(row => {
      const joined = row.joined_at ? String(row.joined_at).slice(0, 10) : "0000-00-00";
      const left = row.left_at ? String(row.left_at).slice(0, 10) : "9999-99-99";
      return joined <= dateText && left >= dateText;
    }).length;

    rows.forEach(item => {
      const task = item.task || {};
      const meta = task.metadata || {};
      const classId = meta.class_id;
      const dateText = String(meta.session_date || task.available_on || taskDay(item)).slice(0, 10);
      if (!classId || !dateText) return;
      const total = activeStudentCount(classId, dateText);
      if (!total) return;
      if (task.task_type === "session_evaluation" && meta.session_id) {
        const current = evaluationMap.get(String(meta.session_id))?.size || 0;
        task.progress = { current, total, label: "Đã đánh giá học sinh" };
      }
    });
  }

  async function loadTasks({ refresh = false } = {}) {
    E.list.innerHTML = '<div class="task-empty">Đang tổng hợp công việc...</div>';
    if (refresh) {
      const { error: refreshError } = await sb.rpc("refresh_daily_tasks", {
        p_user_id: S.profile.role === "admin" ? null : S.user.id,
      });
      if (refreshError) console.warn("Task refresh:", refreshError);
    }
    await sb.rpc("sync_verified_task_statuses", {
      p_user_id: S.profile.role === "admin" ? null : S.user.id,
    });
    let query = sb.from("task_assignments")
      .select("*,task:daily_tasks(*),assignee:users!task_assignments_user_id_fkey(id,full_name,email,role)")
      .order("created_at", { ascending: false });
    if (S.profile.role !== "admin") query = query.eq("user_id", S.user.id);
    const { data, error } = await query;
    if (error) {
      E.list.innerHTML = `<div class="task-empty">Chưa tải được công việc: ${esc(error.message)}</div>`;
      return;
    }
    const assignments = (data || []).filter(item =>
      item.status !== "cancelled"
      && INTERNAL_ROLES.has(item.assignee?.role || S.profile?.role)
    );
    const scheduleFallbacks = await loadScheduleFallbackTasks(assignments);
    S.assignments = [...assignments, ...scheduleFallbacks];
    await enrichTaskProgress(S.assignments);
    render();
  }

  async function setStatus(id, status) {
    const { error } = await sb.rpc("set_task_assignment_status", {
      p_assignment_id: id, p_status: status, p_note: null,
    });
    if (error) return alert(error.message);
    toast(status === "completed" ? "Đã hoàn thành công việc." : "Đã cập nhật trạng thái.");
    await loadTasks();
  }

  function oldStoredAssignments() {
    const today = localDate();
    return S.assignments.filter(item =>
      !String(item.id || "").startsWith("schedule-fallback:")
      && taskDay(item) < today
    );
  }

  function isMissingRpcError(error) {
    return /Could not find the function|schema cache|PGRST202/i.test(error?.message || "");
  }

  async function deleteOldTasksFallback() {
    const rows = oldStoredAssignments();
    if (!rows.length) return 0;

    if (S.profile.role === "admin") {
      let deleted = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const ids = rows.slice(i, i + 100).map(item => item.id);
        const { error } = await sb.from("task_assignments").delete().in("id", ids);
        if (error) throw error;
        deleted += ids.length;
      }
      return deleted;
    }

    let cancelled = 0;
    for (const item of rows) {
      const { error } = await sb.rpc("set_task_assignment_status", {
        p_assignment_id: item.id,
        p_status: "cancelled",
        p_note: "Người dùng xóa công việc cũ",
      });
      if (error) throw error;
      cancelled += 1;
    }
    return cancelled;
  }

  async function deleteOldTasks() {
    const ok = confirm("Xóa tất cả công việc trong các ngày trước hôm nay? Công việc hôm nay và tương lai sẽ được giữ lại.");
    if (!ok) return;
    const { data, error } = await sb.rpc("delete_old_task_assignments", {
      p_user_id: S.profile.role === "admin" ? null : S.user.id,
    });
    let deleted = Number(data?.deleted_assignments || 0);
    if (error) {
      if (!isMissingRpcError(error)) return alert(error.message);
      try {
        deleted = await deleteOldTasksFallback();
      } catch (fallbackError) {
        return alert(fallbackError.message || "Không xóa được công việc cũ.");
      }
    }
    toast(deleted ? `Đã xóa ${deleted} công việc cũ.` : "Không có công việc cũ để xóa.");
    await loadTasks();
  }

  function openAction(url) {
    const page = String(url || "").trim();
    if (!page) return;
    try {
      if (window.parent && window.parent !== window && typeof window.parent.openDashboardPage === "function") {
        window.parent.openDashboardPage(page);
        return;
      }
    } catch (_) {
      // Fall through to the iframe/local navigation fallback.
    }
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "dashboard:navigate-frame", page }, "*");
        setTimeout(() => {
          if (location.pathname.split("/").pop() === "tasks.html") location.href = page;
        }, 250);
        return;
      }
    } catch (_) {
      // Fall through to normal navigation.
    }
    location.href = page;
  }

  function openModal(id) {
    byId(id)?.classList.add("show");
  }

  function closeModal(id) {
    byId(id)?.classList.remove("show");
  }

  function renderAssignees() {
    const query = (byId("manualTaskAssigneeSearch").value || "").trim().toLowerCase();
    byId("manualTaskAssignees").innerHTML = S.users.filter(user =>
      !query || `${user.full_name || ""} ${user.email || ""}`.toLowerCase().includes(query)
    ).map(user => `
      <label class="assignee-row">
        <input type="checkbox" value="${user.id}">
        <span><strong>${esc(user.full_name || user.email)}</strong><br><small>${esc(user.role)} · ${esc(user.email)}</small></span>
      </label>`).join("");
  }

  async function openCreateModal() {
    await loadInternalUsers();
    renderAssignees();
    openModal("taskCreateModal");
  }

  async function saveManualTask() {
    const userIds = [...byId("manualTaskAssignees").querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
    const title = byId("manualTaskTitle").value.trim();
    if (!title || !userIds.length) return alert("Hãy nhập tiêu đề và chọn ít nhất một người nhận.");
    const dueValue = byId("manualTaskDueAt").value;
    const { data: taskId, error } = await sb.rpc("create_manual_task", {
      p_title: title,
      p_description: byId("manualTaskDescription").value.trim(),
      p_priority: byId("manualTaskPriority").value,
      p_due_at: dueValue ? new Date(dueValue).toISOString() : null,
      p_action_url: byId("manualTaskActionUrl").value.trim(),
      p_user_ids: userIds,
    });
    if (error) return alert(error.message);
    try {
      await window.NotificationHelper.createBulkNotifications(userIds.map(userId => ({
        userId,
        type: "task_assigned",
        title: "MindUp - Tư duy Toàn Diện",
        message: `Bạn được giao công việc: ${title}`,
        refId: taskId,
        targetUrl: "tasks.html",
        meta: { task_id: taskId, branded_sender: true, sender_name: "MindUp - Tư duy Toàn Diện", sender_avatar: "pwa-icon-192.png" },
      })));
    } catch (notifyError) {
      console.warn("Không gửi được thông báo giao việc", notifyError);
    }
    closeModal("taskCreateModal");
    ["manualTaskTitle", "manualTaskDescription", "manualTaskDueAt", "manualTaskActionUrl"].forEach(id => byId(id).value = "");
    toast(`Đã giao việc cho ${userIds.length} người.`);
    await loadTasks();
  }

  async function loadPreferences() {
    let { data } = await sb.from("task_preferences").select("*").eq("user_id", S.user.id).maybeSingle();
    if (!data) {
      const result = await sb.from("task_preferences").upsert({ user_id: S.user.id }).select().single();
      data = result.data;
    }
    S.preferences = data || {};
    byId("prefDigestEnabled").value = String(S.preferences.daily_digest_enabled !== false);
    byId("prefDigestTime").value = String(S.preferences.daily_digest_time || "07:00").slice(0, 5);
    byId("prefDueEnabled").value = String(S.preferences.due_reminders_enabled !== false);
    byId("prefOverdueEnabled").value = String(S.preferences.overdue_reminders_enabled !== false);
  }

  async function savePreferences() {
    const payload = {
      user_id: S.user.id,
      daily_digest_enabled: byId("prefDigestEnabled").value === "true",
      daily_digest_time: byId("prefDigestTime").value || "07:00",
      due_reminders_enabled: byId("prefDueEnabled").value === "true",
      overdue_reminders_enabled: byId("prefOverdueEnabled").value === "true",
    };
    const { error } = await sb.from("task_preferences").upsert(payload);
    if (error) return alert(error.message);
    closeModal("taskSettingsModal");
    toast("Đã lưu cài đặt thông báo.");
  }

  function bindEvents() {
    E.prevDay.addEventListener("click", () => {
      S.selectedDate = shiftSelectedDate(-1);
      render();
    });
    E.nextDay.addEventListener("click", () => {
      S.selectedDate = shiftSelectedDate(1);
      render();
    });
    document.querySelectorAll("[data-task-view]").forEach(button => {
      button.addEventListener("click", () => {
        S.viewMode = button.dataset.taskView || "today";
        render();
      });
    });
    E.staffFilter?.addEventListener("change", () => {
      S.selectedUserId = E.staffFilter.value || "all";
      render();
    });
    E.list.addEventListener("click", event => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.dataset.actionUrl) openAction(target.dataset.actionUrl);
    });
    byId("taskRefreshButton").addEventListener("click", () => loadTasks({ refresh: true }));
    byId("taskDeleteOldButton").addEventListener("click", deleteOldTasks);
    byId("taskCreateButton").addEventListener("click", openCreateModal);
    byId("taskSettingsButton").addEventListener("click", async () => { await loadPreferences(); openModal("taskSettingsModal"); });
    byId("manualTaskAssigneeSearch").addEventListener("input", renderAssignees);
    byId("manualTaskSave").addEventListener("click", saveManualTask);
    byId("taskPreferencesSave").addEventListener("click", savePreferences);
    document.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.closeModal)));
  }

  async function init() {
    Object.assign(E, {
      list: byId("taskList"), prevDay: byId("taskPrevDay"), currentDay: byId("taskCurrentDay"), nextDay: byId("taskNextDay"),
      todayCount: byId("taskTodayCount"), importantCount: byId("taskImportantCount"),
      overdueCount: byId("taskOverdueCount"), completedCount: byId("taskCompletedCount"),
      adminFilter: byId("taskAdminFilter"), staffFilter: byId("taskStaffFilter"),
      toast: byId("taskToast"),
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return location.href = "index.html";
    S.user = user;
    const { data: profile, error } = await sb.from("users").select("id,full_name,role").eq("id", user.id).single();
    if (error) return E.list.innerHTML = `<div class="task-empty">${esc(error.message)}</div>`;
    S.profile = profile;
    if (!INTERNAL_ROLES.has(profile.role)) {
      if (window.parent && window.parent !== window && typeof window.parent.openDashboardPage === "function") {
        window.parent.openDashboardPage("notifications.html", { syncMenu: false, syncMobile: false, replaceUrl: true });
        return;
      }
      location.href = "notifications.html";
      return;
    }
    S.selectedDate = localDate();
    byId("taskGreeting").textContent = `${profile.full_name || "Bạn"}, đây là các việc cần chú ý hôm nay.`;
    byId("taskCreateButton").style.display = profile.role === "admin" ? "grid" : "none";
    if (profile.role === "admin") await loadInternalUsers();
    renderStaffFilter();
    bindEvents();
    await loadTasks({ refresh: true });
    window.MindupLiveUI?.watchTable?.("task_assignments", () => loadTasks());
  }

  init();
})();
