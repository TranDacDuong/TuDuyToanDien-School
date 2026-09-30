(function(){
  const overlay = document.getElementById("classQuickOverlay");
  const body = document.getElementById("classQuickBody");
  const title = document.getElementById("classQuickTitle");
  const subtitle = document.getElementById("classQuickSubtitle");
  if(!overlay || !body || !title || !subtitle) return;

  let currentAction = "";

  function getSb(){ return window.sb || sb; }
  function todayValue(){
    const date = new Date();
    return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
  }
  function esc(value){
    return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  function normalize(value){
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase();
  }
  function classes(){ return window.getClassQuickActionData?.() || []; }
  function isStaff(){ return ["admin","teacher","assistant"].includes(window._currentRole || ""); }

  function setHeader(nextTitle, nextSubtitle){
    title.textContent = nextTitle;
    subtitle.textContent = nextSubtitle;
  }

  function renderHome(){
    currentAction = "";
    setHeader("Bạn muốn sử dụng chức năng gì?", "Chọn thao tác để bắt đầu nhanh.");
    body.innerHTML = `
      <div class="class-quick-grid">
        <button class="class-quick-action" type="button" data-quick-action="create">
          <span class="class-quick-icon">＋</span><strong>Tạo buổi học</strong><span>Chọn lớp và mở ngay form tạo nội dung buổi học.</span>
        </button>
        <button class="class-quick-action primary" type="button" data-quick-action="attendance">
          <span class="class-quick-icon">✓</span><strong>Điểm danh</strong><span>Ưu tiên lớp hôm nay và kiểm tra buổi học trước khi mở điểm danh.</span>
        </button>
        <button class="class-quick-action" type="button" data-quick-action="manage">
          <span class="class-quick-icon">☷</span><strong>Quản lý lớp học</strong><span>Mở giao diện đầy đủ như hiện tại.</span>
        </button>
      </div>`;
    body.querySelector('[data-quick-action="create"]')?.addEventListener("click", renderCreateLauncher);
    body.querySelector('[data-quick-action="attendance"]')?.addEventListener("click", () => renderClassPicker("attendance"));
    body.querySelector('[data-quick-action="manage"]')?.addEventListener("click", close);
  }

  function classMeta(row){
    const parts = [];
    if(row.subject_name) parts.push(row.subject_name);
    if(row.grade_name) parts.push("Khối "+row.grade_name);
    if(row.is_today){
      const times = (row.today_times || []).map(item => {
        const range = [item.start_time,item.end_time].filter(Boolean).join("-");
        return range+(item.room_name ? " · "+item.room_name : "");
      }).join("; ");
      if(times) parts.push("Hôm nay "+times);
    }
    return parts.join(" · ") || "Chưa có thông tin lịch học";
  }

  function renderClassRows(keyword = ""){
    const list = document.getElementById("classQuickList");
    if(!list) return;
    const needle = normalize(keyword);
    const rows = classes().filter(row => !needle || normalize([row.class_name,row.subject_name,row.grade_name,classMeta(row)].join(" ")).includes(needle));
    if(!rows.length){
      list.innerHTML = '<div class="class-quick-empty">Không tìm thấy lớp phù hợp.</div>';
      return;
    }
    list.innerHTML = rows.map(row => `
      <button class="class-quick-class ${row.is_today ? "today" : ""}" type="button" data-class-id="${esc(row.id)}">
        <span><strong>${esc(row.class_name)}</strong><small>${esc(classMeta(row))}</small></span>
        ${row.is_today ? '<span class="class-quick-today">Hôm nay</span>' : '<span aria-hidden="true">›</span>'}
      </button>`).join("");
    list.querySelectorAll("[data-class-id]").forEach(button => {
      button.addEventListener("click", () => selectClass(button.dataset.classId));
    });
  }

  function renderCreateLauncher(){
    currentAction = "create";
    const rows = classes();
    setHeader("Tạo buổi học", "Chọn lớp học để tải đúng lịch và nội dung buổi.");
    if(!rows.length){
      body.innerHTML = '<button class="class-quick-back" type="button" id="classQuickBack">← Chọn chức năng khác</button><div class="class-quick-empty" style="margin-top:12px">Không có lớp học phù hợp để tạo buổi.</div>';
      document.getElementById("classQuickBack")?.addEventListener("click", renderHome);
      return;
    }
    body.innerHTML = `
      <button class="class-quick-back" type="button" id="classQuickBack">← Chọn chức năng khác</button>
      <div style="margin-top:14px">
        <label for="classQuickCreateClass">Lớp học</label>
        <select id="classQuickCreateClass" style="width:100%">
          <option value="">Chọn lớp để tạo buổi học</option>
          ${rows.map(row => `<option value="${esc(row.id)}">${esc(row.class_name)}${row.is_today ? " · Có lịch hôm nay" : ""}</option>`).join("")}
        </select>
        <div class="class-quick-empty" style="margin-top:12px;text-align:left">Sau khi chọn lớp, hệ thống sẽ mở ngay form Tạo buổi học và tự chọn ngày hôm nay nếu lớp có lịch.</div>
      </div>`;
    document.getElementById("classQuickBack")?.addEventListener("click", renderHome);
    const select = document.getElementById("classQuickCreateClass");
    select?.addEventListener("change", async event => {
      const row = rows.find(item => String(item.id) === String(event.target.value));
      if(row) await openSessionForm(row,false);
    });
    if(rows.length === 1){
      select.value = String(rows[0].id);
      setTimeout(() => openSessionForm(rows[0],false), 80);
    } else {
      setTimeout(() => select?.focus(), 50);
    }
  }

  function renderClassPicker(action){
    currentAction = action;
    setHeader(action === "attendance" ? "Chọn lớp để điểm danh" : "Tạo buổi học",
      "Các lớp có lịch hôm nay được đưa lên đầu danh sách.");
    body.innerHTML = `
      <button class="class-quick-back" type="button" id="classQuickBack">← Chọn chức năng khác</button>
      <input class="class-quick-search" id="classQuickSearch" type="search" placeholder="Tìm tên lớp, môn hoặc khối..." autocomplete="off">
      <div class="class-quick-list" id="classQuickList"></div>`;
    document.getElementById("classQuickBack")?.addEventListener("click", renderHome);
    document.getElementById("classQuickSearch")?.addEventListener("input", event => renderClassRows(event.target.value));
    renderClassRows();
    setTimeout(() => document.getElementById("classQuickSearch")?.focus(), 50);
  }

  async function openAttendance(row){
    close();
    await window.openClassView?.(row.id,row.class_name);
    await window.cvSwitchTab?.("attendance");
    setTimeout(() => window.cvFocusAttendanceDate?.(todayValue()), 120);
  }

  async function openSessionForm(row, returnToAttendance){
    close();
    await window.openClassView?.(row.id,row.class_name);
    await window.cvSwitchTab?.("exams");
    await window.cvOpenAddClassSession?.("",{
      preselectedDate: row.is_today ? todayValue() : "",
      afterSave: returnToAttendance ? "attendance" : "exams"
    });
  }

  function renderMissingSession(row){
    if(!row.is_today){
      setHeader("Lớp không có lịch hôm nay", row.class_name);
      body.innerHTML = `
        <div class="class-quick-confirm">
          <div class="class-quick-confirm-icon">!</div>
          <h3>Lớp không có lịch học hôm nay</h3>
          <p><strong>${esc(row.class_name)}</strong> không có ca học trong lịch hôm nay. Bạn có thể chọn lớp khác hoặc vẫn mở bảng điểm danh để xem và điều chỉnh các ngày trước.</p>
          <div class="class-quick-confirm-actions">
            <button class="btn btn-primary" type="button" id="classQuickChooseAgain">Chọn lớp khác</button>
            <button class="btn btn-outline" type="button" id="classQuickSkipToday">Bỏ qua</button>
          </div>
        </div>`;
      document.getElementById("classQuickChooseAgain")?.addEventListener("click", () => renderClassPicker("attendance"));
      document.getElementById("classQuickSkipToday")?.addEventListener("click", () => openAttendance(row));
      return;
    }
    setHeader("Chưa có buổi học hôm nay", row.class_name);
    body.innerHTML = `
      <div class="class-quick-confirm">
        <div class="class-quick-confirm-icon">!</div>
        <h3>Hôm nay chưa tạo buổi học</h3>
        <p>Bạn có muốn tạo buổi học cho <strong>${esc(row.class_name)}</strong> ngay bây giờ không? Sau khi lưu, hệ thống sẽ tự chuyển sang bảng điểm danh.</p>
        <div class="class-quick-confirm-actions">
          <button class="btn btn-primary" type="button" id="classQuickCreateToday">Tạo buổi học</button>
          <button class="btn btn-outline" type="button" id="classQuickSkipToday">Bỏ qua</button>
        </div>
      </div>`;
    document.getElementById("classQuickCreateToday")?.addEventListener("click", () => openSessionForm(row,true));
    document.getElementById("classQuickSkipToday")?.addEventListener("click", () => openAttendance(row));
  }

  async function selectClass(classId){
    const row = classes().find(item => String(item.id) === String(classId));
    if(!row) return;
    if(currentAction === "create"){
      await openSessionForm(row,false);
      return;
    }
    const today = todayValue();
    setHeader("Đang kiểm tra buổi học...", row.class_name);
    body.innerHTML = '<div class="class-quick-empty">Đang kiểm tra dữ liệu hôm nay...</div>';
    const { data, error } = await getSb().from("class_sessions").select("id").eq("class_id",row.id).eq("session_date",today).limit(1);
    if(error){
      setHeader("Không kiểm tra được buổi học", row.class_name);
      body.innerHTML = `<div class="class-quick-empty" style="color:var(--red)">${esc(error.message)}</div><div style="margin-top:12px"><button class="btn btn-outline btn-sm" type="button" id="classQuickRetry">Quay lại chọn lớp</button></div>`;
      document.getElementById("classQuickRetry")?.addEventListener("click", () => renderClassPicker("attendance"));
      return;
    }
    if((data || []).length){
      await openAttendance(row);
      return;
    }
    renderMissingSession(row);
  }

  function open(){
    if(!isStaff()) return;
    overlay.classList.remove("hidden");
    renderHome();
  }
  function close(){ overlay.classList.add("hidden"); }

  overlay.addEventListener("click", event => { if(event.target === overlay) close(); });
  window.addEventListener("keydown", event => { if(event.key === "Escape" && !overlay.classList.contains("hidden")) close(); });
  window.addEventListener("message", event => {
    if(event.data?.type !== "class:open-quick-actions") return;
    if(event.source !== window && event.source !== window.parent) return;
    if(window._currentRole) open();
    else window.addEventListener("mindup:classes-ready", open, { once:true });
  });
  window.ClassQuickActions = { open, close, renderHome };
})();
