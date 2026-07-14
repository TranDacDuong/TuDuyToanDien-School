(function () {
  const S = {
    user: null,
    profile: null,
    assignments: [],
    users: [],
    selectedDate: "",
    viewMode: "today",
    adminScope: "center",
    selectedUserId: "all",
    preferences: null,
    manualAssigneeIds: new Set(),
    taskTemplates: [],
    editingTemplateId: null,
    attendanceLocation: null,
    attendanceLogs: [],
    attendanceHistoryLogs: [],
    attendanceHistoryExpanded: false,
    attendanceAdminDate: "",
    attendanceAdminLogs: [],
    attendanceAdminExpanded: false,
  };

  const E = {};
  const byId = id => document.getElementById(id);
  const INTERNAL_ROLES = new Set(["admin", "teacher", "assistant", "marketing"]);
  const DEFAULT_ATTENDANCE_LOCATION = {
    name: "MindUp - Tư Duy Toàn Diện",
    address: "Số 124 phố Chùa Quỳnh, Phường Bạch Mai, thành phố Hà Nội",
    latitude: 20.9999701,
    longitude: 105.8576233,
    radius_meters: 200,
  };
  const REMINDER_TYPES = new Set(["class_schedule", "child_schedule", "attendance"]);
  const DEPRECATED_SOCIAL_TASK_PATTERNS = [
    "comment dạo",
    "comment dao",
    "bài viết ngày hôm trước",
    "bai viet ngay hom truoc",
    "đăng bài",
    "dang bai",
    "hẹn lịch đăng bài",
    "hen lich dang bai",
    "facebook"
  ];
  let taskStaffLoadWarned = false;
  const esc = value => String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function linkifyTaskText(value) {
    const escaped = esc(value);
    return escaped.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<>"']+)/gi, (match, prefix, rawUrl) => {
      const trailing = rawUrl.match(/[),.;!?]+$/)?.[0] || "";
      const cleanUrl = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
      const href = cleanUrl.startsWith("www.") ? `https://${cleanUrl}` : cleanUrl;
      return `${prefix}<a href="${href}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
    });
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  }

  function isDeprecatedSocialTask(item) {
    const task = item?.task || item || {};
    const typeText = normalizeSearchText([task.task_type, task.source_type].join(" "));
    if (/\b(facebook_posting|social_comment)\b/.test(typeText)) return true;
    const content = normalizeSearchText([
      task.title,
      task.description,
      task.source_key,
      task.metadata && JSON.stringify(task.metadata)
    ].join(" "));
    return DEPRECATED_SOCIAL_TASK_PATTERNS.some(pattern => content.includes(normalizeSearchText(pattern)));
  }

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

  function endOfDayIso(dateText) {
    return new Date(`${dateText}T23:59:00+07:00`).toISOString();
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

  function formatAttendanceTime(value) {
    if (!value) return "Chưa có";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
    }).format(new Date(value));
  }

  function formatAttendanceClock(value) {
    if (!value) return "--:--";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit",
    }).format(new Date(value));
  }

  function formatMeters(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "Chưa rõ";
    const n = Number(value);
    return n >= 1000 ? `${(n / 1000).toFixed(2)}km` : `${Math.round(n)}m`;
  }

  function attendanceStatusLabel(value) {
    return {
      valid: "Hợp lệ",
      outside_radius: "Ngoài phạm vi",
      outside_range: "Ngoài phạm vi",
      low_accuracy: "GPS sai số cao",
      manual_review: "Chờ duyệt",
      pending: "Chờ kiểm tra",
      invalid: "Không hợp lệ",
    }[value] || "Chưa rõ";
  }

  function setStaffAttendanceFeedback(message = "", type = "ok") {
    if (!E.attendanceFeedback) return;
    E.attendanceFeedback.textContent = message;
    E.attendanceFeedback.className = `staff-attendance-feedback ${message ? "show" : ""} ${type}`;
  }

  function setStaffAttendanceBusy(isBusy) {
    [E.staffCheckInBtn, E.staffCheckOutBtn].forEach(button => {
      if (button) button.disabled = Boolean(isBusy);
    });
  }

  function getStaffPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Thiết bị/trình duyệt chưa hỗ trợ chia sẻ vị trí."));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  }

  async function loadStaffAttendanceLocation() {
    S.attendanceLocation = DEFAULT_ATTENDANCE_LOCATION;
    const { data, error } = await sb.from("staff_attendance_locations")
      .select("id,name,address,latitude,longitude,radius_meters")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!error && data) S.attendanceLocation = data;
    if (error && !/does not exist|schema cache|permission denied/i.test(error.message || "")) {
      console.warn("Load staff attendance location:", error);
    }
  }

  async function loadStaffAttendanceToday() {
    const today = localDate();
    const start = `${today}T00:00:00+07:00`;
    const end = `${today}T23:59:59+07:00`;
    const { data, error } = await sb.from("staff_attendance_logs")
      .select("*")
      .eq("user_id", S.user.id)
      .gte("checked_at", start)
      .lte("checked_at", end)
      .order("checked_at", { ascending: false });
    if (error) {
      S.attendanceLogs = [];
      if (/does not exist|schema cache/i.test(error.message || "")) {
        setStaffAttendanceFeedback("Chưa cấu hình dữ liệu chấm công. Hãy chạy file SQL staff location attendance.sql trên Supabase.", "warn");
      } else {
        setStaffAttendanceFeedback(`Không tải được dữ liệu chấm công: ${error.message}`, "err");
      }
      console.warn("Load staff attendance today:", error);
      return;
    }
    S.attendanceLogs = data || [];
  }

  async function loadStaffAttendanceHistory() {
    const startDay = addDays(localDate(), -59);
    const start = `${startDay}T00:00:00+07:00`;
    const end = `${localDate()}T23:59:59+07:00`;
    const { data, error } = await sb.from("staff_attendance_logs")
      .select("*")
      .eq("user_id", S.user.id)
      .gte("checked_at", start)
      .lte("checked_at", end)
      .order("checked_at", { ascending: false })
      .limit(240);
    if (error) {
      S.attendanceHistoryLogs = [];
      if (E.attendanceHistoryList) {
        E.attendanceHistoryList.innerHTML = `<div class="task-empty compact">Không tải được lịch sử chấm công: ${esc(error.message)}</div>`;
      }
      console.warn("Load staff attendance history:", error);
      return;
    }
    S.attendanceHistoryLogs = data || [];
  }

  function attendanceLogChip(log) {
    const isCheckIn = log.check_type === "check_in";
    const label = isCheckIn ? "Vào" : "Ra";
    const cls = log.is_valid ? "ok" : (log.status ? "warn" : "muted");
    return `<span class="attendance-log-chip ${cls}">
      ${esc(label)} ${esc(formatAttendanceClock(log.checked_at))}
      ${log.distance_meters !== null && log.distance_meters !== undefined ? ` • ${esc(formatMeters(log.distance_meters))}` : ""}
      ${log.is_valid ? "" : ` • ${esc(attendanceStatusLabel(log.status))}`}
    </span>`;
  }

  function renderStaffAttendanceHistory() {
    if (!E.attendanceHistoryList) return;
    const expanded = Boolean(S.attendanceHistoryExpanded);
    E.attendanceHistoryList.style.display = expanded ? "grid" : "none";
    if (E.attendanceHistoryToggle) {
      E.attendanceHistoryToggle.textContent = expanded ? "Ẩn lịch sử" : "Xem lịch sử";
      E.attendanceHistoryToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
    if (!expanded) return;
    const logs = S.attendanceHistoryLogs || [];
    if (!logs.length) {
      E.attendanceHistoryList.innerHTML = '<div class="task-empty compact">Chưa có lịch sử chấm công.</div>';
      return;
    }
    const grouped = new Map();
    logs.forEach(log => {
      const day = localDate(new Date(log.checked_at));
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day).push(log);
    });
    E.attendanceHistoryList.innerHTML = [...grouped.entries()].map(([day, dayLogs]) => {
      const notes = dayLogs.map(log => String(log.note || "").trim()).filter(Boolean);
      return `
        <div class="staff-attendance-history-row">
          <div class="staff-attendance-history-date">${esc(formatShortDate(day))}</div>
          <div class="staff-attendance-history-events">${dayLogs.map(attendanceLogChip).join("")}</div>
          ${notes.length ? `<div class="attendance-log-note">Ghi chú: ${esc(notes.join(" • "))}</div>` : ""}
        </div>
      `;
    }).join("");
  }

  function renderStaffAttendance() {
    if (!E.attendanceCard) return;
    const canSelfCheck = INTERNAL_ROLES.has(S.profile?.role) && S.profile?.role !== "admin";
    E.attendanceCard.style.display = canSelfCheck ? "grid" : "none";
    if (!canSelfCheck) return;
    const location = S.attendanceLocation || DEFAULT_ATTENDANCE_LOCATION;
    E.attendanceLocation.textContent = `${location.name || "MindUp"} • ${location.address || ""} • hợp lệ dưới ${Number(location.radius_meters || 200)}m`;
    const logs = S.attendanceLogs || [];
    const validIn = logs.find(row => row.check_type === "check_in" && row.is_valid) || logs.find(row => row.check_type === "check_in");
    const validOut = logs.find(row => row.check_type === "check_out" && row.is_valid) || logs.find(row => row.check_type === "check_out");
    const latest = logs[0];
    E.staffCheckInText.textContent = formatAttendanceTime(validIn?.checked_at);
    E.staffCheckOutText.textContent = formatAttendanceTime(validOut?.checked_at);
    E.staffDistanceText.textContent = latest
      ? `${formatMeters(latest.distance_meters)} • ${attendanceStatusLabel(latest.status)}`
      : "Chưa kiểm tra";
    renderStaffAttendanceHistory();
  }

  function attendanceLogUser(log) {
    return log?.user || log?.users || log?.staff || null;
  }

  function staffAttendanceRows() {
    const map = new Map();
    const staffUsers = mergedStaffUsers();
    const adminIds = new Set(staffUsers.filter(user => user?.role === "admin").map(user => String(user.id)));
    if (S.profile?.role === "admin" && S.profile?.id) adminIds.add(String(S.profile.id));
    staffUsers.filter(user => user?.role !== "admin").forEach(user => {
      if (user?.id) map.set(String(user.id), { user, logs: [] });
    });
    (S.attendanceAdminLogs || []).forEach(log => {
      const logUser = attendanceLogUser(log);
      const userId = String(log.user_id || logUser?.id || "");
      if (!userId) return;
      if (adminIds.has(userId) || logUser?.role === "admin") return;
      if (!map.has(userId)) {
        map.set(userId, {
          user: logUser || { id: userId, full_name: "Nhân viên", email: "", role: "" },
          logs: [],
        });
      } else if (logUser) {
        map.get(userId).user = { ...map.get(userId).user, ...logUser };
      }
      map.get(userId).logs.push(log);
    });
    return [...map.values()].sort((a, b) =>
      String(a.user?.full_name || a.user?.email || "").localeCompare(String(b.user?.full_name || b.user?.email || ""), "vi")
    );
  }

  function renderStaffAttendanceAdmin() {
    if (!E.attendanceAdminPanel) return;
    const isAdmin = S.profile?.role === "admin";
    E.attendanceAdminPanel.classList.toggle("show", isAdmin);
    if (!isAdmin) return;
    E.attendanceAdminBody?.classList.toggle("show", S.attendanceAdminExpanded);
    if (E.attendanceAdminToggle) {
      E.attendanceAdminToggle.textContent = S.attendanceAdminExpanded ? "Thu danh sách" : "Mở danh sách";
    }
    if (E.attendanceAdminDate && !E.attendanceAdminDate.value) E.attendanceAdminDate.value = S.attendanceAdminDate || localDate();
    const rows = staffAttendanceRows();
    const withValidIn = rows.filter(row => row.logs.some(log => log.check_type === "check_in" && log.is_valid)).length;
    const withValidOut = rows.filter(row => row.logs.some(log => log.check_type === "check_out" && log.is_valid)).length;
    const noLogs = rows.filter(row => !row.logs.length).length;
    const invalidOnly = rows.filter(row => row.logs.length && !row.logs.some(log => log.is_valid)).length;
    if (E.attendanceAdminSummary) {
      E.attendanceAdminSummary.innerHTML = `
        <div><span>Đã vào hợp lệ</span><strong>${withValidIn}/${rows.length}</strong></div>
        <div><span>Đã ra hợp lệ</span><strong>${withValidOut}/${rows.length}</strong></div>
        <div><span>Chưa chấm công</span><strong>${noLogs}</strong></div>
        <div><span>Ngoài phạm vi</span><strong>${invalidOnly}</strong></div>
      `;
    }
    if (!E.attendanceAdminList) return;
    if (!rows.length) {
      E.attendanceAdminList.innerHTML = '<div class="task-empty compact">Chưa có dữ liệu nhân viên để đối chiếu chấm công.</div>';
      return;
    }
    E.attendanceAdminList.innerHTML = rows.map(row => {
      const logs = row.logs || [];
      const validIn = logs.find(log => log.check_type === "check_in" && log.is_valid) || logs.find(log => log.check_type === "check_in");
      const validOut = logs.find(log => log.check_type === "check_out" && log.is_valid) || logs.find(log => log.check_type === "check_out");
      const latest = logs[0];
      const status = !logs.length
        ? { text: "Chưa chấm công", cls: "muted" }
        : logs.some(log => log.is_valid)
          ? { text: validOut?.is_valid ? "Đã vào/ra" : "Đã chấm công", cls: "ok" }
          : { text: "Chưa hợp lệ", cls: "warn" };
      const note = latest?.note ? ` • Ghi chú: ${esc(latest.note)}` : "";
      return `
        <div class="attendance-admin-row">
          <div>
            <div class="attendance-admin-name">${esc(row.user?.full_name || row.user?.email || "Nhân viên")}</div>
            <div class="attendance-admin-meta">${esc(roleLabel(row.user?.role))}${row.user?.email ? ` • ${esc(row.user.email)}` : ""}</div>
            <div class="attendance-admin-meta">
              Vào: ${esc(formatAttendanceTime(validIn?.checked_at))} • Ra: ${esc(formatAttendanceTime(validOut?.checked_at))}
              ${latest ? ` • Gần nhất: ${esc(formatMeters(latest.distance_meters))} / ${esc(attendanceStatusLabel(latest.status))}` : ""}
              ${note}
            </div>
            ${logs.length ? `<div class="staff-attendance-history-events">${logs.map(attendanceLogChip).join("")}</div>` : ""}
          </div>
          <span class="attendance-admin-badge ${status.cls}">${esc(status.text)}</span>
        </div>
      `;
    }).join("");
  }

  async function loadStaffAttendanceAdmin() {
    if (S.profile?.role !== "admin") return;
    S.attendanceAdminDate = E.attendanceAdminDate?.value || S.attendanceAdminDate || localDate();
    if (E.attendanceAdminDate) E.attendanceAdminDate.value = S.attendanceAdminDate;
    const start = `${S.attendanceAdminDate}T00:00:00+07:00`;
    const end = `${S.attendanceAdminDate}T23:59:59+07:00`;
    let query = sb.from("staff_attendance_logs")
      .select("*,user:users!staff_attendance_logs_user_id_fkey(id,full_name,email,role)")
      .gte("checked_at", start)
      .lte("checked_at", end)
      .order("checked_at", { ascending: false });
    let { data, error } = await query;
    if (error && /relationship|foreign key|could not find/i.test(error.message || "")) {
      const fallback = await sb.from("staff_attendance_logs")
        .select("*")
        .gte("checked_at", start)
        .lte("checked_at", end)
        .order("checked_at", { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }
    if (error) {
      S.attendanceAdminLogs = [];
      if (E.attendanceAdminList) {
        E.attendanceAdminList.innerHTML = `<div class="task-empty compact">Không tải được chấm công nhân viên: ${esc(error.message)}</div>`;
      }
      console.warn("Load staff attendance admin:", error);
      return;
    }
    S.attendanceAdminLogs = data || [];
    renderStaffAttendanceAdmin();
  }

  async function loadStaffAttendance() {
    if (!INTERNAL_ROLES.has(S.profile?.role)) return;
    await loadStaffAttendanceLocation();
    if (S.profile?.role !== "admin") {
      await loadStaffAttendanceToday();
      await loadStaffAttendanceHistory();
      renderStaffAttendance();
    } else {
      renderStaffAttendance();
    }
    await loadStaffAttendanceAdmin();
  }

  async function markStaffAttendance(checkType) {
    setStaffAttendanceBusy(true);
    setStaffAttendanceFeedback("Đang lấy vị trí hiện tại...", "warn");
    try {
      const position = await getStaffPosition();
      const coords = position.coords || {};
      setStaffAttendanceFeedback("Đang gửi dữ liệu chấm công...", "warn");
      const { data, error } = await sb.rpc("mark_staff_attendance", {
        p_check_type: checkType,
        p_latitude: coords.latitude,
        p_longitude: coords.longitude,
        p_accuracy_meters: coords.accuracy,
        p_note: String(E.staffAttendanceNote?.value || "").trim() || null,
        p_device_info: {
          userAgent: navigator.userAgent || "",
          platform: navigator.platform || "",
          language: navigator.language || "",
          screen: window.screen ? `${screen.width}x${screen.height}` : "",
        },
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      const distance = result?.distance_meters;
      const isValid = result?.is_valid;
      setStaffAttendanceFeedback(
        isValid
          ? `Chấm công hợp lệ. Khoảng cách: ${formatMeters(distance)}.`
          : `Chấm công đã ghi nhận nhưng chưa hợp lệ. Khoảng cách: ${formatMeters(distance)}.`,
        isValid ? "ok" : "warn"
      );
      if (isValid && E.staffAttendanceNote) E.staffAttendanceNote.value = "";
      await loadStaffAttendance();
    } catch (error) {
      const message = error?.code === 1
        ? "Bạn cần cho phép chia sẻ vị trí để chấm công."
        : (error?.message || "Không chấm công được. Vui lòng thử lại.");
      setStaffAttendanceFeedback(message, "err");
    } finally {
      setStaffAttendanceBusy(false);
    }
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

  function taskStartDay(item) {
    const task = item.task || {};
    return String(task.available_on || item.created_at || task.created_at || localDate()).slice(0, 10);
  }

  function taskEndDay(item) {
    const task = item.task || {};
    return task.due_at ? localDate(new Date(task.due_at)) : taskStartDay(item);
  }

  function taskCoversDate(item, dateText) {
    const start = taskStartDay(item);
    const end = taskEndDay(item);
    return dateText >= start && dateText <= end;
  }

  function taskOverlapsRange(item, start, end) {
    return taskStartDay(item) <= end && taskEndDay(item) >= start;
  }

  function isLongRunningTask(item) {
    return isManualAssignedTask(item) && taskStartDay(item) < taskEndDay(item);
  }

  function taskDisplayDay(item) {
    if (item.__displayDay) return item.__displayDay;
    const selected = S.selectedDate || localDate();
    if (S.viewMode !== "month" && taskCoversDate(item, selected)) return selected;
    return taskDay(item);
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

  function weekRange(dateText = localDate()) {
    const start = startOfWeek(dateText);
    return { start, end: addDays(start, 6) };
  }

  function activeViewRange() {
    const selected = S.selectedDate || localDate();
    if (S.viewMode === "month") return monthRange(selected);
    if (S.viewMode === "week") return weekRange(selected);
    return { start: selected, end: selected };
  }

  function inRange(day, start, end) {
    return day >= start && day <= end;
  }

  function isReminderTask(item) {
    return REMINDER_TYPES.has(item.task?.task_type);
  }

  function isManualAssignedTask(item) {
    const task = item.task || {};
    return task.task_type === "manual"
      || task.source_type === "manual"
      || task.auto_generated === false
      || task.metadata?.requires_result === true;
  }

  function taskRequirements(item) {
    const raw = item.task?.metadata?.requirements;
    if (!Array.isArray(raw)) return [];
    return raw.map((req, index) => {
      if (typeof req === "string") return { key: `req_${index + 1}`, title: req };
      return { key: req.key || `req_${index + 1}`, title: req.title || req.label || `Mục ${index + 1}` };
    }).filter(req => String(req.title || "").trim());
  }

  function requirementValue(payload, key) {
    const raw = payload?.requirements?.[key];
    if (raw && typeof raw === "object") return String(raw.value || raw.text || raw.note || "").trim();
    return String(raw || "").trim();
  }

  function requirementDone(payload, key) {
    const raw = payload?.requirements?.[key];
    if (raw && typeof raw === "object") return Boolean(raw.done);
    return Boolean(String(raw || "").trim());
  }

  function taskResultPayload(item) {
    const note = String(item.note || "").trim();
    if (!note) return { note: "", requirements: {} };
    try {
      const parsed = JSON.parse(note);
      if (parsed && typeof parsed === "object" && parsed.__task_result_v2) {
        return { note: parsed.note || "", requirements: parsed.requirements || {} };
      }
    } catch (_) {}
    return { note, requirements: {} };
  }

  function requirementProgress(item) {
    const requirements = taskRequirements(item);
    if (!requirements.length) return null;
    const payload = taskResultPayload(item);
    const current = requirements.filter(req => requirementDone(payload, req.key)).length;
    return { current, total: requirements.length, label: "Mục đã nộp" };
  }

  function canDeleteAssignment(item) {
    return S.profile?.role === "admin"
      && !String(item.id || "").startsWith("schedule-fallback:")
      && isManualAssignedTask(item)
      && !item.task?.auto_generated;
  }

  function progressPercent(item) {
    const progress = requirementProgress(item) || item.task?.progress;
    return pct(progress?.current || 0, progress?.total || 0);
  }

  function isAdminActionTask(item) {
    return !isReminderTask(item)
      && (Number(item.task?.progress?.total || 0) > 0 || isManualAssignedTask(item));
  }

  function isProgressComplete(item) {
    const progress = requirementProgress(item) || item.task?.progress;
    return Boolean(progress?.total) && Number(progress.current || 0) >= Number(progress.total || 0);
  }

  function effectiveStatus(item) {
    return isProgressComplete(item) ? "completed" : item.status;
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
    if (effectiveStatus(item) === "completed") return { className: "done", icon: "✓", label: "Đã hoàn thành" };
    return { className: "todo", icon: "✕", label: "Chưa hoàn thành" };
  }

  function isOverdue(item) {
    if (REMINDER_TYPES.has(item.task?.task_type)) return false;
    return effectiveStatus(item) !== "completed" && item.status !== "cancelled"
      && item.task?.due_at && new Date(item.task.due_at) < new Date();
  }

  function visibleAssignments() {
    const selected = S.selectedDate || localDate();
    const { start, end } = activeViewRange();
    return S.assignments.filter(item => {
      if (S.profile?.role === "admin" && S.selectedUserId !== "all" && item.user_id !== S.selectedUserId) return false;
      if (S.profile?.role === "admin" && !isAdminActionTask(item)) return false;
      return taskOverlapsRange(item, start, end);
    }).sort((a, b) => {
      const priority = { urgent: 0, important: 1, normal: 2 };
      const activeLongA = isLongRunningTask(a) && taskCoversDate(a, selected) && effectiveStatus(a) !== "completed";
      const activeLongB = isLongRunningTask(b) && taskCoversDate(b, selected) && effectiveStatus(b) !== "completed";
      const longDiff = Number(activeLongB) - Number(activeLongA);
      if (longDiff) return longDiff;
      if (S.profile?.role === "admin") {
        const progressDiff = progressPercent(b) - progressPercent(a);
        if (progressDiff) return progressDiff;
      }
      const reminderDiff = Number(isReminderTask(a)) - Number(isReminderTask(b));
      if (reminderDiff) return reminderDiff;
      const status = Number(effectiveStatus(a) === "completed") - Number(effectiveStatus(b) === "completed");
      if (status) return status;
      const dayDiff = taskDisplayDay(a).localeCompare(taskDisplayDay(b));
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
    if (S.profile.role === "admin") return [];
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

  function taskProgressHtml(item) {
    const progress = requirementProgress(item) || item.task?.progress;
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

  function recurrenceProgress(item) {
    const task = item.task || {};
    const templateId = task.metadata?.template_id;
    const recurrence = task.metadata?.recurrence;
    if (!templateId || !["daily", "weekly"].includes(recurrence)) return null;
    const selected = S.selectedDate || localDate();
    const start = monthStart(selected);
    const currentMonth = String(selected).slice(0, 7) === String(localDate()).slice(0, 7);
    const end = currentMonth ? localDate() : endOfMonth(selected);
    const rows = S.assignments.filter(row => {
      const rowTask = row.task || {};
      const day = String(rowTask.available_on || "").slice(0, 10);
      return row.user_id === item.user_id
        && String(rowTask.metadata?.template_id || "") === String(templateId)
        && day >= start
        && day <= end;
    });
    const total = rows.length;
    const done = rows.filter(row => effectiveStatus(row) === "completed").length;
    return total ? { current: done, total, label: recurrence === "weekly" ? "Tiến độ tuần trong tháng" : "Tiến độ ngày trong tháng" } : null;
  }

  function recurrenceProgressHtml(item) {
    const progress = recurrenceProgress(item);
    if (!progress) return "";
    const percent = pct(progress.current, progress.total);
    return `
      <div class="task-progress-row" style="margin-top:9px">
        <div class="task-progress-head">
          <span>${esc(progress.label)}</span>
          <span>${Number(progress.current || 0)}/${Number(progress.total || 0)} · ${percent}%</span>
        </div>
        <div class="task-progress-track"><div class="task-progress-fill" style="width:${percent}%"></div></div>
      </div>`;
  }

  function readonlyTaskResultHtml(payload, note, requirements) {
    const submittedRequirements = requirements.map(req => {
      const value = requirementValue(payload, req.key);
      const done = requirementDone(payload, req.key);
      return { ...req, value, done };
    });
    const hasRequirementData = submittedRequirements.some(req => req.value || req.done);
    if (!note && !hasRequirementData) return "";
    return `
      <div class="task-result-box">
        <label>Kết quả đã nộp</label>
        ${note ? `<div class="task-result-note">${linkifyTaskText(note)}</div>` : ""}
        ${requirements.length ? `<div class="task-requirement-list">
          ${submittedRequirements.map(req => `
            <div class="task-requirement-item ${req.done ? "task-requirement-done" : ""}">
              <div class="task-requirement-title">${esc(req.title)} • ${req.done ? "Đã hoàn thành" : "Chưa hoàn thành"}</div>
              <div class="task-result-note">${req.value ? linkifyTaskText(req.value) : "<em>Chưa nhập kết quả</em>"}</div>
            </div>
          `).join("")}
        </div>` : ""}
      </div>`;
  }

  function taskResultHtml(item) {
    if (!isManualAssignedTask(item)) return "";
    const completed = effectiveStatus(item) === "completed";
    const payload = taskResultPayload(item);
    const note = String(payload.note || "").trim();
    const requirements = taskRequirements(item);
    const canEditResult = !(S.profile?.role === "admin" && item.user_id !== S.user?.id);
    if (!canEditResult) {
      return readonlyTaskResultHtml(payload, note, requirements);
    }
    return `
      <div class="task-result-box">
        <label for="taskResult_${esc(item.id)}">${completed ? "Chỉnh sửa kết quả đã nộp" : "Kết quả thực hiện"}</label>
        <textarea class="task-result-input" id="taskResult_${esc(item.id)}" data-result-input="${esc(item.id)}" placeholder="Nhập kết quả công việc...">${esc(note)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
          ${completed ? `<button class="task-btn" type="button" data-cancel-submit="${esc(item.id)}">Hủy nộp</button>` : ""}
          <button class="task-btn success" type="button" data-submit-result="${esc(item.id)}">${completed ? "Lưu chỉnh sửa" : "Nộp"}</button>
        </div>
      </div>`;
  }

  function taskCard(item) {
    const task = item.task || {};
    const completed = effectiveStatus(item) === "completed";
    const overdue = isOverdue(item);
    const state = statusInfo(item);
    const isLongTask = isLongRunningTask(item);
    const deleteButton = canDeleteAssignment(item)
      ? `<button class="task-btn danger" type="button" data-delete-task="${esc(item.id)}" title="Xóa công việc này">Xóa</button>`
      : "";
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
          ${recurrenceProgressHtml(item)}
          <div class="task-meta">
            ${isLongTask ? `<span>Hiện từ ${esc(formatShortDate(taskStartDay(item)))} đến ${esc(formatShortDate(taskEndDay(item)))}</span>` : ""}
            ${S.profile?.role === "admin" && item.assignee ? `<span>Người nhận: ${esc(item.assignee.full_name || item.assignee.email)}</span>` : ""}
            <span>${task.due_at ? `Hạn ${formatDateTime(task.due_at)}` : "Không có thời hạn"}</span>
            <span>${task.auto_generated ? "Hệ thống tự tạo" : "Admin giao"}</span>
            ${task.verification_mode !== "manual" ? "<span>Tự xác minh hoàn thành</span>" : ""}
          </div>
          ${taskResultHtml(item)}
        </div>
        <div class="task-actions">
          <span class="task-status ${state.className}"><span>${state.icon}</span><span>${state.label}</span></span>
          ${task.action_url ? `<button class="task-btn primary" type="button" data-action-url="${esc(task.action_url)}">Mở</button>` : ""}
          ${deleteButton}
        </div>
      </article>`;
  }

  function renderGrouped(rows) {
    const groups = new Map();
    rows.forEach(item => {
      const key = taskDisplayDay(item);
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
    if (S.viewMode === "week") {
      const { start, end } = weekRange(selected);
      return `${formatShortDate(start)} - ${formatShortDate(end)}`;
    }
    return formatShortDate(selected);
  }

  function renderMonthOverview(rows) {
    const completed = rows.filter(item => effectiveStatus(item) === "completed").length;
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

  function renderPeriodOverview(rows) {
    if (S.viewMode === "month") return renderMonthOverview(rows);
    const actionRows = rows.filter(item => !isReminderTask(item));
    const completed = actionRows.filter(item => effectiveStatus(item) === "completed").length;
    const overdue = actionRows.filter(isOverdue).length;
    const remaining = actionRows.filter(item => effectiveStatus(item) !== "completed" && item.status !== "cancelled").length;
    const label = S.viewMode === "week" ? "Tuần này" : "Hôm nay";
    return `
      <section class="task-month-overview">
        <div><span>${esc(label)}</span><strong>${completed}/${actionRows.length}</strong></div>
        <div><span>Còn lại</span><strong>${remaining}</strong></div>
        <div><span>Quá hạn</span><strong>${overdue}</strong></div>
        <div><span>Tỷ lệ</span><strong>${pct(completed, actionRows.length)}%</strong></div>
      </section>`;
  }

  function renderProgressList(rows) {
    const progressRows = rows
      .filter(item => (requirementProgress(item) || item.task?.progress)?.total)
      .sort((a, b) => progressPercent(b) - progressPercent(a))
      .slice(0, 8);
    if (!progressRows.length) return '<div class="task-empty" style="padding:20px">Chưa có công việc nào có tiến độ đo được trong tháng này.</div>';
    return `<div class="task-progress-list">${progressRows.map(item => {
      const progress = requirementProgress(item) || item.task.progress;
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
    const counts = days.map(day => rows.filter(item => !isReminderTask(item) && taskCoversDate(item, day)).length);
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
    const adminOnly = S.profile?.role === "admin";
    const actionRows = adminOnly
      ? rows.filter(isAdminActionTask).sort((a, b) => progressPercent(b) - progressPercent(a))
      : rows.filter(item => !isReminderTask(item));
    const reminderRows = adminOnly ? [] : rows.filter(isReminderTask);
    const completed = actionRows.filter(item => effectiveStatus(item) === "completed").length;
    const overdue = actionRows.filter(isOverdue).length;
    const progressRows = actionRows.filter(item => (requirementProgress(item) || item.task?.progress)?.total);
    const progressDone = progressRows.reduce((sum, item) => sum + Number((requirementProgress(item) || item.task.progress).current || 0), 0);
    const progressTotal = progressRows.reduce((sum, item) => sum + Number((requirementProgress(item) || item.task.progress).total || 0), 0);
    const mainRows = adminOnly ? actionRows.slice(0, 30) : actionRows.filter(item => effectiveStatus(item) !== "completed").slice(0, 12);
    const reminders = reminderRows.slice(0, 12);
    return `
      <section class="task-month-dashboard">
        <section class="task-month-overview">
          <div><span>Cần hoàn thiện</span><strong>${actionRows.filter(item => effectiveStatus(item) !== "completed").length}</strong></div>
          <div><span>Đã hoàn thành</span><strong>${completed}/${actionRows.length}</strong></div>
          <div><span>Quá hạn</span><strong>${overdue}</strong></div>
          <div><span>Tiến độ đo được</span><strong>${progressTotal ? `${progressDone}/${progressTotal}` : "0/0"}</strong></div>
        </section>
        <section class="task-panel">
          <h2>Tiến độ cần hoàn thiện</h2>
          ${renderProgressList(actionRows)}
        </section>
        ${adminOnly ? "" : `<section class="task-panel">
          <h2>Biểu đồ công việc trong tháng</h2>
          ${renderMiniChart(actionRows)}
        </section>`}
        <h2 class="task-month-section-title">${adminOnly ? "Công việc theo tiến độ / nộp thành quả" : "Việc cần xử lý"}</h2>
        ${mainRows.length ? mainRows.map(taskCard).join("") : '<div class="task-empty" style="padding:22px">Không còn công việc cần hoàn thiện trong tháng này.</div>'}
        ${adminOnly ? "" : `<section class="task-reminder-group">
          <h2 class="task-month-section-title">Nhắc nhở trong tháng</h2>
          ${reminders.length ? reminders.map(taskCard).join("") : '<div class="task-empty" style="padding:22px">Không có nhắc nhở trong tháng này.</div>'}
        </section>`}
      </section>`;
  }

  function renderCenterDashboard(rows) {
    const staff = mergedStaffUsers();
    const actionRows = rows.filter(isAdminActionTask);
    const statsByUser = new Map(staff.map(user => [user.id, { user, total: 0, done: 0, overdue: 0 }]));
    actionRows.forEach(item => {
      const id = item.user_id;
      if (!statsByUser.has(id) && item.assignee) statsByUser.set(id, { user: item.assignee, total: 0, done: 0, overdue: 0 });
      const row = statsByUser.get(id);
      if (!row) return;
      row.total += 1;
      if (effectiveStatus(item) === "completed") row.done += 1;
      if (isOverdue(item)) row.overdue += 1;
    });
    const card = row => {
      const user = row.user || {};
      const initials = String(user.full_name || user.email || "NV").trim().split(/\s+/).map(part => part[0]).slice(-2).join("").toUpperCase();
      const percent = pct(row.done, row.total);
      return `<button class="task-staff-card" type="button" data-staff-detail="${esc(user.id)}">
        <span class="task-staff-avatar">${esc(initials || "NV")}</span>
        <span>
          <span class="task-staff-name">${esc(user.full_name || user.email || "Nhân viên")}</span>
          <span class="task-staff-role">${esc(roleLabel(user.role))}</span>
          <span class="task-staff-score"><span>${row.done}/${row.total} việc</span><span>${percent}%</span><span>Quá hạn ${row.overdue}</span></span>
        </span>
      </button>`;
    };
    const teachers = [...statsByUser.values()].filter(row => row.user?.role === "teacher");
    const others = [...statsByUser.values()].filter(row => row.user?.role !== "teacher");
    const section = (title, list) => `<section class="task-staff-section"><h2>${esc(title)}</h2><div class="task-staff-grid">${list.length ? list.map(card).join("") : '<div class="task-empty compact">Chưa có nhân viên.</div>'}</div></section>`;
    return `<section class="task-staff-wrap">
      ${section("Giáo viên", teachers)}
      ${section("Nhân viên khác", others)}
    </section>`;
  }

  function emptyLabel() {
    if (S.viewMode === "month") return "tháng này";
    if (S.viewMode === "week") return "tuần này";
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
    E.adminFilter.classList.remove("show");
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
    renderStaffFilter();
    renderStaffAttendanceAdmin();
    syncDatebar();
    const rows = visibleAssignments();
    if (S.profile?.role === "admin" && S.selectedUserId === "all") {
      E.list.innerHTML = `<section class="task-admin-layout">${renderAdminTemplatePanel()}${renderCenterDashboard(rows)}</section>`;
      return;
    }
    const selectedStaff = S.profile?.role === "admin" && S.selectedUserId !== "all"
      ? mergedStaffUsers().find(user => String(user.id) === String(S.selectedUserId))
      : null;
    const detailHead = selectedStaff ? `<section class="task-staff-detail-head">
      <div><strong>${esc(selectedStaff.full_name || selectedStaff.email || "Nhân viên")}</strong><div style="color:var(--ink-light);font-size:.78rem;margin-top:3px">${esc(roleLabel(selectedStaff.role))} • ${esc(viewTitle())}</div></div>
      <button class="task-btn" type="button" data-staff-detail="all">← Quay lại danh sách nhân viên</button>
    </section>` : "";
    const overview = renderPeriodOverview(rows);
    if (S.viewMode === "month" && rows.length) {
      E.list.innerHTML = detailHead + renderMonthDashboard(rows);
      resizeResultInputs();
      return;
    }
    if (!rows.length) {
      E.list.innerHTML = detailHead + `<div class="task-empty">Không có công việc trong ${esc(emptyLabel())}.</div>`;
      return;
    }
    E.list.innerHTML = rows.length
      ? detailHead + overview + renderGrouped(rows)
      : `<div class="task-empty">Không có công việc trong ngày ${esc(formatShortDate(S.selectedDate || localDate()))}.</div>`;
    resizeResultInputs();
  }

  function weekdayLabel(value) {
    const labels = { 1: "Thứ 2", 2: "Thứ 3", 3: "Thứ 4", 4: "Thứ 5", 5: "Thứ 6", 6: "Thứ 7", 7: "Chủ nhật" };
    return labels[Number(value)] || "Hằng tuần";
  }

  function templateAssigneeNames(template) {
    const ids = new Set((template.assignee_ids || []).map(String));
    const users = (S.users || []).filter(user => ids.has(String(user.id)));
    if (!users.length) return `${ids.size || 0} người nhận`;
    const names = users.slice(0, 3).map(user => user.full_name || user.email || "Nhân viên");
    const more = users.length > 3 ? ` +${users.length - 3}` : "";
    return names.join(", ") + more;
  }

  function renderAdminTemplatePanel() {
    if (S.profile?.role !== "admin") return "";
    const templates = (S.taskTemplates || []).filter(template => !isDeprecatedSocialTask(template));
    const rows = templates.length ? templates.map(template => {
      const requirements = Array.isArray(template.requirements) ? template.requirements : [];
      const recurrence = template.recurrence === "weekly" ? `Hằng tuần • ${weekdayLabel(template.weekday)}` : "Hằng ngày";
      return `
        <div class="task-template-row">
          <div>
            <div class="task-template-title">${esc(template.title)}</div>
            <div class="task-template-meta">${esc(recurrence)} • Bắt đầu ${esc(formatShortDate(template.start_on || localDate()))} • ${esc(templateAssigneeNames(template))}</div>
            ${template.description ? `<div class="task-template-desc">${esc(template.description)}</div>` : ""}
            <div class="task-template-meta">${requirements.length ? `${requirements.length} mục cần nộp` : "Không có mục nộp kết quả"}${template.action_url ? ` • ${esc(template.action_url)}` : ""}</div>
          </div>
          <div class="task-template-actions">
            <button class="task-btn" type="button" data-edit-template="${esc(template.id)}">Sửa</button>
            <button class="task-btn danger" type="button" data-delete-template="${esc(template.id)}">Xóa</button>
          </div>
        </div>
      `;
    }).join("") : '<div class="task-empty compact">Chưa có công việc tự động hằng ngày/hằng tuần nào.</div>';
    return `
      <section class="task-template-panel">
        <div class="task-template-head">
          <div>
            <h2>Công việc tự động đã tạo</h2>
            <p>Danh sách các công việc hằng ngày/hằng tuần do admin tạo. Có thể sửa hoặc xóa từng mẫu.</p>
          </div>
          <button class="task-btn primary" type="button" data-open-template-create="true">Tạo công việc tự động</button>
        </div>
        <div class="task-template-list">${rows}</div>
      </section>
    `;
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
    if (S.viewMode === "week") return addDays(selected, amount * 7);
    return addDays(selected, amount);
  }

  async function loadInternalUsers() {
    const userMap = new Map((S.users || []).filter(user => user?.id).map(user => [user.id, user]));
    const loadErrors = [];

    const mergeUsers = rows => {
      (rows || []).forEach(user => {
        if (user?.id && INTERNAL_ROLES.has(user.role)) userMap.set(user.id, user);
      });
    };

    const rpcRes = await sb.rpc("list_task_staff_users");
    if (rpcRes.error && !/Could not find the function|schema cache|PGRST202/i.test(rpcRes.error.message || "")) {
      loadErrors.push({ source: "rpc:list_task_staff_users", error: rpcRes.error });
    }
    mergeUsers(rpcRes.data);

    const staffRes = await sb.from("users")
      .select("id,full_name,email,role")
      .in("role", ["admin", "teacher", "assistant"])
      .order("full_name");
    if (staffRes.error) loadErrors.push({ source: "users:internal_roles", error: staffRes.error });
    mergeUsers(staffRes.data);

    const allStaffRes = await sb.from("users")
      .select("id,full_name,email,role")
      .order("full_name");
    if (allStaffRes.error) loadErrors.push({ source: "users:all_staff", error: allStaffRes.error });
    mergeUsers(allStaffRes.data);

    if (!userMap.size) {
      const allRes = await sb.from("users")
        .select("id,full_name,email,role")
        .order("full_name");
      if (allRes.error) loadErrors.push({ source: "users:all", error: allRes.error });
      mergeUsers(allRes.data);
    }

    if (!userMap.size) {
      const teacherRes = await sb.from("class_teachers")
        .select("teacher:users!class_teachers_teacher_id_fkey(id,full_name,email,role)");
      if (teacherRes.error) loadErrors.push({ source: "class_teachers", error: teacherRes.error });
      mergeUsers((teacherRes.data || []).map(row => row.teacher));
    }

    (S.assignments || []).forEach(item => {
      const user = item.assignee;
      if (user?.id && INTERNAL_ROLES.has(user.role)) userMap.set(user.id, user);
    });

    if (S.profile?.id && INTERNAL_ROLES.has(S.profile.role)) {
      userMap.set(S.profile.id, {
        id: S.profile.id,
        full_name: S.profile.full_name,
        email: S.user?.email || "",
        role: S.profile.role,
      });
    }

    if (!userMap.size && loadErrors.length && !taskStaffLoadWarned) {
      taskStaffLoadWarned = true;
      console.warn("Load task staff users failed:", loadErrors);
    }

    S.users = [...userMap.values()].sort((a, b) =>
      String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""), "vi")
    );
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

  function pickEffectiveSchedulesForDate(schedules, dateText) {
    const eligible = (schedules || []).filter(item => String(item.effective_from || "2000-01-01").slice(0, 10) <= dateText);
    if (!eligible.length) return [];
    const maxEffective = eligible.reduce((max, item) => {
      const value = String(item.effective_from || "2000-01-01").slice(0, 10);
      return value > max ? value : max;
    }, "2000-01-01");
    return eligible.filter(item => String(item.effective_from || "2000-01-01").slice(0, 10) === maxEffective);
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
        || sameSession.some(item => Number(item.weekday || 0) === Number(selected.weekday || 0));
    });
  }

  function selectedScheduleIdsForDate(historyRows, dateText) {
    if (!Array.isArray(historyRows) || !historyRows.length) return null;
    const eligible = historyRows.filter(row => String(row.effective_from || "2000-01-01").slice(0, 10) <= dateText);
    if (!eligible.length) return null;
    const maxEffective = eligible.reduce((max, row) => {
      const value = String(row.effective_from || "2000-01-01").slice(0, 10);
      return value > max ? value : max;
    }, "2000-01-01");
    const ids = new Set(
      eligible
        .filter(row => String(row.effective_from || "2000-01-01").slice(0, 10) === maxEffective)
        .map(row => Number(row.schedule_id))
        .filter(Boolean)
    );
    return ids.size ? ids : null;
  }

  async function enrichTaskProgress(assignments) {
    const rows = (assignments || []).filter(item => {
      const task = item.task || {};
      return task.metadata && task.task_type === "session_evaluation";
    });
    if (!rows.length) return;

    const classIds = uniq(rows.map(item => item.task?.metadata?.class_id));
    const sessionIds = uniq(rows.map(item => item.task?.metadata?.session_id));

    const [studentsRes, evaluationsRes, sessionsRes, schedulesRes, choicesRes] = await Promise.all([
      classIds.length
        ? sb.from("class_students").select("class_id,student_id,joined_at,left_at").in("class_id", classIds)
        : Promise.resolve({ data: [], error: null }),
      sessionIds.length
        ? sb.from("session_student_evaluations").select("class_session_id,student_id,state").in("class_session_id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
      sessionIds.length
        ? sb.from("class_sessions").select("id,class_id,session_date").in("id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
      classIds.length
        ? sb.from("class_schedules").select("id,class_id,session_no,weekday,start_time,end_time,effective_from").in("class_id", classIds)
        : Promise.resolve({ data: [], error: null }),
      classIds.length
        ? sb.from("class_student_schedules").select("class_id,student_id,schedule_id,effective_from").in("class_id", classIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (studentsRes.error || evaluationsRes.error || sessionsRes.error || schedulesRes.error || choicesRes.error) {
      console.warn("Task progress:", studentsRes.error || evaluationsRes.error || sessionsRes.error || schedulesRes.error || choicesRes.error);
      return;
    }

    const sessionById = new Map((sessionsRes.data || []).map(row => [String(row.id), row]));
    const studentsByClass = new Map();
    (studentsRes.data || []).forEach(row => {
      if (!studentsByClass.has(row.class_id)) studentsByClass.set(row.class_id, []);
      studentsByClass.get(row.class_id).push(row);
    });
    const schedulesByClass = new Map();
    (schedulesRes.data || []).forEach(row => {
      if (!schedulesByClass.has(row.class_id)) schedulesByClass.set(row.class_id, []);
      schedulesByClass.get(row.class_id).push(row);
    });
    const selectedByClassStudent = new Map();
    (choicesRes.data || []).forEach(row => {
      const key = `${row.class_id}:${row.student_id}`;
      if (!selectedByClassStudent.has(key)) selectedByClassStudent.set(key, []);
      selectedByClassStudent.get(key).push(row);
    });
    const evaluationMap = new Map();
    (evaluationsRes.data || []).forEach(row => {
      if (row.state !== "sent") return;
      const key = String(row.class_session_id);
      if (!evaluationMap.has(key)) evaluationMap.set(key, new Set());
      evaluationMap.get(key).add(row.student_id);
    });
    const scheduledStudentIdsForSession = (classId, dateText) => {
      const classSchedules = schedulesByClass.get(classId) || [];
      const daySchedules = pickEffectiveSchedulesForDate(classSchedules, dateText)
        .filter(schedule => Number(schedule.weekday) === weekdayOf(dateText));
      if (!daySchedules.length) return [];
      return (studentsByClass.get(classId) || []).filter(row => {
        const joined = row.joined_at ? String(row.joined_at).slice(0, 10) : "0000-00-00";
        const left = row.left_at ? String(row.left_at).slice(0, 10) : "9999-99-99";
        if (joined > dateText || left < dateText) return false;
        const selected = selectedScheduleIdsForDate(selectedByClassStudent.get(`${classId}:${row.student_id}`), dateText);
        return selectedScheduleMatchesDay(selected, daySchedules, classSchedules);
      }).map(row => row.student_id);
    };

    rows.forEach(item => {
      const task = item.task || {};
      const meta = task.metadata || {};
      const session = sessionById.get(String(meta.session_id || ""));
      const classId = meta.class_id || session?.class_id;
      const dateText = String(meta.session_date || session?.session_date || task.available_on || taskDay(item)).slice(0, 10);
      if (!classId || !dateText) return;
      const scheduledIds = scheduledStudentIdsForSession(classId, dateText);
      const total = scheduledIds.length;
      if (!total) return;
      if (task.task_type === "session_evaluation" && meta.session_id) {
        const sentIds = evaluationMap.get(String(meta.session_id)) || new Set();
        const current = scheduledIds.filter(studentId => sentIds.has(studentId)).length;
        task.progress = { current, total, label: "Đã đánh giá học sinh" };
      }
    });
  }

  async function syncProgressCompletedAssignments() {
    const rows = S.assignments.filter(item =>
      isProgressComplete(item)
      && item.status !== "completed"
      && item.status !== "cancelled"
      && !String(item.id || "").startsWith("schedule-fallback:")
    );
    if (!rows.length) return;
    await Promise.all(rows.map(async item => {
      const { error } = await sb.rpc("set_task_assignment_status", {
        p_assignment_id: item.id,
        p_status: "completed",
        p_note: item.note || "Tự hoàn thành khi tiến độ đạt 100%",
      });
      if (!error) item.status = "completed";
      else console.warn("Sync completed progress task:", error);
    }));
  }

  async function enrichTaskResultNotes(assignments) {
    const ids = (assignments || [])
      .filter(item => !item.note && !String(item.id || "").startsWith("schedule-fallback:"))
      .map(item => item.id)
      .filter(Boolean);
    if (!ids.length) return;
    const { data, error } = await sb.from("task_events")
      .select("assignment_id,note,to_status,created_at")
      .in("assignment_id", ids)
      .not("note", "is", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("Load task result notes:", error);
      return;
    }
    const noteMap = new Map();
    (data || []).forEach(row => {
      const note = String(row.note || "").trim();
      if (note && !noteMap.has(row.assignment_id)) noteMap.set(row.assignment_id, note);
    });
    (assignments || []).forEach(item => {
      if (!item.note && noteMap.has(item.id)) item.note = noteMap.get(item.id);
    });
  }

  async function loadTasks({ refresh = false } = {}) {
    E.list.innerHTML = '<div class="task-empty">Đang tổng hợp công việc...</div>';
    if (S.profile?.role) {
      const activeRange = activeViewRange();
      const start = activeRange.start;
      const end = S.viewMode === "today" ? addDays(start, 31) : activeRange.end;
      const { error: templateError } = await sb.rpc("materialize_admin_task_templates", {
        p_from: start,
        p_to: end,
      });
      if (templateError && !isMissingRpcError(templateError)) console.warn("Task template materialize:", templateError);
    }
    if (refresh) {
      const { error: refreshError } = await sb.rpc("refresh_daily_tasks", {
        p_user_id: S.profile.role === "admin" ? null : S.user.id,
      });
      if (refreshError) console.warn("Task refresh:", refreshError);
    }
    if (refresh) {
      await sb.rpc("sync_verified_task_statuses", {
        p_user_id: S.profile.role === "admin" ? null : S.user.id,
      });
    }
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
      && !isDeprecatedSocialTask(item)
    );
    await enrichTaskResultNotes(assignments);
    const scheduleFallbacks = (await loadScheduleFallbackTasks(assignments)).filter(item => !isDeprecatedSocialTask(item));
    S.assignments = [...assignments, ...scheduleFallbacks].filter(item => !isDeprecatedSocialTask(item));
    if (S.profile.role === "admin") await loadInternalUsers();
    await loadTaskTemplates();
    await enrichTaskProgress(S.assignments);
    await syncProgressCompletedAssignments();
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

  function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 260)}px`;
  }

  function resizeResultInputs() {
    enhanceRequirementInputs();
    document.querySelectorAll(".task-result-input").forEach(autoResizeTextarea);
  }

  function enhanceRequirementInputs() {
    document.querySelectorAll(".task-card[data-task]").forEach(card => {
      const id = card.dataset.task;
      if (card.querySelector(".task-requirement-list")) return;
      const item = S.assignments.find(row => String(row.id) === String(id));
      const requirements = taskRequirements(item);
      if (!item || !requirements.length) return;
      const noteInput = [...card.querySelectorAll("[data-result-input]")]
        .find(element => element.dataset.resultInput === id);
      const resultBox = card.querySelector(".task-result-box");
      if (!resultBox) return;
      const payload = taskResultPayload(item);
      const list = document.createElement("div");
      list.className = "task-requirement-list";
      list.innerHTML = requirements.map(req => `
        <div class="task-requirement-item ${requirementDone(payload, req.key) ? "task-requirement-done" : ""}">
          <div class="task-requirement-title">${esc(req.title)}</div>
          <textarea class="task-result-input" data-requirement-input="${esc(id)}" data-requirement-key="${esc(req.key)}" placeholder="Nhập kết quả cho mục này...">${esc(requirementValue(payload, req.key))}</textarea>
          <div style="display:flex;justify-content:flex-end">
            <button class="task-btn ${requirementDone(payload, req.key) ? "success" : ""}" type="button" data-complete-requirement="${esc(id)}" data-requirement-key="${esc(req.key)}">
              ${requirementDone(payload, req.key) ? "Đã hoàn thành mục" : "Hoàn thành mục"}
            </button>
          </div>
        </div>
      `).join("");
      if (noteInput) resultBox.insertBefore(list, noteInput);
      else resultBox.appendChild(list);
    });
  }

  async function submitTaskResult(id) {
    const input = [...document.querySelectorAll("[data-result-input]")].find(element => element.dataset.resultInput === id);
    const note = String(input?.value || "").trim();
    const item = S.assignments.find(row => String(row.id) === String(id));
    const requirements = taskRequirements(item);
    const payload = collectTaskResultPayload(id, item, note);
    const missingRequirement = requirements.find(req => !requirementDone(payload, req.key));
    if (missingRequirement) return alert(`Hãy bấm hoàn thành mục: ${missingRequirement.title}`);
    const storedNote = requirements.length
      ? JSON.stringify({ __task_result_v2: true, note, requirements: payload.requirements })
      : note;
    if (!requirements.length && !note) {
      input?.focus();
      return alert("Hãy nhập kết quả công việc trước khi nộp.");
    }
    const { error } = await sb.rpc("set_task_assignment_status", {
      p_assignment_id: id,
      p_status: "completed",
      p_note: storedNote,
    });
    if (error) return alert(error.message);
    toast("Đã lưu kết quả công việc.");
    await loadTasks();
  }

  function collectTaskResultPayload(id, item, noteText = null) {
    const payload = taskResultPayload(item);
    const noteInput = [...document.querySelectorAll("[data-result-input]")].find(element => element.dataset.resultInput === id);
    const note = noteText ?? String(noteInput?.value || "").trim();
    const requirements = {};
    taskRequirements(item).forEach(req => {
      const reqInput = [...document.querySelectorAll("[data-requirement-input]")]
        .filter(element => element.dataset.requirementInput === id)
        .find(element => element.dataset.requirementKey === req.key);
      const oldRaw = payload.requirements?.[req.key];
      const oldDone = requirementDone(payload, req.key);
      requirements[req.key] = {
        value: String(reqInput?.value || requirementValue(payload, req.key) || "").trim(),
        done: oldDone,
      };
      if (oldRaw && typeof oldRaw === "object" && oldRaw.done === false) requirements[req.key].done = false;
    });
    return { note, requirements };
  }

  async function completeRequirement(id, key) {
    const item = S.assignments.find(row => String(row.id) === String(id));
    if (!item) return;
    const payload = collectTaskResultPayload(id, item);
    const req = taskRequirements(item).find(row => row.key === key);
    if (!req) return;
    const value = String(payload.requirements?.[key]?.value || "").trim();
    if (!value) return alert(`Hãy nhập kết quả cho mục: ${req.title}`);
    payload.requirements[key] = { value, done: true };
    const requirements = taskRequirements(item);
    const allDone = requirements.every(row => Boolean(payload.requirements?.[row.key]?.done));
    const storedNote = JSON.stringify({ __task_result_v2: true, note: payload.note || "", requirements: payload.requirements });
    const { error } = await sb.rpc("set_task_assignment_status", {
      p_assignment_id: id,
      p_status: allDone ? "completed" : "open",
      p_note: storedNote,
    });
    if (error) return alert(error.message);
    toast(allDone ? "Đã hoàn thành toàn bộ công việc." : "Đã lưu kết quả mục này.");
    await loadTasks();
  }

  async function cancelTaskSubmission(id) {
    const ok = confirm("Hủy nộp công việc này và chuyển về trạng thái Chưa hoàn thành?");
    if (!ok) return;
    const item = S.assignments.find(row => String(row.id) === String(id));
    const payload = taskResultPayload(item);
    const resetRequirements = {};
    taskRequirements(item).forEach(req => {
      resetRequirements[req.key] = {
        value: requirementValue(payload, req.key),
        done: false,
      };
    });
    const preservedNote = taskRequirements(item).length
      ? JSON.stringify({ __task_result_v2: true, note: payload.note || "", requirements: resetRequirements })
      : (item?.note || "");
    const { error } = await sb.rpc("set_task_assignment_status", {
      p_assignment_id: id,
      p_status: "open",
      p_note: preservedNote,
    });
    if (error) return alert(error.message);
    toast("Đã hủy nộp. Nội dung kết quả vẫn được giữ nguyên.");
    await loadTasks();
  }

  async function deleteManualTaskAssignment(id) {
    const item = S.assignments.find(row => String(row.id) === String(id));
    if (!item || !canDeleteAssignment(item)) return;
    const assigneeName = item.assignee?.full_name || item.assignee?.email || "người nhận này";
    const ok = confirm(`Xóa công việc "${item.task?.title || "đã giao"}" của ${assigneeName}?`);
    if (!ok) return;

    const taskId = item.task_id || item.task?.id || null;
    const { error } = await sb.from("task_assignments").delete().eq("id", id);
    if (error) return alert(error.message);

    if (taskId) {
      const { count } = await sb
        .from("task_assignments")
        .select("id", { count: "exact", head: true })
        .eq("task_id", taskId);
      if (!count) {
        await sb.from("daily_tasks").delete().eq("id", taskId).eq("source_type", "manual");
      }
    }

    toast("Đã xóa công việc.");
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

  function selectedManualUsers() {
    const ids = new Set([...S.manualAssigneeIds].map(String));
    return (S.users || []).filter(user => ids.has(String(user.id)));
  }

  function renderPickedAssignees() {
    const picked = byId("manualTaskPicked");
    if (!picked) return;
    const users = selectedManualUsers();
    picked.innerHTML = users.length
      ? users.map(user => `<span class="assignee-chip">${esc(user.full_name || user.email)}<button type="button" data-remove-assignee="${esc(user.id)}" title="Bỏ người nhận" aria-label="Bỏ người nhận ${esc(user.full_name || user.email)}">×</button></span>`).join("")
      : '<span style="font-size:.78rem;color:var(--ink-light)">Chưa chọn người nhận nào</span>';
  }

  function renderAssigneeSelect() {
    const select = byId("manualTaskAssigneeSelect");
    if (!select) return;
    if (!S.users.length) {
      select.innerHTML = '<option value="">Không tải được danh sách nhân viên</option>';
      select.value = "";
      return;
    }
    const options = (S.users || []).map(user =>
      `<option value="${esc(user.id)}">${esc(user.full_name || user.email)} - ${esc(roleLabel(user.role))}${user.email ? ` - ${esc(user.email)}` : ""}</option>`
    ).join("");
    select.innerHTML = `<option value="">Chọn nhân viên để thêm</option>${options}`;
    select.value = "";
  }

  function addManualAssignee(userId) {
    if (!userId) return;
    S.manualAssigneeIds.add(String(userId));
    renderAssignees();
  }

  function removeManualAssignee(userId) {
    S.manualAssigneeIds.delete(String(userId));
    renderAssignees();
  }

  function renderAssignees() {
    const assigneeBox = byId("manualTaskAssignees");
    if (!assigneeBox) return;
    const query = (byId("manualTaskAssigneeSearch")?.value || "").trim().toLowerCase();
    const rows = S.users.filter(user =>
      !query || `${user.full_name || ""} ${user.email || ""}`.toLowerCase().includes(query)
    );
    assigneeBox.innerHTML = rows.length ? rows.map(user => `
      <label class="assignee-row ${S.manualAssigneeIds.has(String(user.id)) ? "selected" : ""}">
        <input type="checkbox" value="${esc(user.id)}" ${S.manualAssigneeIds.has(String(user.id)) ? "checked" : ""}>
        <span><strong>${esc(user.full_name || user.email)}</strong><br><small>${esc(user.role)} · ${esc(user.email)}</small></span>
      </label>`).join("") : `<div style="padding:8px;color:var(--ink-light);font-size:.82rem">${S.users.length ? "Không tìm thấy nhân viên phù hợp." : "Không tải được danh sách nhân viên. Có thể cần kiểm tra quyền đọc bảng users."}</div>`;
    renderPickedAssignees();
  }

  function setCreateModalMode(mode) {
    const isEdit = mode === "edit";
    const title = byId("taskCreateModalTitle");
    const save = byId("manualTaskSave");
    if (title) title.textContent = isEdit ? "Sửa công việc tự động" : "Giao việc";
    if (save) save.textContent = isEdit ? "Lưu thay đổi" : "Giao việc";
  }

  function fillManualTaskForm(template = null) {
    byId("manualTaskTitle").value = template?.title || "";
    byId("manualTaskDescription").value = template?.description || "";
    byId("manualTaskPriority").value = template?.priority || "normal";
    byId("manualTaskAvailableOn").value = template?.start_on || localDate();
    if (byId("manualTaskDueOn")) byId("manualTaskDueOn").value = "";
    byId("manualTaskActionUrl").value = template?.action_url || "";
    byId("manualTaskRecurrence").value = template?.recurrence || "once";
    byId("manualTaskWeekday").value = String(template?.weekday || weekdayOf(localDate()));
    const requirements = Array.isArray(template?.requirements) ? template.requirements : [];
    byId("manualTaskRequirements").value = requirements.map(req => req.title || req.name || "").filter(Boolean).join("\n");
    S.manualAssigneeIds = new Set((template?.assignee_ids || []).map(String));
    if (byId("manualTaskAssigneeSearch")) byId("manualTaskAssigneeSearch").value = "";
    if (byId("manualTaskAssigneeSelect")) byId("manualTaskAssigneeSelect").value = "";
  }

  async function openCreateModal(defaultRecurrence = "once") {
    await loadInternalUsers();
    S.editingTemplateId = null;
    setCreateModalMode("create");
    fillManualTaskForm(null);
    if (byId("manualTaskRecurrence")) byId("manualTaskRecurrence").value = defaultRecurrence;
    renderAssigneeSelect();
    renderAssignees();
    openModal("taskCreateModal");
  }

  async function openEditTemplateModal(templateId) {
    const template = (S.taskTemplates || []).find(item => String(item.id) === String(templateId));
    if (!template) return alert("Không tìm thấy công việc tự động cần sửa.");
    await loadInternalUsers();
    S.editingTemplateId = template.id;
    setCreateModalMode("edit");
    fillManualTaskForm(template);
    renderAssigneeSelect();
    renderAssignees();
    openModal("taskCreateModal");
  }

  async function loadTaskTemplates() {
    if (S.profile?.role !== "admin") {
      S.taskTemplates = [];
      return;
    }
    const { data, error } = await sb
      .from("task_templates")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("Không tải được danh sách công việc tự động:", error);
      S.taskTemplates = [];
      return;
    }
    S.taskTemplates = (data || []).filter(template => !isDeprecatedSocialTask(template));
  }

  async function deleteTemplateFutureGeneratedTasks(templateId) {
    const today = localDate();
    const { data: tasks } = await sb
      .from("daily_tasks")
      .select("id")
      .eq("source_type", "task_template")
      .eq("source_id", String(templateId))
      .gte("available_on", today);
    const ids = (tasks || []).map(item => item.id).filter(Boolean);
    if (ids.length) {
      await sb.from("task_events").delete().in("task_id", ids);
      await sb.from("task_assignments").delete().in("task_id", ids);
      await sb.from("daily_tasks").delete().in("id", ids);
    }
  }

  async function deleteTaskTemplate(templateId) {
    const template = (S.taskTemplates || []).find(item => String(item.id) === String(templateId));
    if (!template) return;
    if (!confirm(`Xóa công việc tự động "${template.title}"?\n\nCác công việc đã sinh trong tương lai cũng sẽ được xóa.`)) return;
    await deleteTemplateFutureGeneratedTasks(templateId);
    const { error } = await sb.from("task_templates").delete().eq("id", templateId);
    if (error) return alert(error.message);
    toast("Đã xóa công việc tự động.");
    await loadTasks();
  }

  async function saveManualTask() {
    const assigneeBox = byId("manualTaskAssignees");
    const checkedIds = assigneeBox
      ? [...assigneeBox.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value)
      : [];
    checkedIds.forEach(id => S.manualAssigneeIds.add(id));
    const userIds = [...S.manualAssigneeIds];
    const title = (byId("manualTaskTitle")?.value || "").trim();
    if (!title || !userIds.length) return alert("Hãy nhập tiêu đề và chọn ít nhất một người nhận.");
    const availableOn = byId("manualTaskAvailableOn")?.value || localDate();
    const recurrence = byId("manualTaskRecurrence")?.value || "once";
    const weekday = Number(byId("manualTaskWeekday")?.value || 1);
    const dueOn = byId("manualTaskDueOn")?.value || availableOn;
    const dueValue = recurrence === "once" ? endOfDayIso(dueOn) : null;
    const requirements = String(byId("manualTaskRequirements")?.value || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map((title, index) => ({ key: `req_${index + 1}`, title }));
    if (S.editingTemplateId) {
      if (!["daily", "weekly"].includes(recurrence)) {
        return alert("Chỉ công việc hằng ngày/hằng tuần mới nằm trong danh sách công việc tự động để sửa.");
      }
      const payload = {
        title,
        description: (byId("manualTaskDescription")?.value || "").trim(),
        priority: byId("manualTaskPriority")?.value || "normal",
        recurrence,
        weekday: recurrence === "weekly" ? weekday : null,
        start_on: availableOn,
        action_url: (byId("manualTaskActionUrl")?.value || "").trim() || null,
        requirements,
        assignee_ids: userIds,
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from("task_templates").update(payload).eq("id", S.editingTemplateId);
      if (error) return alert(error.message);
      await deleteTemplateFutureGeneratedTasks(S.editingTemplateId);
      const { error: materializeError } = await sb.rpc("materialize_admin_task_templates", {
        p_from: availableOn,
        p_to: addDays(availableOn, recurrence === "weekly" ? 35 : 14),
      });
      if (materializeError && !isMissingRpcError(materializeError)) console.warn("Task template materialize:", materializeError);
      closeModal("taskCreateModal");
      S.editingTemplateId = null;
      fillManualTaskForm(null);
      renderAssignees();
      toast("Đã cập nhật công việc tự động.");
      await loadTasks();
      return;
    }
    const { data: taskId, error } = await sb.rpc("create_manual_task", {
      p_title: title,
      p_description: (byId("manualTaskDescription")?.value || "").trim(),
      p_priority: byId("manualTaskPriority")?.value || "normal",
      p_available_on: availableOn,
      p_due_at: dueValue,
      p_action_url: (byId("manualTaskActionUrl")?.value || "").trim(),
      p_user_ids: userIds,
      p_requirements: requirements,
      p_recurrence: recurrence,
      p_weekday: weekday,
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
    ["manualTaskTitle", "manualTaskDescription", "manualTaskAvailableOn", "manualTaskDueOn", "manualTaskActionUrl", "manualTaskRequirements"].forEach(id => {
      const input = byId(id);
      if (input) input.value = "";
    });
    if (byId("manualTaskRecurrence")) byId("manualTaskRecurrence").value = "once";
    S.editingTemplateId = null;
    setCreateModalMode("create");
    S.manualAssigneeIds = new Set();
    if (byId("manualTaskAssigneeSearch")) byId("manualTaskAssigneeSearch").value = "";
    if (byId("manualTaskAssigneeSelect")) byId("manualTaskAssigneeSelect").value = "";
    renderAssignees();
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

  function snapshotAssignments() {
    try {
      return JSON.parse(JSON.stringify(S.assignments || []));
    } catch (_) {
      return [...(S.assignments || [])];
    }
  }

  function restoreAssignments(rows) {
    S.assignments = rows || [];
    render();
  }

  function updateAssignmentLocal(id, patch = {}) {
    const item = S.assignments.find(row => String(row.id) === String(id));
    if (!item) return null;
    Object.assign(item, patch);
    return item;
  }

  function findTaskButton(attr, value, extraAttr = null, extraValue = null) {
    return [...document.querySelectorAll("button")].find(button =>
      String(button.dataset?.[attr] || "") === String(value)
      && (!extraAttr || String(button.dataset?.[extraAttr] || "") === String(extraValue))
    );
  }

  async function runTaskOptimistic(options = {}) {
    if (window.MindupLiveUI?.optimistic) return window.MindupLiveUI.optimistic(options);
    const { apply, save, rollback, success, error, busyElement, busyText } = options;
    const originalText = busyElement?.textContent || "";
    if (busyElement) {
      busyElement.disabled = true;
      busyElement.setAttribute("aria-busy", "true");
      if (busyText) busyElement.textContent = busyText;
    }
    try {
      apply?.();
      const result = await save?.();
      if (result?.error) throw result.error;
      success?.(result);
      return result;
    } catch (err) {
      rollback?.(err);
      if (typeof error === "function") error(err);
      else alert(err?.message || err || "Không lưu được thay đổi.");
      return null;
    } finally {
      if (busyElement) {
        busyElement.disabled = false;
        busyElement.removeAttribute("aria-busy");
        if (originalText) busyElement.textContent = originalText;
      }
    }
  }

  async function setStatus(id, status) {
    const item = S.assignments.find(row => String(row.id) === String(id));
    if (!item) return;
    const previous = snapshotAssignments();
    const busyElement = findTaskButton("status", id) || findTaskButton("cancelSubmit", id);
    await runTaskOptimistic({
      busyElement,
      busyText: "Đang lưu...",
      apply: () => {
        updateAssignmentLocal(id, { status, note: null });
        render();
      },
      save: () => sb.rpc("set_task_assignment_status", {
        p_assignment_id: id,
        p_status: status,
        p_note: null,
      }),
      rollback: () => restoreAssignments(previous),
      success: () => toast(status === "completed" ? "Đã hoàn thành công việc." : "Đã cập nhật trạng thái."),
    });
  }

  async function submitTaskResult(id) {
    const input = [...document.querySelectorAll("[data-result-input]")].find(element => element.dataset.resultInput === id);
    const note = String(input?.value || "").trim();
    const item = S.assignments.find(row => String(row.id) === String(id));
    const requirements = taskRequirements(item);
    const payload = collectTaskResultPayload(id, item, note);
    const missingRequirement = requirements.find(req => !requirementDone(payload, req.key));
    if (missingRequirement) return alert(`Hãy bấm hoàn thành mục: ${missingRequirement.title}`);
    const storedNote = requirements.length
      ? JSON.stringify({ __task_result_v2: true, note, requirements: payload.requirements })
      : note;
    if (!requirements.length && !note) {
      input?.focus();
      return alert("Hãy nhập kết quả công việc trước khi nộp.");
    }
    const previous = snapshotAssignments();
    const busyElement = findTaskButton("submitResult", id);
    await runTaskOptimistic({
      busyElement,
      busyText: "Đang nộp...",
      apply: () => {
        updateAssignmentLocal(id, { status: "completed", note: storedNote });
        render();
      },
      save: () => sb.rpc("set_task_assignment_status", {
        p_assignment_id: id,
        p_status: "completed",
        p_note: storedNote,
      }),
      rollback: () => restoreAssignments(previous),
      success: () => toast("Đã lưu kết quả công việc."),
    });
  }

  async function completeRequirement(id, key) {
    const item = S.assignments.find(row => String(row.id) === String(id));
    if (!item) return;
    const payload = collectTaskResultPayload(id, item);
    const req = taskRequirements(item).find(row => row.key === key);
    if (!req) return;
    const value = String(payload.requirements?.[key]?.value || "").trim();
    if (!value) return alert(`Hãy nhập kết quả cho mục: ${req.title}`);
    payload.requirements[key] = { value, done: true };
    const requirements = taskRequirements(item);
    const allDone = requirements.every(row => Boolean(payload.requirements?.[row.key]?.done));
    const storedNote = JSON.stringify({ __task_result_v2: true, note: payload.note || "", requirements: payload.requirements });
    const nextStatus = allDone ? "completed" : "open";
    const previous = snapshotAssignments();
    const busyElement = findTaskButton("completeRequirement", id, "requirementKey", key);
    await runTaskOptimistic({
      busyElement,
      busyText: "Đang lưu...",
      apply: () => {
        updateAssignmentLocal(id, { status: nextStatus, note: storedNote });
        render();
      },
      save: () => sb.rpc("set_task_assignment_status", {
        p_assignment_id: id,
        p_status: nextStatus,
        p_note: storedNote,
      }),
      rollback: () => restoreAssignments(previous),
      success: () => toast(allDone ? "Đã hoàn thành toàn bộ công việc." : "Đã lưu kết quả mục này."),
    });
  }

  async function cancelTaskSubmission(id) {
    const ok = confirm("Hủy nộp công việc này và chuyển về trạng thái Chưa hoàn thành?");
    if (!ok) return;
    const item = S.assignments.find(row => String(row.id) === String(id));
    const payload = taskResultPayload(item);
    const resetRequirements = {};
    taskRequirements(item).forEach(req => {
      resetRequirements[req.key] = {
        value: requirementValue(payload, req.key),
        done: false,
      };
    });
    const preservedNote = taskRequirements(item).length
      ? JSON.stringify({ __task_result_v2: true, note: payload.note || "", requirements: resetRequirements })
      : (item?.note || "");
    const previous = snapshotAssignments();
    const busyElement = findTaskButton("cancelSubmit", id);
    await runTaskOptimistic({
      busyElement,
      busyText: "Đang hủy...",
      apply: () => {
        updateAssignmentLocal(id, { status: "open", note: preservedNote });
        render();
      },
      save: () => sb.rpc("set_task_assignment_status", {
        p_assignment_id: id,
        p_status: "open",
        p_note: preservedNote,
      }),
      rollback: () => restoreAssignments(previous),
      success: () => toast("Đã hủy nộp. Nội dung kết quả vẫn được giữ nguyên."),
    });
  }

  async function deleteManualTaskAssignment(id) {
    const item = S.assignments.find(row => String(row.id) === String(id));
    if (!item || !canDeleteAssignment(item)) return;
    const assigneeName = item.assignee?.full_name || item.assignee?.email || "người nhận này";
    const ok = confirm(`Xóa công việc "${item.task?.title || "đã giao"}" của ${assigneeName}?`);
    if (!ok) return;

    const previous = snapshotAssignments();
    const taskId = item.task_id || item.task?.id || null;
    const busyElement = findTaskButton("deleteTask", id);
    await runTaskOptimistic({
      busyElement,
      busyText: "Đang xóa...",
      apply: () => {
        S.assignments = S.assignments.filter(row => String(row.id) !== String(id));
        render();
      },
      save: async () => {
        const result = await sb.from("task_assignments").delete().eq("id", id);
        if (result.error) return result;
        if (taskId) {
          const { count } = await sb
            .from("task_assignments")
            .select("id", { count: "exact", head: true })
            .eq("task_id", taskId);
          if (!count) await sb.from("daily_tasks").delete().eq("id", taskId).eq("source_type", "manual");
        }
        return result;
      },
      rollback: () => restoreAssignments(previous),
      success: () => toast("Đã xóa công việc."),
    });
  }

  function bindEvents() {
    E.prevDay.addEventListener("click", () => {
      S.selectedDate = shiftSelectedDate(-1);
      loadTasks();
    });
    E.nextDay.addEventListener("click", () => {
      S.selectedDate = shiftSelectedDate(1);
      loadTasks();
    });
    document.querySelectorAll("[data-task-view]").forEach(button => {
      button.addEventListener("click", () => {
        S.viewMode = button.dataset.taskView || "today";
        S.selectedUserId = "all";
        loadTasks();
      });
    });
    E.staffFilter?.addEventListener("change", () => {
      S.selectedUserId = E.staffFilter.value || "all";
      render();
    });
    E.list.addEventListener("click", event => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.dataset.openTemplateCreate) return openCreateModal("daily");
      if (target.dataset.staffDetail) {
        S.selectedUserId = target.dataset.staffDetail || "all";
        render();
        return;
      }
      if (target.dataset.editTemplate) return openEditTemplateModal(target.dataset.editTemplate);
      if (target.dataset.deleteTemplate) return deleteTaskTemplate(target.dataset.deleteTemplate);
      if (target.dataset.cancelSubmit) return cancelTaskSubmission(target.dataset.cancelSubmit);
      if (target.dataset.completeRequirement) return completeRequirement(target.dataset.completeRequirement, target.dataset.requirementKey);
      if (target.dataset.submitResult) return submitTaskResult(target.dataset.submitResult);
      if (target.dataset.deleteTask) return deleteManualTaskAssignment(target.dataset.deleteTask);
      if (target.dataset.actionUrl) openAction(target.dataset.actionUrl);
    });
    E.list.addEventListener("input", event => {
      const input = event.target.closest(".task-result-input");
      if (input) autoResizeTextarea(input);
    });
    byId("taskRefreshButton").addEventListener("click", () => loadTasks({ refresh: true }));
    byId("taskDeleteOldButton").addEventListener("click", deleteOldTasks);
    byId("taskCreateButton").addEventListener("click", openCreateModal);
    E.staffCheckInBtn?.addEventListener("click", () => markStaffAttendance("check_in"));
    E.staffCheckOutBtn?.addEventListener("click", () => markStaffAttendance("check_out"));
    E.attendanceHistoryToggle?.addEventListener("click", () => {
      S.attendanceHistoryExpanded = !S.attendanceHistoryExpanded;
      renderStaffAttendanceHistory();
    });
    E.attendanceAdminRefresh?.addEventListener("click", () => loadStaffAttendanceAdmin());
    E.attendanceAdminDate?.addEventListener("change", () => loadStaffAttendanceAdmin());
    E.attendanceAdminToggle?.addEventListener("click", () => {
      S.attendanceAdminExpanded = !S.attendanceAdminExpanded;
      renderStaffAttendanceAdmin();
    });
    byId("taskSettingsButton").addEventListener("click", async () => { await loadPreferences(); openModal("taskSettingsModal"); });
    byId("manualTaskAssigneeSelect")?.addEventListener("change", event => {
      addManualAssignee(event.target.value);
      event.target.value = "";
    });
    byId("manualTaskAssigneeSearch").addEventListener("input", renderAssignees);
    byId("manualTaskPicked")?.addEventListener("click", event => {
      const button = event.target.closest("[data-remove-assignee]");
      if (button) removeManualAssignee(button.dataset.removeAssignee);
    });
    byId("manualTaskAssignees").addEventListener("change", event => {
      const input = event.target.closest('input[type="checkbox"]');
      if (!input) return;
      if (input.checked) addManualAssignee(input.value);
      else removeManualAssignee(input.value);
    });
    byId("manualTaskSave").addEventListener("click", saveManualTask);
    byId("taskPreferencesSave").addEventListener("click", savePreferences);
    document.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.closeModal)));
  }

  async function init() {
    Object.assign(E, {
      list: byId("taskList"), prevDay: byId("taskPrevDay"), currentDay: byId("taskCurrentDay"), nextDay: byId("taskNextDay"),
      adminFilter: byId("taskAdminFilter"), staffFilter: byId("taskStaffFilter"), adminScopeTabs: byId("taskAdminScopeTabs"),
      attendanceCard: byId("staffAttendanceCard"), attendanceLocation: byId("staffAttendanceLocation"),
      staffCheckInText: byId("staffCheckInText"), staffCheckOutText: byId("staffCheckOutText"), staffDistanceText: byId("staffDistanceText"),
      staffCheckInBtn: byId("staffCheckInBtn"), staffCheckOutBtn: byId("staffCheckOutBtn"),
      staffAttendanceNote: byId("staffAttendanceNote"), attendanceFeedback: byId("staffAttendanceFeedback"),
      attendanceHistoryList: byId("staffAttendanceHistoryList"), attendanceHistoryToggle: byId("staffAttendanceHistoryToggle"),
      attendanceAdminPanel: byId("staffAttendanceAdminPanel"), attendanceAdminDate: byId("staffAttendanceAdminDate"),
      attendanceAdminRefresh: byId("staffAttendanceAdminRefresh"), attendanceAdminSummary: byId("staffAttendanceAdminSummary"),
      attendanceAdminToggle: byId("staffAttendanceAdminToggle"), attendanceAdminBody: byId("staffAttendanceAdminBody"),
      attendanceAdminList: byId("staffAttendanceAdminList"),
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
        window.parent.openDashboardPage("messages.html", { syncMenu: false, syncMobile: false, replaceUrl: true });
        return;
      }
      location.href = "messages.html";
      return;
    }
    S.selectedDate = localDate();
    S.attendanceAdminDate = localDate();
    if (E.attendanceAdminDate) E.attendanceAdminDate.value = S.attendanceAdminDate;
    byId("taskGreeting").textContent = `${profile.full_name || "Bạn"}, đây là các việc cần chú ý hôm nay.`;
    byId("taskCreateButton").style.display = profile.role === "admin" ? "grid" : "none";
    if (profile.role === "admin") await loadInternalUsers();
    renderStaffFilter();
    bindEvents();
    await loadStaffAttendance();
    await loadTasks();
    window.MindupLiveUI?.watchTable?.("task_assignments", () => loadTasks());
    window.MindupLiveUI?.watchTable?.("staff_attendance_logs", () => loadStaffAttendance());
  }

  init();
})();
