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
  function esc(value){
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function generateDates(schedules, month, year){
    const dates=[], days=new Date(year,month+1,0).getDate();
    for(let d=1;d<=days;d++){
      const date=new Date(year,month,d);
      const wd=date.getDay()===0?7:date.getDay();
      schedules.forEach(s=>{
        if(s.weekday===wd){
          dates.push(date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(d).padStart(2,"0"));
        }
      });
    }
    return dates.sort();
  }
  function getSchedulesForMonth(all, month, year){
    const mStart=monthStart(month,year);
    const eligible=all.filter(s=>(s.effective_from||"2000-01-01")<=mStart);
    if(!eligible.length) return [];
    const maxEf=eligible.reduce((m,s)=>{ const e=s.effective_from||"2000-01-01"; return e>m?e:m; },"2000-01-01");
    return eligible.filter(s=>(s.effective_from||"2000-01-01")===maxEf);
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

  function isCurrentMonthDate(value){
    if(!value) return false;
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return false;
    return d.getMonth() === _currentMonth && d.getFullYear() === _currentYear;
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
    present:{ text:"Có",     cls:"present" },
    absent: { text:"Vắng",   cls:"absent"  },
    makeup: { text:"Học bù", cls:"makeup"  },
  };

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
    const phoneNorm = normalizeSearchText(student.phone);
    const initials  = getNameInitials(student.full_name);

    return [
      nameNorm,
      nameNorm.replace(/\s+/g, ""),
      emailNorm,
      phoneNorm,
      initials,
    ].some(value => value && value.includes(compactKeyword));
  }

  async function getStudentSearchPool(){
    if(_studentSearchPool) return _studentSearchPool;
    const sb = getSb();
    const { data, error } = await sb
      .from("users")
      .select("id,full_name,email,phone")
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

    window._classId   = classId;
    window._className = className;

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
    if(role === "admin" || role === "teacher"){
      actionBtns =
        '<button onclick="cvEditClass()" style="'+
        'background:var(--gold);color:var(--navy);border:none;padding:6px 14px;'+
        'border-radius:7px;font-size:.82rem;font-weight:700;cursor:pointer;font-family:var(--font-body)">'+
        '✏ Sửa</button>'+
        (role === "admin" || role === "teacher"
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
        'font-size:.82rem;font-weight:600;cursor:pointer;font-family:var(--font-body)">← Quay lại</button>'+
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
    } else {
      if(!confirm("Ẩn lớp \""+_className+"\"?")) return;
      const { error } = await sb.from("classes").update({hidden:true}).eq("id",_classId);
      if(error){ alert("Lỗi ẩn lớp: "+error.message); return; }
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
      "id,class_name,tuition_fee,tuition_type,makeup_fee",
      "grades(name),subjects(name)",
      "class_schedules(id,weekday,start_time,end_time,effective_from,rooms:rooms(room_name,capacity))",
      "students:class_students!fk_class(id,student_id,joined_at,left_at,user:users!fk_student(id,full_name))"
    ].join(",")).eq("id",_classId).single();

    if(error){
      body.innerHTML = "<p style='color:var(--red);padding:20px'>Lỗi: "+error.message+"</p>";
      return;
    }
    _cachedClass = data;
    renderShell();
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
    const shouldWarnCapacity = (role === "admin" || role === "teacher") && roomCapacity > 0 && activeCount >= roomCapacity;
    const scheduleHtml = schThisMonth.length
      ? schThisMonth.map(s=>
          '<span style="font-size:.78rem;background:var(--blue-bg);color:var(--blue);'+
          'padding:3px 10px;border-radius:12px;margin-right:6px;display:inline-block;margin-bottom:4px;'+
          'font-weight:600;border:1px solid rgba(26,86,168,.15)">'+
          daysMap[s.weekday]+" "+s.start_time.slice(0,5)+"–"+s.end_time.slice(0,5)+
          (s.rooms?" • "+s.rooms.room_name:"")+
          "</span>").join("")
      : '<span style="color:var(--ink-light);font-size:.82rem">Chưa có lịch học</span>';
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
          ((_role==="admin"||_role==="teacher")
            ? '<button onclick="cvOpenClassGame()" class="btn btn-outline btn-sm">🎮 Mở game lớp</button>'
            : '')+
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
        '📄 Đề thi</button>'+
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
      return j<=mEnd && l>=mStart;
    });
    const dates = generateDates(schedulesThisMonth, _currentMonth, _currentYear);

    const {data:attData} = await sb.from("attendance").select("student_id,date,status")
      .eq("class_id",_classId).gte("date",mStart).lte("date",mEnd);
    _attendanceMap = {};
    (attData||[]).forEach(a=>{ _attendanceMap[a.student_id+"_"+a.date]=a.status; });

    if(role === "student"){
      const uid = window._currentUserId;
      let dateHeaders="";
      dates.forEach(d=>{
        dateHeaders+='<th class="center" style="min-width:58px;white-space:nowrap">'+
          d.slice(8,10)+"/"+d.slice(5,7)+"</th>";
      });
      const me = visibleStudents.find(s => s.student_id === uid);
      if(!me){
        tc.innerHTML = '<p style="color:var(--ink-light);font-size:.85rem">Không tìm thấy dữ liệu điểm danh của bạn trong tháng này.</p>';
        return;
      }
      const joined=me.joined_at?me.joined_at.slice(0,10):"0000-00-00";
      const left  =me.left_at  ?me.left_at.slice(0,10)  :"9999-99-99";
      let myCells="";
      dates.forEach(d=>{
        if(d>left){
          const status=_attendanceMap[me.student_id+"_"+d]||"absent";
          const sm=statusMap[status]||statusMap.absent;
          myCells+='<td class="center" style="padding:4px"><span class="att-btn '+sm.cls+'" style="cursor:default;font-weight:700">'+ sm.text+'</span></td>';
        } else {
          const defaultStatus = d < joined ? "absent" : "present";
          const status=_attendanceMap[me.student_id+"_"+d]||defaultStatus;
          const sm=statusMap[status]||statusMap.present;
          myCells+='<td class="center" style="padding:4px"><span class="att-btn '+sm.cls+'" style="cursor:default;font-weight:700">'+ sm.text+'</span></td>';
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
      dates.forEach(d=>{
        if(d>left){
          const status=_attendanceMap[s.student_id+"_"+d]||"absent";
          const key="cvatt_"+s.student_id+"_"+d;
          const sm=statusMap[status]||statusMap.absent;
          cells+='<td class="center" style="padding:4px">'+
            '<button id="'+key+'" class="att-btn '+sm.cls+'" '+
            'onclick="cvToggleAtt(\''+_classId+'\',\''+s.student_id+'\',\''+d+'\',\''+status+'\')">'+
            sm.text+'</button></td>';
        } else {
          const defaultStatus = d < joined ? "absent" : "present";
          const status=_attendanceMap[s.student_id+"_"+d]||defaultStatus;
          const key="cvatt_"+s.student_id+"_"+d;
          const sm=statusMap[status]||statusMap.present;
          cells+='<td class="center" style="padding:4px">'+
            '<button id="'+key+'" class="att-btn '+sm.cls+'" '+
            'onclick="cvToggleAtt(\''+_classId+'\',\''+s.student_id+'\',\''+d+'\',\''+status+'\')">'+
            sm.text+'</button></td>';
        }
      });
      const stopBtn = isActive
        ? '<button onclick="cvStopStudent(\''+_classId+'\',\''+s.student_id+'\')" '+
          'class="btn btn-outline btn-sm" style="font-size:.72rem;padding:3px 9px">Ngừng</button>'
        : '<span style="font-size:.72rem;color:var(--ink-light)">—</span>';
      rowsHtml+="<tr>"+
        '<td style="text-align:left;font-weight:600;position:sticky;left:0;background:#fff;z-index:1;'+
        'border-right:1px solid var(--border);padding:6px 10px">'+
        s.user.full_name+
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
    dates.forEach(d=>{
      dateHeaders+='<th class="center" style="min-width:62px;white-space:nowrap">'+
        d.slice(8,10)+"/"+d.slice(5,7)+"</th>";
    });

    const searchModal=
      '<div id="cvAddStudentModal" style="display:none;margin-top:14px;padding:14px;'+
      'background:var(--surface);border-radius:10px;border:1px solid var(--border)">'+
      '<b style="font-size:.85rem;color:var(--navy);font-family:var(--font-display)">Tìm học sinh</b>'+
      '<div style="display:flex;gap:8px;margin-top:8px">'+
      '<input id="cvStudentSearch" type="text" placeholder="Nhập tên hoặc email..." '+
      'oninput="cvSearchStudents()" />'+
      '<button onclick="document.getElementById(\'cvAddStudentModal\').style.display=\'none\'" '+
      'class="btn btn-outline btn-sm">✕</button>'+
      "</div>"+
      '<div id="cvSearchResults" style="margin-top:8px;max-height:220px;overflow-y:auto"></div>'+
      "</div>";

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

  window.cvToggleAtt = async function(classId,studentId,date,current){
    const next=statusCycle[(statusCycle.indexOf(current)+1)%3];
    const sb=getSb();
    const{error}=await sb.from("attendance").upsert(
      [{class_id:classId,student_id:studentId,date,status:next}],
      {onConflict:"class_id,student_id,date"}
    );
    if(error){alert("Lỗi: "+error.message);return;}
    _attendanceMap[studentId+"_"+date]=next;
    const btn=document.getElementById("cvatt_"+studentId+"_"+date);
    if(btn){
      const s=statusMap[next];
      btn.className="att-btn "+s.cls; btn.textContent=s.text;
      btn.setAttribute("onclick","cvToggleAtt('"+classId+"','"+studentId+"','"+date+"','"+next+"')");
    }
  };

  window.cvStopStudent = async function(classId,studentId){
    if(!confirm("Xác nhận ngừng học cho học sinh này?")) return;
    const sb=getSb(), today=todayStr();
    await sb.from("class_students").update({left_at:new Date().toISOString()}).eq("class_id",classId).eq("student_id",studentId);
    const sched=getSchedulesForMonth(_cachedClass.class_schedules||[],_currentMonth,_currentYear);
    const futureDates=generateDates(sched,_currentMonth,_currentYear).filter(d=>d>=today);
    if(futureDates.length>0){
      await sb.from("attendance").upsert(
        futureDates.map(d=>({class_id:classId,student_id:studentId,date:d,status:"absent"})),
        {onConflict:"class_id,student_id,date"}
      );
    }
    const st=_cachedClass.students.find(s=>s.student_id===studentId);
    if(st) st.left_at=new Date().toISOString();
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
      return j<=today&&l>=today;
    });
    if(!active.length) return;
    await sb.from("attendance").upsert(
      active.map(s=>({class_id:classId,student_id:s.student_id,date:today,status:"absent"})),
      {onConflict:"class_id,student_id,date"}
    );
    active.forEach(s=>{
      _attendanceMap[s.student_id+"_"+today]="absent";
      const btn=document.getElementById("cvatt_"+s.student_id+"_"+today);
      if(btn){
        btn.className="att-btn absent"; btn.textContent="Vắng";
        btn.setAttribute("onclick","cvToggleAtt('"+classId+"','"+s.student_id+"','"+today+"','absent')");
      }
    });
  };

  window.cvOpenAddStudent = function(){
    const modal=document.getElementById("cvAddStudentModal");
    if(!modal) return;
    modal.style.display="block";
    const inp=document.getElementById("cvStudentSearch");
    if(inp){inp.value="";inp.focus();}
    const res=document.getElementById("cvSearchResults");
    if(res) res.innerHTML="";
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
        '<div style="font-size:.75rem;color:var(--ink-mid)">'+(u.email||"")+(u.phone?" • "+u.phone:"")+"</div>"+
        "</div>"+
        (alreadyIn
          ?'<span style="font-size:.75rem;color:var(--ink-light)">Đã trong lớp</span>'
          :'<button onclick="cvConfirmAddStudent(\''+u.id+'\',\''+safeName+'\')" class="btn btn-primary btn-sm">Thêm</button>')+
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
          :'<button onclick="cvConfirmAddStudent(\''+u.id+'\',\''+safeName+'\')" class="btn btn-primary btn-sm">Thêm</button>')+
        "</div>";
    });
    resultsDiv.innerHTML=html;
  };

  window.cvConfirmAddStudent = async function(studentId,studentName){
    if(!confirm('Thêm "'+studentName+'" vào lớp?')) return;
    const sb=getSb(), classId=_classId, today=todayStr();
    const{data:newRow,error}=await sb.from("class_students")
      .insert([{class_id:classId,student_id:studentId,joined_at:new Date().toISOString()}])
      .select().single();
    if(error){alert("Lỗi: "+error.message);return;}
    const sched=getSchedulesForMonth(_cachedClass.class_schedules||[],_currentMonth,_currentYear);
    const pastDates=generateDates(sched,_currentMonth,_currentYear).filter(d=>d<today);
    if(pastDates.length>0){
      await sb.from("attendance").upsert(
        pastDates.map(d=>({class_id:classId,student_id:studentId,date:d,status:"absent"})),
        {onConflict:"class_id,student_id,date"}
      );
    }
    const{data:userData}=await sb.from("users").select("id,full_name").eq("id",studentId).single();
    _cachedClass.students.push({id:newRow.id,student_id:studentId,joined_at:newRow.joined_at,left_at:null,user:userData});
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

      return '<div style="margin-top:12px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:#f8fbff">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-weight:700;color:var(--navy)">'+esc(examInfo.title)+'</div>'+
            '<div style="font-size:.75rem;color:var(--ink-mid)">📄 PDF • ⏱ '+(examInfo.duration_minutes||0)+' phút • 🏆 '+(examInfo.total_points||0)+' điểm • '+access.scheduleLabel+'</div>'+
            (access.note && access.canDo ? '<div style="font-size:.72rem;color:#16a34a;margin-top:2px">'+access.note+'</div>' : '')+
          '</div>'+
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+actionsHtml+'</div>'+
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

    return '<div style="margin-top:12px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:#f8fbff">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-weight:700;color:var(--navy)">'+esc(examInfo.title)+'</div>'+
          '<div style="font-size:.75rem;color:var(--ink-mid)">⏱ '+(examInfo.duration_minutes||0)+' phút • 🏆 '+(examInfo.total_points||0)+' điểm • '+access.scheduleLabel+'</div>'+
          (access.note && access.canDo ? '<div style="font-size:.72rem;color:#16a34a;margin-top:2px">'+access.note+'</div>' : '')+
        '</div>'+
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+actionsHtml+'</div>'+
      '</div>'+
    '</div>';
  }

  function renderAdminPracticeBlock(examInfo, submitState){
    if(!examInfo) return "";
    const access = getExamAccessMeta(examInfo.starts_at, examInfo.ends_at);
    if(examInfo.type === "pdf"){
      const count = submitState.pdfSubmitCount[examInfo.id] || 0;
      return '<div style="margin-top:12px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:#f8fbff">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-weight:700;color:var(--navy)">'+esc(examInfo.title)+'</div>'+
            '<div style="font-size:.75rem;color:var(--ink-mid)">📄 PDF • ⏱ '+(examInfo.duration_minutes||0)+' phút • 🏆 '+(examInfo.total_points||0)+' điểm • '+access.scheduleLabel+'</div>'+
          '</div>'+
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
            '<span style="background:var(--navy);color:var(--gold-light);padding:3px 12px;border-radius:20px;font-size:.78rem;font-weight:700">'+count+' bài đã nộp</span>'+
            '<button onclick="location.href=\'pdf_exam.html?exam='+encodeURIComponent(examInfo.id)+'&classId='+encodeURIComponent(_classId)+'\'" class="btn btn-outline btn-sm">Mở đề PDF</button>'+
          '</div>'+
        '</div>'+
      '</div>';
    }

    const count = submitState.submitCount[examInfo.id] || 0;
    return '<div style="margin-top:12px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:#f8fbff">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">'+
        '<div onclick="cvOpenExamResult(\''+examInfo.id+'\',\''+examInfo.title.replace(/'/g,"\\'")+'\',\''+_classId+'\')" style="flex:1;min-width:0;cursor:pointer">'+
          '<div style="font-weight:700;color:var(--navy)">'+esc(examInfo.title)+'</div>'+
          '<div style="font-size:.75rem;color:var(--ink-mid)">⏱ '+(examInfo.duration_minutes||0)+' phút • 🏆 '+(examInfo.total_points||0)+' điểm • '+access.scheduleLabel+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
          '<span style="background:var(--navy);color:var(--gold-light);padding:3px 12px;border-radius:20px;font-size:.78rem;font-weight:700">'+count+' bài đã nộp</span>'+
          '<button onclick="cvOpenExamResult(\''+examInfo.id+'\',\''+examInfo.title.replace(/'/g,"\\'")+'\',\''+_classId+'\')" class="btn btn-outline btn-sm">Xem kết quả</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function renderClassSessionCard(session, lesson, examInfo, role, examState){
    const summary = lesson?.summary ? esc(lesson.summary) : "Chưa có mô tả cho buổi học này.";
    const mediaHtml =
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'+
        (lesson?.lecture_video_url ? '<a class="btn btn-outline btn-sm" href="'+esc(lesson.lecture_video_url)+'" target="_blank" rel="noopener">Video bài giảng</a>' : '')+
        (lesson?.solution_video_url ? '<a class="btn btn-outline btn-sm" href="'+esc(lesson.solution_video_url)+'" target="_blank" rel="noopener">Video chữa bài</a>' : '')+
      '</div>';
    const practiceHtml = role === "student"
      ? renderStudentPracticeBlock(examInfo, examState)
      : renderAdminPracticeBlock(examInfo, examState);
    const actionHtml = (role === "admin" || role === "teacher")
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<button onclick="cvOpenAddClassSession(\''+session.id+'\')" class="btn btn-outline btn-sm">Sửa buổi</button>'+
          '<button onclick="cvDeleteClassSession(\''+session.id+'\')" class="btn btn-sm" style="background:var(--red-bg);color:var(--red);border:1px solid #fca5a5">Xóa buổi</button>'+
        '</div>'
      : "";
    const orderLabel = session.display_order || session.session_order || "—";
    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:16px 18px">'+
      '<div style="display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">'+
        '<div style="display:flex;gap:14px;flex:1;min-width:260px">'+
          '<div style="width:72px;min-width:72px;border-radius:16px;background:linear-gradient(135deg,var(--navy),var(--navy-mid));color:var(--gold-light);padding:10px 8px;text-align:center;box-shadow:0 8px 20px rgba(13,39,80,.12)">'+
            '<div style="font-size:.74rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Buổi</div>'+
            '<div style="font-size:1.3rem;font-weight:800;line-height:1.1;margin-top:4px">'+orderLabel+'</div>'+
          '</div>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">'+
              '<span style="font-size:.74rem;font-weight:700;padding:4px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8">'+esc(fmtSessionDate(session.session_date))+'</span>'+
              (examInfo ? '<span style="font-size:.74rem;font-weight:700;padding:4px 10px;border-radius:999px;background:#fff7ed;color:#c2410c">Có đề luyện tập</span>' : '<span style="font-size:.74rem;font-weight:700;padding:4px 10px;border-radius:999px;background:#f5f5f4;color:#57534e">Chưa gắn đề luyện tập</span>')+
            '</div>'+
            '<div style="font-weight:700;font-size:1rem;color:var(--navy)">'+esc(lesson?.name || "Chưa có tên bài học")+'</div>'+
            '<div style="font-size:.84rem;line-height:1.65;color:var(--ink-mid);margin-top:6px">'+summary+'</div>'+
            mediaHtml+
            practiceHtml+
          '</div>'+
        '</div>'+
        actionHtml+
      '</div>'+
    '</div>';
  }

  function renderLegacyExamCard(examInfo, role, examState){
    const header = '<div style="font-size:.76rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-light);margin-bottom:8px">Đề kiểm tra riêng</div>';
    const body = role === "student"
      ? renderStudentPracticeBlock(examInfo, examState)
      : renderAdminPracticeBlock(examInfo, examState);
    const actionRow = (role === "admin" || role === "teacher")
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'+
          (examInfo.type === "exam"
            ? '<button onclick="cvEditClassExam(\''+examInfo.class_exam_id+'\',\''+examInfo.title.replace(/'/g,"\\'")+'\',\''+examInfo.id+'\')" class="btn btn-outline btn-sm">Đặt giờ</button>'
            : '<button onclick="cvEditClassExam(\''+examInfo.class_exam_id+'\',\''+examInfo.title.replace(/'/g,"\\'")+'\',\'\')" class="btn btn-outline btn-sm">Đặt giờ</button>')+
          '<button onclick="cvRemoveExamFromClass(\''+examInfo.class_exam_id+'\',\''+examInfo.title.replace(/'/g,"\\'")+'\','+((examInfo.type==="pdf"? (examState.pdfSubmitCount[examInfo.id]||0) : (examState.submitCount[examInfo.id]||0)))+')" class="btn btn-sm" style="background:var(--red-bg);color:var(--red);border:1px solid #fca5a5">Gỡ đề</button>'+
        '</div>'
      : "";
    return '<div style="background:var(--white);border:1px dashed #cbd5e1;border-radius:14px;padding:16px 18px">'+header+body+actionRow+'</div>';
  }

  async function syncClassSessionsForCurrentMonth(sb, sessions){
    const role = _role;
    const schedulesThisMonth = getSchedulesForMonth(_cachedClass?.class_schedules || [], _currentMonth, _currentYear);
    const monthDates = generateDates(schedulesThisMonth, _currentMonth, _currentYear);
    if(!monthDates.length) return { sessions, createdLessons: [] };
    if(role !== "admin" && role !== "teacher") return { sessions, createdLessons: [] };

    const existingDates = new Set(
      (sessions || [])
        .map(item => (item.session_date || "").slice(0, 10))
        .filter(Boolean)
    );
    const missingDates = monthDates.filter(date => !existingDates.has(date));
    if(!missingDates.length) return { sessions, createdLessons: [] };

    const baseOrder = (sessions || []).reduce((maxValue, item) => {
      const nextValue = Number(item?.session_order || 0);
      return nextValue > maxValue ? nextValue : maxValue;
    }, 0);

    const lessonPayloads = missingDates.map(date => ({
      name: "Chưa cập nhật nội dung buổi học",
      summary: "Admin có thể bấm Sửa buổi để thêm tiêu đề, mô tả, video và đề luyện tập cho buổi học này.",
      lecture_video_url: null,
      solution_video_url: null,
      created_by: window._currentUserId
    }));
    const { data: newLessons, error: lessonError } = await sb
      .from("lessons")
      .insert(lessonPayloads)
      .select("id,name,summary,lecture_video_url,solution_video_url");
    if(lessonError){
      alert("Không thể tự tạo bài học theo lịch tháng này: " + lessonError.message);
      return { sessions, createdLessons: [] };
    }

    const sessionPayloads = (newLessons || []).map((lesson, index) => ({
      class_id: _classId,
      lesson_id: lesson.id,
      session_order: baseOrder + index + 1,
      session_date: missingDates[index],
      exam_id: null,
      pdf_exam_id: null,
      starts_at: null,
      ends_at: null,
      created_by: window._currentUserId
    }));
    const { data: insertedSessions, error: sessionError } = await sb
      .from("class_sessions")
      .insert(sessionPayloads)
      .select("id,lesson_id,session_order,session_date,exam_id,pdf_exam_id,starts_at,ends_at,created_at");
    if(sessionError){
      const lessonIds = (newLessons || []).map(item => item.id).filter(Boolean);
      if(lessonIds.length){
        await sb.from("lessons").delete().in("id", lessonIds);
      }
      const msg = String(sessionError.message || "").toLowerCase();
      if(msg.includes("duplicate") || msg.includes("unique")){
        const { data: refreshedSessions } = await sb
          .from("class_sessions")
          .select("id,lesson_id,session_order,session_date,exam_id,pdf_exam_id,starts_at,ends_at,created_at")
          .eq("class_id", _classId)
          .order("session_order", { ascending: true });
        return { sessions: refreshedSessions || sessions, createdLessons: [] };
      }
      alert("Không thể tự tạo buổi học theo lịch tháng này: " + sessionError.message);
      return { sessions, createdLessons: [] };
    }

    const mergedSessions = [...(sessions || []), ...(insertedSessions || [])]
      .sort((a, b) => {
        const dateCompare = String(a.session_date || "").localeCompare(String(b.session_date || ""));
        if(dateCompare !== 0) return dateCompare;
        return Number(a.session_order || 0) - Number(b.session_order || 0);
      });
    return {
      sessions: mergedSessions,
      createdLessons: newLessons || []
    };
  }

  async function renderExamsTab(){
    const tc=document.getElementById("cvTabContent"); if(!tc) return;
    tc.innerHTML='<p style="color:var(--ink-light);font-size:.85rem">Đang tải buổi học và đề luyện tập...</p>';
    const sb=getSb(), role=_role;

    const [
      {data:classSessions,error:classSessionsError},
      {data:classExams,error:classExamsError},
      {data:gameRooms,error:gameRoomsError},
      {data:gamePlayers,error:gamePlayersError}
    ] = await Promise.all([
      sb.from("class_sessions")
        .select("id,lesson_id,session_order,session_date,exam_id,pdf_exam_id,starts_at,ends_at,created_at")
        .eq("class_id",_classId)
        .order("session_order",{ascending:true}),
      sb.from("class_exams")
        .select("id,starts_at,ends_at,exam_id,pdf_exam_id")
        .eq("class_id",_classId)
        .order("created_at",{ascending:false}),
      sb.from("game_rooms").select("id,title,join_code,status,question_count,time_per_question,max_players,visibility,class_id,created_at").eq("class_id",_classId).order("created_at",{ascending:false}),
      sb.from("game_room_players").select("id,room_id,user_id,score,ready,joined_at")
    ]);

    const sessionTableMissing = !!classSessionsError && isMissingRelationError(classSessionsError);
    if((classSessionsError && !sessionTableMissing) || classExamsError || gameRoomsError || gamePlayersError){
      const msg = classSessionsError?.message || classExamsError?.message || gameRoomsError?.message || gamePlayersError?.message || "Không thể tải dữ liệu lớp học.";
      tc.innerHTML = '<p style="color:var(--red);font-size:.85rem;padding:12px">Lỗi tải dữ liệu: '+esc(msg)+'</p>';
      return;
    }

    let sessions = sessionTableMissing ? [] : (classSessions || []);
    let autoCreatedLessons = [];
    if(!sessionTableMissing){
      const syncResult = await syncClassSessionsForCurrentMonth(sb, sessions);
      sessions = syncResult.sessions || sessions;
      autoCreatedLessons = syncResult.createdLessons || [];
    }
    const lessonIds = [...new Set(sessions.map(s=>s.lesson_id).filter(Boolean))];
    const regularIds = [...new Set([
      ...sessions.map(s=>s.exam_id).filter(Boolean),
      ...(classExams||[]).map(ce=>ce.exam_id).filter(Boolean)
    ])];
    const pdfIds = [...new Set([
      ...sessions.map(s=>s.pdf_exam_id).filter(Boolean),
      ...(classExams||[]).map(ce=>ce.pdf_exam_id).filter(Boolean)
    ])];

    const queryList = [
      lessonIds.length
        ? sb.from("lessons").select("id,name,summary,lecture_video_url,solution_video_url").in("id", lessonIds)
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

    const lessonRows = [...(results[0].data || []), ...autoCreatedLessons];
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
          pdfSubmitCount: {}
        }
      : {
          resultsMap: {},
          pdfResultsMap: {},
          submitCount: (results[4].data||[]).reduce((acc,row)=>{ acc[row.exam_id]=(acc[row.exam_id]||0)+1; return acc; }, {}),
          pdfSubmitCount: (results[5].data||[]).reduce((acc,row)=>{ acc[row.pdf_exam_id]=(acc[row.pdf_exam_id]||0)+1; return acc; }, {})
        };

    const monthSessions = sessions
      .filter(session => !session.session_date || isCurrentMonthDate(session.session_date))
      .sort((a, b) => {
        const dateCompare = String(a.session_date || "").localeCompare(String(b.session_date || ""));
        if(dateCompare !== 0) return dateCompare;
        return Number(a.session_order || 0) - Number(b.session_order || 0);
      });
    const sessionCards = monthSessions
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
          display_order: index + 1
        }, lesson, examInfo, role, examState);
      });

    const legacyCards = (classExams || []).map(row => {
      if(row.exam_id && regularMap[row.exam_id]){
        return renderLegacyExamCard({
          type: "exam",
          class_exam_id: row.id,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          ...regularMap[row.exam_id]
        }, role, examState);
      }
      if(row.pdf_exam_id && pdfMap[row.pdf_exam_id]){
        return renderLegacyExamCard({
          type: "pdf",
          class_exam_id: row.id,
          title: pdfMap[row.pdf_exam_id].title + " (PDF)",
          duration_minutes: pdfMap[row.pdf_exam_id].duration_minutes,
          total_points: pdfMap[row.pdf_exam_id].total_points,
          question_types: pdfQuestionTypeMap[row.pdf_exam_id] || [],
          id: row.pdf_exam_id,
          starts_at: row.starts_at,
          ends_at: row.ends_at
        }, role, examState);
      }
      return "";
    }).filter(Boolean);

    const gameSectionHtml = buildClassGamesSection(role, gameRooms||[], gamePlayers||[]);
    const actionsHtml = (role==="admin"||role==="teacher")
      ? '<div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">'+
          '<button onclick="cvOpenAddClassSession()" class="btn btn-primary btn-sm">+ Thêm buổi học</button>'+
          '<button onclick="cvOpenAddExam()" class="btn btn-outline btn-sm">+ Thêm đề kiểm tra cũ</button>'+
        '</div>'
      : "";
    const sessionHint = sessionTableMissing
      ? '<div style="margin-bottom:14px;padding:12px 14px;border-radius:12px;background:#fff7ed;border:1px solid rgba(245,158,11,.28);color:#9a3412;font-size:.82rem">Tab này đã sẵn sàng cho kiểu "Buổi 1, Buổi 2..." nhưng database của bạn chưa có bảng <b>class_sessions</b>. Hãy chạy SQL mới rồi reload lại.</div>'
      : "";
    const sessionEmpty = '<div style="padding:18px;border:1px dashed #cbd5e1;border-radius:14px;background:#fff"><strong style="display:block;color:var(--navy);margin-bottom:6px">Chưa có buổi học nào trong tháng này</strong><div style="font-size:.84rem;color:var(--ink-mid)">Bạn có thể thêm các buổi học của tháng để hiển thị như phần Danh sách buổi học trong Khóa học.</div></div>';
    const legacySection = legacyCards.length
      ? '<div style="margin-top:18px"><div style="font-weight:700;color:var(--navy);margin-bottom:10px">Đề kiểm tra riêng đã tạo trước đây</div><div style="display:flex;flex-direction:column;gap:10px">'+legacyCards.join("")+'</div></div>'
      : "";

    tc.innerHTML = gameSectionHtml +
      '<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:16px 18px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">'+
          '<div><div style="font-weight:700;color:var(--navy)">Danh sách buổi học trong tháng</div><div style="font-size:.8rem;color:var(--ink-mid)">Hiển thị theo tháng đang xem, giống cách Khóa học trình bày bài học và đề luyện tập.</div></div>'+
          '<span style="font-size:.78rem;font-weight:700;padding:4px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8">'+sessionCards.length+' buổi</span>'+
        '</div>'+
        actionsHtml+
        sessionHint+
        '<div style="display:flex;flex-direction:column;gap:12px">'+(sessionCards.length ? sessionCards.join("") : sessionEmpty)+'</div>'+
        legacySection+
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

  async function renderExamsForStudent(tc, exams, addExamBtn=""){
    const sb=getSb();
    const uid=window._currentUserId;
    const examIds=exams.filter(e=>e.type==="exam").map(e=>e.id);
    const pdfIds=exams.filter(e=>e.type==="pdf").map(e=>e.id);
    const {data:myResults,error:myResultsError}=examIds.length
      ? await sb.from("exam_results")
          .select("id,exam_id,attempt_no,submitted_at,score_auto,score_essay,score_total,seconds_left")
          .eq("student_id",uid).eq("class_id",_classId).in("exam_id",examIds)
          .order("attempt_no",{ascending:false})
      : {data:[],error:null};
    const {data:myPdfResults,error:myPdfResultsError}=pdfIds.length
      ? await sb.from("pdf_exam_results")
          .select("id,pdf_exam_id,attempt_no,submitted_at,score_auto,score_total,seconds_left")
          .eq("student_id",uid).eq("class_id",_classId).in("pdf_exam_id",pdfIds)
          .order("attempt_no",{ascending:false})
      : {data:[],error:null};

    if(myResultsError || myPdfResultsError){
      const msg = myResultsError?.message || myPdfResultsError?.message || "Không thể tải bài làm.";
      tc.innerHTML = addExamBtn + '<p style="color:var(--red);font-size:.85rem;padding:12px">Lỗi tải bài làm: '+esc(msg)+'</p>';
      return;
    }

    const resultsMap={};
    (myResults||[]).forEach(r=>{
      if(!resultsMap[r.exam_id]) resultsMap[r.exam_id]=[];
      resultsMap[r.exam_id].push(r);
    });
    const pdfResultsMap={};
    (myPdfResults||[]).forEach(r=>{
      if(!pdfResultsMap[r.pdf_exam_id]) pdfResultsMap[r.pdf_exam_id]=[];
      pdfResultsMap[r.pdf_exam_id].push(r);
    });

    const now=new Date();
    const examsHtml=exams.map(ex=>{
      if(ex.type==="pdf"){
        const results = pdfResultsMap[ex.id]||[];
        const submitted = results.filter(r=>r.submitted_at);
        const lastResult = submitted[0]||null;
        const inProgress = (submitted.length===0)
          ? (results.find(r=>!r.submitted_at&&r.seconds_left>0)||null)
          : null;
        const pdfHasEssay=(ex.question_types||[]).includes("essay");
        let canDo=true, scheduleNote="";
        if(ex.starts_at&&ex.ends_at){
          const startDt=new Date(ex.starts_at), endDt=new Date(ex.ends_at);
          if(now<startDt){canDo=false;scheduleNote="Chưa đến giờ thi";}
          else if(now>endDt){canDo=false;scheduleNote="Đã hết giờ thi";}
          else scheduleNote="Đang trong giờ thi";
        }
        const schStr=ex.starts_at&&ex.ends_at
          ?"🕐 "+fmtDT(ex.starts_at)+" → "+fmtDT(ex.ends_at)
          :"🗓 Không giới hạn";
        let scoreBadge="";
        if(lastResult){
          const score=lastResult.score_total??lastResult.score_auto??"?";
          const pendingEssay=pdfHasEssay&&lastResult.score_total===null;
          scoreBadge='<span style="background:#dcfce7;color:#15803d;font-size:.78rem;font-weight:700;'+
            'padding:3px 10px;border-radius:20px;white-space:nowrap">✓ '+score+" / "+ex.total_points+" đ</span>"+
            (pendingEssay?' <span style="background:#fef3c7;color:#b45309;font-size:.72rem;padding:2px 8px;border-radius:20px">⏳ Chờ chấm tự luận</span>':"");
          scoreBadge+=' <button onclick="location.href=\'pdf_exam.html?exam='+encodeURIComponent(ex.id)+'&classId='+encodeURIComponent(_classId)+'&action=review&resultId='+encodeURIComponent(lastResult.id)+'\'" '+
            'class="btn btn-outline btn-sm" style="font-size:.75rem">Xem lại</button>';
        }
        let actionBtn="";
        if(!canDo&&(ex.starts_at||ex.ends_at)){
          actionBtn='<div style="font-size:.75rem;color:var(--ink-mid);padding:6px 10px;'+
            'background:var(--surface);border-radius:8px;white-space:nowrap">'+scheduleNote+"</div>";
        } else if(inProgress){
          const secsLeft=Math.max(0,(inProgress.seconds_left||0)-300);
          const minLeft=Math.floor(secsLeft/60), secLeft2=secsLeft%60;
          const timeStr=minLeft+":"+String(secLeft2).padStart(2,"0");
          actionBtn='<button onclick="location.href=\'pdf_exam.html?exam='+encodeURIComponent(ex.id)+'&classId='+encodeURIComponent(_classId)+'\'" '+
            'style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;'+
            'padding:8px 14px;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;'+
            'white-space:nowrap;font-family:var(--font-body);flex-shrink:0">Làm bài tiếp ('+timeStr+")</button>";
        } else if(lastResult&&!pdfHasEssay){
          actionBtn='<div style="font-size:.78rem;font-weight:600;color:var(--green);padding:6px 12px;'+
            'background:#dcfce7;border-radius:8px;white-space:nowrap">Đã hoàn thành</div>'+
            '<button onclick="location.href=\'pdf_exam.html?exam='+encodeURIComponent(ex.id)+'&classId='+encodeURIComponent(_classId)+'&action=review&resultId='+encodeURIComponent(lastResult.id)+'\'" '+
            'class="btn btn-outline btn-sm" style="font-size:.78rem">Xem lại</button>';
        } else if(submitted.length>0){
          actionBtn="";
        } else {
          actionBtn='<button onclick="location.href=\'pdf_exam.html?exam='+encodeURIComponent(ex.id)+'&classId='+encodeURIComponent(_classId)+'\'" '+
            'style="background:linear-gradient(135deg,var(--navy),var(--navy-mid));color:var(--gold-light);'+
            'border:none;padding:8px 16px;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;'+
            'white-space:nowrap;font-family:var(--font-body);flex-shrink:0">Làm bài</button>';
        }
        return `<div style="border:1px solid var(--border);border-radius:12px;padding:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;color:var(--navy);font-size:.95rem">${esc(ex.title)}</div>
            <div style="font-size:.75rem;color:var(--ink-mid)">📄 PDF • ⏱ ${ex.duration_minutes||0} phút • 🏆 ${ex.total_points||0} điểm • ${schStr}</div>
            ${(scheduleNote&&canDo)?'<div style="font-size:.72rem;color:#16a34a;margin-top:2px">'+scheduleNote+'</div>':""}
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${scoreBadge}${actionBtn}
          </div>
        </div>`;
      }
      const results   =resultsMap[ex.id]||[];
      const submitted =results.filter(r=>r.submitted_at);
      const lastResult=submitted[0]||null;
      const inProgress=(submitted.length===0)
        ?(results.find(r=>!r.submitted_at&&r.seconds_left>0)||null)
        :null;

      let canDo=true, scheduleNote="";
      if(ex.starts_at&&ex.ends_at){
        const startDt=new Date(ex.starts_at), endDt=new Date(ex.ends_at);
        if(now<startDt){canDo=false;scheduleNote="Chưa đến giờ thi";}
        else if(now>endDt){canDo=false;scheduleNote="Đã hết giờ thi";}
        else scheduleNote="Đang trong giờ thi";
      }
      const schStr=ex.starts_at&&ex.ends_at
        ?"🕐 "+fmtDT(ex.starts_at)+" → "+fmtDT(ex.ends_at)
        :"🗓 Không giới hạn";

      const examHasEssay=(ex.exam_questions||[]).some(eq=>eq.question?.question_type==="essay");
      let scoreBadge="";
      if(lastResult){
        const score=lastResult.score_total??lastResult.score_auto??"?";
        const pendingEssay=examHasEssay&&lastResult.score_essay===null&&lastResult.score_total===null;
        scoreBadge='<span style="background:#dcfce7;color:#15803d;font-size:.78rem;font-weight:700;'+
          'padding:3px 10px;border-radius:20px;white-space:nowrap">✓ '+score+" / "+ex.total_points+" đ</span>"+
          (pendingEssay?' <span style="background:#fef3c7;color:#b45309;font-size:.72rem;padding:2px 8px;border-radius:20px">⏳ Chờ chấm tự luận</span>':"");
        scoreBadge+=' <button onclick="cvOpenStudentReview(\''+lastResult.id+'\',\''+ex.id+'\',\''+ex.title.replace(/'/g,"\\'")+'\')\" '+
          'class="btn btn-outline btn-sm" style="font-size:.75rem">Xem lại</button>';
      }

      let actionBtn="";
      if(!canDo&&(ex.starts_at||ex.ends_at)){
        actionBtn='<div style="font-size:.75rem;color:var(--ink-mid);padding:6px 10px;'+
          'background:var(--surface);border-radius:8px;white-space:nowrap">'+scheduleNote+"</div>";
      } else if(inProgress){
        const secsLeft=Math.max(0,(inProgress.seconds_left||0)-300);
        const minLeft=Math.floor(secsLeft/60), secLeft2=secsLeft%60;
        const timeStr=minLeft+":"+String(secLeft2).padStart(2,"0");
        actionBtn='<button onclick="resumeExam(\''+ex.id+'\',\''+ex.title.replace(/'/g,"\\'")+'\','+ex.total_points+',\''+inProgress.id+'\','+secsLeft+')" '+
          'style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;'+
          'padding:8px 14px;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;'+
          'white-space:nowrap;font-family:var(--font-body);flex-shrink:0">Làm bài tiếp ('+timeStr+")</button>";
      } else if(lastResult&&!examHasEssay){
        actionBtn='<div style="font-size:.78rem;font-weight:600;color:var(--green);padding:6px 12px;'+
          'background:#dcfce7;border-radius:8px;white-space:nowrap">Đã hoàn thành</div>'+
          '<button onclick="cvOpenStudentReview(\''+lastResult.id+'\',\''+ex.id+'\',\''+ex.title.replace(/'/g,"\\'")+'\')" '+
          'class="btn btn-outline btn-sm" style="font-size:.78rem">Xem lại</button>';
      } else if(submitted.length>0){
        actionBtn="";
      } else {
        actionBtn='<button onclick="startExam(\''+ex.id+'\',\''+ex.title.replace(/'/g,"\\'")+'\','+ex.duration_minutes+','+ex.total_points+',\''+_classId+'\')" '+
          'style="background:linear-gradient(135deg,var(--navy),var(--navy-mid));color:var(--gold-light);'+
          'border:none;padding:8px 16px;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;'+
          'white-space:nowrap;font-family:var(--font-body);flex-shrink:0">Làm bài</button>';
      }

      return '<div style="padding:14px 16px;background:var(--white);border:1px solid var(--border);'+
        'border-radius:10px;'+(lastResult?"border-left:3px solid var(--green)":"")+'">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-weight:600;font-size:.9rem;color:var(--navy);margin-bottom:3px">'+ex.title+"</div>"+
            '<div style="font-size:.75rem;color:var(--ink-mid)">⏱ '+ex.duration_minutes+" phút &nbsp;•&nbsp; 🏆 "+ex.total_points+"đ &nbsp;•&nbsp; "+schStr+"</div>"+
            (scheduleNote&&canDo?'<div style="font-size:.72rem;color:#16a34a;margin-top:2px">'+scheduleNote+"</div>":"")+
          "</div>"+
          '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap">'+
            scoreBadge+actionBtn+
          "</div>"+
        "</div></div>";
    }).join("");

    tc.innerHTML=addExamBtn+'<div style="display:flex;flex-direction:column;gap:8px">'+examsHtml+"</div>";
  }

  async function renderExamsForAdmin(tc, exams, addExamBtn=""){
    const sb=getSb();
    const examIds=exams.filter(e=>e.type==="exam").map(e=>e.id);
    const{data:submits}=examIds.length
      ? await sb.from("exam_results").select("exam_id").not("submitted_at","is",null).eq("class_id",_classId).in("exam_id",examIds)
      : {data:[]};
    const submitCount={};
    (submits||[]).forEach(r=>{submitCount[r.exam_id]=(submitCount[r.exam_id]||0)+1;});

    tc.innerHTML=addExamBtn+'<div style="display:flex;flex-direction:column;gap:8px">'+
      exams.map(ex=>{
        const schStr=ex.starts_at&&ex.ends_at
          ?"🕐 "+fmtDT(ex.starts_at)+" → "+fmtDT(ex.ends_at)
          :"🗓 Không giới hạn";
        if(ex.type==="pdf"){
          return '<div style="padding:14px 16px;background:var(--white);border:1px solid var(--border);'+
            'border-radius:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">'+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-weight:600;font-size:.9rem;color:var(--navy);margin-bottom:3px">'+ex.title+'</div>'+
              '<div style="font-size:.75rem;color:var(--ink-mid)">📄 PDF &nbsp;•&nbsp; ⏱ '+ex.duration_minutes+' phút &nbsp;•&nbsp; 🏆 '+ex.total_points+' điểm &nbsp;•&nbsp; '+schStr+'</div>'+
            '</div>'+
            '<button onclick="location.href=\'pdf_exam.html?exam='+ex.id+'&classId='+_classId+'\'" class="btn btn-outline btn-sm" style="font-size:.75rem;flex-shrink:0">Mở đề PDF</button>'+
            '<button onclick="cvRemoveExamFromClass(\''+ex.class_exam_id+'\',\''+ex.title.replace(/'/g,"\\'")+'\',0)" class="btn btn-sm" style="background:var(--red-bg);color:var(--red);border:1px solid #fca5a5;font-size:.75rem;flex-shrink:0">Gỡ</button>'+
            '</div>';
        }
        const cnt=submitCount[ex.id]||0;
        return '<div style="padding:14px 16px;background:var(--white);border:1px solid var(--border);'+
          'border-radius:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">'+
          '<div onclick="cvOpenExamResult(\''+ex.id+'\',\''+ex.title.replace(/'/g,"\\'")+'\',\''+_classId+'\')" style="flex:1;cursor:pointer;min-width:0">'+
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'+
              '<div style="flex:1">'+
                '<div style="font-weight:600;font-size:.9rem;color:var(--navy);margin-bottom:3px">'+ex.title+'</div>'+
                '<div style="font-size:.75rem;color:var(--ink-mid)">⏱ '+ex.duration_minutes+' phút &nbsp;•&nbsp; 🏆 '+ex.total_points+' điểm &nbsp;•&nbsp; '+schStr+'</div>'+
              '</div>'+
              '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'+
                '<span style="background:var(--navy);color:var(--gold-light);padding:3px 12px;border-radius:20px;font-size:.78rem;font-weight:700">'+cnt+' bài đã nộp</span>'+
                '<span style="color:var(--ink-light);font-size:1.2rem">›</span>'+
              '</div>'+
            '</div>'+
          '</div>'+
          '<button onclick="cvEditClassExam(\''+ex.class_exam_id+'\',\''+ex.title.replace(/'/g,"\\'")+'\',\''+ex.id+'\')" class="btn btn-outline btn-sm" style="font-size:.75rem;flex-shrink:0">Đặt giờ</button>'+
          '<button onclick="cvRemoveExamFromClass(\''+ex.class_exam_id+'\',\''+ex.title.replace(/'/g,"\\'")+'\','+cnt+')" class="btn btn-sm" style="background:var(--red-bg);color:var(--red);border:1px solid #fca5a5;font-size:.75rem;flex-shrink:0">Gỡ</button>'+
          '</div>';
      }).join("")+
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
        '<button onclick="cvSwitchTab(\'exams\')" class="btn btn-outline btn-sm">← Quay lại</button>'+
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
        '<button class="btn btn-outline btn-sm" id="cvDetailBackBtn">← Quay lại</button>'+
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
      tc.appendChild(window.buildReviewCards(sortedEqs, ansMap, hasEssay));
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
    for(const{qid}of(window._cvEssayQIds||[])){
      const val=parseFloat(document.getElementById("cv_essay_"+qid)?.value||0);
      essaySum+=val;
      await sb.from("exam_answers").update({score_earned:val}).eq("result_id",resultId).eq("question_id",qid);
    }
    const grand=Math.round((scoreAuto+essaySum)*100)/100;
    await sb.from("exam_results").update({score_essay:Math.round(essaySum*100)/100,score_total:grand}).eq("id",resultId);
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
      const { data: lessonData, error: lessonError } = await sb.from("lessons").select("id,name,summary,lecture_video_url,solution_video_url").eq("id", currentSession.lesson_id).single();
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
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:14px">'+
          '<div><label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Loại đề luyện tập</label><select id="cvSessionPracticeType" onchange="cvUpdateSessionPracticeOptions(this.value)" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:var(--font-body);box-sizing:border-box"><option value="">Chưa gắn đề luyện tập</option><option value="exam" '+(practiceType==="exam"?"selected":"")+'>Đề kiểm tra</option><option value="pdf" '+(practiceType==="pdf"?"selected":"")+'>Đề PDF</option></select></div>'+
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
      created_by: window._currentUserId
    };
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

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     THÃŠM / Gá»  / Äáº¶T GIá»œ Äá»€ THI TRONG Lá»šP
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  window.cvOpenAddExam = async function(){
    const tc=document.getElementById("cvTabContent"); if(!tc) return;
    const sb=getSb();
    const [{data:existing},{data:allExams},{data:allPdfExams}] = await Promise.all([
      sb.from("class_exams").select("exam_id,pdf_exam_id").eq("class_id",_classId),
      sb.from("exams").select("id,title,duration_minutes,total_points").order("created_at",{ascending:false}),
      sb.from("pdf_exams").select("id,title,duration_minutes,total_points,status").order("created_at",{ascending:false})
    ]);
    const existingKeys = new Set((existing||[]).map(e=>e.exam_id?`exam:${e.exam_id}`:`pdf:${e.pdf_exam_id}`));
    const allItems = [
      ...(allExams||[]).map(ex=>({kind:"exam",id:ex.id,title:ex.title,duration_minutes:ex.duration_minutes,total_points:ex.total_points,status:"open"})),
      ...(allPdfExams||[]).map(ex=>({kind:"pdf",id:ex.id,title:`${ex.title} (PDF)`,duration_minutes:ex.duration_minutes,total_points:ex.total_points,status:ex.status||"open"}))
    ];

    const modal=document.createElement("div");
    modal.id="cvAddExamModal";
    modal.style.cssText="position:fixed;inset:0;background:rgba(10,20,40,.5);backdrop-filter:blur(3px);"+
      "display:flex;align-items:center;justify-content:center;z-index:300";
    modal.innerHTML=
      '<div style="background:var(--white);border-radius:14px;padding:20px;width:min(95vw,620px);'+
      'max-height:80vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);border-top:4px solid var(--gold)">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
          '<h3 style="font-family:var(--font-display);font-size:1rem;color:var(--navy);margin:0">Thêm đề kiểm tra vào lớp</h3>'+
          '<button onclick="document.getElementById(\'cvAddExamModal\').remove()" style="background:var(--surface);border:none;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:14px;color:var(--ink-mid)">✕</button>'+
        '</div>'+
        '<input id="cvExamSearchInput" type="text" placeholder="Tìm đề theo tên..." oninput="cvFilterExamList()" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:var(--font-body);font-size:.85rem;margin-bottom:12px;width:100%;box-sizing:border-box;outline:none">'+
        '<div id="cvExamList" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:6px">'+
        allItems.map(ex=>{
          const key = `${ex.kind}:${ex.id}`;
          const added=existingKeys.has(key);
          return '<div class="cv-exam-pick-item" data-title="'+ex.title.toLowerCase()+'" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:'+(added?"var(--surface)":"var(--white)")+'">'+
            '<div>'+
              '<div style="font-weight:600;font-size:.85rem;color:var(--navy)">'+ex.title+'</div>'+
              '<div style="font-size:.72rem;color:var(--ink-mid)">'+(ex.kind==="pdf"?"PDF &nbsp;•&nbsp; ":"")+'⏱ '+(ex.duration_minutes||0)+' phút &nbsp;•&nbsp; 🏆 '+(ex.total_points||0)+' điểm'+(ex.kind==="pdf"&&ex.status!=="open"?' &nbsp;•&nbsp; Đóng':'')+'</div>'+
            '</div>'+
            (added
              ?'<span style="font-size:.75rem;color:var(--ink-light)">Đã thêm</span>'
              :'<button onclick="cvConfirmAddExam(\''+ex.kind+'\',\''+ex.id+'\',\''+ex.title.replace(/'/g,"\\'")+'\')" class="btn btn-primary btn-sm" style="flex-shrink:0">+ Thêm</button>')+
            '</div>';
        }).join("")+
        '</div>'+
      '</div>';
    document.body.appendChild(modal);
  };

  window.cvFilterExamList = function(){
    const q=(document.getElementById("cvExamSearchInput")?.value||"").toLowerCase();
    document.querySelectorAll(".cv-exam-pick-item").forEach(el=>{
      el.style.display=el.dataset.title.includes(q)?"":"none";
    });
  };

  window.cvConfirmAddExam = async function(kind, examId, examTitle){
    const sb=getSb();
    const payload = kind === "pdf"
      ? {class_id:_classId,pdf_exam_id:examId}
      : {class_id:_classId,exam_id:examId};
    const {error}=await sb.from("class_exams").insert(payload);
    if(error){alert("Lỗi: "+error.message);return;}
    document.getElementById("cvAddExamModal")?.remove();
    await cvSwitchTab("exams");
  };

  window.cvRemoveExamFromClass = async function(classExamId, examTitle, submittedCount){
    const msg = submittedCount>0
      ? `Gỡ đề "${examTitle}" khỏi lớp?\n⚠ Đã có ${submittedCount} bài nộp — kết quả vẫn được giữ lại.`
      : `Gỡ đề "${examTitle}" khỏi lớp?`;
    if(!confirm(msg)) return;
    const sb=getSb();
    const {error}=await sb.from("class_exams").delete().eq("id",classExamId);
    if(error){alert("Lỗi: "+error.message);return;}
    await cvSwitchTab("exams");
  };

  window.cvEditClassExam = function(classExamId, examTitle, examId){
    const modal=document.createElement("div");
    modal.id="cvEditExamModal";
    modal.style.cssText="position:fixed;inset:0;background:rgba(10,20,40,.5);backdrop-filter:blur(3px);"+
      "display:flex;align-items:center;justify-content:center;z-index:300";
    modal.innerHTML=
      '<div style="background:var(--white);border-radius:14px;padding:20px;width:min(95vw,440px);'+
      'box-shadow:var(--shadow-lg);border-top:4px solid var(--gold)">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
          '<h3 style="font-family:var(--font-display);font-size:1rem;color:var(--navy);margin:0">Đặt giờ thi</h3>'+
          '<button onclick="document.getElementById(\'cvEditExamModal\').remove()" '+
          'style="background:var(--surface);border:none;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:14px">✕</button>'+
        '</div>'+
        '<div style="font-size:.82rem;color:var(--ink-mid);margin-bottom:14px">'+examTitle+'</div>'+
        '<div style="margin-bottom:12px">'+
          '<label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px">Thời gian bắt đầu</label>'+
          '<input type="datetime-local" id="cvExamStartsAt" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:var(--font-body);font-size:.875rem;box-sizing:border-box;outline:none">'+
        '</div>'+
        '<div style="margin-bottom:18px">'+
          '<label style="font-size:.75rem;font-weight:700;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px">Thời gian kết thúc</label>'+
          '<input type="datetime-local" id="cvExamEndsAt" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:var(--font-body);font-size:.875rem;box-sizing:border-box;outline:none">'+
        '</div>'+
        '<div style="display:flex;gap:8px;justify-content:flex-end">'+
          '<button onclick="cvSaveClassExamTime(\''+classExamId+'\')" class="btn btn-primary">💾 Lưu</button>'+
          '<button onclick="cvClearClassExamTime(\''+classExamId+'\')" class="btn btn-outline">✕ Xóa giờ</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(modal);
    getSb().from("class_exams").select("starts_at,ends_at").eq("id",classExamId).single()
      .then(({data})=>{
        if(data?.starts_at) document.getElementById("cvExamStartsAt").value=data.starts_at.slice(0,16);
        if(data?.ends_at)   document.getElementById("cvExamEndsAt").value=data.ends_at.slice(0,16);
      });
  };

  window.cvSaveClassExamTime = async function(classExamId){
    const startsAt=document.getElementById("cvExamStartsAt")?.value||null;
    const endsAt  =document.getElementById("cvExamEndsAt")?.value||null;
    if(startsAt&&endsAt&&startsAt>=endsAt){alert("Thời gian kết thúc phải sau bắt đầu!");return;}
    const sb=getSb();
    const {error}=await sb.from("class_exams").update({
      starts_at: startsAt?new Date(startsAt).toISOString():null,
      ends_at:   endsAt  ?new Date(endsAt).toISOString()  :null,
    }).eq("id",classExamId);
    if(error){alert("Lỗi: "+error.message);return;}
    document.getElementById("cvEditExamModal")?.remove();
    await cvSwitchTab("exams");
  };

  window.cvClearClassExamTime = async function(classExamId){
    const sb=getSb();
    await sb.from("class_exams").update({starts_at:null,ends_at:null}).eq("id",classExamId);
    document.getElementById("cvEditExamModal")?.remove();
    await cvSwitchTab("exams");
  };

  /* â”€â”€ Há»c sinh xem láº¡i bÃ i thi tá»« tab Äá» thi â€” layout 15 pháº§n ngang â”€â”€ */
  window.cvOpenStudentReview = async function(resultId, examId, examTitle) {
    const sb = getSb();
    const tc = document.getElementById("cvTabContent");
    if (!tc) return;
    tc.innerHTML = '<p style="color:var(--ink-light)">Đang tải bài làm...</p>';

    const [{ data: answers }, { data: eqs }, { data: result }] = await Promise.all([
      sb.from("exam_answers").select("question_id,answer,is_correct,score_earned").eq("result_id", resultId),
      sb.from("exam_questions").select("*, question:question_bank(*)").eq("exam_id", examId).order("order_no"),
      sb.from("exam_results").select("score_auto,score_total,score_essay,submitted_at").eq("id", resultId).single(),
    ]);

    const ansMap = {};
    (answers||[]).forEach(a => { ansMap[a.question_id] = a; });
    const score = result?.score_total ?? result?.score_auto ?? "?";

    /* Header */
    const wrap = document.createElement("div");
    const hdr  = document.createElement("div");
    hdr.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap";
    hdr.innerHTML =
      '<button onclick="cvSwitchTab(\'exams\')" class="btn btn-outline btn-sm">← Quay lại</button>' +
      '<div style="flex:1"><div style="font-weight:700;font-size:.95rem;color:var(--navy)">' + examTitle + '</div>' +
      '<div style="font-size:.75rem;color:var(--ink-mid)">Điểm: <b>' + score + '</b>' +
      (result?.submitted_at ? ' &nbsp;•&nbsp; Nộp: ' + fmtDT(result.submitted_at) : '') + '</div></div>';
    wrap.appendChild(hdr);

    /* Cards â€” layout 15 pháº§n ngang giá»‘ng lÃºc thi, dÃ¹ng review_helper.js */
    const sortedEqs = (eqs||[]).slice().sort((a,b)=>(a.order_no??0)-(b.order_no??0)).filter(eq=>eq.question);
    if (window.buildReviewCards) {
      wrap.appendChild(window.buildReviewCards(sortedEqs, ansMap, false, { enableAiSolution: true }));
    }

    tc.innerHTML = "";
    tc.appendChild(wrap);
  };

  /* â”€â”€ Backward compat â”€â”€ */
  window.openStudentClassView = function(classId, className){
    window.openClassView(classId, className);
  };

  window.closeStudentClassView = function(){
    clearInterval(window._examTimerRef);
    const ov = document.getElementById("classViewOverlay");
    if(ov) ov.style.display = "none";
  };

})();



