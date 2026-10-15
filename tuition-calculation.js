(function () {
  const isNode = typeof module === 'object' && module.exports;
  const discounts = isNode ? require('./tuition-discounts.js') : window.TuitionDiscounts;
  function fmt(v) { return new Intl.NumberFormat("vi-VN").format(Math.round(v)); }
  function ymToDate(ym) { return ym + "-01"; }

  function monthEnd(ym) {
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(y, m, 0);
    return `${y}-${String(m).padStart(2,"0")}-${String(last.getDate()).padStart(2,"0")}`;
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

  function getActiveSchedulesForDate(allSchedules, dateText) {
    const eligible = (allSchedules || []).filter(s => String(s.effective_from || "2000-01-01").slice(0, 10) <= dateText);
    if (!eligible.length) return [];
    const maxEf = eligible.reduce((max, s) => {
      const ef = String(s.effective_from || "2000-01-01").slice(0, 10);
      return ef > max ? ef : max;
    }, "2000-01-01");
    return eligible.filter(s => String(s.effective_from || "2000-01-01").slice(0, 10) === maxEf);
  }

  function generateOccurrencesForStudent(allSchedules, ym, chosenRows) {
    const [year, month] = ym.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const items = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const dateText = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const weekday = date.getDay() === 0 ? 7 : date.getDay();
      getActiveSchedulesForDate(allSchedules, dateText)
        .filter(s => Number(s.weekday) === weekday)
        .filter(s => scheduleMatchesChosen(s, chosenIdsForDate(chosenRows, dateText), allSchedules))
        .forEach(s => {
          items.push({
            date: dateText,
            schedule_id: Number(s.id || 0),
            session_no: Number(s.session_no || 1),
            schedule: s
          });
        });
    }
    return items.sort((a,b) => a.date.localeCompare(b.date) || a.session_no - b.session_no);
  }

  function attendanceStatusFor(attMap, studentId, classId, item) {
    return attMap[`${studentId}_${classId}_${item.date}_${item.schedule_id}`]
      || attMap[`${studentId}_${classId}_${item.date}_0`]
      || null;
  }

  /* ─────────────────────────────────────────────
     TÍNH HỌC PHÍ
  ───────────────────────────────────────────── */
  function calcTuition({ tuition_type, tuition_fee, makeup_fee, present, absent, makeup, totalSessions }) {
    const fee      = Number(tuition_fee) || 0;
    // makeup_fee: null/undefined → dùng luôn giá buổi chính
    const mkFee    = (makeup_fee != null && makeup_fee !== "") ? Number(makeup_fee) : null;

    let billableSessions = 0, amount = 0, feePerSession = 0, noteCalc = "";

    if (tuition_type === "per_session") {
      // (present × fee) + (makeup × makeup_fee)
      const mFee       = mkFee !== null ? mkFee : fee;
      billableSessions = present + makeup;
      feePerSession    = fee;
      amount           = (present * fee) + (makeup * mFee);
      if (mkFee !== null && mkFee !== fee) {
        noteCalc = `Học bù: ${fmt(mFee)}đ/buổi`;
      }

    } else if (tuition_type === "per_month") {
      // fee + (makeup × makeup_fee) (không trừ tiền vắng mặt)
      const perSession = totalSessions > 0 ? fee / totalSessions : 0;
      const mFee       = mkFee !== null ? mkFee : perSession;
      feePerSession    = perSession;
      amount           = fee + (makeup * mFee);
      amount           = Math.max(0, amount);
      billableSessions = totalSessions + makeup;
      noteCalc = `Cố định tháng`;
      if (mkFee !== null && mkFee !== perSession) {
        noteCalc += ` • Học bù: ${fmt(mFee)}đ/buổi`;
      }

    } else if (tuition_type === "per_course") {
      billableSessions = present + makeup;
      feePerSession    = 0;
      amount           = fee;
      noteCalc         = "Theo khoá";
    }

    return { billableSessions, feePerSession, amount, noteCalc };
  }

  function buildRowsForMonth({ ym, classes, classStudents, attData, chosenSchedules, trialReqs, suppSessions, payments = {} }, viewer = {}) {
    const { currentRole = "admin", currentUserId = null, parentStudentIds = new Set(),
      staffClassIds = new Set(), parentContactMap = {}, isStaffTuitionView = () => false,
      canViewAllTuition = () => true, canViewStudentPhone = () => false } = viewer;
    const mStart = ymToDate(ym);
    const mEnd = monthEnd(ym);
    const classMap = {};
    (classes || []).forEach(c => { classMap[c.id] = c; });

    const trialDateMap = {};
    (trialReqs || []).forEach(tr => {
      if (tr.student_id) {
        const cId = tr.trial_class_id || "";
        if (tr.trial_session_1_at) {
          const d1 = tr.trial_session_1_at.slice(0, 10);
          if (cId) trialDateMap[`${tr.student_id}_${cId}_${d1}`] = true;
          trialDateMap[`${tr.student_id}_${d1}`] = true;
        }
        if (tr.trial_session_2_at) {
          const d2 = tr.trial_session_2_at.slice(0, 10);
          if (cId) trialDateMap[`${tr.student_id}_${cId}_${d2}`] = true;
          trialDateMap[`${tr.student_id}_${d2}`] = true;
        }
      }
    });

    // Map buổi dạy bổ sung hoàn thành trong tháng theo student_id & parent_class_id
    const suppMap = {};
    (suppSessions || []).forEach(sess => {
      const cId = sess.parent_class_id;
      const sDate = sess.session_date ? String(sess.session_date).slice(0, 10) : "";
      if (sDate < mStart || sDate > mEnd) return;
      (sess.students || []).forEach(st => {
        const key = `${st.student_id}_${cId}`;
        if (!suppMap[key]) suppMap[key] = [];
        suppMap[key].push({
          session: sess,
          student: st,
          date: sDate,
        });
      });
    });

    const attMap = {};
    const overrideMap = {};
    const attRowsByStudentClass = {};
    (attData || []).forEach(a => {
      const date = String(a.date || "").slice(0, 10);
      if (date < mStart || date > mEnd) return;
      attMap[`${a.student_id}_${a.class_id}_${date}_${a.schedule_id || 0}`] = a.status;
      overrideMap[`${a.student_id}_${a.class_id}_${date}_${a.schedule_id || 0}`] = a.status_overridden === true;
      const key = `${a.student_id}_${a.class_id}`;
      if (!attRowsByStudentClass[key]) attRowsByStudentClass[key] = [];
      attRowsByStudentClass[key].push({ ...a, date });
    });

    const chosenMap = {};
    (chosenSchedules || []).forEach(row => {
      const key = `${row.student_id}_${row.class_id}`;
      if (!chosenMap[key]) chosenMap[key] = [];
      chosenMap[key].push(row);
    });

    const processedStudentClasses = new Set();
    const rows = [];
    (classStudents || []).forEach(cs => {
      if (currentRole === "student" && cs.student_id !== currentUserId) return;
      if (currentRole === "parent" && !parentStudentIds.has(cs.student_id)) return;
      if (isStaffTuitionView() && currentRole !== "admin" && !canViewAllTuition() && !staffClassIds.has(cs.class_id)) return;
      const cls = classMap[cs.class_id];
      if (!cls) return;

      const joined = cs.joined_at ? cs.joined_at.slice(0, 10) : "0000-00-00";
      const left = cs.left_at ? cs.left_at.slice(0, 10) : "9999-99-99";
      if (joined > mEnd || left < mStart) return;

      processedStudentClasses.add(`${cs.student_id}_${cs.class_id}`);

      const schedules = cls.class_schedules || [];
      const chosenRows = chosenMap[`${cs.student_id}_${cs.class_id}`];
      const activeOccurrences = generateOccurrencesForStudent(schedules, ym, chosenRows).filter(item => {
        if (item.date > left) return false;
        if (item.date >= joined) return true;
        const actualStatus = attendanceStatusFor(attMap, cs.student_id, cs.class_id, item);
        const isTrial = Boolean(
          trialDateMap[`${cs.student_id}_${cs.class_id}_${item.date}`] ||
          trialDateMap[`${cs.student_id}_${item.date}`]
        );
        return actualStatus === "present" || actualStatus === "makeup" || actualStatus === "trial" || isTrial;
      });
      const occurrenceKeys = new Set(activeOccurrences.map(item => `${item.date}_${item.schedule_id || 0}`));
      (attRowsByStudentClass[`${cs.student_id}_${cs.class_id}`] || []).forEach(row => {
        const date = String(row.date || "").slice(0, 10);
        const status = row.status || "";
        const scheduleId = Number(row.schedule_id || 0);
        const key = `${date}_${scheduleId}`;
        if (!date || occurrenceKeys.has(key) || date > left) return;
        const isTrial = Boolean(
          trialDateMap[`${cs.student_id}_${cs.class_id}_${date}`] ||
          trialDateMap[`${cs.student_id}_${date}`]
        );
        if (date < joined && status !== "present" && status !== "makeup" && status !== "trial" && !isTrial) return;
        activeOccurrences.push({
          date,
          schedule_id: scheduleId,
          session_no: 0,
          schedule: null,
          from_attendance_only: true,
        });
        occurrenceKeys.add(key);
      });
      activeOccurrences.sort((a, b) => a.date.localeCompare(b.date) || Number(a.schedule_id || 0) - Number(b.schedule_id || 0));
      const totalSessions = activeOccurrences.length;

      const daysMap = {1:"T2",2:"T3",3:"T4",4:"T5",5:"T6",6:"T7",7:"CN"};
      let present = 0, absent = 0, makeup = 0, trialCount = 0;
      const attendanceDetails = activeOccurrences.map(item => {
        const isTrial = Boolean(
          trialDateMap[`${cs.student_id}_${cs.class_id}_${item.date}`] ||
          trialDateMap[`${cs.student_id}_${item.date}`]
        );
        let rawStatus = attendanceStatusFor(attMap, cs.student_id, cs.class_id, item);
        const attendanceKey = `${cs.student_id}_${cs.class_id}_${item.date}`;
        const overridden = Object.prototype.hasOwnProperty.call(attMap, `${attendanceKey}_${item.schedule_id}`)
          ? overrideMap[`${attendanceKey}_${item.schedule_id}`] : overrideMap[`${attendanceKey}_0`];
        let status = overridden && rawStatus ? rawStatus
          : (rawStatus === "trial" || isTrial) ? "trial" : (rawStatus || (item.date < joined ? "absent" : "present"));

        if (status === "trial") trialCount++;
        else if (status === "present") present++;
        else if (status === "absent") absent++;
        else if (status === "makeup") makeup++;

        const s = item.schedule || null;
        const timeLabel = s?.start_time && s?.end_time
          ? `${String(s.start_time).slice(0,5)}–${String(s.end_time).slice(0,5)}`
          : "";
        const roomLabel = s?.rooms?.room_name ? ` • ${s.rooms.room_name}` : "";
        let scheduleLabel = s
          ? `Buổi ${s.session_no || item.session_no || 1}: ${daysMap[s.weekday] || ""} ${timeLabel}${roomLabel}`.trim()
          : (item.from_attendance_only ? "Điểm danh bổ sung" : `Buổi ${item.session_no || ""}`.trim());

        if (status === "trial") {
          scheduleLabel = `🌱 Buổi học thử (Miễn phí) • ${scheduleLabel}`;
        }
        return {
          date: item.date,
          status,
          schedule_id: item.schedule_id,
          session_no: item.session_no,
          scheduleLabel,
        };
      });

      // Tích hợp buổi dạy bổ sung hoàn thành của lớp
      const studentSupps = suppMap[`${cs.student_id}_${cs.class_id}`] || [];
      let suppCount = 0;
      let suppTotalFee = 0;

      studentSupps.forEach(item => {
        const sess = item.session;
        const st = item.student;
        const attStatus = st.attendance_status || "present";
        const isCharged = ["present", "late"].includes(attStatus);
        const fee = Number(st.tuition_fee ?? sess.fee_per_student ?? 0);

        if (isCharged) {
          suppCount++;
          suppTotalFee += fee;
        }

        attendanceDetails.push({
          date: item.date,
          status: attStatus === "absent" ? "absent" : "supplementary",
          schedule_id: 999000,
          session_no: 0,
          scheduleLabel: `⭐ Buổi dạy bổ sung: ${sess.topic}${attStatus === "absent" ? " (Vắng - 0đ)" : ` (+${fmt(fee)}đ)`}`,
          isSupplementary: true,
          fee: isCharged ? fee : 0,
        });
      });

      const { billableSessions, feePerSession, amount: baseAmount, noteCalc: baseNote } = calcTuition({
        tuition_type: cls.tuition_type,
        tuition_fee: cls.tuition_fee,
        makeup_fee: cls.makeup_fee,
        present, absent, makeup, totalSessions: Math.max(0, totalSessions - trialCount),
      });

      const finalAmount = baseAmount + suppTotalFee;
      let noteCalc = baseNote;
      if (suppTotalFee > 0) {
        noteCalc = (noteCalc ? `${noteCalc} • ` : "") + `Dạy bổ sung (${suppCount} buổi): +${fmt(suppTotalFee)}đ`;
      }

      const studentSchedules = [...new Map(activeOccurrences
        .map(item => item.schedule)
        .filter(Boolean)
        .map(schedule => [Number(schedule.id), schedule])
      ).values()];
      const scheduleLabel = studentSchedules
        .map(s => `Buổi ${s.session_no || 1}: ${daysMap[s.weekday]} (${s.start_time.slice(0,5)}–${s.end_time.slice(0,5)})`)
        .join(", ");

      rows.push({
        studentId: cs.student_id,
        classId: cs.class_id,
        studentName: cs.user?.full_name || "—",
        phone: canViewStudentPhone() ? (cs.user?.phone || "") : "",
        rawPhone: cs.user?.phone || "",
        parentContacts: canViewStudentPhone() ? (parentContactMap[cs.student_id] || []) : [],
        className: cls.class_name,
        tuitionType: cls.tuition_type,
        tuitionFee: cls.tuition_fee,
        makeupFee: cls.makeup_fee,
        scheduleLabel,
        totalSessions, present, absent, makeup, trialCount,
        suppCount, suppTotalFee,
        attendanceDetails,
        billableSessions, feePerSession, amount: finalAmount, noteCalc, ym,
      });
    });

    // Thêm các học sinh tham gia buổi dạy bổ sung mà không có trong classStudents tháng này
    Object.entries(suppMap).forEach(([key, items]) => {
      if (processedStudentClasses.has(key)) return;
      const [studentId, classId] = key.split("_");
      if (currentRole === "student" && studentId !== currentUserId) return;
      if (currentRole === "parent" && !parentStudentIds.has(studentId)) return;
      if (isStaffTuitionView() && currentRole !== "admin" && !canViewAllTuition() && !staffClassIds.has(classId)) return;

      const cls = classMap[classId];
      if (!cls) return;

      let suppCount = 0;
      let suppTotalFee = 0;
      const attendanceDetails = [];

      items.forEach(item => {
        const sess = item.session;
        const st = item.student;
        const attStatus = st.attendance_status || "present";
        const isCharged = ["present", "late"].includes(attStatus);
        const fee = Number(st.tuition_fee ?? sess.fee_per_student ?? 0);

        if (isCharged) {
          suppCount++;
          suppTotalFee += fee;
        }

        attendanceDetails.push({
          date: item.date,
          status: attStatus === "absent" ? "absent" : "supplementary",
          schedule_id: 999000,
          session_no: 0,
          scheduleLabel: `⭐ Buổi dạy bổ sung: ${sess.topic}${attStatus === "absent" ? " (Vắng - 0đ)" : ` (+${fmt(fee)}đ)`}`,
          isSupplementary: true,
          fee: isCharged ? fee : 0,
        });
      });

      if (!suppCount && !attendanceDetails.length) return;

      rows.push({
        studentId,
        classId,
        studentName: "Học sinh",
        phone: "",
        parentContacts: canViewStudentPhone() ? (parentContactMap[studentId] || []) : [],
        className: cls.class_name,
        tuitionType: "per_session",
        tuitionFee: 0,
        makeupFee: 0,
        scheduleLabel: "Buổi dạy bổ sung",
        totalSessions: 0, present: 0, absent: 0, makeup: 0, trialCount: 0,
        suppCount, suppTotalFee,
        attendanceDetails,
        billableSessions: suppCount, feePerSession: 0, amount: suppTotalFee,
        noteCalc: `Dạy bổ sung (${suppCount} buổi): +${fmt(suppTotalFee)}đ`,
        ym,
      });
    });

    return discounts.apply(rows.map(row => {
      const payment = payments[row.studentId];
      if (!payment?.locked_at || String(payment.month).slice(0, 7) !== row.ym) return row;
      const component = payment.gross_components?.find(c => c.class_id === row.classId);
      return { ...row, frozenPercent: Number(component?.percent || 0) };
    }), viewer.discountRules || []);
  }


  if (isNode) module.exports = { buildRowsForMonth };
  else window.TuitionCalculation = { buildRowsForMonth };
})();
