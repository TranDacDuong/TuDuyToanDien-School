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
  let _allSubjects   = [];

  async function loadMyClasses(){
    container.innerHTML = '<div style="color:var(--ink-light);padding:20px">Đang tải...</div>';
    try{
      const sb   = getSb();
      const role = window._currentRole;
      const uid  = window._currentUserId;

      if(!role || !uid){
        container.innerHTML = '<div style="color:var(--red);padding:20px">Lỗi: Chưa xác thực người dùng.</div>';
        return;
      }

      let classIds = null;

      if(role === "teacher"){
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
      }

      let classQuery = sb
        .from("classes")
        .select("id,class_name,tuition_fee,tuition_type,grade_id,subject_id,hidden,grades(name),subjects(name)")
        .order("class_name", { ascending: true });
      if(classIds !== null) classQuery = classQuery.in("id", classIds);
      // Teacher và student chỉ thấy lớp không bị ẩn
      if(role !== "admin") classQuery = classQuery.eq("hidden", false);

      const [
        { data: classes,  error: e1 },
        { data: schedules, error: e2 },
        { data: teachers },
        { data: students },
      ] = await Promise.all([
        classQuery,
        sb.from("class_schedules").select("*,rooms(room_name)")
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

      if(role === "admin"){
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
    const { data: teachers } = await sb
      .from("users").select("id,full_name").eq("role","teacher").order("full_name");
    _teacherNameMap = {};
    (teachers||[]).forEach(t => { _teacherNameMap[t.id] = t.full_name; });

    if(role !== "admin") return;

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
      (teachers||[]).forEach(t => teachEl.appendChild(new Option(t.full_name, t.id)));
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

    container.innerHTML = "";

    gradeOrder.forEach(grade => {
      const block = document.createElement("div");
      block.className = "grade-block";

      const title = document.createElement("div");
      title.className = "grade-title";
      title.textContent = "Khối " + grade;
      block.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "class-grid";

      gradeMap[grade].forEach(cls => {
        const card = document.createElement("div");
        card.className = "class-card";
        if(cls.hidden) card.style.cssText = "opacity:.45;filter:grayscale(.4)";

        const sch = (_scheduleMap[cls.id]||[]).map(s => {
          const day  = daysMap[s.weekday]||"?";
          const time = s.start_time.slice(0,5)+"–"+s.end_time.slice(0,5);
          const room = s.rooms?.room_name ? " • "+s.rooms.room_name : "";
          return `${day} (${time})${room}`;
        }).join("<br>");

        const teacherList = (_teacherMap[cls.id]||[])
          .map(tid => _teacherNameMap[tid]||"").filter(Boolean);
        const stuCount    = _studentCount[cls.id] || 0;
        const subjectName = cls.subjects?.name || "";

        card.innerHTML = `
          <div>
            <div class="class-name">${cls.class_name}${cls.hidden ? ' <span style="font-size:.7rem;color:var(--ink-light);font-weight:400">(Đã ẩn)</span>' : ""}</div>
            ${subjectName ? `<div class="class-info">📚 ${subjectName}</div>` : ""}
            <div class="class-info">📅 ${sch || "<span style='color:var(--ink-light);font-size:.75rem'>Chưa có lịch</span>"}</div>
            <div class="class-info">💰 ${new Intl.NumberFormat("vi-VN").format(cls.tuition_fee||0)}đ</div>
            <div class="class-info">👨‍🎓 ${stuCount} học sinh</div>
            ${teacherList.length ? `<div class="class-teacher-tag">👨‍🏫 ${teacherList.join(", ")}</div>` : ""}
          </div>`;

        card.onclick = () => {
          if(window.openClassView) window.openClassView(cls.id, cls.class_name);
        };

        grid.appendChild(card);
      });

      block.appendChild(grid);
      container.appendChild(block);
    });
  }

  window.deleteClass = async function(id, role){
    const sb = getSb();
    if(role === "admin"){
      if(!confirm("Xóa hoàn toàn lớp này? Hành động không thể hoàn tác.")) return;
      await sb.from("classes").delete().eq("id", id);
    } else {
      if(!confirm("Ẩn lớp này?")) return;
      await sb.from("classes").update({hidden:true}).eq("id", id);
    }
    loadMyClasses();
  };

  window.restoreClass = async function(id){
    if(!confirm("Khôi phục lớp này?")) return;
    await getSb().from("classes").update({hidden:false}).eq("id", id);
    loadMyClasses();
  };

  window.loadMyClasses = loadMyClasses;

})();
