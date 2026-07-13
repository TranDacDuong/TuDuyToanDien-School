(function () {
  const ABSENT_STATUSES = new Set(["absent", "excused"]);

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function money(value) {
    return `${new Intl.NumberFormat("vi-VN").format(Math.round(Number(value || 0)))}đ`;
  }

  function pct(value) {
    return `${Math.round(Number(value || 0))}%`;
  }

  function score10(value) {
    const score = Math.round((Number(value || 0) / 10) * 10) / 10;
    return `${Number.isInteger(score) ? score : score.toFixed(1)}/10`;
  }

  function ym(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthStart(date) {
    return `${ym(date)}-01`;
  }

  function monthEnd(date) {
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return `${ym(date)}-${String(last.getDate()).padStart(2, "0")}`;
  }

  function ymToDate(monthKey) {
    return `${monthKey}-01`;
  }

  function monthEndByKey(monthKey) {
    const [year, month] = String(monthKey || "").split("-").map(Number);
    const last = new Date(year, month, 0);
    return `${year}-${String(month).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
  }

  function monthLabel(monthKey) {
    const [year, month] = String(monthKey).split("-").map(Number);
    return `T${month}/${String(year).slice(2)}`;
  }

  function monthRange(startKey, endKey) {
    if (!startKey || !endKey) return [ym(new Date())];
    const [startYear, startMonth] = String(startKey).split("-").map(Number);
    const [endYear, endMonth] = String(endKey).split("-").map(Number);
    const start = new Date(startYear, startMonth - 1, 1);
    const end = new Date(endYear, endMonth - 1, 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [ym(new Date())];
    const keys = [];
    for (let cursor = start; cursor <= end; cursor = addMonths(cursor, 1)) {
      keys.push(ym(cursor));
    }
    return keys;
  }

  function collectDataMonths(rows, fields) {
    const months = new Set();
    (rows || []).forEach(row => {
      fields.forEach(field => {
        const value = row?.[field];
        const key = String(value || "").slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(key)) months.add(key);
      });
    });
    return months;
  }

  function getSchedulesForMonth(allSchedules, monthKey) {
    const mStart = ymToDate(monthKey);
    const eligible = (allSchedules || []).filter(item => String(item.effective_from || "2000-01-01").slice(0, 10) <= mStart);
    if (!eligible.length) return [];
    const maxEffective = eligible.reduce((max, item) => {
      const value = String(item.effective_from || "2000-01-01").slice(0, 10);
      return value > max ? value : max;
    }, "2000-01-01");
    return eligible.filter(item => String(item.effective_from || "2000-01-01").slice(0, 10) === maxEffective);
  }

  function scheduleKey(schedule) {
    return [
      Number(schedule?.session_no || 1),
      Number(schedule?.weekday || 0),
      String(schedule?.start_time || "").slice(0, 5),
      String(schedule?.end_time || "").slice(0, 5),
    ].join("|");
  }

  function scheduleMatchesChosen(schedule, chosenIds, allSchedules) {
    if (!chosenIds?.size) return true;
    if (chosenIds.has(Number(schedule?.id))) return true;
    const key = scheduleKey(schedule);
    return (allSchedules || []).some(item =>
      chosenIds.has(Number(item.id))
      && (
        scheduleKey(item) === key
        || (
          Number(item.session_no || 1) === Number(schedule?.session_no || 1)
          && Number(item.weekday || 0) === Number(schedule?.weekday || 0)
        )
      )
    );
  }

  function getActiveSchedulesForDate(allSchedules, dateText) {
    const eligible = (allSchedules || []).filter(item => String(item.effective_from || "2000-01-01").slice(0, 10) <= dateText);
    if (!eligible.length) return [];
    const maxEffective = eligible.reduce((max, item) => {
      const value = String(item.effective_from || "2000-01-01").slice(0, 10);
      return value > max ? value : max;
    }, "2000-01-01");
    return eligible.filter(item => String(item.effective_from || "2000-01-01").slice(0, 10) === maxEffective);
  }

  function generateOccurrences(schedules, monthKey) {
    const [year, month] = String(monthKey || "").split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const items = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month - 1, day);
      const weekday = date.getDay() === 0 ? 7 : date.getDay();
      (schedules || []).forEach(schedule => {
        if (Number(schedule.weekday) !== weekday) return;
        items.push({
          date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          schedule_id: Number(schedule.id || 0),
          session_no: Number(schedule.session_no || 1),
          schedule,
        });
      });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date) || a.session_no - b.session_no);
  }

  function generateOccurrencesForStudent(allSchedules, monthKey, chosenRows) {
    const [year, month] = String(monthKey || "").split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const items = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month - 1, day);
      const dateText = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const weekday = date.getDay() === 0 ? 7 : date.getDay();
      getActiveSchedulesForDate(allSchedules, dateText)
        .filter(schedule => Number(schedule.weekday) === weekday)
        .filter(schedule => scheduleMatchesChosen(schedule, chosenIdsForDate(chosenRows, dateText), allSchedules))
        .forEach(schedule => {
          items.push({
            date: dateText,
            schedule_id: Number(schedule.id || 0),
            session_no: Number(schedule.session_no || 1),
            schedule,
          });
        });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date) || a.session_no - b.session_no);
  }

  function chosenIdsForDate(chosenRows, dateText) {
    if (!Array.isArray(chosenRows) || !chosenRows.length) return null;
    const eligible = chosenRows.filter(row => String(row.effective_from || "2000-01-01").slice(0, 10) <= dateText);
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

  function attendanceStatusFor(attMap, studentId, classId, occurrence) {
    return attMap[`${studentId}_${classId}_${occurrence.date}_${occurrence.schedule_id}`]
      || attMap[`${studentId}_${classId}_${occurrence.date}_0`]
      || null;
  }

  function calcTuition({ tuition_type, tuition_fee, makeup_fee, present, makeup, totalSessions }) {
    const fee = Number(tuition_fee) || 0;
    const makeupFee = (makeup_fee != null && makeup_fee !== "") ? Number(makeup_fee) : null;

    if (tuition_type === "per_session") {
      const mFee = makeupFee !== null ? makeupFee : fee;
      return (present * fee) + (makeup * mFee);
    }

    if (tuition_type === "per_month") {
      const perSession = totalSessions > 0 ? fee / totalSessions : 0;
      const mFee = makeupFee !== null ? makeupFee : perSession;
      return Math.max(0, fee + (makeup * mFee));
    }

    if (tuition_type === "per_course") return fee;
    return 0;
  }

  async function fetchAllPages(buildQuery, pageSize = 1000) {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await buildQuery().range(from, from + pageSize - 1);
      if (error) return { data: rows, error };
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return { data: rows, error: null };
  }

  function renderBars(id, rows, options = {}) {
    const el = byId(id);
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = '<div class="ops-empty">Chưa có đủ dữ liệu để hiển thị.</div>';
      return;
    }
    const max = Math.max(...rows.map(row => Number(row.value || 0)), 1);
    el.innerHTML = `<div class="ops-bars">${rows.map(row => {
      const height = Math.max(8, Math.round((Number(row.value || 0) / max) * 100));
      return `
        <div class="ops-bar-item">
          <div class="ops-bar-value">${options.format ? options.format(row.value) : row.value}</div>
          <div class="ops-bar-track"><div class="ops-bar-fill ${options.className || ""}" style="height:${height}%"></div></div>
          <div class="ops-bar-label">${row.label}</div>
        </div>
      `;
    }).join("")}</div>`;
  }

  function renderDualBars(id, rows, config) {
    const el = byId(id);
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = '<div class="ops-empty">Chưa có đủ dữ liệu để hiển thị.</div>';
      return;
    }
    const max = Math.max(...rows.flatMap(row => [Number(row.a || 0), Number(row.b || 0)]), 1);
    el.innerHTML = `
      <div class="ops-chart-legend">
        <span><i class="${config.aClass}"></i>${config.aLabel}</span>
        <span><i class="${config.bClass}"></i>${config.bLabel}</span>
      </div>
      <div class="ops-dual-bars">
        ${rows.map(row => {
          const aHeight = Math.max(6, Math.round((Number(row.a || 0) / max) * 100));
          const bHeight = Math.max(6, Math.round((Number(row.b || 0) / max) * 100));
          return `
            <div class="ops-dual-item">
              <div class="ops-dual-values">${row.a}/${row.b}</div>
              <div class="ops-dual-track">
                <div class="ops-bar-fill ${config.aClass}" style="height:${aHeight}%"></div>
                <div class="ops-bar-fill ${config.bClass}" style="height:${bHeight}%"></div>
              </div>
              <div class="ops-bar-label">${row.label}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderLineChart(id, series, labels) {
    const el = byId(id);
    if (!el) return;
    const visibleSeries = series.filter(item => item.values.some(value => Number(value) > 0));
    if (!visibleSeries.length) {
      el.innerHTML = '<div class="ops-empty">Chưa có đủ dữ liệu điểm để hiển thị.</div>';
      return;
    }
    const width = 640;
    const height = 260;
    const pad = { top: 24, right: 22, bottom: 46, left: 42 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const max = Math.max(...visibleSeries.flatMap(item => item.values), 100);
    const colors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9", "#ec4899"];
    const x = index => pad.left + (labels.length <= 1 ? innerW / 2 : (index / (labels.length - 1)) * innerW);
    const y = value => pad.top + innerH - (Number(value || 0) / max) * innerH;
    const axis = [0, 25, 50, 75, 100];

    el.innerHTML = `
      <div class="ops-line-wrap">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Điểm trung bình theo môn và theo tháng">
          ${axis.map(mark => `<line x1="${pad.left}" y1="${y(mark)}" x2="${width - pad.right}" y2="${y(mark)}" class="ops-grid-line"></line><text x="10" y="${y(mark) + 4}" class="ops-axis">${score10(mark)}</text>`).join("")}
          ${labels.map((label, index) => `<text x="${x(index)}" y="${height - 18}" text-anchor="middle" class="ops-axis">${label}</text>`).join("")}
          ${visibleSeries.map((item, seriesIndex) => {
            const color = colors[seriesIndex % colors.length];
            const points = item.values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
            return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
              ${item.values.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4" fill="${color}"><title>${item.name}: ${score10(value)}</title></circle>`).join("")}`;
          }).join("")}
        </svg>
        <div class="ops-chart-legend">
          ${visibleSeries.map((item, index) => `<span><i style="background:${colors[index % colors.length]}"></i>${item.name}</span>`).join("")}
        </div>
      </div>
    `;
  }

  function classScoreCards(stats) {
    const el = byId("opsClassScoreCards");
    if (!el) return;
    if (!stats.length) {
      el.innerHTML = '<div class="ops-empty">Chưa có dữ liệu điểm theo lớp.</div>';
      return;
    }
    const sorted = [...stats].sort((a, b) => b.avg - a.avg);
    const best = sorted[0];
    const lowest = sorted[sorted.length - 1];
    el.innerHTML = `
      <div class="ops-rank-card good">
        <span>Lớp điểm cao nhất</span>
        <strong>${best.className}</strong>
        <em>${score10(best.avg)} • ${best.count} lượt nộp</em>
      </div>
      <div class="ops-rank-card warn">
        <span>Lớp điểm thấp nhất</span>
        <strong>${lowest.className}</strong>
        <em>${score10(lowest.avg)} • ${lowest.count} lượt nộp</em>
      </div>
    `;
  }

  async function loadAdminOps() {
    try {
      const now = new Date();
      const thisMonth = ym(now);
      const thisMonthStart = monthStart(now);
      const thisMonthEnd = monthEnd(now);
      const toDate = monthEnd(now);

      const [
        tuitionRes,
        studentRes,
        classStudentRes,
          classRes,
          attendanceRes,
          chosenScheduleRes,
          examResultRes,
          sessionScoreRes,
        ] = await Promise.all([
        fetchAllPages(() => sb.from("tuition_payments").select("month,amount_due,amount_paid").lte("month", thisMonthStart).order("month", { ascending: true })),
        fetchAllPages(() => sb.from("users").select("id,role,created_at").eq("role", "student").order("created_at", { ascending: true })),
        fetchAllPages(() => sb.from("class_students").select("class_id,student_id,joined_at,left_at").order("joined_at", { ascending: true })),
        fetchAllPages(() => sb.from("classes").select("id,class_name,hidden,tuition_fee,tuition_type,makeup_fee,subjects(name),class_schedules(id,session_no,weekday,start_time,end_time,effective_from)").eq("hidden", false).order("class_name", { ascending: true })),
          fetchAllPages(() => sb.from("attendance").select("class_id,student_id,date,status,schedule_id").lte("date", toDate).order("date", { ascending: true })),
          fetchAllPages(() => sb.from("class_student_schedules").select("class_id,student_id,schedule_id,effective_from")),
          fetchAllPages(() => sb.from("exam_results").select("class_id,submitted_at,score_auto,score_total,exam:exams(total_points,classes(class_name,subjects(name)))").not("submitted_at", "is", null).order("submitted_at", { ascending: true })),
          fetchAllPages(() => sb.from("class_session_scores").select("class_id,score,max_score,created_at,class_sessions(session_date)").order("created_at", { ascending: true })),
        ]);
        const firstError = tuitionRes.error || studentRes.error || classStudentRes.error || classRes.error || attendanceRes.error || chosenScheduleRes.error || examResultRes.error || sessionScoreRes.error;
      if (firstError) throw firstError;

      const tuitions = tuitionRes.data || [];
      const students = studentRes.data || [];
      const classStudents = classStudentRes.data || [];
      const classes = classRes.data || [];
        const attendance = attendanceRes.data || [];
        const chosenSchedules = chosenScheduleRes.data || [];
        const examResults = examResultRes.data || [];
        const sessionScores = sessionScoreRes.data || [];
      const monthsWithData = new Set([thisMonth]);
      [
        ...collectDataMonths(tuitions, ["month"]),
          ...collectDataMonths(students, ["created_at"]),
          ...collectDataMonths(classStudents, ["joined_at", "left_at"]),
          ...collectDataMonths(attendance, ["date"]),
          ...collectDataMonths(examResults, ["submitted_at"]),
          ...collectDataMonths(sessionScores, ["created_at"]),
        ].forEach(key => monthsWithData.add(key));
        sessionScores.forEach(item => {
          const key = String(item.class_sessions?.session_date || "").slice(0, 7);
          if (key) monthsWithData.add(key);
        });
        const sortedMonths = [...monthsWithData].sort();
      const keys = monthRange(sortedMonths[0], sortedMonths[sortedMonths.length - 1]);

      const classMap = Object.fromEntries(classes.map(item => [item.id, item]));
      const attendanceMap = {};
      const attendanceRowsByStudentClass = {};
      attendance.forEach(item => {
        attendanceMap[`${item.student_id}_${item.class_id}_${item.date}_${item.schedule_id || 0}`] = item.status;
        const key = `${item.student_id}_${item.class_id}`;
        if (!attendanceRowsByStudentClass[key]) attendanceRowsByStudentClass[key] = [];
        attendanceRowsByStudentClass[key].push(item);
      });
      const chosenMap = {};
      chosenSchedules.forEach(item => {
        const key = `${item.student_id}_${item.class_id}`;
        if (!chosenMap[key]) chosenMap[key] = [];
        chosenMap[key].push(item);
      });

      const revenueByMonth = Object.fromEntries(keys.map(key => [key, { due: 0, paid: 0 }]));
      tuitions.forEach(item => {
        const key = String(item.month || "").slice(0, 7);
        if (!revenueByMonth[key]) return;
        revenueByMonth[key].paid += Number(item.amount_paid || 0);
      });

      keys.forEach(monthKey => {
        const mStart = ymToDate(monthKey);
        const mEnd = monthEndByKey(monthKey);

        classStudents.forEach(classStudent => {
          const cls = classMap[classStudent.class_id];
          if (!cls) return;
          const joined = classStudent.joined_at ? String(classStudent.joined_at).slice(0, 10) : "0000-00-00";
          const left = classStudent.left_at ? String(classStudent.left_at).slice(0, 10) : "9999-99-99";
          if (joined > mEnd || left < mStart) return;

          const chosenRows = chosenMap[`${classStudent.student_id}_${classStudent.class_id}`];
          const activeOccurrences = generateOccurrencesForStudent(cls.class_schedules || [], monthKey, chosenRows).filter(occurrence => {
            if (occurrence.date > left) return false;
            if (occurrence.date >= joined) return true;
            const actualStatus = attendanceStatusFor(attendanceMap, classStudent.student_id, classStudent.class_id, occurrence);
            return actualStatus === "present" || actualStatus === "makeup";
          });
          const occurrenceKeys = new Set(activeOccurrences.map(occurrence => `${occurrence.date}_${occurrence.schedule_id || 0}`));
          (attendanceRowsByStudentClass[`${classStudent.student_id}_${classStudent.class_id}`] || []).forEach(row => {
            const date = String(row.date || "").slice(0, 10);
            const status = String(row.status || "");
            const scheduleId = Number(row.schedule_id || 0);
            const key = `${date}_${scheduleId}`;
            if (!date || date < mStart || date > mEnd || occurrenceKeys.has(key) || date > left) return;
            if (date < joined && status !== "present" && status !== "makeup") return;
            activeOccurrences.push({
              date,
              schedule_id: scheduleId,
              session_no: 0,
              schedule: null,
              from_attendance_only: true,
            });
            occurrenceKeys.add(key);
          });
          activeOccurrences.sort((a, b) =>
            String(a.date || "").localeCompare(String(b.date || ""))
            || Number(a.schedule_id || 0) - Number(b.schedule_id || 0)
          );
          const totalSessions = activeOccurrences.length;

          let present = 0;
          let makeup = 0;
          activeOccurrences.forEach(occurrence => {
            const status = attendanceStatusFor(attendanceMap, classStudent.student_id, classStudent.class_id, occurrence) || "present";
            if (status === "present") present += 1;
            else if (status === "makeup") makeup += 1;
          });

          revenueByMonth[monthKey].due += calcTuition({
            tuition_type: cls.tuition_type,
            tuition_fee: cls.tuition_fee,
            makeup_fee: cls.makeup_fee,
            present,
            makeup,
            totalSessions,
          });
        });
      });

      const studentAdds = Object.fromEntries(keys.map(key => [key, 0]));
      students.forEach(item => {
        const key = String(item.created_at || "").slice(0, 7);
        if (studentAdds[key] !== undefined) studentAdds[key] += 1;
      });

      const studentLeaves = Object.fromEntries(keys.map(key => [key, new Set()]));
      classStudents.forEach(item => {
        const key = String(item.left_at || "").slice(0, 7);
        if (studentLeaves[key]) studentLeaves[key].add(item.student_id);
      });

      const absentByMonth = Object.fromEntries(keys.map(key => [key, 0]));
      attendance.forEach(item => {
        const key = String(item.date || "").slice(0, 7);
        if (absentByMonth[key] !== undefined && ABSENT_STATUSES.has(String(item.status || ""))) absentByMonth[key] += 1;
      });

      const classNameMap = Object.fromEntries(classes.map(item => [item.id, item.class_name || "Lớp học"]));
      const subjectMonthMap = new Map();
      const classScoreMap = new Map();
        examResults.forEach(item => {
          const total = Number(item.exam?.total_points || 0);
          const score = Number(item.score_total ?? item.score_auto);
          if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(score)) return;
          const key = String(item.submitted_at || "").slice(0, 7);
        if (!keys.includes(key)) return;
        const ratio = Math.max(0, Math.min(100, (score / total) * 100));
        const subject = item.exam?.classes?.subjects?.name || "Khác";
        const subjectKey = `${subject}|${key}`;
        const subjectPrev = subjectMonthMap.get(subjectKey) || { subject, month: key, total: 0, count: 0 };
        subjectPrev.total += ratio;
        subjectPrev.count += 1;
        subjectMonthMap.set(subjectKey, subjectPrev);

        const classId = item.class_id || item.exam?.classes?.id || "";
        if (!classId) return;
        const classPrev = classScoreMap.get(classId) || { classId, className: classNameMap[classId] || item.exam?.classes?.class_name || "Lớp học", total: 0, count: 0 };
        classPrev.total += ratio;
          classPrev.count += 1;
          classScoreMap.set(classId, classPrev);
        });

        sessionScores.forEach(item => {
          const total = Number(item.max_score || 0);
          const score = Number(item.score);
          if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(score)) return;
          const key = String(item.class_sessions?.session_date || item.created_at || "").slice(0, 7);
          if (!keys.includes(key)) return;
          const ratio = Math.max(0, Math.min(100, (score / total) * 100));
          const cls = classMap[item.class_id];
          const subject = cls?.subjects?.name || "Khác";
          const subjectKey = `${subject}|${key}`;
          const subjectPrev = subjectMonthMap.get(subjectKey) || { subject, month: key, total: 0, count: 0 };
          subjectPrev.total += ratio;
          subjectPrev.count += 1;
          subjectMonthMap.set(subjectKey, subjectPrev);

          const classId = item.class_id || "";
          if (!classId) return;
          const classPrev = classScoreMap.get(classId) || { classId, className: classNameMap[classId] || cls?.class_name || "Lớp học", total: 0, count: 0 };
          classPrev.total += ratio;
          classPrev.count += 1;
          classScoreMap.set(classId, classPrev);
        });

        const revenueMonths = keys.filter(key => Number(revenueByMonth[key]?.due || 0) || Number(revenueByMonth[key]?.paid || 0));
      const currentRevenue = revenueByMonth[thisMonth] || { due: 0, paid: 0 };
      const displayRevenueMonth = (Number(currentRevenue.due || 0) || Number(currentRevenue.paid || 0))
        ? thisMonth
        : revenueMonths[revenueMonths.length - 1] || thisMonth;
      const displayRevenue = revenueByMonth[displayRevenueMonth] || { due: 0, paid: 0 };
      const newStudentsThisMonth = students.filter(item => String(item.created_at || "").slice(0, 10) >= thisMonthStart && String(item.created_at || "").slice(0, 10) <= thisMonthEnd).length;

      setText("opsRevenueValue", `${money(displayRevenue.paid)} / ${money(displayRevenue.due)}`);
      setText(
        "opsRevenueSub",
        displayRevenue.due
          ? `Tháng ${monthLabel(displayRevenueMonth)} • đã thu ${pct((displayRevenue.paid / displayRevenue.due) * 100)} doanh thu`
          : "Chưa có dữ liệu học phí"
      );
      setText("opsStudentGrowthValue", `${newStudentsThisMonth} / ${students.length}`);
      setText("opsStudentGrowthSub", "Học sinh mới tháng này / tổng học sinh");
      setText("opsActiveClassCount", String(classes.length));
      setText("opsActiveClassSub", "Tổng lớp đang hoạt động");

      renderBars("opsRevenueChart", keys.map(key => ({ label: monthLabel(key), value: revenueByMonth[key]?.due || 0 })), { format: money, className: "money" });
      renderDualBars("opsStudentFlowChart", keys.map(key => ({ label: monthLabel(key), a: studentAdds[key] || 0, b: studentLeaves[key]?.size || 0 })), {
        aLabel: "Học sinh mới",
        bLabel: "Học sinh nghỉ",
        aClass: "new-students",
        bClass: "left-students",
      });
      renderBars("opsAbsenceChart", keys.map(key => ({ label: monthLabel(key), value: absentByMonth[key] || 0 })), { className: "absent" });

      const subjects = [...new Set([...subjectMonthMap.values()].map(item => item.subject))].slice(0, 7);
      const subjectSeries = subjects.map(subject => ({
        name: subject,
        values: keys.map(key => {
          const item = subjectMonthMap.get(`${subject}|${key}`);
          return item ? item.total / item.count : 0;
        }),
      }));
      renderLineChart("opsScoreChart", subjectSeries, keys.map(monthLabel));
      classScoreCards([...classScoreMap.values()].map(item => ({ ...item, avg: item.total / item.count })));
    } catch (error) {
      console.warn("loadAdminOps failed", error);
      ["opsRevenueChart", "opsStudentFlowChart", "opsAbsenceChart", "opsScoreChart"].forEach(id => {
        const el = byId(id);
        if (el) el.innerHTML = '<div class="ops-empty">Không tải được dữ liệu dashboard lúc này.</div>';
      });
    }
  }

  window.DashboardOps = {
    loadAdminOps,
  };
})();
