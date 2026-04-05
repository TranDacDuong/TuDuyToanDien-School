(function () {

  /* ─────────────────────────────────────────────
     UTILS
  ───────────────────────────────────────────── */
  function getSb() {
    if (window.sb) return window.sb;
    if (typeof sb !== "undefined") return sb;
    throw new Error("Supabase chưa sẵn");
  }

  function fmt(v) {
    return new Intl.NumberFormat("vi-VN").format(Math.round(v));
  }

  function toAscii(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildTransferContent(studentName, ym) {
    const [year, month] = String(ym || "").split("-");
    const cleanName = toAscii(studentName).replace(/\s+/g, " ").toUpperCase();
    const cleanMonth = [month, year].filter(Boolean).join(" ").trim();
    return `${cleanName} NOP TIEN HOC THANG ${cleanMonth}`.trim();
  }

  function buildPaymentQrUrl(studentName, ym, amount) {
    const finalAmount = Math.max(0, Math.round(Number(amount) || 0));
    if (!finalAmount) return "";
    const addInfo = buildTransferContent(studentName, ym);
    return `https://img.vietqr.io/image/TCB-8209224001-compact2.png?amount=${encodeURIComponent(finalAmount)}&addInfo=${encodeURIComponent(addInfo)}`;
  }

  function buildPaymentQrBlock(studentName, ym, amount) {
    const finalAmount = Math.max(0, Math.round(Number(amount) || 0));
    if (!finalAmount) {
      return `<div class="qr-payment-card"><div class="qr-payment-text"><div class="qr-payment-title">Mã QR thanh toán</div><div class="qr-payment-note">Học phí đã được thanh toán đủ nên không cần tạo mã QR.</div></div></div>`;
    }
    const qrUrl = buildPaymentQrUrl(studentName, ym, finalAmount);
    const transferContent = buildTransferContent(studentName, ym);
    return `
      <div class="qr-payment-card">
        <div class="qr-payment-media">
          <img class="qr-payment-image" src="${qrUrl}" alt="QR thanh toán học phí" referrerpolicy="no-referrer">
        </div>
        <div class="qr-payment-text">
          <div class="qr-payment-title">Quét mã để thanh toán học phí</div>
          <div class="qr-payment-line"><span>Ngân hàng:</span><b>Techcombank</b></div>
          <div class="qr-payment-line"><span>Số tài khoản:</span><b>8209224001</b></div>
          <div class="qr-payment-line"><span>Số tiền:</span><b>${fmt(finalAmount)}đ</b></div>
          <div class="qr-payment-line"><span>Nội dung CK:</span><b>${transferContent}</b></div>
          <div class="qr-payment-note">Khi quét QR, ứng dụng ngân hàng sẽ tự điền sẵn số tiền và nội dung chuyển khoản.</div>
        </div>
      </div>
    `;
  }

  function todayYM() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  }

  function ymToDate(ym) { return ym + "-01"; }

  function monthEnd(ym) {
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(y, m, 0);
    return `${y}-${String(m).padStart(2,"0")}-${String(last.getDate()).padStart(2,"0")}`;
  }

  function generateDates(schedules, ym) {
    const [year, month] = ym.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const weekday = date.getDay() === 0 ? 7 : date.getDay();
      schedules.forEach(s => {
        if (s.weekday === weekday) {
          dates.push(`${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
        }
      });
    }
    return dates.sort();
  }

  function getSchedulesForMonth(allSchedules, ym) {
    const mStart = ymToDate(ym);
    const eligible = allSchedules.filter(s => (s.effective_from || "2000-01-01") <= mStart);
    if (eligible.length === 0) return [];
    const maxEf = eligible.reduce((max, s) => {
      const ef = s.effective_from || "2000-01-01";
      return ef > max ? ef : max;
    }, "2000-01-01");
    return eligible.filter(s => (s.effective_from || "2000-01-01") === maxEf);
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
      // fee - (absent × fee/tổng) + (makeup × makeup_fee)
      const perSession = totalSessions > 0 ? fee / totalSessions : 0;
      const mFee       = mkFee !== null ? mkFee : perSession;
      feePerSession    = perSession;
      amount           = fee - (absent * perSession) + (makeup * mFee);
      amount           = Math.max(0, amount);
      billableSessions = totalSessions - absent + makeup;
      noteCalc = `${fmt(perSession)}đ/buổi`;
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

  const tuitionLabel = {
    per_session: "Theo buổi",
    per_month:   "Theo tháng",
    per_course:  "Theo khoá",
  };

  /* Trạng thái dựa vào amount_paid vs amount_due */
  function getStatus(amountDue, amountPaid) {
    if (!amountPaid || amountPaid <= 0) return "unpaid";
    if (amountPaid < amountDue)         return "partial";
    if (amountPaid > amountDue)         return "overpaid";
    return "paid";
  }

  const statusLabel = {
    unpaid:   "Chưa nộp",
    partial:  "Chưa nộp đủ",
    paid:     "Đã nộp đủ",
    overpaid: "Nộp thừa",
  };

  /* ─────────────────────────────────────────────
     STATE
     allRows  : mảng chi tiết từng học sinh × lớp (dùng để tính)
     grouped  : mảng đã gộp theo studentId (dùng để hiển thị)
     paymentMap: studentId → payment record (1 payment/học sinh/tháng)
  ───────────────────────────────────────────── */
  let allRows    = [];
  let grouped    = [];
  let paymentMap = {};
  let currentRows = [];
  let currentRole = "admin";
  let currentUserId = null;

  function canViewStudentPhone() {
    return currentRole === "admin";
  }

  function canManagePayments() {
    return currentRole === "admin";
  }

  function syncToolbarVisibility() {
    const notifyBtn = document.getElementById("notifyTuitionBtn");
    if (notifyBtn) notifyBtn.style.display = currentRole === "admin" ? "" : "none";
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("vi-VN");
  }

  function getStudentGroup(studentId) {
    return currentRows.find(r => r.studentId === studentId)
      || grouped.find(r => r.studentId === studentId)
      || null;
  }

  function buildTuitionDetailHtml(group) {
    const payment = paymentMap[group.studentId];
    const amountPaid = payment?.amount_paid || 0;
    const status = getStatus(group.amount, amountPaid);
    const remaining = Math.max(0, group.amount - amountPaid);
    const overpaid = Math.max(0, amountPaid - group.amount);
    const qrAmount = remaining > 0 ? remaining : 0;

    return `
      <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-size:12px;color:var(--muted)">Tháng</div>
          <div style="font-size:15px;font-weight:700;color:var(--navy)">${group.ym}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--muted)">Trạng thái</div>
          <div><span class="status-badge ${status}">${statusLabel[status]}</span></div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--muted)">Đã nộp</div>
          <div style="font-size:15px;font-weight:700;color:var(--green)">${fmt(amountPaid)}đ</div>
        </div>
      </div>
      ${group.classes.map(c => `
        <div class="detail-card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
            <span class="class-tag">${c.className}</span>
            <div style="font-weight:700;color:var(--navy)">${fmt(c.amount)}đ</div>
          </div>
          ${c.scheduleLabel ? `<div style="margin-top:8px;font-size:12px;color:var(--muted)">📅 ${c.scheduleLabel}</div>` : ""}
          <div class="detail-grid">
            <div class="detail-metric">
              <div class="label">Kiểu học phí</div>
              <div class="value">${tuitionLabel[c.tuitionType] || c.tuitionType}</div>
            </div>
            <div class="detail-metric">
              <div class="label">Tổng buổi</div>
              <div class="value">${c.totalSessions}</div>
            </div>
            <div class="detail-metric">
              <div class="label">Có mặt</div>
              <div class="value">${c.present}</div>
            </div>
            <div class="detail-metric">
              <div class="label">Vắng</div>
              <div class="value">${c.absent}</div>
            </div>
            <div class="detail-metric">
              <div class="label">Học bù</div>
              <div class="value">${c.makeup}</div>
            </div>
          </div>
          ${c.noteCalc ? `<div style="margin-top:10px;font-size:12px;color:var(--muted)">${c.noteCalc}</div>` : ""}
        </div>
      `).join("")}
      <div class="detail-card">
        <div class="detail-grid">
          <div class="detail-metric">
            <div class="label">Tổng cần thu</div>
            <div class="value">${fmt(group.amount)}đ</div>
          </div>
          <div class="detail-metric">
            <div class="label">Còn thiếu</div>
            <div class="value">${fmt(remaining)}đ</div>
          </div>
          <div class="detail-metric">
            <div class="label">Nộp thừa</div>
            <div class="value">${fmt(overpaid)}đ</div>
          </div>
          <div class="detail-metric">
            <div class="label">Ngày thu gần nhất</div>
            <div class="value">${fmtDate(payment?.paid_at)}</div>
          </div>
        </div>
        ${payment?.note ? `<div class="invoice-note" style="margin-top:12px">${payment.note}</div>` : ""}
        <div style="margin-top:16px">${buildPaymentQrBlock(group.studentName, group.ym, qrAmount)}</div>
      </div>
    `;
  }

  /* ─────────────────────────────────────────────
     HELPER: upsert payment record
  ───────────────────────────────────────────── */
  async function upsertPayment(studentId, ym, fields) {
    const sb = getSb();
    const existing = paymentMap[studentId] || {};
    const { data, error } = await sb
      .from("tuition_payments")
      .upsert({
        student_id:  studentId,
        class_id:    null,
        month:       ymToDate(ym),
        amount_due:  fields.amount_due  ?? existing.amount_due  ?? 0,
        amount_paid: fields.amount_paid ?? existing.amount_paid ?? 0,
        paid_at:     fields.paid_at     !== undefined ? fields.paid_at : (existing.paid_at || null),
        note:        fields.note        !== undefined ? fields.note    : (existing.note    || null),
      }, { onConflict: "student_id,month" })
      .select().single();
    if (error) throw error;
    paymentMap[studentId] = data;
  }

  /* ─────────────────────────────────────────────
     THU TIỀN — nhập số tiền phụ huynh nộp
  ───────────────────────────────────────────── */
  window.collectPayment = async function (studentId, ym, amountDue) {
    const existing   = paymentMap[studentId];
    const alreadyPaid = existing?.amount_paid || 0;
    const remaining  = amountDue - alreadyPaid;

    const input = prompt(
      `Thu tiền cho học sinh
Cần thu: ${fmt(amountDue)}đ
Đã thu: ${fmt(alreadyPaid)}đ
Còn thiếu: ${fmt(remaining)}đ

Nhập số tiền thu thêm lần này:`,
      remaining > 0 ? remaining : ""
    );
    if (input === null) return;

    const addAmount = parseInt(input.replace(/[^0-9]/g, ""));
    if (isNaN(addAmount) || addAmount <= 0) { alert("Số tiền không hợp lệ"); return; }

    const newPaid = alreadyPaid + addAmount;
    const now     = new Date().toISOString();

    try {
      await upsertPayment(studentId, ym, {
        amount_due:  amountDue,
        amount_paid: newPaid,
        paid_at:     now,
      });
      await window.AppAdminTools?.recordAudit?.("tuition_payment_collected", {
        target_type: "tuition_payment",
        target_id: paymentMap[studentId]?.id || null,
        student_id: studentId,
        month: ym,
        amount_due: amountDue,
        added_amount: addAmount,
        amount_paid: newPaid,
      });
      renderRows();
    } catch (err) { alert("Lỗi: " + err.message); }
  };

  /* ─────────────────────────────────────────────
     HOÀN TIỀN — trừ vào amount_paid
  ───────────────────────────────────────────── */
  window.refundPayment = async function (studentId, ym, amountDue) {
    const existing   = paymentMap[studentId];
    const alreadyPaid = existing?.amount_paid || 0;
    if (alreadyPaid <= 0) { alert("Chưa có tiền nào được thu"); return; }

    const input = prompt(
      `Hoàn tiền cho học sinh
Đã thu: ${fmt(alreadyPaid)}đ

Nhập số tiền hoàn lại (>0):`,
      ""
    );
    if (input === null) return;

    const refund = parseInt(input.replace(/[^0-9]/g, ""));
    if (isNaN(refund) || refund <= 0) { alert("Số tiền không hợp lệ"); return; }
    if (refund > alreadyPaid) { alert(`Không thể hoàn nhiều hơn đã thu (${fmt(alreadyPaid)}đ)`); return; }

    const newPaid = alreadyPaid - refund;
    // Nếu hoàn hết thì xóa paid_at
    const newPaidAt = newPaid > 0 ? (existing?.paid_at || new Date().toISOString()) : null;

    try {
      await upsertPayment(studentId, ym, {
        amount_due:  amountDue,
        amount_paid: newPaid,
        paid_at:     newPaidAt,
      });
      await window.AppAdminTools?.recordAudit?.("tuition_payment_refunded", {
        target_type: "tuition_payment",
        target_id: paymentMap[studentId]?.id || null,
        student_id: studentId,
        month: ym,
        amount_due: amountDue,
        refund_amount: refund,
        amount_paid: newPaid,
      });
      renderRows();
    } catch (err) { alert("Lỗi: " + err.message); }
  };

  /* ─────────────────────────────────────────────
     GHI CHÚ
  ───────────────────────────────────────────── */
  window.editNote = async function (studentId, ym, amountDue) {
    const existing = paymentMap[studentId];
    const newNote  = prompt("Ghi chú:", existing?.note || "");
    if (newNote === null) return;
    try {
      await upsertPayment(studentId, ym, { amount_due: amountDue, note: newNote || null });
      await window.AppAdminTools?.recordAudit?.("tuition_note_updated", {
        target_type: "tuition_payment",
        target_id: paymentMap[studentId]?.id || null,
        student_id: studentId,
        month: ym,
        has_note: !!(newNote || "").trim(),
      });
      renderRows();
    } catch (err) { alert("Lỗi: " + err.message); }
  };

  /* ─────────────────────────────────────────────
     INIT CONTROLS
  ───────────────────────────────────────────── */
  const monthPicker = document.getElementById("monthPicker");
  const monthQuery = new URLSearchParams(location.search).get("month");
  monthPicker.value = /^\d{4}-\d{2}$/.test(monthQuery || "") ? monthQuery : todayYM();

  async function loadViewerContext() {
    const sb = getSb();
    const user = await window.AppAuth?.getUser?.();
    if (!user) {
      location.href = "index.html";
      return;
    }
    currentUserId = user.id;

    const { data: profile } = await sb
      .from("users")
      .select("role, full_name")
      .eq("id", user.id)
      .single();
    currentRole = profile?.role || "student";
    if (currentRole === "teacher") {
      location.href = "dashboard.html";
      return false;
    }

    const titleEl = document.querySelector("h1");
    const subtitleEl = document.querySelector(".subtitle");
    if (currentRole === "student") {
      if (titleEl) titleEl.textContent = "Học phí của tôi";
      if (subtitleEl) subtitleEl.textContent = "Xem học phí của bạn theo từng tháng và từng lớp học";
    }
    return true;
  }

  function syncToolbarVisibility() {
    const classFilter = document.getElementById("classFilter");
    const paidFilter = document.getElementById("paidFilter");
    const notifyBtn = document.getElementById("notifyTuitionBtn");
    const rowCount = document.getElementById("rowCount");
    const summary = document.querySelector(".summary-row");
    const tableWrap = document.querySelector(".table-wrap");
    const studentDetailView = document.getElementById("studentDetailView");
    const toolbarButtons = [...document.querySelectorAll(".toolbar button")];
    const reloadBtn = toolbarButtons.find(btn => btn.textContent.includes("Tải lại"));
    const printBtn = toolbarButtons.find(btn => btn.textContent.includes("In"));

    if (currentRole === "student") {
      if (classFilter) classFilter.style.display = "none";
      if (paidFilter) paidFilter.style.display = "none";
      if (notifyBtn) notifyBtn.style.display = "none";
      if (reloadBtn) reloadBtn.style.display = "none";
      if (printBtn) printBtn.style.display = "none";
      if (rowCount) rowCount.style.display = "none";
      if (summary) summary.style.display = "none";
      if (tableWrap) tableWrap.style.display = "none";
      if (studentDetailView) studentDetailView.classList.add("show");
      return;
    }

    if (classFilter) classFilter.style.display = "";
    if (rowCount) rowCount.style.display = "";
    if (summary) summary.style.display = "";
    if (tableWrap) tableWrap.style.display = "";
    if (reloadBtn) reloadBtn.style.display = "";
    if (printBtn) printBtn.style.display = "";
    if (notifyBtn) notifyBtn.style.display = currentRole === "admin" ? "" : "none";
    if (studentDetailView) studentDetailView.classList.remove("show");
    if (paidFilter) paidFilter.style.display = canManagePayments() ? "" : "none";
  }

  function syncClassFilterOptions() {
    const sel = document.getElementById("classFilter");
    if (!sel) return;
    const currentValue = sel.value || "";
    const classMap = {};
    allRows.forEach(r => {
      classMap[r.classId] = r.className;
    });
    const options = Object.entries(classMap).sort((a, b) => a[1].localeCompare(b[1]));
    sel.innerHTML = `<option value="">Tất cả lớp</option>`;
    options.forEach(([id, name]) => sel.appendChild(new Option(name, id)));
    if (currentValue && classMap[currentValue]) sel.value = currentValue;
  }

  /* ─────────────────────────────────────────────
     LOAD CLASS FILTER
  ───────────────────────────────────────────── */
  async function loadClassFilter() {
    if (!canManagePayments()) {
      syncClassFilterOptions();
      return;
    }
    const sb = getSb();
    const { data } = await sb
      .from("classes").select("id, class_name")
      .eq("hidden", false).order("class_name");

    const sel = document.getElementById("classFilter");
    sel.innerHTML = `<option value="">Tất cả lớp</option>`;
    (data || []).forEach(c => sel.appendChild(new Option(c.class_name, c.id)));
  }

  /* ─────────────────────────────────────────────
     MAIN LOAD
  ───────────────────────────────────────────── */
  window.loadTuition = async function () {
    const ym = monthPicker.value;
    if (!ym) return;

    const tbody = document.getElementById("tuitionBody");
    tbody.innerHTML = `<tr><td colspan="9" class="loading">⏳ Đang tính học phí...</td></tr>`;

    const sb     = getSb();
    const mStart = ymToDate(ym);
    const mEnd   = monthEnd(ym);

    try {
      const [
        { data: classes,       error: e1 },
        { data: classStudents, error: e2 },
        { data: attData,       error: e3 },
        { data: payments,      error: e4 },
      ] = await Promise.all([
        sb.from("classes")
          .select(`id, class_name, tuition_fee, tuition_type, makeup_fee,
                   class_schedules(weekday, start_time, end_time, effective_from)`)
          .eq("hidden", false),

        sb.from("class_students")
          .select(`id, class_id, student_id, joined_at, left_at,
                   user:users!fk_student(id, full_name, email${canViewStudentPhone() ? ", phone" : ""})`),

        sb.from("attendance")
          .select("student_id, class_id, date, status")
          .gte("date", mStart).lte("date", mEnd),

        // payment theo student_id + month (không cần class_id nữa)
        sb.from("tuition_payments")
          .select("*").eq("month", mStart),
      ]);

      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      if (e4) throw e4;

      const classMap = {};
      (classes || []).forEach(c => { classMap[c.id] = c; });

      const attMap = {};
      (attData || []).forEach(a => {
        attMap[`${a.student_id}_${a.class_id}_${a.date}`] = a.status;
      });

      // paymentMap: studentId → record
      paymentMap = {};
      (payments || []).forEach(p => { paymentMap[p.student_id] = p; });

      // Tính chi tiết từng học sinh × lớp
      allRows = [];
      (classStudents || []).forEach(cs => {
        if (currentRole === "student" && cs.student_id !== currentUserId) return;
        const cls = classMap[cs.class_id];
        if (!cls) return;

        const joined = cs.joined_at ? cs.joined_at.slice(0, 10) : "0000-00-00";
        const left   = cs.left_at   ? cs.left_at.slice(0, 10)   : "9999-99-99";
        if (joined > mEnd || left < mStart) return;

        const schedules   = getSchedulesForMonth(cls.class_schedules || [], ym);
        const allDates    = generateDates(schedules, ym);
        const activeDates = allDates.filter(d => d >= joined && d <= left);
        const totalSessions = activeDates.length;

        let present = 0, absent = 0, makeup = 0;
        activeDates.forEach(d => {
          const status = attMap[`${cs.student_id}_${cs.class_id}_${d}`] || "present";
          if (status === "present")     present++;
          else if (status === "absent") absent++;
          else if (status === "makeup") makeup++;
        });

        const { billableSessions, feePerSession, amount, noteCalc } = calcTuition({
          tuition_type: cls.tuition_type,
          tuition_fee:  cls.tuition_fee,
          makeup_fee:   cls.makeup_fee,
          present, absent, makeup, totalSessions,
        });

        // Tạo label lịch học: "T2 (07:00–09:00), T4 (07:00–09:00)"
        const daysMap = {1:"T2",2:"T3",3:"T4",4:"T5",5:"T6",6:"T7",7:"CN"};
        const scheduleLabel = schedules
          .map(s => `${daysMap[s.weekday]} (${s.start_time.slice(0,5)}–${s.end_time.slice(0,5)})`)
          .join(", ");

        allRows.push({
          studentId:   cs.student_id,
          classId:     cs.class_id,
          studentName: cs.user?.full_name || "—",
          phone:       canViewStudentPhone() ? (cs.user?.phone || "") : "",
          className:   cls.class_name,
          tuitionType: cls.tuition_type,
          tuitionFee:  cls.tuition_fee,
          makeupFee:   cls.makeup_fee,
          scheduleLabel,
          totalSessions, present, absent, makeup,
          billableSessions, feePerSession, amount, noteCalc, ym,
        });
      });

      // Gộp theo studentId
      buildGrouped();
      syncClassFilterOptions();
      renderRows();

    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="9" class="empty">❌ Lỗi: ${err.message}</td></tr>`;
    }
  };

  /* ─────────────────────────────────────────────
     BUILD GROUPED — gộp allRows theo studentId
  ───────────────────────────────────────────── */
  function buildGrouped() {
    const map = {};
    allRows.forEach(r => {
      if (!map[r.studentId]) {
        map[r.studentId] = {
          studentId:   r.studentId,
          studentName: r.studentName,
          phone:       r.phone,
          ym:          r.ym,
          classes:     [],           // chi tiết từng lớp
          totalSessions: 0,
          present: 0, absent: 0, makeup: 0,
          billableSessions: 0,
          amount: 0,
        };
      }
      const g = map[r.studentId];
      g.classes.push({
        className:        r.className,
        tuitionType:      r.tuitionType,
        tuitionFee:       r.tuitionFee,
        makeupFee:        r.makeupFee,
        scheduleLabel:    r.scheduleLabel,
        totalSessions:    r.totalSessions,
        present:          r.present,
        absent:           r.absent,
        makeup:           r.makeup,
        billableSessions: r.billableSessions,
        feePerSession:    r.feePerSession,
        amount:           r.amount,
        noteCalc:         r.noteCalc,
      });
      g.totalSessions   += r.totalSessions;
      g.present         += r.present;
      g.absent          += r.absent;
      g.makeup          += r.makeup;
      g.billableSessions += r.billableSessions;
      g.amount          += r.amount;
    });

    grouped = Object.values(map).sort((a, b) =>
      a.studentName.localeCompare(b.studentName)
    );
  }

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  function renderRows() {
    const ym          = monthPicker.value;
    const classFilter = document.getElementById("classFilter")?.value || "";
    const paidFilter  = document.getElementById("paidFilter")?.value || "";

    // Filter trên allRows trước, rồi re-group
    let filtered = [...allRows];
    if (classFilter) filtered = filtered.filter(r => r.classId === classFilter);

    // Re-group sau khi filter lớp
    const map = {};
    filtered.forEach(r => {
      if (!map[r.studentId]) {
        map[r.studentId] = {
          studentId: r.studentId, studentName: r.studentName,
          phone: r.phone, ym: r.ym,
          classes: [], totalSessions: 0,
          present: 0, absent: 0, makeup: 0, billableSessions: 0, amount: 0,
        };
      }
      const g = map[r.studentId];
      g.classes.push({
        className: r.className, tuitionType: r.tuitionType,
        tuitionFee: r.tuitionFee, makeupFee: r.makeupFee,
        scheduleLabel: r.scheduleLabel,
        totalSessions: r.totalSessions,
        present: r.present, absent: r.absent, makeup: r.makeup,
        billableSessions: r.billableSessions, feePerSession: r.feePerSession,
        amount: r.amount, noteCalc: r.noteCalc,
      });
      g.totalSessions    += r.totalSessions;
      g.present          += r.present;
      g.absent           += r.absent;
      g.makeup           += r.makeup;
      g.billableSessions += r.billableSessions;
      g.amount           += r.amount;
    });

    let rows = Object.values(map).sort((a, b) => a.studentName.localeCompare(b.studentName));

    // Filter theo trạng thái thanh toán
    if (paidFilter) {
      rows = rows.filter(r => {
        const p = paymentMap[r.studentId];
        return getStatus(r.amount, p?.amount_paid || 0) === paidFilter;
      });
    }

    currentRows = rows;

    if (currentRole === "student") {
      const detailWrap = document.getElementById("studentDetailView");
      const detailBody = document.getElementById("studentDetailBody");
      if (detailWrap && detailBody) {
        if (rows[0]) {
          detailWrap.classList.add("show");
          detailBody.innerHTML = buildTuitionDetailHtml(rows[0]);
        } else {
          detailWrap.classList.add("show");
          detailBody.innerHTML = '<div class="empty" style="padding:24px 0">Không có dữ liệu học phí trong tháng này.</div>';
        }
      }
      return;
    }

    const tbody = document.getElementById("tuitionBody");

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty">Không có dữ liệu</td></tr>`;
      updateSummary([], ym);
      document.getElementById("rowCount").textContent = "0 học sinh";
      return;
    }

    const frag = document.createDocumentFragment();

    rows.forEach((g, i) => {
      const payment = paymentMap[g.studentId];
      const note    = payment?.note || "";

      const amountPaid  = payment?.amount_paid || 0;
      const status      = getStatus(g.amount, amountPaid);
      const remaining   = g.amount - amountPaid;
      const overpaid    = amountPaid - g.amount;
      const noteBlock = note
        ? `<div style="margin-top:8px;font-size:12px;color:#854d0e;background:#fef9c3;
             padding:4px 8px;border-radius:6px;border:1px solid #fde68a;
             white-space:pre-wrap;word-break:break-word">📝 ${note}</div>`
        : "";
      const actionButtons = canManagePayments()
        ? `<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-start">
              <button class="action-btn collect"
               onclick="event.stopPropagation();collectPayment('${g.studentId}','${ym}',${g.amount})">
                💵 Thu tiền
              </button>
              <button class="action-btn refund"
               onclick="event.stopPropagation();refundPayment('${g.studentId}','${ym}',${g.amount})">
                ↩ Hoàn tiền
              </button>
              <button class="action-btn note ${note ? "has" : ""}"
               onclick="event.stopPropagation();editNote('${g.studentId}','${ym}',${g.amount})">
                📝 ${note ? "Sửa ghi chú" : "Ghi chú"}
              </button>
            </div>`
        : '<span style="color:var(--muted);font-size:12px">—</span>';

      const tr = document.createElement("tr");
      tr.className = "tuition-row-clickable";
      tr.setAttribute("onclick", `openTuitionDetail('${g.studentId}')`);
      tr.innerHTML = `
        <td style="color:var(--muted);vertical-align:top;padding-top:12px">${i + 1}</td>

        <td style="vertical-align:top;padding:10px 12px">
          <span class="student-trigger">
            <span class="student-name">${g.studentName}</span>
          </span>
          ${canViewStudentPhone() && g.phone ? `<div style="font-size:11px;color:var(--muted)">${g.phone}</div>` : ""}
          <div class="hint-link">Xem chi tiết ${g.classes.length} lớp học</div>
          ${noteBlock}
        </td>

        <td class="right" style="vertical-align:top;padding-top:12px;white-space:nowrap">
          <div class="amount">${fmt(g.amount)}đ</div>
        </td>

        <td class="right" style="vertical-align:top;padding-top:12px;white-space:nowrap">
          ${amountPaid > 0
            ? `<div style="font-weight:700;color:var(--green)">${fmt(amountPaid)}đ</div>
               ${payment?.paid_at
                 ? `<div style="font-size:10px;color:var(--muted)">${new Date(payment.paid_at).toLocaleDateString("vi-VN")}</div>`
                 : ""}`
            : `<span style="color:var(--muted);font-size:12px">—</span>`}
        </td>

        <td class="right" style="vertical-align:top;padding-top:12px;white-space:nowrap">
          ${status === "partial"  ? `<div style="font-weight:700;color:var(--red)">${fmt(remaining)}đ</div>` : ""}
          ${status === "overpaid" ? `<div style="font-weight:700;color:#0369a1">+${fmt(overpaid)}đ</div>` : ""}
          ${status === "unpaid"   ? `<div style="font-weight:700;color:var(--red)">${fmt(g.amount)}đ</div>` : ""}
          ${status === "paid"     ? `<span style="color:var(--green)">✓</span>` : ""}
        </td>

        <td class="center" style="vertical-align:top;padding-top:10px">
          <span class="status-badge ${status}">${statusLabel[status]}</span>
        </td>

        <td style="vertical-align:top;padding-top:8px">
          ${actionButtons}
        </td>
      `;
      frag.appendChild(tr);
    });

    tbody.innerHTML = "";
    tbody.appendChild(frag);
    updateSummary(rows, ym);
    document.getElementById("rowCount").textContent = rows.length + " học sinh";
  }

  window.openTuitionDetail = function(studentId) {
    const group = getStudentGroup(studentId);
    if (!group) return;

    const body = document.getElementById("tuitionDetailBody");
    const title = document.getElementById("tuitionDetailTitle");
    const modal = document.getElementById("tuitionDetailModal");
    if (!body || !title || !modal) return;

    title.textContent = `Chi tiết học phí - ${group.studentName}`;
    body.innerHTML = buildTuitionDetailHtml(group);
    modal.classList.add("show");
  };

  window.closeTuitionDetail = function(evt) {
    if (evt && evt.target !== evt.currentTarget) return;
    document.getElementById("tuitionDetailModal")?.classList.remove("show");
  };

  window.printInvoices = function() {
    const printArea = document.getElementById("printArea");
    if (!printArea) return;
    if (!currentRows.length) {
      alert("Không có dữ liệu để in.");
      return;
    }

    printArea.innerHTML = currentRows.map((g, index) => {
      const payment = paymentMap[g.studentId];
      const amountPaid = payment?.amount_paid || 0;
      const status = getStatus(g.amount, amountPaid);
      const remaining = Math.max(0, g.amount - amountPaid);
      const overpaid = Math.max(0, amountPaid - g.amount);
      return `
        <section class="invoice-page">
          <div class="invoice-head">
            <div>
              <div class="invoice-title">Hóa đơn học phí</div>
              <div class="invoice-meta">
                Học sinh: <b>${g.studentName}</b><br>
                ${canViewStudentPhone() && g.phone ? `SĐT: ${g.phone}<br>` : ""}
                Tháng: ${g.ym}<br>
                Trạng thái: ${statusLabel[status]}
              </div>
            </div>
            <div class="invoice-meta" style="text-align:right">
              Phiếu số: ${String(index + 1).padStart(3, "0")}<br>
              In ngày: ${new Date().toLocaleDateString("vi-VN")}<br>
              Thanh toán gần nhất: ${fmtDate(payment?.paid_at)}
            </div>
          </div>

          <table class="invoice-table">
            <thead>
              <tr>
                <th>Lớp học</th>
                <th>Lịch</th>
                <th>Điểm danh</th>
                <th>Kiểu thu</th>
                <th style="text-align:right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${g.classes.map(c => `
                <tr>
                  <td><b>${c.className}</b></td>
                  <td>${c.scheduleLabel || "—"}</td>
                  <td>Có mặt: ${c.present}<br>Vắng: ${c.absent}<br>Học bù: ${c.makeup}</td>
                  <td>${tuitionLabel[c.tuitionType] || c.tuitionType}${c.noteCalc ? `<br><span style="color:#64748b">${c.noteCalc}</span>` : ""}</td>
                  <td style="text-align:right;font-weight:700">${fmt(c.amount)}đ</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          ${payment?.note ? `<div class="invoice-note">Ghi chú: ${payment.note}</div>` : ""}

          <div class="invoice-summary">
            <div class="invoice-summary-row"><span>Tổng cần thu</span><b>${fmt(g.amount)}đ</b></div>
            <div class="invoice-summary-row"><span>Đã nộp</span><b>${fmt(amountPaid)}đ</b></div>
            <div class="invoice-summary-row"><span>Còn thiếu</span><b>${fmt(remaining)}đ</b></div>
            <div class="invoice-summary-row"><span>Nộp thừa</span><b>${fmt(overpaid)}đ</b></div>
            <div class="invoice-summary-row total"><span>Trạng thái</span><span>${statusLabel[status]}</span></div>
          </div>

          <div style="margin-top:18px">
            ${buildPaymentQrBlock(g.studentName, g.ym, remaining > 0 ? remaining : 0)}
          </div>
        </section>
      `;
    }).join("");

    document.body.classList.add("printing-invoices");
    window.print();
  };

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-invoices");
  });

  /* ─────────────────────────────────────────────
     SUMMARY
  ───────────────────────────────────────────── */
  function updateSummary(rows, ym) {
    let total = 0, collected = 0, deficit = 0, surplus = 0;
    rows.forEach(g => {
      const p       = paymentMap[g.studentId];
      const paid    = p?.amount_paid || 0;
      const status  = getStatus(g.amount, paid);
      total     += g.amount;
      collected += paid;
      if (status === "partial" || status === "unpaid") deficit  += (g.amount - paid);
      if (status === "overpaid")                       surplus  += (paid - g.amount);
    });
    document.getElementById("sumTotal").textContent    = fmt(total)     + "đ";
    document.getElementById("sumPaid").textContent     = fmt(collected) + "đ";
    document.getElementById("sumUnpaid").textContent   = fmt(deficit)   + "đ";
    document.getElementById("sumOverpaid").textContent = surplus > 0 ? fmt(surplus) + "đ" : "—";
  }

  /* ─────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────── */
  window.notifyPendingTuition = async function () {
    if (currentRole !== "admin") {
      alert("Chỉ admin mới có thể gửi thông báo học phí.");
      return;
    }
    if (!window.NotificationHelper) {
      alert("Không tải được bộ gửi thông báo.");
      return;
    }

    const ym = monthPicker.value;
    const pendingRows = (currentRows || []).filter(group => {
      const amountPaid = paymentMap[group.studentId]?.amount_paid || 0;
      const status = getStatus(group.amount, amountPaid);
      return status === "unpaid" || status === "partial";
    });

    if (!pendingRows.length) {
      alert("Không có học sinh nào đang chưa nộp hoặc chưa nộp đủ trong bộ lọc hiện tại.");
      return;
    }
    if (!confirm(`Gửi thông báo học phí cho ${pendingRows.length} học sinh đang chưa nộp hoặc chưa nộp đủ?`)) {
      return;
    }

    try {
      await window.NotificationHelper.createBulkNotifications(
        pendingRows.map(group => {
          const amountPaid = paymentMap[group.studentId]?.amount_paid || 0;
          const remaining = Math.max(0, Math.round(group.amount - amountPaid));
          const status = getStatus(group.amount, amountPaid);
          return {
            userId: group.studentId,
            type: status === "unpaid" ? "tuition_due" : "tuition_reminder",
            title: `Học phí tháng ${ym}`,
            message: status === "unpaid"
              ? `Bạn có học phí tháng ${ym} chưa thanh toán. Số tiền cần nộp là ${fmt(group.amount)}đ.`
              : `Bạn còn thiếu ${fmt(remaining)}đ học phí tháng ${ym}. Hãy kiểm tra và hoàn tất thanh toán.`,
            targetUrl: `tuition.html?month=${encodeURIComponent(ym)}`,
            meta: { month: ym, remaining_amount: remaining, total_amount: Math.round(group.amount) }
          };
        })
      );
      alert(`Đã gửi thông báo học phí cho ${pendingRows.length} học sinh.`);
    } catch (error) {
      alert("Không thể gửi thông báo học phí: " + error.message);
    }
  };

  async function init() {
    await loadViewerContext();
    syncToolbarVisibility();
    await loadClassFilter();
    await loadTuition();
  }

  window.renderRows  = renderRows;
  window.loadTuition = loadTuition;
  monthPicker.addEventListener("change", loadTuition);

  init();

})();
