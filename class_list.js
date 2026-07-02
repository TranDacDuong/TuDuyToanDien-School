(function(){

  const container = document.getElementById("classesContainer");
  if(!container) return;

  function getSb(){
    if(window.sb) return window.sb;
    if(typeof sb!=="undefined") return sb;
    throw new Error("Supabase chua san");
  }

  let _allClasses    = [];
  let _scheduleMap   = {};
  let _teacherMap    = {};
  let _studentCount  = {};
  let _teacherNameMap = {};
  let _teacherRoleMap = {};
  let _allSubjects   = [];

  function getMinRoomCapacity(schedules){
    const capacities = (schedules || [])
      .map(s => Number(s?.rooms?.capacity || 0))
      .filter(cap => Number.isFinite(cap) && cap > 0);
    return capacities.length ? Math.min(...capacities) : 0;
  }

  async function loadMyClasses(options = {}){
    if(!options.silent) container.innerHTML = '<div style="color:var(--ink-light);padding:20px">Đang tải...</div>';
    try{
      const sb   = getSb();
      const role = window._currentRole;
      const uid  = window._currentUserId;

      if(!role || !uid){
        container.innerHTML = '<div style="color:var(--red);padding:20px">Lỗi: Chưa xác thực người dùng.</div>';
        return;
      }

      let classIds = null;

      if(role === "teacher" || role === "assistant"){
        const { data: myRows } = await getSb()
          .from("class_teachers").select("class_id").eq("teacher_id", uid);
        classIds = (myRows||[]).map(r => r.class_id);
        if(!classIds.length){
          container.innerHTML = '<div style="color:var(--ink-light);padding:20px">Bạn chưa phụ trách lớp nào.</div>';
          return;
        }
      } else if(role === "student"){
        const { data: myRows } = await getSb()
          .from("class_students").select("class_id").eq("student_id", uid).is("left_at", null);
        classIds = (myRows||[]).map(r => r.class_id);
        if(!classIds.length){
          container.innerHTML = '<div style="color:var(--ink-light);padding:20px">Bạn chưa tham gia lớp nào.</div>';
          return;
        }
      } else if(role === "parent"){
        const { data: links, error: linkError } = await getSb()
          .from("parent_students")
          .select("student_id")
          .eq("parent_id", uid)
          .is("revoked_at", null);
        if(linkError) throw linkError;
        const studentIds = [...new Set((links || []).map(row => row.student_id).filter(Boolean))];
        if(!studentIds.length){
          container.innerHTML = '<div style="color:var(--ink-light);padding:20px">Tài khoản phụ huynh chưa liên kết với học sinh nào.</div>';
          return;
        }
        const { data: myRows, error: classLinkError } = await getSb()
          .from("class_students")
          .select("class_id")
          .in("student_id", studentIds)
          .is("left_at", null);
        if(classLinkError) throw classLinkError;
        classIds = [...new Set((myRows||[]).map(r => r.class_id).filter(Boolean))];
        if(!classIds.length){
          container.innerHTML = '<div style="color:var(--ink-light);padding:20px">Chưa có lớp học nào của học sinh được liên kết.</div>';
          return;
        }
      }

      let classQuery = sb
        .from("classes")
        .select("id,class_name,tuition_fee,tuition_type,grade_id,subject_id,hidden,grades(name),subjects(name)")
        .order("class_name", { ascending: true });
      if(classIds !== null) classQuery = classQuery.in("id", classIds);
      // Teacher và student chỉ thấy lớp không bị ẩn
      if(role !== "admin" && role !== "accountant") classQuery = classQuery.eq("hidden", false);

      const [
        { data: classes,  error: e1 },
        { data: schedules, error: e2 },
        { data: teachers },
        { data: students },
      ] = await Promise.all([
        classQuery,
        sb.from("class_schedules").select("*,rooms(room_name,capacity)")
          .order("weekday",    { ascending: true })
          .order("start_time", { ascending: true }),
        sb.from("class_teachers").select("class_id,teacher_id"),
        sb.from("class_students").select("class_id,student_id,left_at"),
      ]);

      if(e1) throw e1;
      if(e2) throw e2;

      _allClasses = classes || [];

      _scheduleMap = {};
      (schedules||[]).forEach(s => {
        if(!_scheduleMap[s.class_id]) _scheduleMap[s.class_id] = [];
        _scheduleMap[s.class_id].push(s);
      });

      _teacherMap     = {};
      _teacherNameMap = {};
      (teachers||[]).forEach(t => {
        if(!_teacherMap[t.class_id]) _teacherMap[t.class_id] = [];
        _teacherMap[t.class_id].push(t.teacher_id);
      });

      _studentCount = {};
      (students||[]).forEach(s => {
        if(s.left_at) return;
        _studentCount[s.class_id] = (_studentCount[s.class_id]||0) + 1;
      });

      await loadFilterOptions(sb, role);

      if(role === "admin" || role === "accountant"){
        const filterBar = document.getElementById("filterBar");
        if(filterBar) filterBar.style.display = "flex";
        bindFilters();
      }

      renderClasses(_allClasses);

    }catch(err){
      console.error(err);
      container.innerHTML = '<div style="color:var(--red);padding:20px">Lỗi tải lớp: ' + err.message + '</div>';
    }
  }

  async function loadFilterOptions(sb, role){
    const { data: staff } = await sb
      .from("users").select("id,full_name,role").in("role",["teacher","assistant"]).order("full_name");
    _teacherNameMap = {};
    _teacherRoleMap = {};
    (staff||[]).forEach(t => {
      _teacherNameMap[t.id] = t.full_name;
      _teacherRoleMap[t.id] = t.role;
    });

    if(role !== "admin" && role !== "accountant") return;

    const [{ data: grades }, { data: subjects }] = await Promise.all([
      sb.from("grades").select("id,name").order("name"),
      sb.from("subjects").select("id,name,grade_id").order("name"),
    ]);
    _allSubjects = subjects || [];

    const gradeEl = document.getElementById("filterGrade");
    if(gradeEl){
      gradeEl.innerHTML = '<option value="">Tất cả khối</option>';
      (grades||[]).forEach(g => gradeEl.appendChild(new Option(g.name, g.id)));
    }
    const subEl = document.getElementById("filterSubject");
    if(subEl){
      subEl.innerHTML = '<option value="">Chọn khối trước</option>';
      subEl.disabled = true;
    }
    const teachEl = document.getElementById("filterTeacher");
    if(teachEl){
      teachEl.innerHTML = '<option value="">Tất cả giáo viên</option>';
      (staff||[])
        .filter(t => t.role === "teacher")
        .forEach(t => teachEl.appendChild(new Option(t.full_name, t.id)));
    }
  }

  function onGradeChange(){
    const gradeId = document.getElementById("filterGrade")?.value || "";
    const subEl   = document.getElementById("filterSubject");
    if(!subEl) return;
    if(!gradeId){
      subEl.innerHTML = '<option value="">Chọn khối trước</option>';
      subEl.disabled = true;
    } else {
      const filtered = _allSubjects.filter(s => s.grade_id === gradeId);
      subEl.innerHTML = '<option value="">Tất cả môn</option>';
      filtered.forEach(s => subEl.appendChild(new Option(s.name, s.id)));
      subEl.disabled = false;
    }
    applyFilters();
  }

  let _timer = null;
  function bindFilters(){
    const gradeEl = document.getElementById("filterGrade");
    if(gradeEl) gradeEl.addEventListener("change", () => {
      clearTimeout(_timer); _timer = setTimeout(onGradeChange, 180);
    });
    ["filterSubject","filterTeacher"].forEach(id => {
      const el = document.getElementById(id); if(!el) return;
      el.addEventListener("change", () => {
        clearTimeout(_timer); _timer = setTimeout(applyFilters, 180);
      });
    });
  }

  function applyFilters(){
    const gradeId = document.getElementById("filterGrade")?.value   || "";
    const subId   = document.getElementById("filterSubject")?.value || "";
    const teachId = document.getElementById("filterTeacher")?.value || "";

    const filtered = _allClasses.filter(c => {
      if(gradeId && c.grade_id   !== gradeId) return false;
      if(subId   && c.subject_id !== subId)   return false;
      if(teachId){
        const ids = _teacherMap[c.id] || [];
        if(!ids.includes(teachId)) return false;
      }
      return true;
    });
    renderClasses(filtered);
  }

  window.resetFilters = function(){
    ["filterGrade","filterTeacher"].forEach(id => {
      const el = document.getElementById(id); if(el) el.value = "";
    });
    const subEl = document.getElementById("filterSubject");
    if(subEl){ subEl.innerHTML = '<option value="">Chọn khối trước</option>'; subEl.disabled = true; }
    renderClasses(_allClasses);
  };

  const daysMap = {1:"T2",2:"T3",3:"T4",4:"T5",5:"T6",6:"T7",7:"CN"};

  function getCurrentSchedules(schedules){
    const month = new Date();
    const monthStart = month.getFullYear()+"-"+String(month.getMonth()+1).padStart(2,"0")+"-01";
    const eligible = (schedules || []).filter(s => (s.effective_from || "2000-01-01") <= monthStart);
    if(!eligible.length) return [];
    const latest = eligible.reduce((max, s) => {
      const value = s.effective_from || "2000-01-01";
      return value > max ? value : max;
    }, "2000-01-01");
    return eligible.filter(s => (s.effective_from || "2000-01-01") === latest);
  }

  function renderScheduleSummary(schedules){
    if(!schedules || !schedules.length){
      return "<span style='color:var(--ink-light);font-size:.75rem'>Chưa có lịch</span>";
    }
    const grouped = {};
    schedules.forEach(s => {
      const no = Number(s.session_no || 1);
      if(!grouped[no]) grouped[no] = [];
      grouped[no].push(s);
    });
    return Object.keys(grouped).map(Number).sort((a,b)=>a-b).map(no => {
      const items = grouped[no]
        .slice()
        .sort((a,b)=>Number(a.weekday || 0)-Number(b.weekday || 0) || String(a.start_time || "").localeCompare(String(b.start_time || "")))
        .map(s => {
          const day = daysMap[s.weekday] || "?";
          const time = String(s.start_time || "").slice(0,5)+"-"+String(s.end_time || "").slice(0,5);
          const room = s.rooms?.room_name ? " "+s.rooms.room_name : "";
          return `${day} ${time}${room}`;
        })
        .join("; ");
      return `<div><strong>Buổi ${no}:</strong> ${items}</div>`;
    }).join("");
  }

  function renderClasses(classes){
    const role    = window._currentRole || "student";
    const countEl = document.getElementById("filterCount");
    if(countEl) countEl.textContent = classes.length + " lớp";

    if(!classes.length){
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">🔍</div>
          <p>Không tìm thấy lớp nào phù hợp.</p>
        </div>`;
      return;
    }

    const gradeMap = {}, gradeOrder = [];
    classes.forEach(cls => {
      const gName = cls.grades?.name || "Chưa phân khối";
      if(!gradeMap[gName]){ gradeMap[gName] = []; gradeOrder.push(gName); }
      gradeMap[gName].push(cls);
    });

    const nextContainer = document.createElement("div");

    gradeOrder.forEach(grade => {
      const block = document.createElement("div");
      block.className = "grade-block";
      block.dataset.liveKey = "class-grade-" + grade;

      const title = document.createElement("div");
      title.className = "grade-title";
      title.textContent = "Khối " + grade;
      block.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "class-grid";

      gradeMap[grade].forEach(cls => {
        const card = document.createElement("div");
        card.className = "class-card";
        card.dataset.liveKey = "class-" + cls.id;
        if(cls.hidden) card.style.cssText = "opacity:.45;filter:grayscale(.4)";

        const currentSchedules = getCurrentSchedules(_scheduleMap[cls.id] || []);
        const schGrouped = renderScheduleSummary(currentSchedules);
        const teacherList = (_teacherMap[cls.id]||[])
          .filter(tid => _teacherRoleMap[tid] === "teacher")
          .map(tid => _teacherNameMap[tid]||"")
          .filter(Boolean);
        const stuCount    = _studentCount[cls.id] || 0;
        const subjectName = cls.subjects?.name || "";
        const roomCapacity = getMinRoomCapacity(currentSchedules);
        const showCapacityWarning = (role === "admin" || role === "teacher" || role === "assistant") && roomCapacity > 0 && stuCount >= roomCapacity;
        const capacityWarningHtml = showCapacityWarning
          ? `<div class="class-info" style="margin-top:6px;padding:8px 10px;border-radius:10px;background:${stuCount > roomCapacity ? "rgba(239,68,68,.12)" : "rgba(245,158,11,.12)"};border:1px solid ${stuCount > roomCapacity ? "rgba(239,68,68,.28)" : "rgba(245,158,11,.28)"};color:${stuCount > roomCapacity ? "#b91c1c" : "#92400e"};font-weight:700">⚠ ${stuCount > roomCapacity ? "Số lượng học sinh đang vượt quá" : "Số lượng học sinh đã chạm tới"} sức chứa phòng học (${roomCapacity}).</div>`
          : "";

        const actionHtml = role === "admin"
          ? `<div class="class-actions">
              <button class="edit-btn" type="button" onclick="event.stopPropagation(); if(window.openClassView) window.openClassView('${cls.id}', '${String(cls.class_name || "").replace(/'/g, "\\'")}')">✏ Sửa</button>
              ${cls.hidden
                ? `<button class="edit-btn" type="button" onclick="event.stopPropagation(); window.restoreClass('${cls.id}')">↺ Khôi phục</button>`
                : `<button class="delete-btn" type="button" onclick="event.stopPropagation(); window.deleteClass('${cls.id}','${role}')">🗑 Xóa</button>`}
            </div>`
          : (role === "teacher" || role === "assistant")
            ? `<div class="class-actions">
                ${cls.hidden
                  ? `<button class="edit-btn" type="button" onclick="event.stopPropagation(); window.restoreClass('${cls.id}')">↺ Khôi phục</button>`
                  : `<button class="delete-btn" type="button" onclick="event.stopPropagation(); window.deleteClass('${cls.id}','${role}')">🗑 Xóa</button>`}
              </div>`
            : "";

        card.innerHTML = `
          <div>
            <div class="class-name">${cls.class_name}${cls.hidden ? ' <span style="font-size:.7rem;color:var(--ink-light);font-weight:400">(Đã ẩn)</span>' : ""}</div>
            ${subjectName ? `<div class="class-info">📚 ${subjectName}</div>` : ""}
            <div class="class-info">📅 ${schGrouped}</div>
            <div class="class-info">💰 ${new Intl.NumberFormat("vi-VN").format(cls.tuition_fee||0)}đ</div>
            <div class="class-info">👨‍🎓 ${stuCount} học sinh</div>
            ${capacityWarningHtml}
            ${teacherList.length ? `<div class="class-teacher-tag">👨‍🏫 ${teacherList.join(", ")}</div>` : ""}
          </div>
          ${actionHtml}`;

        card.dataset.openClassId = cls.id;
        card.dataset.openClassName = cls.class_name || "";

        grid.appendChild(card);
      });

      block.appendChild(grid);
      nextContainer.appendChild(block);
    });
    window.MindupLiveUI?.patchHTML(container, nextContainer.innerHTML);
    container.querySelectorAll("[data-open-class-id]").forEach(card => {
      card.onclick = () => {
        if(window.openClassView) window.openClassView(card.dataset.openClassId, card.dataset.openClassName);
      };
    });
  }

  window.deleteClass = async function(id, role){
    const sb = getSb();
    if(role === "admin"){
      if(!confirm("Xóa hoàn toàn lớp này? Hành động không thể hoàn tác.")) return;
      await sb.from("classes").delete().eq("id", id);
      await window.AppAdminTools?.recordAudit?.("class_deleted", {
        target_type: "class",
        target_id: id,
      });
    } else {
      if(!confirm("Ẩn lớp này?")) return;
      await sb.from("classes").update({hidden:true}).eq("id", id);
      await window.AppAdminTools?.recordAudit?.("class_hidden", {
        target_type: "class",
        target_id: id,
      });
    }
    loadMyClasses({silent:true});
  };

  window.restoreClass = async function(id){
    if(!confirm("Khôi phục lớp này?")) return;
    await getSb().from("classes").update({hidden:false}).eq("id", id);
    await window.AppAdminTools?.recordAudit?.("class_restored", {
      target_type: "class",
      target_id: id,
    });
    loadMyClasses({silent:true});
  };

  window.loadMyClasses = loadMyClasses;
  ["classes","class_schedules","class_teachers","class_students"].forEach(table => {
    window.MindupLiveUI?.watchTable?.(table, () => loadMyClasses({silent:true}));
  });

})();
