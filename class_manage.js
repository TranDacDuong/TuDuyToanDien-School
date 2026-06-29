/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   CLASS_MANAGE.JS  â€”  Unified fullscreen view cho má»i role
   - Admin / Teacher : Ä‘iá»ƒm danh (cÃ³ thá»ƒ báº¥m) + Ä‘á» thi + nÃºt Sá»­a/XÃ³a
   - Student         : Ä‘iá»ƒm danh (chá»‰ xem) + Ä‘á» thi (lÃ m bÃ i)
   window.openClassView(classId, className) â€” entry point duy nháº¥t
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
(function () {

  function getSb() { return window.sb || sb; }

  /* â”€â”€ Utils â”€â”€ */
  const daysMap = { 1:"T2",2:"T3",3:"T4",4:"T5",5:"T6",6:"T7",7:"CN" };
  function formatMoney(v){ return new Intl.NumberFormat("vi-VN").format(v); }
  const tuitionLabel = { per_session:"buổi", per_month:"tháng", per_course:"khóa" };
  function formatTuition(fee,type){ return formatMoney(fee)+"đ/"+(tuitionLabel[type]||type); }
  function todayStr(){
    const n=new Date();
    return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-"+String(n.getDate()).padStart(2,"0");
  }
  function monthStart(m,y){ return y+"-"+String(m+1).padStart(2,"0")+"-01"; }
  function monthEnd(m,y){
    const last=new Date(y,m+1,0);
    return last.getFullYear()+"-"+String(last.getMonth()+1).padStart(2,"0")+"-"+String(last.getDate()).padStart(2,"0");
  }
  function fmtDT(iso){
    return new Date(iso).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
  }
  function uniqueAttendanceRows(rows){
    return [...new Map((rows || []).map(row => [
      row.class_id+"_"+row.student_id+"_"+row.date,
      row
    ])).values()];
  }
  function esc(value){
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function jsArg(value){
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r?\n/g, " ");
  }
  function generateDates(schedules, month, year){
    const dates=new Set(), days=new Date(year,month+1,0).getDate();
    for(let d=1;d<=days;d++){
      const date=new Date(year,month,d);
      const wd=date.getDay()===0?7:date.getDay();
      schedules.forEach(s=>{
        if(s.weekday===wd){
          dates.add(date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(d).padStart(2,"0"));
        }
      });
    }
    return [...dates].sort();
  }
  function generateOccurrences(schedules, month, year){
    const items=[], days=new Date(year,month+1,0).getDate();
    for(let d=1;d<=days;d++){
      const date=new Date(year,month,d);
      const wd=date.getDay()===0?7:date.getDay();
      schedules.forEach(s=>{
        if(s.weekday===wd){
          const value=date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");
          items.push({ date:value, schedule_id:Number(s.id), session_no:Number(s.session_no || 1), schedule:s });
        }
      });
    }
    return items.sort((a,b)=>a.date.localeCompare(b.date) || a.session_no-b.session_no || String(a.schedule?.start_time || "").localeCompare(String(b.schedule?.start_time || "")));
  }
  function getSchedulesForMonth(all, month, year){
    const mStart=monthStart(month,year);
    const eligible=all.filter(s=>(s.effective_from||"2000-01-01")<=mStart);
    if(!eligible.length) return [];
    const maxEf=eligible.reduce((m,s)=>{ const e=s.effective_from||"2000-01-01"; return e>m?e:m; },"2000-01-01");
    return eligible.filter(s=>(s.effective_from||"2000-01-01")===maxEf);
  }

  function scheduleLabel(s){
    if(!s) return "Chưa chọn lịch";
    return "Buổi "+(s.session_no || 1)+": "+(daysMap[s.weekday] || "?")+" "+String(s.start_time || "").slice(0,5)+"–"+String(s.end_time || "").slice(0,5)+(s.rooms?.room_name ? " • "+s.rooms.room_name : "");
  }

  function renderScheduleSummary(schedules){
    if(!schedules || !schedules.length){
      return '<span style="color:var(--ink-light);font-size:.82rem">Chưa có lịch học</span>';
    }
    const grouped = groupSchedulesBySession(schedules);
    return Object.keys(grouped).map(Number).sort((a,b)=>a-b).map(no => {
      const items = (grouped[no] || [])
        .slice()
        .sort((a,b)=>Number(a.weekday || 0)-Number(b.weekday || 0) || String(a.start_time || "").localeCompare(String(b.start_time || "")))
        .map(s => {
          const time = String(s.start_time || "").slice(0,5)+"-"+String(s.end_time || "").slice(0,5);
          return esc((daysMap[s.weekday] || "?")+" "+time+(s.rooms?.room_name ? " "+s.rooms.room_name : ""));
        })
        .join("; ");
      return '<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;line-height:1.45">'+
        '<span style="flex:0 0 auto;font-size:.82rem;font-weight:800;color:var(--navy)">Buổi '+no+':</span>'+
        '<span style="font-size:.82rem;font-weight:600;color:var(--ink-mid)">'+items+'</span>'+
      '</div>';
    }).join("");
  }

  function groupSchedulesBySession(schedules){
    const map = {};
    (schedules || []).forEach(s => {
      const no = Number(s.session_no || 1);
      if(!map[no]) map[no] = [];
      map[no].push(s);
    });
    return map;
  }

  function getStudentSchedules(studentId, schedules){
    const selectedIds = _studentScheduleMap[studentId];
    if(!selectedIds || !selectedIds.size) return schedules || [];
    return (schedules || []).filter(s => selectedIds.has(Number(s.id)));
  }

  function isStudentScheduledOn(studentId, dateValue, schedules){
    const date = new Date(dateValue);
    const wd = date.getDay() === 0 ? 7 : date.getDay();
    return getStudentSchedules(studentId, schedules).some(s => s.weekday === wd);
  }

  

  function generateStudentOccurrences(studentId, schedules, month, year){
    return generateOccurrences(getStudentSchedules(studentId, schedules), month, year);
  }

  function collectDatesForStudents(students, schedules, month, year){
    const map = new Map();
    (students || []).forEach(s => {
      generateStudentOccurrences(s.student_id, schedules, month, year).forEach(item => {
        map.set(item.date+"_"+item.schedule_id, item);
      });
    });
    if(!map.size) generateOccurrences(schedules, month, year).forEach(item => map.set(item.date+"_"+item.schedule_id, item));
    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date) || a.session_no-b.session_no);
  }

  function chooseSchedulesForStudent(studentName, schedules){
    const grouped = groupSchedulesBySession(schedules);
    const sessionNos = Object.keys(grouped).map(Number).sort((a,b)=>a-b);
    const picks = [];
    for(const no of sessionNos){
      const options = grouped[no];
      const checked = document.querySelector('input[name="cv_schedule_session_'+no+'"]:checked');
      const selectedId = checked ? Number(checked.value) : Number(options[0]?.id);
      const selected = options.find(s => Number(s.id) === selectedId);
      if(!selected){
        alert("Vui lòng chọn lịch cho Buổi "+no+".");
        return null;
      }
      picks.push(selected);
    }
    return picks;
  }

  function buildSchedulePickerHtml(schedules, selectedScheduleIds = new Set()){
    const grouped = groupSchedulesBySession(schedules);
    const sessionNos = Object.keys(grouped).map(Number).sort((a,b)=>a-b);
    if(!sessionNos.length) {
      return '<p style="font-size:13px;color:var(--ink-light)">Lớp chưa có lịch học để chọn.</p>';
    }
    const rows = sessionNos.map(no => {
      const checkedIndex = Math.max(0, grouped[no].findIndex(s => selectedScheduleIds.has(Number(s.id))));
      const options = grouped[no].map((s, idx) => `
        <label style="display:block;margin:4px 0;cursor:pointer">
          <input type="radio" name="cv_schedule_session_${no}" value="${s.id}" ${idx === checkedIndex ? "checked" : ""} style="width:15px;height:15px;accent-color:var(--navy);vertical-align:middle;margin-right:6px">
          <span>${esc((daysMap[s.weekday] || "?")+" "+String(s.start_time || "").slice(0,5)+"–"+String(s.end_time || "").slice(0,5)+(s.rooms?.room_name ? " • "+s.rooms.room_name : ""))}</span>
        </label>
      `).join("");
      return `<tr><td style="font-weight:800;color:var(--navy);white-space:nowrap">Buổi ${no}</td><td>${options}</td></tr>`;
    }).join("");
    return `
      <div style="overflow-x:auto;margin-top:10px;border:1px solid var(--border);border-radius:10px">
        <table class="table" style="font-size:.84rem;margin:0">
          <thead><tr><th style="width:110px;text-align:left">Buổi</th><th style="text-align:left">Chọn 1 lịch học</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function getMinRoomCapacity(schedules){
    const capacities = (schedules || [])
      .map(s => Number(s?.rooms?.capacity || 0))
      .filter(cap => Number.isFinite(cap) && cap > 0);
    return capacities.length ? Math.min(...capacities) : 0;
  }

  function isMissingRelationError(error){
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("does not exist") || msg.includes("could not find") || msg.includes("relation");
  }

  

  function fmtSessionDate(value){
    if(!value) return "Chưa chọn ngày học";
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return "Chưa chọn ngày học";
    return d.toLocaleDateString("vi-VN", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  /* â”€â”€ Attendance status â”€â”€ */
  const statusCycle = ["present","absent","makeup"];
  const statusMap = {
    unmarked:{ text:"—",      cls:""        },
    present:{ text:"Có",     cls:"present" },
    absent: { text:"Vắng",   cls:"absent"  },
    makeup: { text:"Học bù", cls:"makeup"  },
  };
  const attendanceSessionColors = [
    { bg:"#eff6ff", border:"#bfdbfe", text:"#1d4ed8" },
    { bg:"#f0fdf4", border:"#bbf7d0", text:"#15803d" },
    { bg:"#fff7ed", border:"#fed7aa", text:"#c2410c" },
    { bg:"#f5f3ff", border:"#ddd6fe", text:"#7c3aed" },
    { bg:"#fdf2f8", border:"#fbcfe8", text:"#be185d" },
    { bg:"#ecfeff", border:"#a5f3fc", text:"#0e7490" },
    { bg:"#fefce8", border:"#fde68a", text:"#a16207" }
  ];
  function attendanceSessionStyle(sessionNo, part = "cell"){
    const palette = attendanceSessionColors[(Math.max(1, Number(sessionNo || 1)) - 1) % attendanceSessionColors.length];
    if(part === "header"){
      return "background:"+palette.bg+";color:"+palette.text+";border-left:1px solid "+palette.border+";border-right:1px solid "+palette.border+";";
    }
    return "background:"+palette.bg+";border-left:1px solid "+palette.border+";border-right:1px solid "+palette.border+";";
  }

  /* â”€â”€ State â”€â”€ */
  let _classId        = null;
  let _className      = "";
  let _role           = "student";
  let _currentMonth   = new Date().getMonth();
  let _currentYear    = new Date().getFullYear();
  let _cachedClass    = null;
  let _attendanceMap  = {};
  let _activeTab      = "attendance";
  let _studentSearchPool = null;
  let _classSessionExamCatalog = { exam: [], pdf: [] };
  let _studentScheduleMap = {};
  let _parentStudentIds = new Set();

  function normalizeSearchText(value){
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getNameInitials(fullName){
    const parts = normalizeSearchText(fullName).split(" ").filter(Boolean);
    return parts.map(part => part[0]).join("");
  }

  function matchesStudentSearch(student, keyword){
    const normKeyword = normalizeSearchText(keyword);
    if(!normKeyword) return false;
    const compactKeyword = normKeyword.replace(/\s+/g, "");
    const nameNorm  = normalizeSearchText(student.full_name);
    const emailNorm = normalizeSearchText(student.email);
    const phoneNorm = _role === "admin" ? normalizeSearchText(student.phone) : "";
    const initials  = getNameInitials(student.full_name);

    return [
      nameNorm,
      nameNorm.replace(/\s+/g, ""),
      emailNorm,
      phoneNorm,
      initials,
    ].some(value => value && value.includes(compactKeyword));
  }

  function canTakeAttendance(role = _role){
    return role === "admin" || role === "teacher" || role === "assistant";
  }

  function canManageClassContent(role = _role){
    return role === "admin" || role === "teacher";
  }

  function canEvaluateClassSession(role = _role){
    return role === "admin" || role === "teacher" || role === "assistant";
  }

  

  function buildSessionMapByDate(sessions){
    const map = {};
    (sessions || []).forEach(session => {
      const date = String(session?.session_date || "").slice(0,10);
      if(date && session?.id && !map[date]) map[date] = session;
    });
    return map;
  }

  function renderAttendanceDateHeader(item, sessionMap, role, minWidth){
    const d = item.date;
    const session = sessionMap?.[d];
    const baseStyle = "min-width:"+minWidth+"px;white-space:nowrap;"+attendanceSessionStyle(item.session_no, "header");
    const label = d.slice(8,10)+"/"+d.slice(5,7);
    if(canEvaluateClassSession(role) && session?.id && d <= todayStr()){
      return '<th class="center" style="'+baseStyle+'">'+
        '<button type="button" onclick="openSessionEvaluation(\''+session.id+'\')" title="Nhận xét buổi học" aria-label="Nhận xét buổi học ngày '+label+'" '+
          'style="border:0;background:rgba(255,255,255,.16);color:inherit;border-radius:8px;padding:5px 7px;font:inherit;font-weight:800;cursor:pointer;line-height:1;display:inline-flex;align-items:center;gap:4px">'+
          label+'<span aria-hidden="true" style="font-size:.78em;opacity:.9">✎</span>'+
        '</button>'+
      '</th>';
    }
    return '<th class="center" style="'+baseStyle+'">'+label+'</th>';
  }

  async function getStudentSearchPool(){
    if(_studentSearchPool) return _studentSearchPool;
    const sb = getSb();
    const selectFields = _role === "admin"
      ? "id,full_name,email,phone"
      : "id,full_name,email";
    const { data, error } = await sb
      .from("users")
      .select(selectFields)
      .eq("role","student")
      .order("full_name");
    if(error) throw error;
    _studentSearchPool = data || [];
    return _studentSearchPool;
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     OVERLAY â€” táº¡o 1 láº§n, dÃ¹ng láº¡i
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function getOrCreateOverlay(){
    let ov = document.getElementById("classViewOverlay");
    if(!ov){
      ov = document.createElement("div");
      ov.id = "classViewOverlay";
      ov.style.cssText =
        "display:none;position:fixed;inset:0;background:var(--cream);z-index:200;"+
        "flex-direction:column;overflow:hidden;font-family:var(--font-body);min-height:0";
      document.body.appendChild(ov);
    }
    return ov;
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     ENTRY POINT â€” gá»i tá»« má»i role
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  window.openClassView = async function(classId, className){
    _classId      = classId;
    _className    = className;
    _role         = window._currentRole || "student";
    _activeTab    = "attendance";
    _currentMonth = new Date().getMonth();
    _currentYear  = new Date().getFullYear();
    _parentStudentIds = new Set();

    if(_role === "parent" && window._currentUserId){
      const { data: parentLinks } = await getSb()
        .from("parent_students")
        .select("student_id")
        .eq("parent_id", window._currentUserId)
        .is("revoked_at", null);
      _parentStudentIds = new Set((parentLinks || []).map(row => row.student_id).filter(Boolean));
    }

    window._classId   = classId;
    window._className = className;
    if(!window._openingClassFromUrl && window.parent && window.parent !== window){
      const page = "class.html?openClassId=" + encodeURIComponent(classId) +
        "&className=" + encodeURIComponent(className || "Chi tiết lớp");
      window.parent.postMessage({ type: "dashboard:navigate-frame", page }, "*");
    }

    const ov = getOrCreateOverlay();
    ov.style.display = "flex";
    ov.innerHTML =
      buildTopbar(className) +
      '<div id="cvBody" style="flex:1;overflow-y:auto;padding:22px 24px;min-height:0">'+
        '<p style="color:var(--ink-light)">Đang tải...</p>'+
      "</div>";

    await loadAndRender();
  };

  function buildTopbar(title){
    const role = window._currentRole || "student";
    let actionBtns = "";
    if(canManageClassContent(role)){
      actionBtns =
        '<button onclick="cvEditClass()" style="'+
        'background:var(--gold);color:var(--navy);border:none;padding:6px 14px;'+
        'border-radius:7px;font-size:.82rem;font-weight:700;cursor:pointer;font-family:var(--font-body)">'+
        '✏ Sửa</button>'+
        (canManageClassContent(role)
          ? '<button onclick="cvDeleteClass()" style="'+
            'background:rgba(239,68,68,.15);color:#fca5a5;border:1px solid rgba(239,68,68,.3);'+
            'padding:6px 14px;border-radius:7px;font-size:.82rem;font-weight:700;'+
            'cursor:pointer;font-family:var(--font-body)">🗑 Xóa</button>'
          : "");
    }
    return (
      '<div style="height:56px;background:var(--navy);color:#fff;display:flex;'+
      'align-items:center;gap:12px;padding:0 20px;flex-shrink:0;'+
      'box-shadow:0 2px 8px rgba(0,0,0,.25)">'+
        '<button onclick="closeClassView()" style="background:rgba(255,255,255,.12);'+
        'border:1px solid rgba(255,255,255,.2);color:#fff;padding:5px 14px;border-radius:7px;'+
        'font-size:.82rem;font-weight:600;cursor:pointer;font-family:var(--font-body)" title="Quay lại" aria-label="Quay lại">←</button>'+
        '<span style="font-family:var(--font-display);font-size:1.1rem;flex:1;white-space:nowrap;'+
        'overflow:hidden;text-overflow:ellipsis">'+title+"</span>"+
        '<div style="display:flex;gap:8px;align-items:center">'+
          actionBtns+
        "</div>"+
      "</div>"
    );
  }

  window.closeClassView = function(){
    const ov = document.getElementById("classViewOverlay");
    if(ov) ov.style.display = "none";
  };

  window.cvEditClass = function(){
    if(window.fillEditClass) window.fillEditClass(_classId);
  };

  window.cvDeleteClass = async function(){
    const sb = getSb();
    if(_role === "admin"){
      if(!confirm("Xóa hoàn toàn lớp \""+_className+"\"? Hành động không thể hoàn tác.")) return;
      const { error } = await sb.from("classes").delete().eq("id",_classId);
      if(error){ alert("Lỗi xóa: "+error.message); return; }
      await window.AppAdminTools?.recordAudit?.("class_deleted", {
        target_type: "class",
        target_id: _classId,
        class_name: _className,
      });
    } else {
      if(!confirm("Ẩn lớp \""+_className+"\"?")) return;
      const { error } = await sb.from("classes").update({hidden:true}).eq("id",_classId);
      if(error){ alert("Lỗi ẩn lớp: "+error.message); return; }
      await window.AppAdminTools?.recordAudit?.("class_hidden", {
        target_type: "class",
        target_id: _classId,
        class_name: _className,
      });
    }
    window.closeClassView();
    if(window.loadMyClasses) window.loadMyClasses();
  };

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     LOAD & RENDER SHELL
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  async function loadAndRender(){
    const sb = getSb();
    const body = document.getElementById("cvBody");
    if(!body) return;

    const { data, error } = await sb.from("classes").select([
      "id,class_name,tuition_fee,tuition_type,makeup_fee,sessions_per_week",
      "grades(name),subjects(name)",
      "class_schedules(id,session_no,weekday,start_time,end_time,effective_from,rooms:rooms(room_name,capacity))",
      "students:class_students!fk_class(id,student_id,joined_at,left_at,user:users!fk_student(id,full_name))"
    ].join(",")).eq("id",_classId).single();

    if(error){
      body.innerHTML = "<p style='color:var(--red);padding:20px'>Lỗi: "+error.message+"</p>";
      return;
    }
    _cachedClass = data;
    renderShell();
    const { data: chosenSchedules } = await sb
      .from("class_student_schedules")
      .select("student_id,schedule_id")
      .eq("class_id", _classId);
    _studentScheduleMap = {};
    (chosenSchedules || []).forEach(row => {
      if(!_studentScheduleMap[row.student_id]) _studentScheduleMap[row.student_id] = new Set();
      _studentScheduleMap[row.student_id].add(Number(row.schedule_id));
    });
    if(_activeTab === "attendance") await renderAttendanceTab();
    else await renderExamsTab();
  }

  function renderShell(){
    const data  = _cachedClass;
    const role  = _role;
    const today = todayStr();
    const activeCount = (data.students||[]).filter(s=>!s.left_at||s.left_at.slice(0,10)>=today).length;

    const schThisMonth = getSchedulesForMonth(data.class_schedules||[], _currentMonth, _currentYear);
    const roomCapacity = getMinRoomCapacity(schThisMonth);
    const shouldWarnCapacity = (role === "admin" || role === "teacher" || role === "assistant") && roomCapacity > 0 && activeCount >= roomCapacity;
    const scheduleHtml = renderScheduleSummary(schThisMonth);
    const capacityWarningHtml = shouldWarnCapacity
      ? '<div style="margin-top:10px;padding:10px 12px;border-radius:10px;'+
        'background:'+(activeCount > roomCapacity ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)')+';'+
        'border:1px solid '+(activeCount > roomCapacity ? 'rgba(239,68,68,.28)' : 'rgba(245,158,11,.28)')+';'+
        'color:'+(activeCount > roomCapacity ? '#b91c1c' : '#92400e')+';font-size:.82rem;font-weight:600">'+
        '⚠ Cảnh báo: Số lượng học sinh hiện tại ('+activeCount+') '+
        (activeCount > roomCapacity ? 'đã vượt quá' : 'đã chạm tới')+
        ' sức chứa phòng học ('+roomCapacity+').'+
        '</div>'
      : '';

    const body = document.getElementById("cvBody");
    if(!body) return;

    body.innerHTML =
      '<div style="background:var(--white);border-radius:12px;padding:16px 18px;'+
      'box-shadow:var(--shadow-sm);margin-bottom:16px;border-top:3px solid var(--gold)">'+
        '<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between">'+
          '<div>'+
            '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;'+
            'color:var(--ink-light);margin-bottom:5px">Thông tin lớp</div>'+
            '<div style="margin-bottom:5px">'+scheduleHtml+'</div>'+
            '<div style="font-size:.82rem;color:var(--ink-mid)">'+
            '💰 '+formatTuition(data.tuition_fee, data.tuition_type)+
            ' &nbsp;•&nbsp; 👨‍🎓 '+activeCount+' học sinh'+
            (data.subjects?.name?' &nbsp;•&nbsp; 📚 '+data.subjects.name:'')+
            (data.grades?.name?' &nbsp;•&nbsp; 🏫 Khối '+data.grades.name:'')+
            '</div>'+
            capacityWarningHtml+
        '</div>'+
        '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0">'+
          '<button onclick="cvPrevMonth()" class="btn btn-outline btn-sm" style="padding:4px 12px;font-size:1rem">‹</button>'+
          '<span style="font-weight:700;font-size:.92rem;color:var(--navy);white-space:nowrap">'+
          'Tháng '+(_currentMonth+1)+'/'+_currentYear+'</span>'+
            '<button onclick="cvNextMonth()" class="btn btn-outline btn-sm" style="padding:4px 12px;font-size:1rem">›</button>'+
          '</div>'+
        '</div>'+
      '</div>'+

      '<div style="display:flex;gap:4px;margin-bottom:16px;background:var(--surface);'+
      'border-radius:10px;padding:4px;width:fit-content">'+
        '<button id="cvTab_attendance" onclick="cvSwitchTab(\'attendance\')" '+
        'style="padding:7px 20px;border:none;border-radius:7px;font-size:.83rem;font-weight:600;'+
        'cursor:pointer;font-family:var(--font-body);background:var(--navy);color:var(--gold-light)">'+
        '📋 Điểm danh</button>'+
        '<button id="cvTab_exams" onclick="cvSwitchTab(\'exams\')" '+
        'style="padding:7px 20px;border:none;border-radius:7px;font-size:.83rem;font-weight:600;'+
        'cursor:pointer;font-family:var(--font-body);background:transparent;color:var(--ink-mid)">'+
        '📘 Học tập</button>'+
      '</div>'+
      '<div id="cvTabContent">Đang tải...</div>';
  }

  window.cvSwitchTab = async function(tab){
    _activeTab = tab;
    ["attendance","exams"].forEach(t=>{
      const btn = document.getElementById("cvTab_"+t);
      if(!btn) return;
      btn.style.background = t===tab ? "var(--navy)" : "transparent";
      btn.style.color      = t===tab ? "var(--gold-light)" : "var(--ink-mid)";
    });
    if(tab==="attendance") await renderAttendanceTab();
    else await renderExamsTab();
  };

  window.cvPrevMonth = async function(){
    _currentMonth--; if(_currentMonth<0){_currentMonth=11;_currentYear--;}
    renderShell();
    if(_activeTab==="attendance") await renderAttendanceTab();
    else await renderExamsTab();
  };
  window.cvNextMonth = async function(){
    _currentMonth++; if(_currentMonth>11){_currentMonth=0;_currentYear++;}
    renderShell();
    if(_activeTab==="attendance") await renderAttendanceTab();
    else await renderExamsTab();
  };

  window.cvOpenClassGame = function(){
    if(!_classId) return;
    location.href = "game.html?action=create_room&classId=" + encodeURIComponent(_classId);
  };

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     TAB ÄIá»‚M DANH
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  async function renderAttendanceTab(){
    const tc = document.getElementById("cvTabContent"); if(!tc) return;
    const data = _cachedClass, sb = getSb();
    const role   = _role;
    const mStart = monthStart(_currentMonth, _currentYear);
    const mEnd   = monthEnd(_currentMonth, _currentYear);
    const today  = todayStr();

    const schedulesThisMonth = getSchedulesForMonth(data.class_schedules||[], _currentMonth, _currentYear);
    const visibleStudents = (data.students||[]).filter(s=>{
      const j = s.joined_at?s.joined_at.slice(0,10):"0000-00-00";
      const l = s.left_at  ?s.left_at.slice(0,10)  :"9999-99-99";
      if(role === "parent" && !_parentStudentIds.has(s.student_id)) return false;
      return j<=mEnd && l>=mStart;
    });
    const dates = role === "student"
      ? generateStudentOccurrences(window._currentUserId, schedulesThisMonth, _currentMonth, _currentYear)
      : collectDatesForStudents(visibleStudents, schedulesThisMonth, _currentMonth, _currentYear);
    let evaluationSessions = [];
    if(canEvaluateClassSession(role)){
      const { data: storedSessions, error: sessionLoadError } = await sb
        .from("class_sessions")
        .select("id,lesson_id,session_order,session_date,exam_id,pdf_exam_id,starts_at,ends_at,created_at")
        .eq("class_id",_classId)
        .order("session_date",{ascending:true});
      if(!sessionLoadError){
        evaluationSessions = storedSessions || [];
      }
    }

    const {data:attData} = await sb.from("attendance").select("student_id,date,status,schedule_id")
      .eq("class_id",_classId).gte("date",mStart).lte("date",mEnd);
    _attendanceMap = {};
    (attData||[]).forEach(a=>{ _attendanceMap[a.student_id+"_"+a.date+"_"+(a.schedule_id || 0)]=a.status; });
    const evaluationSessionMap = buildSessionMapByDate(evaluationSessions);

    if(role === "student"){
      const uid = window._currentUserId;
      let dateHeaders="";
      dates.forEach(item=>{
        dateHeaders += renderAttendanceDateHeader(item, evaluationSessionMap, role, 58);
      });
      const me = visibleStudents.find(s => s.student_id === uid);
      if(!me){
        tc.innerHTML = '<p style="color:var(--ink-light);font-size:.85rem">Không tìm thấy dữ liệu điểm danh của bạn trong tháng này.</p>';
        return;
      }
      const joined=me.joined_at?me.joined_at.slice(0,10):"0000-00-00";
      const left  =me.left_at  ?me.left_at.slice(0,10)  :"9999-99-99";
      let myCells="";
      dates.forEach(item=>{
        const d = item.date, scheduleId = item.schedule_id;
        const cellStyle = 'padding:4px;'+attendanceSessionStyle(item.session_no);
        if(!getStudentSchedules(me.student_id, schedulesThisMonth).some(s => Number(s.id) === scheduleId)){
          myCells+='<td class="center" style="'+cellStyle+'"></td>';
          return;
        }
        if(d>left){
          const status=_attendanceMap[me.student_id+"_"+d+"_"+scheduleId]||_attendanceMap[me.student_id+"_"+d+"_0"]||"absent";
          const sm=statusMap[status]||statusMap.absent;
          myCells+='<td class="center" style="'+cellStyle+'"><span class="att-btn '+sm.cls+'" style="cursor:default;font-weight:700">'+ sm.text+'</span></td>';
        } else {
          const defaultStatus = d < joined ? "absent" : "present";
          const status=_attendanceMap[me.student_id+"_"+d+"_"+scheduleId]||_attendanceMap[me.student_id+"_"+d+"_0"]||defaultStatus;
          const sm=statusMap[status]||statusMap.present;
          myCells+='<td class="center" style="'+cellStyle+'"><span class="att-btn '+sm.cls+'" style="cursor:default;font-weight:700">'+ sm.text+'</span></td>';
        }
      });
      const myRow =
        '<tr style="background:var(--gold-pale)">'+
          '<td style="text-align:left;font-weight:700;position:sticky;left:0;background:var(--gold-pale);z-index:1;'+
          'border-right:1px solid var(--border);padding:6px 10px">'+
          (me.user?.full_name || "Tôi")+' <span style="font-size:.7rem;color:var(--gold)">(Tôi)</span>'+
          "</td>"+myCells+
        "</tr>";
      tc.innerHTML =
        '<div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">'+
        '<table class="table" style="font-size:.8rem">'+
        "<thead><tr>"+
        '<th style="text-align:left;min-width:130px;position:sticky;left:0;background:var(--navy);z-index:1">Học sinh</th>'+
        dateHeaders+
        "</tr></thead><tbody>"+myRow+"</tbody></table></div>";
      return;
      let rowsHtml="";
      visibleStudents.forEach(s=>{
        const isMe = s.student_id === uid;
        const joined=s.joined_at?s.joined_at.slice(0,10):"0000-00-00";
        const left  =s.left_at  ?s.left_at.slice(0,10)  :"9999-99-99";
        let cells="";
        dates.forEach(d=>{
          if(d>left){
            const status=_attendanceMap[s.student_id+"_"+d]||"absent";
            const sm=statusMap[status]||statusMap.absent;
            cells+='<td class="center" style="padding:4px"><span class="att-btn '+sm.cls+'" style="cursor:default;'+(isMe?"font-weight:700":"")+'">'+ sm.text+'</span></td>';
          } else {
            const defaultStatus = d < joined ? "absent" : "present";
            const status=_attendanceMap[s.student_id+"_"+d]||defaultStatus;
            const sm=statusMap[status]||statusMap.present;
            cells+='<td class="center" style="padding:4px"><span class="att-btn '+sm.cls+'" style="cursor:default;'+(isMe?"font-weight:700":"")+'">'+ sm.text+'</span></td>';
          }
        });
        rowsHtml+="<tr"+(isMe?' style="background:var(--gold-pale)"':"")+">"+
          '<td style="text-align:left;font-weight:'+(isMe?"700":"600")+';position:sticky;left:0;'+
          'background:'+(isMe?"var(--gold-pale)":"#fff")+';z-index:1;'+
          'border-right:1px solid var(--border);padding:6px 10px">'+
          s.user.full_name+(isMe?' <span style="font-size:.7rem;color:var(--gold)">(Tôi)</span>':"")+
          "</td>"+cells+"</tr>";
      });
      tc.innerHTML =
        '<div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">'+
        '<table class="table" style="font-size:.8rem">'+
        "<thead><tr>"+
        '<th style="text-align:left;min-width:130px;position:sticky;left:0;background:var(--navy);z-index:1">Học sinh</th>'+
        dateHeaders+
        "</tr></thead><tbody>"+rowsHtml+"</tbody></table></div>";
      return;
    }

    let rowsHtml="";
    visibleStudents.forEach(s=>{
      const isActive=!s.left_at||s.left_at.slice(0,10)>=today;
      const joined  =s.joined_at?s.joined_at.slice(0,10):"0000-00-00";
      const left    =s.left_at  ?s.left_at.slice(0,10)  :"9999-99-99";
      let cells="";
      dates.forEach(item=>{
        const d = item.date, scheduleId = item.schedule_id, sessionNo = item.session_no;
        const cellStyle = 'padding:4px;'+attendanceSessionStyle(sessionNo);
        if(!getStudentSchedules(s.student_id, schedulesThisMonth).some(sc => Number(sc.id) === scheduleId)){
          cells+='<td class="center" style="'+cellStyle+'"></td>';
          return;
        }
        if(d>left){
          const status=_attendanceMap[s.student_id+"_"+d+"_"+scheduleId]||_attendanceMap[s.student_id+"_"+d+"_0"]||"absent";
          const key="cvatt_"+s.student_id+"_"+d+"_"+scheduleId;
          const sm=statusMap[status]||statusMap.absent;
          cells+='<td class="center" style="'+cellStyle+'">'+
            (canTakeAttendance(role)
              ? '<button id="'+key+'" class="att-btn '+sm.cls+'" '+
                'onclick="cvToggleAtt(\''+_classId+'\',\''+s.student_id+'\',\''+d+'\',\''+status+'\',\''+scheduleId+'\',\''+sessionNo+'\')">'+
                sm.text+'</button>'
              : '<span class="att-btn '+sm.cls+'" style="cursor:default;font-weight:700">'+sm.text+'</span>')+
            '</td>';
        } else {
          const defaultStatus = d < joined ? "absent" : "present";
          const status=_attendanceMap[s.student_id+"_"+d+"_"+scheduleId]||_attendanceMap[s.student_id+"_"+d+"_0"]||defaultStatus;
          const key="cvatt_"+s.student_id+"_"+d+"_"+scheduleId;
          const sm=statusMap[status]||statusMap.present;
          cells+='<td class="center" style="'+cellStyle+'">'+
            (canTakeAttendance(role)
              ? '<button id="'+key+'" class="att-btn '+sm.cls+'" '+
                'onclick="cvToggleAtt(\''+_classId+'\',\''+s.student_id+'\',\''+d+'\',\''+status+'\',\''+scheduleId+'\',\''+sessionNo+'\')">'+
                sm.text+'</button>'
              : '<span class="att-btn '+sm.cls+'" style="cursor:default;font-weight:700">'+sm.text+'</span>')+
            '</td>';
        }
      });
      const stopBtn = (isActive && (role === "admin" || role === "teacher"))
        ? '<button onclick="cvStopStudent(\''+_classId+'\',\''+s.student_id+'\')" '+
          'class="btn btn-outline btn-sm" style="font-size:.72rem;padding:3px 9px">Ngừng</button>'
        : '<span style="font-size:.72rem;color:var(--ink-light)">—</span>';
      const studentName = s.user?.full_name || "—";
      const studentNameHtml = canTakeAttendance(role)
        ? '<button type="button" onclick="cvOpenEditStudentSchedule(\''+s.student_id+'\',\''+jsArg(studentName)+'\')" '+
          'title="Sửa lịch học của học sinh này" '+
          'style="appearance:none;border:0;background:transparent;padding:0;margin:0;color:var(--navy);font:inherit;font-weight:700;text-align:left;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px">'+
          esc(studentName)+'</button>'
        : esc(studentName);
      rowsHtml+="<tr>"+
        '<td style="text-align:left;font-weight:600;position:sticky;left:0;background:#fff;z-index:1;'+
        'border-right:1px solid var(--border);padding:6px 10px">'+
        studentNameHtml+
        (!isActive?'<br><span style="font-size:.7rem;color:var(--ink-light);font-weight:400">nghỉ '+left+"</span>":"")+
        "</td>"+cells+
        '<td class="center">'+stopBtn+"</td>"+
        "</tr>";
    });

    rowsHtml+=
      '<tr style="background:var(--gold-pale)">'+
      '<td colspan="'+(dates.length+2)+'" style="padding:8px;text-align:left">'+
      '<button onclick="cvClassOff(\''+_classId+'\')" class="btn btn-sm" '+
      'style="background:var(--amber);color:#fff;border:none;box-shadow:0 2px 8px rgba(180,83,9,.2)">📅 Lớp nghỉ hôm nay</button>'+
      "</td></tr>";

    let dateHeaders="";
      dates.forEach(item=>{
        dateHeaders += renderAttendanceDateHeader(item, evaluationSessionMap, role, 62);
      });

    const searchModal=
      '<div id="cvAddStudentModal" class="popup-overlay hidden" style="z-index:1100" onclick="if(event.target===this)cvCloseAddStudent()">'+
      '<div class="popup-card" style="width:min(94vw,640px);padding:0;max-height:88vh">'+
      '<div class="popup-header" style="padding:16px 18px 12px;margin:0;border-bottom:1px solid var(--border)">'+
      '<h3>Thêm học sinh</h3>'+
      '<button onclick="cvCloseAddStudent()" class="close-btn" type="button">✕</button>'+
      "</div>"+
      '<div style="padding:16px 18px 18px">'+
      '<label for="cvStudentSearch">Tìm học sinh</label>'+
      '<input id="cvStudentSearch" type="text" placeholder="Nhập tên hoặc email..." oninput="cvSearchStudents()" />'+
      '<div id="cvSearchResults" style="margin-top:12px;max-height:52vh;overflow-y:auto"></div>'+
      "</div></div></div>";

    tc.innerHTML=
      '<div style="margin-bottom:14px">'+
      '<button onclick="cvOpenAddStudent()" class="btn btn-primary btn-sm">+ Thêm học sinh</button>'+
      '</div>'+
      '<div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">'+
      '<table class="table" style="font-size:.8rem">'+
      "<thead><tr>"+
      '<th style="text-align:left;min-width:130px;position:sticky;left:0;background:var(--navy);z-index:1">Học sinh</th>'+
      dateHeaders+
      '<th class="center" style="min-width:80px">Ngừng</th>'+
      "</tr></thead><tbody>"+rowsHtml+"</tbody></table></div>"+
      searchModal;
  }

  window.cvToggleAtt = async function(classId,studentId,date,current,scheduleId,sessionNo){
    const next=statusCycle[(statusCycle.indexOf(current)+1)%3];
    const sb=getSb();
    const sid = Number(scheduleId || 0) || null;
    const{error}=await sb.from("attendance").upsert(
      [{class_id:classId,student_id:studentId,date,status:next,schedule_id:sid,session_no:Number(sessionNo || 1)}],
      {onConflict:"class_id,student_id,date"}
    );
    if(error){alert("Lỗi: "+error.message);return;}
    _attendanceMap[studentId+"_"+date+"_"+(sid || 0)]=next;
    const btn=document.getElementById("cvatt_"+studentId+"_"+date+"_"+(sid || 0));
    if(btn){
      const s=statusMap[next];
      btn.className="att-btn "+s.cls; btn.textContent=s.text;
      btn.setAttribute("onclick","cvToggleAtt('"+classId+"','"+studentId+"','"+date+"','"+next+"','"+sid+"','"+Number(sessionNo || 1)+"')");
    }
    // === MINDUP BOT: Gửi tin nhắn tự động sau điểm danh ===
    try {
      if(window.MindUpBot && date === new Date().toISOString().slice(0,10)) {
        const now = new Date();
        const isAfterSession = now.getHours() >= 17; // Chỉ gửi sau 17h
        if(isAfterSession) {
          const className = _cachedClass?.name || _cachedClass?.class_name || 'lớp học';
          const sessionDate = new Date(date).toLocaleDateString('vi-VN');
          // Lấy thông tin học sinh
          const st = (_cachedClass?.students||[]).find(s=>s.student_id===studentId);
          const studentName = st?.user?.full_name || 'học sinh';
          if(next === 'absent') {
            // Tin nhắn 3: Thông báo vắng học (1 buổi)
            await window.MindUpBot.sendAbsentMessage(studentId, { studentName, className, sessionDate });
            // Kiểm tra vắng liên tiếp
            const {data:recentAtt} = await sb.from('attendance')
              .select('date,status').eq('class_id',classId).eq('student_id',studentId)
              .eq('status','absent').order('date',{ascending:false}).limit(5);
            if(recentAtt && recentAtt.length >= 2) {
              // Tính số buổi vắng liên tiếp (chỉ đếm những ngày giáp nhau)
              let consecutiveCount = 1;
              for(let i=1;i<recentAtt.length;i++){
                const d1=new Date(recentAtt[i-1].date), d2=new Date(recentAtt[i].date);
                const diff=Math.round((d1-d2)/(86400000));
                if(diff<=7) consecutiveCount++; else break; // Kế tiếp trong vòng 7 ngày
              }
              if(consecutiveCount >= 2) {
                // Tin nhắn 4: Cảnh báo vắng liên tiếp
                await window.MindUpBot.sendConsecutiveAbsentMessage(studentId, { studentName, className, absentCount: consecutiveCount });
              }
            }
          } else if(next === 'present') {
            // Tin nhắn 13: Yêu cầu đánh giá buổi học
            const sessionId = `${classId}_${date}_${sessionNo||1}`;
            await window.MindUpBot.sendSessionEvaluationWidget(studentId, { className, sessionId });
          }
        }
      }
    } catch(botErr){ console.warn('[MindUpBot] Lỗi gửi tin nhắn điểm danh:',botErr); }
    // === END MINDUP BOT ===
  };


  window.cvStopStudent = async function(classId,studentId){
    if(!confirm("Xác nhận ngừng học cho học sinh này?")) return;
    const sb=getSb(), today=todayStr();
    await sb.from("class_students").update({left_at:new Date().toISOString()}).eq("class_id",classId).eq("student_id",studentId);
    const sched=getSchedulesForMonth(_cachedClass.class_schedules||[],_currentMonth,_currentYear);
    const futureRows=generateStudentOccurrences(studentId,sched,_currentMonth,_currentYear)
      .filter(item=>item.date>today)
      .map(item=>({class_id:classId,student_id:studentId,date:item.date,status:"absent",schedule_id:item.schedule_id,session_no:item.session_no}));
    if(futureRows.length>0){
      await sb.from("attendance").upsert(
        uniqueAttendanceRows(futureRows),
        {onConflict:"class_id,student_id,date"}
      );
    }
    const st=_cachedClass.students.find(s=>s.student_id===studentId);
    if(st) st.left_at=new Date().toISOString();
    await window.AppAdminTools?.recordAudit?.("class_student_stopped", {
      target_type: "class_student",
      target_id: classId,
      class_id: classId,
      student_id: studentId,
      student_name: st?.user?.full_name || null,
    });
    await renderAttendanceTab();
  };

  window.cvClassOff = async function(classId){
    const today=todayStr();
    const sched=getSchedulesForMonth(_cachedClass.class_schedules||[],_currentMonth,_currentYear);
    const todayWd=new Date().getDay()===0?7:new Date().getDay();
    if(!sched.some(s=>s.weekday===todayWd)){alert("Hôm nay không có lịch học của lớp này.");return;}
    if(!confirm("Đánh dấu tất cả học sinh vắng hôm nay?")) return;
    const sb=getSb();
    const active=(_cachedClass.students||[]).filter(s=>{
      const j=s.joined_at?s.joined_at.slice(0,10):"0000-00-00";
      const l=s.left_at  ?s.left_at.slice(0,10)  :"9999-99-99";
      return j<=today&&l>=today&&isStudentScheduledOn(s.student_id,today,sched);
    });
    if(!active.length) return;
    const rows = [];
    active.forEach(s => {
      getStudentSchedules(s.student_id, sched)
        .filter(sc => sc.weekday === todayWd)
        .forEach(sc => rows.push({
          class_id: classId,
          student_id: s.student_id,
          date: today,
          status: "absent",
          schedule_id: Number(sc.id),
          session_no: Number(sc.session_no || 1)
        }));
    });
    if(!rows.length) return;
    await sb.from("attendance").upsert(
      uniqueAttendanceRows(rows),
      {onConflict:"class_id,student_id,date"}
    );
    rows.forEach(row=>{
      _attendanceMap[row.student_id+"_"+today+"_"+row.schedule_id]="absent";
      const btn=document.getElementById("cvatt_"+row.student_id+"_"+today+"_"+row.schedule_id);
      if(btn){
        btn.className="att-btn absent"; btn.textContent="Vắng";
        btn.setAttribute("onclick","cvToggleAtt('"+classId+"','"+row.student_id+"','"+today+"','absent','"+row.schedule_id+"','"+row.session_no+"')");
      }
    });
  };

  window.cvOpenAddStudent = function(){
    const modal=document.getElementById("cvAddStudentModal");
    if(!modal) return;
    const title=modal.querySelector(".popup-header h3");
    const label=modal.querySelector('label[for="cvStudentSearch"]');
    const inp=document.getElementById("cvStudentSearch");
    if(title) title.textContent="Thêm học sinh";
    if(label) label.style.display="";
    if(inp){ inp.style.display=""; inp.disabled=false; inp.value=""; }
    modal.classList.remove("hidden");
    modal.style.display="flex";
    if(inp){inp.value="";inp.focus();}
    const res=document.getElementById("cvSearchResults");
    if(res) res.innerHTML="";
  };

  window.cvCloseAddStudent = function(){
    const modal=document.getElementById("cvAddStudentModal");
    if(!modal) return;
    modal.classList.add("hidden");
    modal.style.display="none";
  };

  window.cvOpenEditStudentSchedule = function(studentId, studentName){
    if(!canTakeAttendance(_role)) return;
    const modal=document.getElementById("cvAddStudentModal");
    const resultsDiv=document.getElementById("cvSearchResults");
    if(!modal || !resultsDiv) return;
    const title=modal.querySelector(".popup-header h3");
    const label=modal.querySelector('label[for="cvStudentSearch"]');
    const inp=document.getElementById("cvStudentSearch");
    if(title) title.textContent="Sửa lịch học";
    if(label) label.style.display="none";
    if(inp){ inp.style.display="none"; inp.disabled=true; }

    const sched=getSchedulesForMonth(_cachedClass.class_schedules||[],_currentMonth,_currentYear);
    const selectedIds=_studentScheduleMap[studentId] || new Set();
    resultsDiv.innerHTML =
      '<div style="padding:10px;border-radius:10px;background:#fff;border:1px solid var(--border)">'+
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center">'+
          '<div>'+
            '<div style="font-weight:800;color:var(--navy)">Sửa lịch học của học sinh</div>'+
            '<div style="font-size:.82rem;color:var(--ink-mid);margin-top:2px">'+esc(studentName)+'</div>'+
          '</div>'+
          '<button onclick="cvCloseAddStudent()" class="btn btn-outline btn-sm">Đóng</button>'+
        '</div>'+
        '<p style="font-size:.82rem;color:var(--ink-mid);margin:10px 0 0">Chọn lịch học áp dụng cho học sinh này trong lớp hiện tại. Mỗi buổi chọn một khung lịch.</p>'+
        buildSchedulePickerHtml(sched, selectedIds)+
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">'+
          '<button onclick="cvConfirmEditStudentSchedule(\''+studentId+'\',\''+jsArg(studentName)+'\')" class="btn btn-primary btn-sm">Lưu lịch học</button>'+
        '</div>'+
      '</div>';
    modal.classList.remove("hidden");
    modal.style.display="flex";
  };

  window.cvConfirmEditStudentSchedule = async function(studentId, studentName){
    if(!canTakeAttendance(_role)) return;
    const sb=getSb();
    const sched=getSchedulesForMonth(_cachedClass.class_schedules||[],_currentMonth,_currentYear);
    const selectedSchedules = chooseSchedulesForStudent(studentName, sched);
    if(selectedSchedules === null) return;
    if(!selectedSchedules.length && sched.length){
      alert("Lớp chưa có lịch học hợp lệ.");
      return;
    }

    const { error: deleteError } = await sb
      .from("class_student_schedules")
      .delete()
      .eq("class_id", _classId)
      .eq("student_id", studentId);
    if(deleteError){ alert("Lỗi xóa lịch học cũ: "+deleteError.message); return; }

    if(selectedSchedules.length){
      const rows = selectedSchedules.map(s => ({
        class_id: _classId,
        student_id: studentId,
        session_no: Number(s.session_no || 1),
        schedule_id: s.id
      }));
      const { error: scheduleError } = await sb
        .from("class_student_schedules")
        .upsert(rows, { onConflict: "class_id,student_id,session_no" });
      if(scheduleError){ alert("Lỗi lưu lịch học sinh: "+scheduleError.message); return; }
      _studentScheduleMap[studentId] = new Set(selectedSchedules.map(s => Number(s.id)));
    } else {
      delete _studentScheduleMap[studentId];
    }

    await window.AppAdminTools?.recordAudit?.("class_student_schedule_updated", {
      target_type: "class_student_schedule",
      target_id: _classId,
      class_id: _classId,
      student_id: studentId,
      student_name: studentName || null,
      schedule_ids: selectedSchedules.map(s => s.id),
    });
    cvCloseAddStudent();
    await renderAttendanceTab();
  };

  window.cvSearchStudents = async function(){
    const q=(document.getElementById("cvStudentSearch")||{}).value||"";
    const resultsDiv=document.getElementById("cvSearchResults");
    if(!resultsDiv) return;
    if(q.trim().length<1){resultsDiv.innerHTML="";return;}
    const existingActiveIds=(_cachedClass.students||[]).filter(s=>!s.left_at).map(s=>s.student_id);
    let localMatches = [];
    try{
      localMatches = (await getStudentSearchPool()).filter(u => matchesStudentSearch(u, q)).slice(0, 10);
    }catch(error){
      resultsDiv.innerHTML='<p style="font-size:13px;color:var(--red)">Lỗi tải danh sách học sinh: '+error.message+'</p>';
      return;
    }
    if(!localMatches.length){
      resultsDiv.innerHTML='<p style="font-size:13px;color:var(--ink-light)">Không tìm thấy học sinh nào.</p>';
      return;
    }
    let localHtml="";
    localMatches.forEach(u=>{
      const alreadyIn=existingActiveIds.includes(u.id);
      const safeName=(u.full_name || "").replace(/'/g,"\\'");
      localHtml+='<div style="display:flex;justify-content:space-between;align-items:center;'+
        'padding:8px 10px;border-radius:8px;margin-bottom:4px;'+
        'background:'+(alreadyIn?"var(--surface)":"var(--white)")+';border:1px solid var(--border)">'+
        "<div>"+
        '<div style="font-weight:600;font-size:.85rem;color:var(--navy)">'+(u.full_name||"—")+"</div>"+
        '<div style="font-size:.75rem;color:var(--ink-mid)">'+(u.email||"")+"</div>"+
        "</div>"+
        (alreadyIn
          ?'<span style="font-size:.75rem;color:var(--ink-light)">Đã trong lớp</span>'
          :'<button onclick="cvOpenSchedulePicker(\''+u.id+'\',\''+safeName+'\')" class="btn btn-primary btn-sm">Thêm</button>')+
        "</div>";
    });
    resultsDiv.innerHTML=localHtml;
    return;
    const sb=getSb();
    const existingIds=(_cachedClass.students||[]).filter(s=>!s.left_at).map(s=>s.student_id);
    const{data,error}=await sb.from("users").select("id,full_name,email,phone").eq("role","student")
      .or("full_name.ilike.%"+q+"%,email.ilike.%"+q+"%").limit(10);
    if(error||!data||data.length===0){
      resultsDiv.innerHTML='<p style="font-size:13px;color:var(--ink-light)">Không tìm thấy học sinh nào.</p>';
      return;
    }
    let html="";
    data.forEach(u=>{
      const alreadyIn=existingIds.includes(u.id);
      const safeName=u.full_name.replace(/'/g,"\\'");
      html+='<div style="display:flex;justify-content:space-between;align-items:center;'+
        'padding:8px 10px;border-radius:8px;margin-bottom:4px;'+
        'background:'+(alreadyIn?"var(--surface)":"var(--white)")+';border:1px solid var(--border)">'+
        "<div>"+
        '<div style="font-weight:600;font-size:.85rem;color:var(--navy)">'+u.full_name+"</div>"+
        '<div style="font-size:.75rem;color:var(--ink-mid)">'+(u.email||"")+(u.phone?" • "+u.phone:"")+"</div>"+
        "</div>"+
        (alreadyIn
          ?'<span style="font-size:.75rem;color:var(--ink-light)">Đã trong lớp</span>'
          :'<button onclick="cvOpenSchedulePicker(\''+u.id+'\',\''+safeName+'\')" class="btn btn-primary btn-sm">Thêm</button>')+
        "</div>";
    });
    resultsDiv.innerHTML=html;
  };

  window.cvOpenSchedulePicker = function(studentId, studentName){
    const resultsDiv=document.getElementById("cvSearchResults");
    if(!resultsDiv) return;
    const sched=getSchedulesForMonth(_cachedClass.class_schedules||[],_currentMonth,_currentYear);
    resultsDiv.innerHTML =
      '<div style="padding:10px;border-radius:10px;background:#fff;border:1px solid var(--border)">'+
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center">'+
          '<div>'+
            '<div style="font-weight:800;color:var(--navy)">Chọn lịch học</div>'+
            '<div style="font-size:.82rem;color:var(--ink-mid);margin-top:2px">'+esc(studentName)+'</div>'+
          '</div>'+
          '<button onclick="cvSearchStudents()" class="btn btn-outline btn-sm">Đổi học sinh</button>'+
        '</div>'+
        buildSchedulePickerHtml(sched)+
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">'+
          '<button onclick="cvConfirmAddStudent(\''+studentId+'\',\''+String(studentName || '').replace(/'/g,"\\'")+'\')" class="btn btn-primary btn-sm">Xác nhận thêm</button>'+
        '</div>'+
      '</div>';
  };

  window.cvConfirmAddStudent = async function(studentId,studentName){
    const sb=getSb(), classId=_classId, today=todayStr();
    const sched=getSchedulesForMonth(_cachedClass.class_schedules||[],_currentMonth,_currentYear);
    const selectedSchedules = chooseSchedulesForStudent(studentName, sched);
    if(selectedSchedules === null) return;
    if(!selectedSchedules.length && sched.length){
      alert("Lớp chưa có lịch học hợp lệ.");
      return;
    }
    const{data:newRow,error}=await sb.from("class_students")
      .insert([{class_id:classId,student_id:studentId,joined_at:new Date().toISOString()}])
      .select().single();
    if(error){alert("Lỗi: "+error.message);return;}
    if(selectedSchedules.length){
      const rows = selectedSchedules.map(s => ({
        class_id: classId,
        student_id: studentId,
        session_no: Number(s.session_no || 1),
        schedule_id: s.id
      }));
      const { error: scheduleError } = await sb.from("class_student_schedules").upsert(rows, { onConflict: "class_id,student_id,session_no" });
      if(scheduleError){ alert("Lỗi lưu lịch học sinh: "+scheduleError.message); return; }
      _studentScheduleMap[studentId] = new Set(selectedSchedules.map(s => Number(s.id)));
    }
    const pastRows=generateOccurrences(selectedSchedules.length ? selectedSchedules : sched,_currentMonth,_currentYear)
      .filter(item=>item.date<today)
      .map(item=>({class_id:classId,student_id:studentId,date:item.date,status:"absent",schedule_id:item.schedule_id,session_no:item.session_no}));
    if(pastRows.length>0){
      await sb.from("attendance").upsert(
        uniqueAttendanceRows(pastRows),
        {onConflict:"class_id,student_id,date"}
      );
    }
    const{data:userData}=await sb.from("users").select("id,full_name").eq("id",studentId).single();
    _cachedClass.students.push({id:newRow.id,student_id:studentId,joined_at:newRow.joined_at,left_at:null,user:userData});
    await window.AppAdminTools?.recordAudit?.("class_student_added", {
      target_type: "class_student",
      target_id: classId,
      class_id: classId,
      student_id: studentId,
      student_name: userData?.full_name || studentName || null,
    });
    cvCloseAddStudent();
    await renderAttendanceTab();
  };

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     TAB Äá»€ THI
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function getExamAccessMeta(startsAt, endsAt){
    const now = new Date();
    let canDo = true;
    let note = "";
    if(startsAt && endsAt){
      const startDt = new Date(startsAt);
      const endDt = new Date(endsAt);
      if(now < startDt){ canDo = false; note = "Chưa đến giờ làm bài"; }
      else if(now > endDt){ canDo = false; note = "Đã hết giờ làm bài"; }
      else note = "Đang trong thời gian làm bài";
    }
    return {
      canDo,
      note,
      scheduleLabel: startsAt && endsAt
        ? "🕐 " + fmtDT(startsAt) + " → " + fmtDT(endsAt)
        : "🗓 Không giới hạn"
    };
  }

  function buildSessionExamInfo(source){
    if(!source) return null;
    if(source.type === "pdf"){
      return {
        type: "pdf",
        id: source.id,
        title: source.title,
        duration_minutes: source.duration_minutes,
        total_points: source.total_points,
        question_types: source.question_types || [],
        starts_at: source.starts_at || null,
        ends_at: source.ends_at || null
      };
    }
    return {
      type: "exam",
      id: source.id,
      title: source.title,
      duration_minutes: source.duration_minutes,
      total_points: source.total_points,
      exam_questions: source.exam_questions || [],
      starts_at: source.starts_at || null,
      ends_at: source.ends_at || null
    };
  }

  function renderStudentPracticeBlock(examInfo, resultState){
    if(!examInfo) return "";
    const isCompactMobile = window.matchMedia("(max-width: 768px)").matches;
    const access = getExamAccessMeta(examInfo.starts_at, examInfo.ends_at);

    if(examInfo.type === "pdf"){
      const results = resultState.pdfResultsMap[examInfo.id] || [];
      const submitted = results.filter(r=>r.submitted_at);
      const lastResult = submitted[0] || null;
      const inProgress = submitted.length === 0
        ? (results.find(r=>!r.submitted_at && (r.seconds_left||0) > 0) || null)
        : null;
      const hasEssay = (examInfo.question_types || []).includes("essay");
      let actionsHtml = "";
      if(lastResult){
        const score = lastResult.score_total ?? lastResult.score_auto ?? "?";
        const waiting = hasEssay && lastResult.score_total === null;
        actionsHtml += '<span style="background:#dcfce7;color:#15803d;font-size:.78rem;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap">✓ '+score+' / '+(examInfo.total_points||0)+' đ</span>';
        if(waiting){
          actionsHtml += ' <span style="background:#fef3c7;color:#b45309;font-size:.72rem;padding:2px 8px;border-radius:20px">⏳ Chờ chấm tự luận</span>';
        }
        actionsHtml += ' <button onclick="location.href=\'pdf_exam.html?exam='+encodeURIComponent(examInfo.id)+'&classId='+encodeURIComponent(_classId)+'&action=review&resultId='+encodeURIComponent(lastResult.id)+'\'" class="btn btn-outline btn-sm" style="font-size:.75rem">Xem lại</button>';
      } else if(!access.canDo && (examInfo.starts_at || examInfo.ends_at)){
        actionsHtml = '<div style="font-size:.75rem;color:var(--ink-mid);padding:6px 10px;background:var(--surface);border-radius:8px;white-space:nowrap">'+access.note+'</div>';
      } else if(inProgress){
        const secsLeft = Math.max(0,(inProgress.seconds_left||0)-300);
        const minLeft = Math.floor(secsLeft/60);
        const secLeft = secsLeft%60;
        actionsHtml = '<button onclick="location.href=\'pdf_exam.html?exam='+encodeURIComponent(examInfo.id)+'&classId='+encodeURIComponent(_classId)+'\'" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;font-family:var(--font-body)">Làm bài tiếp ('+minLeft+':'+String(secLeft).padStart(2,"0")+')</button>';
      } else {
        actionsHtml = '<button onclick="location.href=\'pdf_exam.html?exam='+encodeURIComponent(examInfo.id)+'&classId='+encodeURIComponent(_classId)+'\'" style="background:linear-gradient(135deg,var(--navy),var(--navy-mid));color:var(--gold-light);border:none;padding:8px 16px;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;font-family:var(--font-body)">Làm bài</button>';
      }

      return '<div style="margin-top:12px;padding:'+(isCompactMobile ? '14px' : '12px 14px')+';border-radius:14px;border:1px solid #bfdbfe;background:linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%);box-shadow:0 10px 24px rgba(29,107,209,.08)">'+
        '<div style="font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#1d4ed8;margin-bottom:10px">Đề luyện tập</div>'+
        '<div style="display:flex;justify-content:space-between;align-items:'+(isCompactMobile ? 'stretch' : 'center')+';gap:12px;flex-wrap:wrap;flex-direction:'+(isCompactMobile ? 'column' : 'row')+'">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-weight:700;color:var(--navy)">'+esc(examInfo.title)+'</div>'+
            '<div style="font-size:'+(isCompactMobile ? '.82rem' : '.75rem')+';color:var(--ink-mid);line-height:1.6">📄 PDF • ⏱ '+(examInfo.duration_minutes||0)+' phút • 🏆 '+(examInfo.total_points||0)+' điểm • '+access.scheduleLabel+'</div>'+
            (access.note && access.canDo ? '<div style="font-size:.72rem;color:#16a34a;margin-top:2px">'+access.note+'</div>' : '')+
          '</div>'+
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:'+(isCompactMobile ? '100%' : 'auto')+';justify-content:'+(isCompactMobile ? 'flex-start' : 'flex-end')+'">'+actionsHtml+'</div>'+
        '</div>'+
      '</div>';
    }

    const results = resultState.resultsMap[examInfo.id] || [];
    const submitted = results.filter(r=>r.submitted_at);
    const lastResult = submitted[0] || null;
    const inProgress = submitted.length === 0
      ? (results.find(r=>!r.submitted_at && (r.seconds_left||0) > 0) || null)
      : null;
    const hasEssay = (examInfo.exam_questions || []).some(eq=>eq.question?.question_type === "essay");
    let actionsHtml = "";
    if(lastResult){
      const score = lastResult.score_total ?? lastResult.score_auto ?? "?";
      const waiting = hasEssay && lastResult.score_essay === null && lastResult.score_total === null;
      actionsHtml += '<span style="background:#dcfce7;color:#15803d;font-size:.78rem;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap">✓ '+score+' / '+(examInfo.total_points||0)+' đ</span>';
      if(waiting){
        actionsHtml += ' <span style="background:#fef3c7;color:#b45309;font-size:.72rem;padding:2px 8px;border-radius:20px">⏳ Chờ chấm tự luận</span>';
      }
      actionsHtml += ' <button onclick="cvOpenStudentReview(\''+lastResult.id+'\',\''+examInfo.id+'\',\''+examInfo.title.replace(/'/g,"\\'")+'\')" class="btn btn-outline btn-sm" style="font-size:.75rem">Xem lại</button>';
    } else if(!access.canDo && (examInfo.starts_at || examInfo.ends_at)){
      actionsHtml = '<div style="font-size:.75rem;color:var(--ink-mid);padding:6px 10px;background:var(--surface);border-radius:8px;white-space:nowrap">'+access.note+'</div>';
    } else if(inProgress){
      const secsLeft = Math.max(0,(inProgress.seconds_left||0)-300);
      const minLeft = Math.floor(secsLeft/60);
      const secLeft = secsLeft%60;
      actionsHtml = '<button onclick="resumeExam(\''+examInfo.id+'\',\''+examInfo.title.replace(/'/g,"\\'")+'\','+(examInfo.total_points||0)+',\''+inProgress.id+'\','+secsLeft+')" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;font-family:var(--font-body)">Làm bài tiếp ('+minLeft+':'+String(secLeft).padStart(2,"0")+')</button>';
    } else {
      actionsHtml = '<button onclick="startExam(\''+examInfo.id+'\',\''+examInfo.title.replace(/'/g,"\\'")+'\','+(examInfo.duration_minutes||0)+','+(examInfo.total_points||0)+',\''+_classId+'\')" style="background:linear-gradient(135deg,var(--navy),var(--navy-mid));color:var(--gold-light);border:none;padding:8px 16px;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;font-family:var(--font-body)">Làm bài</button>';
    }

    const matchedReviews = (resultState.reviewExams || []).filter(re => re.parent_exam_id === examInfo.id);
    const reviewHtml = matchedReviews.map(re => {
      const rResults = resultState.resultsMap[re.id] || [];
      const rSubmitted = rResults.filter(r => r.submitted_at);
      const rLastResult = rSubmitted[0] || null;
      const rInProgress = (rSubmitted.length === 0) ? (rResults.find(r => !r.submitted_at && r.seconds_left > 0) || null) : null;
      const rAttemptCount = rSubmitted.length;

      let rScoreBadge = "";
      if (rLastResult) {
        const rScore = rLastResult.score_total ?? rLastResult.score_auto ?? "?";
        rScoreBadge = '<span style="background:#fef3c7;color:#d97706;border:1.5px solid #f59e0b;font-size:.78rem;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap">✓ ' + rScore + ' / ' + re.total_points + ' đ</span>';
      }

      let rActionBtn = "";
      if (rInProgress) {
        const rSecsLeft = Math.max(0, (rInProgress.seconds_left || 0) - 300);
        const rMinLeft = Math.floor(rSecsLeft / 60);
        const rSecLeft2 = rSecsLeft % 60;
        const rTimeStr = rMinLeft + ":" + String(rSecLeft2).padStart(2,"0");
        rActionBtn = '<button onclick="resumeExam(\'' + re.id + '\',\'' + re.title.replace(/'/g,"\\'") + '\',' + re.total_points + ',\'' + rInProgress.id + '\',' + rSecsLeft + ')" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;font-family:var(--font-body);flex-shrink:0">▶ Làm tiếp (' + rTimeStr + ')</button>';
      } else if (rLastResult) {
        rActionBtn = '<div style="font-size:.78rem;font-weight:600;color:#d97706;padding:6px 12px;background:#fef3c7;border-radius:8px;white-space:nowrap">✔ Đã hoàn thành</div>';
      } else {
        rActionBtn = '<button onclick="startExam(\'' + re.id + '\',\'' + re.title.replace(/'/g,"\\'") + '\',' + re.duration_minutes + ',' + re.total_points + ',\'' + _classId + '\')" style="background:linear-gradient(135deg,#d97706,#b45309);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;font-family:var(--font-body);flex-shrink:0">' + (rAttemptCount > 0 ? "🔄 Làm lại" : "📝 Làm bài") + '</button>';
      }

      return '<div style="margin-top:8px;margin-left:20px;padding:12px 14px;background:#fffbeb;border:1px solid #fde047;border-radius:10px;border-left:3px solid #f59e0b">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:700;font-size:.85rem;color:#92400e;margin-bottom:3px">⚠️ ' + esc(re.title) + "</div>" +
            '<div style="font-size:.75rem;color:#b45309">⏱ ' + re.duration_minutes + " phút &nbsp;•&nbsp; 🏆 " + re.total_points + "đ</div>" +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap">' +
            rScoreBadge + rActionBtn +
          '</div>' +
        '</div>' +
      '</div>';
    }).join("");

    return '<div style="margin-top:12px;padding:'+(isCompactMobile ? '14px' : '12px 14px')+';border-radius:14px;border:1px solid #bfdbfe;background:linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%);box-shadow:0 10px 24px rgba(29,107,209,.08)">'+
      '<div style="font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#1d4ed8;margin-bottom:10px">Đề luyện tập</div>'+
      '<div style="display:flex;justify-content:space-between;align-items:'+(isCompactMobile ? 'stretch' : 'center')+';gap:12px;flex-wrap:wrap;flex-direction:'+(isCompactMobile ? 'column' : 'row')+'">'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-weight:700;color:var(--navy)">'+esc(examInfo.title)+'</div>'+
          '<div style="font-size:'+(isCompactMobile ? '.82rem' : '.75rem')+';color:var(--ink-mid);line-height:1.6">⏱ '+(examInfo.duration_minutes||0)+' phút • 🏆 '+(examInfo.total_points||0)+' điểm • '+access.scheduleLabel+'</div>'+
          (access.note && access.canDo ? '<div style="font-size:.72rem;color:#16a34a;margin-top:2px">'+access.note+'</div>' : '')+
        '</div>'+
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:'+(isCompactMobile ? '100%' : 'auto')+';justify-content:'+(isCompactMobile ? 'flex-start' : 'flex-end')+'">'+actionsHtml+'</div>'+
      '</div>'+
    '</div>' + reviewHtml;
  }

  function renderAdminPracticeBlock(examInfo, submitState){
    if(!examInfo) return "";
    const isCompactMobile = window.matchMedia("(max-width: 768px)").matches;
    const access = getExamAccessMeta(examInfo.starts_at, examInfo.ends_at);
    if(examInfo.type === "pdf"){
      const count = submitState.pdfSubmitCount[examInfo.id] || 0;
      return '<div style="margin-top:12px;padding:'+(isCompactMobile ? '14px' : '12px 14px')+';border-radius:14px;border:1px solid #bfdbfe;background:linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%);box-shadow:0 10px 24px rgba(29,107,209,.08)">'+
        '<div style="font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#1d4ed8;margin-bottom:10px">Đề luyện tập</div>'+
        '<div style="display:flex;justify-content:space-between;align-items:'+(isCompactMobile ? 'stretch' : 'center')+';gap:12px;flex-wrap:wrap;flex-direction:'+(isCompactMobile ? 'column' : 'row')+'">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-weight:700;color:var(--navy)">'+esc(examInfo.title)+'</div>'+
            '<div style="font-size:'+(isCompactMobile ? '.82rem' : '.75rem')+';color:var(--ink-mid);line-height:1.6">📄 PDF • ⏱ '+(examInfo.duration_minutes||0)+' phút • 🏆 '+(examInfo.total_points||0)+' điểm • '+access.scheduleLabel+'</div>'+
          '</div>'+
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:'+(isCompactMobile ? '100%' : 'auto')+';justify-content:'+(isCompactMobile ? 'flex-start' : 'flex-end')+'">'+
            '<span style="background:var(--navy);color:var(--gold-light);padding:3px 12px;border-radius:20px;font-size:.78rem;font-weight:700">'+count+' bài đã nộp</span>'+
            '<button onclick="location.href=\'pdf_exam.html?exam='+encodeURIComponent(examInfo.id)+'&classId='+encodeURIComponent(_classId)+'\'" class="btn btn-outline btn-sm">Mở đề PDF</button>'+
          '</div>'+
        '</div>'+
      '</div>';
    }

    const count = submitState.submitCount[examInfo.id] || 0;
    return '<div style="margin-top:12px;padding:'+(isCompactMobile ? '14px' : '12px 14px')+';border-radius:14px;border:1px solid #bfdbfe;background:linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%);box-shadow:0 10px 24px rgba(29,107,209,.08)">'+
      '<div style="font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#1d4ed8;margin-bottom:10px">Đề luyện tập</div>'+
      '<div style="display:flex;justify-content:space-between;align-items:'+(isCompactMobile ? 'stretch' : 'center')+';gap:12px;flex-wrap:wrap;flex-direction:'+(isCompactMobile ? 'column' : 'row')+'">'+
        '<div onclick="cvOpenExamResult(\''+examInfo.id+'\',\''+examInfo.title.replace(/'/g,"\\'")+'\',\''+_classId+'\')" style="flex:1;min-width:0;cursor:pointer">'+
          '<div style="font-weight:700;color:var(--navy)">'+esc(examInfo.title)+'</div>'+
          '<div style="font-size:'+(isCompactMobile ? '.82rem' : '.75rem')+';color:var(--ink-mid);line-height:1.6">⏱ '+(examInfo.duration_minutes||0)+' phút • 🏆 '+(examInfo.total_points||0)+' điểm • '+access.scheduleLabel+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:'+(isCompactMobile ? '100%' : 'auto')+';justify-content:'+(isCompactMobile ? 'flex-start' : 'flex-end')+'">'+
          '<span style="background:var(--navy);color:var(--gold-light);padding:3px 12px;border-radius:20px;font-size:.78rem;font-weight:700">'+count+' bài đã nộp</span>'+
          '<button onclick="cvOpenExamResult(\''+examInfo.id+'\',\''+examInfo.title.replace(/'/g,"\\'")+'\',\''+_classId+'\')" class="btn btn-outline btn-sm">Xem kết quả</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function renderClassSessionCard(session, lesson, examInfo, role, examState){
    const isCompactMobile = window.matchMedia("(max-width: 768px)").matches;
    const summary = lesson?.summary
      ? '<div style="font-size:.84rem;line-height:1.65;color:var(--ink-mid);margin-top:6px">'+esc(lesson.summary)+'</div>'
      : '';
    const mediaHtml =
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'+
        (lesson?.lecture_video_url ? '<a class="btn btn-outline btn-sm" href="'+esc(lesson.lecture_video_url)+'" target="_blank" rel="noopener">Video bài giảng</a>' : '')+
        (lesson?.solution_video_url ? '<a class="btn btn-outline btn-sm" href="'+esc(lesson.solution_video_url)+'" target="_blank" rel="noopener">Video chữa bài</a>' : '')+
        (lesson?.document_link ? '<a class="btn btn-outline btn-sm" href="'+esc(lesson.document_link)+'" target="_blank" rel="noopener">Tài liệu</a>' : '')+
      '</div>';
    const practiceHtml = role === "student"
      ? renderStudentPracticeBlock(examInfo, examState)
      : renderAdminPracticeBlock(examInfo, examState);
    const canEvaluate = role === "admin" || role === "teacher" || role === "assistant";
    const actionHtml = canEvaluate
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<button onclick="openSessionEvaluation(\''+session.id+'\')" class="btn btn-primary btn-sm">Đánh giá buổi học</button>'+
          ((role === "admin" || role === "teacher") ?
          '<button onclick="cvOpenAddClassSession(\''+session.id+'\')" class="btn btn-outline btn-sm">Sửa buổi</button>'+
          '<button onclick="cvDeleteClassSession(\''+session.id+'\')" class="btn btn-sm" style="background:var(--red-bg);color:var(--red);border:1px solid #fca5a5">Xóa buổi</button>' : '')+
        '</div>'
      : "";
    const orderLabel = session.display_order || session.session_order || "—";
    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:18px;padding:'+(isCompactMobile ? '16px' : '16px 18px')+'">'+
      '<div style="display:grid;grid-template-columns:'+(isCompactMobile ? '1fr' : '82px minmax(0,1fr) auto')+';gap:16px;align-items:'+(isCompactMobile ? 'stretch' : 'center')+'">'+
        '<div style="width:'+(isCompactMobile ? '100%' : '82px')+';height:'+(isCompactMobile ? 'auto' : '82px')+';min-height:58px;border-radius:16px;background:linear-gradient(135deg,#0f3c73 0%,#1d6bd1 100%);box-shadow:0 12px 28px rgba(15,60,115,.18);color:#fff;display:flex;flex-direction:'+(isCompactMobile ? 'row' : 'column')+';align-items:center;justify-content:center;gap:'+(isCompactMobile ? '10px' : '2px')+';padding:'+(isCompactMobile ? '12px 14px' : '8px')+'">'+
          '<div style="font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.78)">Buổi học</div>'+
          '<div style="font-size:'+(isCompactMobile ? '1.18rem' : '1.4rem')+';font-weight:800;line-height:1.1">'+orderLabel+'</div>'+
        '</div>'+
        '<div style="min-width:0">'+
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">'+
            '<span style="font-size:.74rem;font-weight:700;padding:4px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8">'+esc(fmtSessionDate(session.session_date))+'</span>'+
            (examInfo ? '<span style="font-size:.74rem;font-weight:700;padding:4px 10px;border-radius:999px;background:#fff7ed;color:#c2410c">Có đề luyện tập</span>' : '<span style="font-size:.74rem;font-weight:700;padding:4px 10px;border-radius:999px;background:#f5f5f4;color:#57534e">Chưa gắn đề luyện tập</span>')+
          '</div>'+
          '<div style="font-weight:700;font-size:1rem;color:var(--navy);margin-top:'+(isCompactMobile ? '8px' : '4px')+'">'+esc(lesson?.name || "Chưa có tên bài học")+'</div>'+
          summary+
          mediaHtml+
          practiceHtml+
        '</div>'+
        '<div style="display:flex;justify-content:'+(isCompactMobile ? 'stretch' : 'flex-end')+';width:'+(isCompactMobile ? '100%' : 'auto')+'">'+actionHtml+'</div>'+
      '</div>'+
    '</div>';
  }



  async function renderExamsTab(){
    const tc=document.getElementById("cvTabContent"); if(!tc) return;
    tc.innerHTML='<p style="color:var(--ink-light);font-size:.85rem">Đang tải buổi học và đề luyện tập...</p>';
    const sb=getSb(), role=_role;
    const isStudent = role === "student";
    const isParent = role === "parent";
    let reviewExamsQuery = null;
    if (isStudent && window._currentUserId) {
      reviewExamsQuery = sb.from("exams")
        .select("id,title,duration_minutes,total_points,is_review_generated,parent_exam_id,student_id,exam_questions(question:question_bank(question_type))")
        .eq("class_id", _classId)
        .eq("is_review_generated", true)
        .eq("student_id", window._currentUserId);
    } else if (isParent && window._currentUserId && _parentStudentIds && _parentStudentIds.size > 0) {
      reviewExamsQuery = sb.from("exams")
        .select("id,title,duration_minutes,total_points,is_review_generated,parent_exam_id,student_id,exam_questions(question:question_bank(question_type))")
        .eq("class_id", _classId)
        .eq("is_review_generated", true)
        .in("student_id", Array.from(_parentStudentIds));
    }

    const [
      {data:classSessions,error:classSessionsError},
      {data:gameRooms,error:gameRoomsError},
      {data:gamePlayers,error:gamePlayersError},
      reviewExamsResult
    ] = await Promise.all([
      sb.from("class_sessions")
        .select("id,lesson_id,session_order,session_date,exam_id,pdf_exam_id,starts_at,ends_at,created_at")
        .eq("class_id",_classId)
        .order("session_order",{ascending:true}),
      sb.from("game_rooms").select("id,title,join_code,status,question_count,time_per_question,max_players,visibility,class_id,created_at").eq("class_id",_classId).order("created_at",{ascending:false}),
      sb.from("game_room_players").select("id,room_id,user_id,score,ready,joined_at"),
      reviewExamsQuery ? reviewExamsQuery : Promise.resolve({data:[],error:null})
    ]);

    const reviewExams = reviewExamsResult?.data || [];

    const sessionTableMissing = !!classSessionsError && isMissingRelationError(classSessionsError);
    if((classSessionsError && !sessionTableMissing) || gameRoomsError || gamePlayersError){
      const msg = classSessionsError?.message || gameRoomsError?.message || gamePlayersError?.message || "Không thể tải dữ liệu lớp học.";
      tc.innerHTML = '<p style="color:var(--red);font-size:.85rem;padding:12px">Lỗi tải dữ liệu: '+esc(msg)+'</p>';
      return;
    }

    const sessions = sessionTableMissing ? [] : (classSessions || []);
    const lessonIds = [...new Set(sessions.map(s=>s.lesson_id).filter(Boolean))];
    const reviewExamIds = reviewExams.map(re => re.id);
    const regularIds = [...new Set([
      ...sessions.map(s=>s.exam_id).filter(Boolean),
      ...reviewExamIds
    ])];
    const pdfIds = [...new Set([
      ...sessions.map(s=>s.pdf_exam_id).filter(Boolean)
    ])];

    const queryList = [
      lessonIds.length
        ? sb.from("lessons").select("id,name,summary,lecture_video_url,solution_video_url,document_link").in("id", lessonIds)
        : Promise.resolve({data:[],error:null}),
      regularIds.length
        ? sb.from("exams").select("id,title,duration_minutes,total_points,exam_questions(question:question_bank(question_type))").in("id", regularIds)
        : Promise.resolve({data:[],error:null}),
      pdfIds.length
        ? sb.from("pdf_exams").select("id,title,duration_minutes,total_points").in("id", pdfIds)
        : Promise.resolve({data:[],error:null}),
      pdfIds.length
        ? sb.from("pdf_exam_questions").select("pdf_exam_id,question_type").in("pdf_exam_id", pdfIds)
        : Promise.resolve({data:[],error:null})
    ];

    if(role === "student"){
      queryList.push(
        regularIds.length
          ? sb.from("exam_results").select("id,exam_id,attempt_no,submitted_at,score_auto,score_essay,score_total,seconds_left").eq("student_id",window._currentUserId).eq("class_id",_classId).in("exam_id",regularIds).order("attempt_no",{ascending:false})
          : Promise.resolve({data:[],error:null}),
        pdfIds.length
          ? sb.from("pdf_exam_results").select("id,pdf_exam_id,attempt_no,submitted_at,score_auto,score_total,seconds_left").eq("student_id",window._currentUserId).eq("class_id",_classId).in("pdf_exam_id",pdfIds).order("attempt_no",{ascending:false})
          : Promise.resolve({data:[],error:null})
      );
    } else {
      queryList.push(
        regularIds.length
          ? sb.from("exam_results").select("exam_id").not("submitted_at","is",null).eq("class_id",_classId).in("exam_id",regularIds)
          : Promise.resolve({data:[],error:null}),
        pdfIds.length
          ? sb.from("pdf_exam_results").select("pdf_exam_id").not("submitted_at","is",null).eq("class_id",_classId).in("pdf_exam_id",pdfIds)
          : Promise.resolve({data:[],error:null})
      );
    }

    const results = await Promise.all(queryList);
    const lessonError = results[0].error;
    const regularExamsError = results[1].error;
    const pdfExamsError = results[2].error;
    const pdfQuestionRowsError = results[3].error;
    const extraError = results[4].error || results[5].error;
    if(lessonError || regularExamsError || pdfExamsError || pdfQuestionRowsError || extraError){
      const msg = lessonError?.message || regularExamsError?.message || pdfExamsError?.message || pdfQuestionRowsError?.message || extraError?.message || "Không thể tải dữ liệu buổi học.";
      tc.innerHTML = '<p style="color:var(--red);font-size:.85rem;padding:12px">Lỗi tải dữ liệu: '+esc(msg)+'</p>';
      return;
    }

    const lessonRows = results[0].data || [];
    const lessonMap = Object.fromEntries(lessonRows.map(row => [row.id, row]));
    const regularMap = Object.fromEntries((results[1].data||[]).map(row => [row.id, row]));
    const pdfMap = Object.fromEntries((results[2].data||[]).map(row => [row.id, row]));
    const pdfQuestionTypeMap = {};
    (results[3].data || []).forEach(row => {
      if(!pdfQuestionTypeMap[row.pdf_exam_id]) pdfQuestionTypeMap[row.pdf_exam_id] = [];
      pdfQuestionTypeMap[row.pdf_exam_id].push(row.question_type);
    });

    const examState = role === "student"
      ? {
          resultsMap: (results[4].data||[]).reduce((acc,row)=>{ if(!acc[row.exam_id]) acc[row.exam_id]=[]; acc[row.exam_id].push(row); return acc; }, {}),
          pdfResultsMap: (results[5].data||[]).reduce((acc,row)=>{ if(!acc[row.pdf_exam_id]) acc[row.pdf_exam_id]=[]; acc[row.pdf_exam_id].push(row); return acc; }, {}),
          submitCount: {},
          pdfSubmitCount: {},
          reviewExams: reviewExams
        }
      : {
          resultsMap: {},
          pdfResultsMap: {},
          submitCount: (results[4].data||[]).reduce((acc,row)=>{ acc[row.exam_id]=(acc[row.exam_id]||0)+1; return acc; }, {}),
          pdfSubmitCount: (results[5].data||[]).reduce((acc,row)=>{ acc[row.pdf_exam_id]=(acc[row.pdf_exam_id]||0)+1; return acc; }, {}),
          reviewExams: reviewExams
        };

    const manualSessions = sessions
      .sort((a, b) => {
        const orderCompare = Number(b.session_order || 0) - Number(a.session_order || 0);
        if(orderCompare !== 0) return orderCompare;
        const dateCompare = String(b.session_date || "").localeCompare(String(a.session_date || ""));
        if(dateCompare !== 0) return dateCompare;
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      });
    const sessionCards = manualSessions
      .map((session, index) => {
        const lesson = lessonMap[session.lesson_id] || null;
        let examInfo = null;
        if(session.exam_id && regularMap[session.exam_id]){
          examInfo = buildSessionExamInfo({
            type: "exam",
            ...regularMap[session.exam_id],
            starts_at: session.starts_at,
            ends_at: session.ends_at
          });
        } else if(session.pdf_exam_id && pdfMap[session.pdf_exam_id]){
          examInfo = buildSessionExamInfo({
            type: "pdf",
            ...pdfMap[session.pdf_exam_id],
            question_types: pdfQuestionTypeMap[session.pdf_exam_id] || [],
            starts_at: session.starts_at,
            ends_at: session.ends_at
          });
        }
        return renderClassSessionCard({
          ...session,
          display_order: manualSessions.length - index
        }, lesson, examInfo, role, examState);
      });

    const gameSectionHtml = buildClassGamesSection(role, gameRooms||[], gamePlayers||[]);
    const actionsHtml = (role==="admin"||role==="teacher")
      ? '<div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">'+
          '<button onclick="cvOpenAddClassSession()" class="btn btn-primary btn-sm">+ Thêm buổi học</button>'+
        '</div>'
      : "";
    const sessionHint = sessionTableMissing
      ? '<div style="margin-bottom:14px;padding:12px 14px;border-radius:12px;background:#fff7ed;border:1px solid rgba(245,158,11,.28);color:#9a3412;font-size:.82rem">Tab này đã sẵn sàng cho kiểu "Buổi 1, Buổi 2..." nhưng database của bạn chưa có bảng <b>class_sessions</b>. Hãy chạy SQL mới rồi reload lại.</div>'
      : "";
    const sessionEmpty = '<div style="padding:18px;border:1px dashed #cbd5e1;border-radius:14px;background:#fff"><strong style="display:block;color:var(--navy);margin-bottom:6px">Chưa có buổi học nào</strong><div style="font-size:.84rem;color:var(--ink-mid)">Giáo viên bấm Thêm buổi học để tạo buổi học thủ công cho lớp.</div></div>';

    tc.innerHTML = gameSectionHtml +
      '<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:16px 18px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">'+
          '<div><div style="font-weight:700;color:var(--navy)">Các buổi học được tạo thủ công</div><div style="font-size:.78rem;color:var(--ink-mid);margin-top:2px">Buổi mới nhất nằm trên cùng, Buổi 1 nằm dưới cùng.</div></div>'+
          '<span style="font-size:.78rem;font-weight:700;padding:4px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8">'+sessionCards.length+' buổi</span>'+
        '</div>'+
        actionsHtml+
        sessionHint+
        '<div style="display:flex;flex-direction:column;gap:12px">'+(sessionCards.length ? sessionCards.join("") : sessionEmpty)+'</div>'+
      '</div>';
  }

  function buildClassGamesSection(role, rooms, players){
    const uid = window._currentUserId;
    const playerMap = {};
    (players||[]).forEach(p=>{
      if(!playerMap[p.room_id]) playerMap[p.room_id]=[];
      playerMap[p.room_id].push(p);
    });
    const openCreateBtn = (role==="admin"||role==="teacher")
      ? '<button onclick="cvOpenClassGame()" class="btn btn-outline btn-sm">🎮 Tạo phòng game cho lớp</button>'
      : "";
    const roomsHtml = (rooms||[]).length
      ? rooms.map(room=>{
          const rows = playerMap[room.id] || [];
          const joined = rows.some(p=>p.user_id===uid);
          const isWaiting = room.status === "waiting";
          const isLive = room.status === "live";
          const isFull = rows.length >= Number(room.max_players||8);
          const canJoin = !joined && isWaiting && !isFull;
          const action = joined
            ? '<button onclick="location.href=\'game.html?action=open_room&roomId='+encodeURIComponent(room.id)+'&classId='+encodeURIComponent(_classId)+'\'" class="btn btn-primary btn-sm">Vào phòng</button>'
            : canJoin
              ? '<button onclick="location.href=\'game.html?action=join_room&roomId='+encodeURIComponent(room.id)+'&classId='+encodeURIComponent(_classId)+'\'" class="btn btn-primary btn-sm">Tham gia</button>'
              : '<button class="btn btn-outline btn-sm" disabled>'+(isWaiting?'Đã đầy':'Đã khóa')+'</button>';
          const statusText = room.status==="waiting"?"Đang chờ":room.status==="live"?"Đang đấu":"Đã kết thúc";
          const statusBg = isWaiting ? "#eff6ff" : isLive ? "#ecfdf5" : "#f5f5f4";
          const statusColor = isWaiting ? "#1d4ed8" : isLive ? "#15803d" : "#57534e";
          const visibilityText = room.visibility==="private" ? "Riêng tư" : "Công khai";
          return '<div style="padding:14px 16px;background:var(--white);border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">'+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-weight:600;font-size:.9rem;color:var(--navy);margin-bottom:3px">'+esc(room.title||"Phòng game")+'</div>'+
              '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:5px">'+
                '<span style="font-size:.72rem;font-weight:700;padding:3px 9px;border-radius:999px;background:'+statusBg+';color:'+statusColor+'">'+esc(statusText)+'</span>'+
                '<span style="font-size:.72rem;font-weight:700;padding:3px 9px;border-radius:999px;background:#f8fafc;color:#475569;border:1px solid #e2e8f0">'+esc(visibilityText)+'</span>'+
                (joined ? '<span style="font-size:.72rem;font-weight:700;padding:3px 9px;border-radius:999px;background:#fff7ed;color:#c2410c">Bạn đang ở trong phòng</span>' : '')+
              '</div>'+
              '<div style="font-size:.75rem;color:var(--ink-mid)">Mã: '+esc(room.join_code||"—")+' &nbsp;•&nbsp; 👥 '+rows.length+'/'+(room.max_players||8)+' &nbsp;•&nbsp; ⏱ '+(room.time_per_question||0)+'s/câu &nbsp;•&nbsp; '+(room.question_count||0)+' câu</div>'+
            '</div>'+
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+action+'</div>'+
          '</div>';
        }).join("")
      : '<div style="color:var(--ink-light);font-size:.82rem;padding:12px">Chưa có phòng game nào gắn với lớp này.</div>';
    return '<div style="margin-bottom:16px;background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px">'+
        '<div><div style="font-weight:700;color:var(--navy)">🎮 Game của lớp</div><div style="font-size:.76rem;color:var(--ink-mid)">Thi đấu nhanh giữa các học sinh trong lớp.</div></div>'+
        openCreateBtn+
      '</div>'+
      '<div style="display:flex;flex-direction:column;gap:8px">'+roomsHtml+'</div>'+
    '</div>';
  }

  

  

  window.cvOpenExamResult = async function(examId, examTitle, classId){
    const tc=document.getElementById("cvTabContent"); if(!tc) return;
    tc.innerHTML='<p style="color:var(--ink-light)">Đang tải kết quả...</p>';
    const sb=getSb();
    const students=(_cachedClass.students||[]).filter(s=>!s.left_at);
    const [{data:results},{data:exam},{data:eqTypes}]=await Promise.all([
      sb.from("exam_results").select("id,student_id,attempt_no,submitted_at,score_auto,score_essay,score_total")
        .eq("exam_id",examId).eq("class_id",classId).not("submitted_at","is",null),
      sb.from("exams").select("title,total_points").eq("id",examId).single(),
      sb.from("exam_questions").select("question:question_bank(question_type)").eq("exam_id",examId),
    ]);
    const examHasEssay=(eqTypes||[]).some(eq=>eq.question?.question_type==="essay");
    const bestMap={};
    (results||[]).forEach(r=>{
      const score=r.score_total??r.score_auto??-1;
      const prev=bestMap[r.student_id];
      const prevScore=prev?(prev.score_total??prev.score_auto??-1):-999;
      if(!prev||score>prevScore) bestMap[r.student_id]=r;
    });
    const ranked=students.map(s=>({...s,result:bestMap[s.student_id]||null})).sort((a,b)=>{
      const sa=a.result?(a.result.score_total??a.result.score_auto??-1):-1;
      const sb2=b.result?(b.result.score_total??b.result.score_auto??-1):-1;
      return sb2-sa;
    });

    tc.innerHTML=
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'+
        '<button onclick="cvSwitchTab(\'exams\')" class="btn btn-outline btn-sm" title="Quay lại" aria-label="Quay lại">←</button>'+
        '<div>'+
          '<div style="font-weight:700;font-size:.95rem;color:var(--navy)">'+exam?.title+'</div>'+
          '<div style="font-size:.75rem;color:var(--ink-mid)">'+(results?.length||0)+' bài đã nộp / '+students.length+' học sinh &nbsp;•&nbsp; Tổng điểm: '+exam?.total_points+'</div>'+
        '</div>'+
      '</div>'+
      '<div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">'+
      '<table style="width:100%;border-collapse:collapse;font-size:.83rem">'+
      '<thead><tr style="background:var(--navy)">'+
        '<th style="padding:10px 12px;color:var(--gold-light);font-weight:600;text-align:center;width:44px">Hạng</th>'+
        '<th style="padding:10px 12px;color:var(--gold-light);font-weight:600;text-align:left">Học sinh</th>'+
        '<th style="padding:10px 12px;color:var(--gold-light);font-weight:600;text-align:center">Tự động</th>'+
        '<th style="padding:10px 12px;color:var(--gold-light);font-weight:600;text-align:center">Tự luận</th>'+
        '<th style="padding:10px 12px;color:var(--gold-light);font-weight:600;text-align:center">Tổng</th>'+
        '<th style="padding:10px 12px;color:var(--gold-light);font-weight:600;text-align:center">Chi tiết</th>'+
      '</tr></thead><tbody>'+
      ranked.map((s,i)=>{
        const r=s.result;
        const rank=r?i+1:"—";
        const icon=rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":rank;
        const scoreTotal=r?(r.score_total??r.score_auto??null):null;
        const pct=scoreTotal!==null&&exam?.total_points?Math.round(scoreTotal/exam.total_points*100):null;
        const color=pct===null?"var(--ink-light)":pct>=80?"var(--green)":pct>=50?"var(--amber)":"var(--red)";
        const pendingEssay=examHasEssay&&r&&r.score_essay===null&&r.score_total===null;
        return '<tr style="border-bottom:1px solid var(--surface)" onmouseover="this.style.background=\'var(--gold-pale)\'" onmouseout="this.style.background=\'\'">'+
          '<td style="text-align:center;padding:10px 8px;font-size:1rem">'+icon+'</td>'+
          '<td style="padding:10px 14px;font-weight:600;color:var(--navy)">'+s.user.full_name+'</td>'+
          '<td style="text-align:center;padding:10px 8px">'+(r?(r.score_auto??'—'):'<span style="color:var(--ink-light)">Chưa làm</span>')+'</td>'+
          '<td style="text-align:center;padding:10px 8px">'+(r?(pendingEssay?'<span style="color:var(--amber);font-size:.75rem;font-weight:600">⏳ Chờ chấm</span>':(r.score_essay??'—')):'—')+'</td>'+
          '<td style="text-align:center;padding:10px 8px;font-weight:700;color:'+color+'">'+(scoreTotal!==null?scoreTotal+'<span style="font-size:.72rem;color:var(--ink-mid);font-weight:400">/'+exam?.total_points+'</span>':'—')+'</td>'+
          '<td style="text-align:center;padding:10px 8px">'+(r?'<button onclick="cvOpenStudentExamDetail(\''+r.id+'\',\''+s.user.full_name.replace(/'/g,"\\'")+'\',\''+examId+'\')" class="btn btn-outline btn-sm" style="font-size:.75rem;padding:4px 10px">Xem bài</button>':'—')+'</td>'+
          '</tr>';
      }).join("")+
      '</tbody></table></div>';
  };

  /* â”€â”€ Xem bÃ i + cháº¥m tá»± luáº­n (admin/teacher) â€” layout 15 pháº§n ngang â”€â”€ */
  window.cvOpenStudentExamDetail = async function(resultId, studentName, examId){
    const tc=document.getElementById("cvTabContent"); if(!tc) return;
    tc.innerHTML='<p style="color:var(--ink-light)">Đang tải bài làm...</p>';
    const sb=getSb();

    const [{data:result},{data:answers},{data:eqs},{data:exam}]=await Promise.all([
      sb.from("exam_results").select("*").eq("id",resultId).single(),
      sb.from("exam_answers").select("question_id,answer,is_correct,score_earned").eq("result_id",resultId),
      sb.from("exam_questions").select("*,question:question_bank(*)").eq("exam_id",examId).order("order_no"),
      sb.from("exams").select("title,total_points").eq("id",examId).single(),
    ]);

    const ansMap={};
    (answers||[]).forEach(a=>{ ansMap[a.question_id]=a; });

    const essayQs=(eqs||[]).filter(eq=>eq.question?.question_type==="essay");
    const hasEssay=essayQs.length>0;
    const scoreAuto=result?.score_auto??0;
    const scoreEssay=result?.score_essay??0;
    const scoreTotal=result?.score_total;

    /* Sort cÃ¢u Ä‘Ãºng thá»© tá»± */
    const sortedEqs=(eqs||[]).slice().sort((a,b)=>(a.order_no??0)-(b.order_no??0)).filter(eq=>eq.question);

    /* Header */
    tc.innerHTML=
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">'+
        '<button class="btn btn-outline btn-sm icon-btn" id="cvDetailBackBtn" title="Quay l&#7841;i" aria-label="Quay l&#7841;i">&larr;</button>'+
        '<div style="flex:1">'+
          '<div style="font-weight:700;font-size:.95rem;color:var(--navy)">'+studentName+'</div>'+
          '<div style="font-size:.75rem;color:var(--ink-mid)">'+exam?.title+' &nbsp;•&nbsp; Nộp: '+(result?.submitted_at?fmtDT(result.submitted_at):"—")+'</div>'+
        '</div>'+
        (hasEssay
          ?'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
            '<div style="text-align:right;font-size:.8rem;color:var(--ink-mid)">'+
              'Tự động: <b>'+scoreAuto+'</b><br>'+
              'Tự luận: <b id="cv_essayTotal">'+(scoreEssay||0)+'</b><br>'+
              '<b style="color:var(--navy)">Tổng: <span id="cv_grandTotal">'+(scoreTotal??"Chưa chấm")+'</span>/'+exam?.total_points+'</b>'+
            '</div>'+
            '<button class="btn btn-primary btn-sm" id="cvEssaySaveBtn">💾 Lưu điểm</button>'+
          '</div>'
          :'<div style="font-size:.9rem;font-weight:700;color:var(--navy)">Tổng: '+(scoreTotal??scoreAuto)+'/'+exam?.total_points+'</div>')+
      '</div>';

    /* Back button */
    document.getElementById('cvDetailBackBtn')?.addEventListener('click', ()=>{
      cvOpenExamResult(examId, '', _classId);
    });

    /* Save essay button */
    document.getElementById('cvEssaySaveBtn')?.addEventListener('click', ()=>{
      cvSaveEssayScores(resultId, scoreAuto, examId, studentName, exam?.total_points);
    });

    /* Cards dÃ¹ng helper chung â€” canGradeEssay = true cho admin/teacher */
    if (window.buildReviewCards) {
      tc.appendChild(window.buildReviewCards(sortedEqs, ansMap, hasEssay, {
        examResultId: resultId,
        reportSourceMode: "class_teacher_review",
      }));
    }

    window._cvEssayQIds      = essayQs.map(eq=>({qid:eq.question.id,pts:eq.points}));
    window._cvEssayScoreAuto = scoreAuto;
  };

  window.cvUpdateEssayTotal = function(){
    let sum=0;
    (window._cvEssayQIds||[]).forEach(({qid})=>{
      sum+=parseFloat(document.getElementById("cv_essay_"+qid)?.value||0);
    });
    const grand=(window._cvEssayScoreAuto||0)+sum;
    const dd=document.getElementById("cv_essayTotal"), gd=document.getElementById("cv_grandTotal");
    if(dd) dd.textContent=Math.round(sum*100)/100;
    if(gd) gd.textContent=Math.round(grand*100)/100;
  };

  window.cvSaveEssayScores = async function(resultId,scoreAuto,examId,studentName,totalPts){
    const sb=getSb(); let essaySum=0;
    const updates = [];
    for(const{qid,pts}of(window._cvEssayQIds||[])){
      const raw=document.getElementById("cv_essay_"+qid)?.value||0;
      const val=parseFloat(raw);
      if(!Number.isFinite(val) || val < 0){
        alert("Điểm tự luận phải là số không âm.");
        return;
      }
      if(Number.isFinite(pts) && val > pts){
        alert(`Điểm câu tự luận không được vượt quá ${pts}.`);
        return;
      }
      essaySum+=val;
      updates.push({qid,val});
    }
    const grand=Math.round((scoreAuto+essaySum)*100)/100;
    for(const item of updates){
      const { error } = await sb.from("exam_answers").update({score_earned:item.val}).eq("result_id",resultId).eq("question_id",item.qid);
      if(error){
        alert("Không thể lưu điểm tự luận: " + error.message);
        return;
      }
    }
    const { error: resultErr } = await sb.from("exam_results").update({score_essay:Math.round(essaySum*100)/100,score_total:grand}).eq("id",resultId);
    if(resultErr){
      alert("Không thể cập nhật tổng điểm: " + resultErr.message);
      return;
    }
    window.AppAdminTools?.recordAudit?.("essay_score_saved", {
      target_type: "exam_result",
      target_id: resultId,
      student_name: studentName,
      exam_id: examId,
      score_auto: scoreAuto,
      score_essay: Math.round(essaySum*100)/100,
      score_total: grand
    });
    const toast=document.createElement("div");
    toast.textContent="✅ Đã lưu điểm "+studentName+": "+grand+"/"+totalPts;
    toast.style.cssText="position:fixed;bottom:24px;right:24px;background:var(--navy);color:var(--gold-light);"+
      "padding:10px 18px;border-radius:10px;font-size:.85rem;font-weight:600;z-index:9999;box-shadow:var(--shadow-lg)";
    document.body.appendChild(toast); setTimeout(()=>toast.remove(),2500);
  };

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     THÃŠM / Sá»¬A BUá»”I Há»ŒC TRONG Lá»šP
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  window.cvUpdateSessionPracticeOptions = function(selectedType = "", selectedId = ""){
    const select = document.getElementById("cvSessionPracticeId");
    if(!select) return;
    const list = selectedType === "pdf"
      ? (_classSessionExamCatalog.pdf || [])
      : selectedType === "exam"
        ? (_classSessionExamCatalog.exam || [])
        : [];
    select.disabled = !selectedType;
    select.innerHTML = !selectedType
      ? '<option value="">Chưa gắn đề luyện tập</option>'
      : '<option value="">Chọn đề luyện tập</option>' + list.map(item => {
          const suffix = selectedType === "pdf" ? " (PDF)" : "";
          return '<option value="'+item.id+'" '+(selectedId===item.id?'selected':'')+'>'+esc(item.title)+suffix+'</option>';
        }).join("");
  };

  window.cvOpenAddClassSession = async function(sessionId = ""){
    if(_role !== "admin" && _role !== "teacher") return;
    const sb = getSb();
    const { error: probeError } = await sb.from("class_sessions").select("id").eq("class_id", _classId).limit(1);
    if(probeError && isMissingRelationError(probeError)){
      alert("Database của bạn chưa có bảng class_sessions. Hãy chạy SQL mới rồi reload lại trang.");
      return;
    }
    if(probeError){
      alert("Không thể mở form buổi học: " + probeError.message);
      return;
    }

    const [
      { data: sessions, error: sessionsError },
      { data: allExams, error: examsError },
      { data: allPdfExams, error: pdfExamsError }
    ] = await Promise.all([
      sb.from("class_sessions").select("id,lesson_id,session_order,session_date,exam_id,pdf_exam_id,starts_at,ends_at").eq("class_id", _classId).order("session_order", { ascending: true }),
      sb.from("exams").select("id,title,duration_minutes,total_points").order("created_at", { ascending: false }),
      sb.from("pdf_exams").select("id,title,duration_minutes,total_points,status").order("created_at", { ascending: false })
    ]);
    if(sessionsError || examsError || pdfExamsError){
      alert("Không thể tải dữ liệu buổi học: " + (sessionsError?.message || examsError?.message || pdfExamsError?.message));
      return;
    }

    _classSessionExamCatalog = {
      exam: allExams || [],
      pdf: (allPdfExams || []).filter(item => (item.status || "open") === "open")
    };

    const currentSession = (sessions || []).find(item => item.id === sessionId) || null;
    let lesson = null;
    if(currentSession?.lesson_id){
      const { data: lessonData, error: lessonError } = await sb.from("lessons").select("id,name,summary,lecture_video_url,solution_video_url,document_link").eq("id", currentSession.lesson_id).single();
      if(lessonError){
        alert("Không thể tải bài học của buổi này: " + lessonError.message);
        return;
      }
      lesson = lessonData;
    }

    const nextOrder = (sessions || []).length + 1;
    const practiceType = currentSession?.pdf_exam_id ? "pdf" : currentSession?.exam_id ? "exam" : "";
    const practiceId = currentSession?.pdf_exam_id || currentSession?.exam_id || "";
    const modal = document.createElement("div");
    modal.id = "cvClassSessionModal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(10,20,40,.5);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:320";
    modal.innerHTML =
      '<div style="background:var(--white);border-radius:16px;padding:20px;width:min(96vw,760px);max-height:86vh;overflow:auto;box-shadow:var(--shadow-lg);border-top:4px solid var(--gold)">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px">'+
          '<div><h3 style="margin:0;font-family:var(--font-display);font-size:1.05rem;color:var(--navy)">'+(sessionId ? 'Sửa buổi học' : 'Thêm buổi học mới')+'</h3><div style="font-size:.78rem;color:var(--ink-mid);margin-top:4px">Buổi học của lớp sẽ hiển thị giống phần Khóa học.</div></div>'+
          '<button onclick="document.getElementById(\'cvClassSessionModal\').remove()" style="background:var(--surface);border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:14px;color:var(--ink-mid)">✕</button>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">'+
          '<div><label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Số buổi</label><input id="cvSessionOrder" type="number" min="1" value="'+(currentSession?.session_order || nextOrder)+'" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:var(--font-body);box-sizing:border-box"></div>'+
          '<div><label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Ngày học</label><input id="cvSessionDate" type="date" value="'+(currentSession?.session_date || "")+'" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:var(--font-body);box-sizing:border-box"></div>'+
        '</div>'+
        '<div style="margin-top:14px"><label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Tên bài học</label><input id="cvSessionLessonName" type="text" value="'+esc(lesson?.name || "")+'" placeholder="Ví dụ: Bài 5. Sự biến thiên của hàm số" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:var(--font-body);box-sizing:border-box"></div>'+
        '<div style="margin-top:14px"><label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Mô tả</label><textarea id="cvSessionSummary" rows="4" placeholder="Mô tả ngắn cho buổi học này" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:var(--font-body);box-sizing:border-box;resize:vertical">'+esc(lesson?.summary || "")+'</textarea></div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:14px">'+
          '<div><label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Video bài giảng</label><input id="cvSessionLectureVideo" type="url" value="'+esc(lesson?.lecture_video_url || "")+'" placeholder="https://..." style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:var(--font-body);box-sizing:border-box"></div>'+
          '<div><label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Video chữa bài</label><input id="cvSessionSolutionVideo" type="url" value="'+esc(lesson?.solution_video_url || "")+'" placeholder="https://..." style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:var(--font-body);box-sizing:border-box"></div>'+
        '</div>'+
        '<div style="margin-top:14px"><label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Link tài liệu tham khảo (Drive)</label><input id="cvSessionDocumentLink" type="url" value="'+esc(lesson?.document_link || "")+'" placeholder="https://drive.google.com/..." style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:var(--font-body);box-sizing:border-box"></div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:14px">'+
          '<div><label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Loại đề luyện tập</label><select id="cvSessionPracticeType" onchange="cvUpdateSessionPracticeOptions(this.value)" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:var(--font-body);box-sizing:border-box"><option value="">Chưa gắn đề luyện tập</option><option value="exam" '+(practiceType==="exam"?"selected":"")+'>Đề luyện tập online</option><option value="pdf" '+(practiceType==="pdf"?"selected":"")+'>Đề PDF</option></select></div>'+
          '<div><label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Chọn đề luyện tập</label><select id="cvSessionPracticeId" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:var(--font-body);box-sizing:border-box"></select></div>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:14px">'+
          '<div><label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Mở làm bài từ lúc</label><input id="cvSessionStartsAt" type="datetime-local" value="'+(currentSession?.starts_at ? currentSession.starts_at.slice(0,16) : "")+'" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:var(--font-body);box-sizing:border-box"></div>'+
          '<div><label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Khóa làm bài lúc</label><input id="cvSessionEndsAt" type="datetime-local" value="'+(currentSession?.ends_at ? currentSession.ends_at.slice(0,16) : "")+'" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:var(--font-body);box-sizing:border-box"></div>'+
        '</div>'+
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">'+
          '<button onclick="document.getElementById(\'cvClassSessionModal\').remove()" class="btn btn-outline">Hủy</button>'+
          '<button onclick="cvSaveClassSession(\''+sessionId+'\',\''+(currentSession?.lesson_id || "")+'\')" class="btn btn-primary">Lưu buổi học</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(modal);
    window.cvUpdateSessionPracticeOptions(practiceType, practiceId);
  };

  window.cvSaveClassSession = async function(sessionId = "", lessonId = ""){
    const sb = getSb();
    const lessonName = (document.getElementById("cvSessionLessonName")?.value || "").trim();
    const sessionOrder = Number(document.getElementById("cvSessionOrder")?.value || 0);
    const sessionDate = document.getElementById("cvSessionDate")?.value || null;
    const practiceType = document.getElementById("cvSessionPracticeType")?.value || "";
    const practiceId = document.getElementById("cvSessionPracticeId")?.value || "";
    const startsAt = document.getElementById("cvSessionStartsAt")?.value || null;
    const endsAt = document.getElementById("cvSessionEndsAt")?.value || null;

    if(!lessonName){
      alert("Tên bài học không được để trống.");
      return;
    }
    if(!Number.isFinite(sessionOrder) || sessionOrder <= 0){
      alert("Số buổi phải lớn hơn 0.");
      return;
    }
    if(!sessionDate){
      alert("Bạn cần chọn ngày học cho buổi này.");
      return;
    }
    if((startsAt && !endsAt) || (!startsAt && endsAt)){
      alert("Nếu đặt thời gian làm bài thì cần nhập cả bắt đầu và kết thúc.");
      return;
    }
    if(startsAt && endsAt && startsAt >= endsAt){
      alert("Thời gian kết thúc phải sau thời gian bắt đầu.");
      return;
    }
    if(practiceType && !practiceId){
      alert("Bạn đã chọn loại đề luyện tập nhưng chưa chọn đề cụ thể.");
      return;
    }

    const lessonPayload = {
      name: lessonName,
      summary: (document.getElementById("cvSessionSummary")?.value || "").trim(),
      lecture_video_url: (document.getElementById("cvSessionLectureVideo")?.value || "").trim() || null,
      solution_video_url: (document.getElementById("cvSessionSolutionVideo")?.value || "").trim() || null,
      document_link: (document.getElementById("cvSessionDocumentLink")?.value || "").trim() || null,
      created_by: window._currentUserId
    };
    if(lessonPayload.document_link && !/^https?:\/\/(drive|docs)\.google\.com\//i.test(lessonPayload.document_link)){
      alert("Link tài liệu phải là link Google Drive hoặc Google Docs.");
      return;
    }
    const sessionPayload = {
      class_id: _classId,
      session_order: sessionOrder,
      session_date: sessionDate,
      exam_id: practiceType === "exam" ? practiceId : null,
      pdf_exam_id: practiceType === "pdf" ? practiceId : null,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      created_by: window._currentUserId
    };

    if(sessionId){
      const { error: lessonError } = await sb.from("lessons").update(lessonPayload).eq("id", lessonId);
      if(lessonError){
        alert("Không thể cập nhật bài học: " + lessonError.message);
        return;
      }
      const { error: sessionError } = await sb.from("class_sessions").update(sessionPayload).eq("id", sessionId);
      if(sessionError){
        alert("Không thể cập nhật buổi học: " + sessionError.message);
        return;
      }
    } else {
      const { data: lessonRow, error: lessonError } = await sb.from("lessons").insert(lessonPayload).select("id").single();
      if(lessonError){
        alert("Không thể tạo bài học: " + lessonError.message);
        return;
      }
      const { error: sessionError } = await sb.from("class_sessions").insert({ ...sessionPayload, lesson_id: lessonRow.id });
      if(sessionError){
        await sb.from("lessons").delete().eq("id", lessonRow.id);
        alert("Không thể tạo buổi học: " + sessionError.message);
        return;
      }
    }

    if(window.NotificationHelper){
      const hasLecture = !!lessonPayload.lecture_video_url;
      const hasSolution = !!lessonPayload.solution_video_url;
      const hasDocument = !!lessonPayload.document_link;
      const hasPractice = !!practiceId;
      const summaryBits = [
        hasLecture ? "video bài giảng" : "",
        hasSolution ? "video chữa bài" : "",
        hasDocument ? "tài liệu tham khảo" : "",
        hasPractice ? "đề luyện tập" : ""
      ].filter(Boolean);
      const actionLabel = sessionId ? "cập nhật" : "thêm";
      const type = sessionId ? "class_session_updated" : "class_session_added";
      const extraText = summaryBits.length ? " Kèm " + summaryBits.join(", ") + "." : "";

      try {
        await window.NotificationHelper.notifyClassStudents(_classId, () => ({
          type,
          title: `${_className || "Lớp học"} có buổi học ${actionLabel}`,
          message: `Buổi ${sessionOrder}: ${lessonName}.${extraText}`,
          targetUrl: `class.html?openClassId=${encodeURIComponent(_classId)}&tab=exams&className=${encodeURIComponent(_className || "Lớp học")}`,
          meta: {
            class_id: _classId,
            class_name: _className || "",
            session_order: sessionOrder,
            session_date: sessionDate,
            lesson_name: lessonName
          }
        }));
      } catch (notifyError) {
        console.warn("Không gửi được thông báo buổi học lớp:", notifyError);
      }
    }

    document.getElementById("cvClassSessionModal")?.remove();
    await cvSwitchTab("exams");
  };

  window.cvDeleteClassSession = async function(sessionId){
    if(!confirm("Xóa buổi học này khỏi lớp?")) return;
    const sb = getSb();
    const { data: current, error: loadError } = await sb.from("class_sessions").select("id,lesson_id").eq("id", sessionId).single();
    if(loadError){
      alert("Không thể đọc dữ liệu buổi học: " + loadError.message);
      return;
    }
    const { error: deleteError } = await sb.from("class_sessions").delete().eq("id", sessionId);
    if(deleteError){
      alert("Không thể xóa buổi học: " + deleteError.message);
      return;
    }
    if(current?.lesson_id){
      await sb.from("lessons").delete().eq("id", current.lesson_id);
    }
    await cvSwitchTab("exams");
  };



  /* â”€â”€ Há»c sinh xem láº¡i bÃ i thi tá»« tab Äá» thi â€” layout 15 pháº§n ngang â”€â”€ */
  window.cvOpenStudentReview = async function(resultId, examId, examTitle) {
    const sb = getSb();
    const tc = document.getElementById("cvTabContent");
    if (!tc) return;
    tc.innerHTML = '<p style="color:var(--ink-light)">Đang tải bài làm...</p>';

    const [{ data: answers }, { data: eqs }, { data: result }, { data: exam }] = await Promise.all([
      sb.from("exam_answers").select("question_id,answer,is_correct,score_earned").eq("result_id", resultId),
      sb.from("exam_questions").select("*, question:question_bank(*)").eq("exam_id", examId).order("order_no"),
      sb.from("exam_results").select("score_auto,score_total,score_essay,submitted_at").eq("id", resultId).single(),
      sb.from("exams").select("title,total_points").eq("id", examId).single(),
    ]);

    const ansMap = {};
    (answers||[]).forEach(a => { ansMap[a.question_id] = a; });
    const score = result?.score_total ?? result?.score_auto ?? "?";
    const sortedEqs = (eqs||[]).slice().sort((a,b)=>(a.order_no??0)-(b.order_no??0)).filter(eq=>eq.question);

    if (window.ExamUIHelper?.renderStandardReview?.({
      mount: tc,
      title: exam?.title || examTitle || "Xem lại bài thi",
      subtitle: result?.submitted_at ? `Nộp lúc ${fmtDT(result.submitted_at)}` : "Kết quả bài làm",
      score,
      totalPoints: exam?.total_points || 0,
      backHandler: "cvSwitchTab.bind(null,'exams')",
      questions: sortedEqs,
      answers: ansMap,
      cardsOptions: {
        enableAiSolution: true,
        enableQuestionReport: true,
        examResultId: resultId,
        reportSourceMode: "class_review",
      },
    })) return;

    tc.innerHTML = '<p style="color:var(--red)">Không tải được giao diện xem lại bài.</p>';
  };

})();



