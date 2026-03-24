(function(){

const form = document.getElementById("classForm");
if(!form) return;

const gradeSelect   = document.getElementById("grade_id");
const subjectSelect = document.getElementById("subject_id");
const tuitionType   = document.getElementById("tuition_type");
const tuitionFee    = document.getElementById("tuition_fee");
const makeupFee     = document.getElementById("makeup_fee");
const schedulesEl   = document.getElementById("schedules");
const addScheduleBtn= document.getElementById("addSchedule");

let editingClassId = null;
let selectedTeacherIds = new Set(); // giáo viên được chọn

function getSb(){
  if(window.sb) return window.sb;
  if(typeof sb!=="undefined") return sb;
  throw new Error("Supabase chưa sẵn");
}

const WEEKDAYS = [
  {v:1,label:"Thứ 2"},{v:2,label:"Thứ 3"},{v:3,label:"Thứ 4"},
  {v:4,label:"Thứ 5"},{v:5,label:"Thứ 6"},{v:6,label:"Thứ 7"},{v:7,label:"Chủ nhật"}
];

/* ══════════════════════════════════════════════
   SCHEDULE ROW
══════════════════════════════════════════════ */
function createScheduleRow(initial={}){
  const row = document.createElement("div");
  row.className = "schedule-row";

  const weekdaySelect = document.createElement("select");
  weekdaySelect.innerHTML = `<option value="">- buổi -</option>` +
    WEEKDAYS.map(w => `<option value="${w.v}">${w.label}</option>`).join("");
  if(initial.weekday !== undefined) weekdaySelect.value = initial.weekday;

  const startInput = document.createElement("input");
  startInput.type = "time"; startInput.value = initial.start_time || "";

  const endInput = document.createElement("input");
  endInput.type = "time"; endInput.value = initial.end_time || "";

  const roomSelect = document.createElement("select");
  roomSelect.innerHTML = `<option value="">Chọn phòng</option>`;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button"; removeBtn.className = "remove-btn";
  removeBtn.innerHTML = "✕"; removeBtn.onclick = () => row.remove();

  row.appendChild(weekdaySelect);
  row.appendChild(startInput);
  row.appendChild(endInput);
  row.appendChild(roomSelect);
  row.appendChild(removeBtn);

  async function refreshRooms(){
    const weekday = weekdaySelect.value;
    const start   = startInput.value;
    const end     = endInput.value;
    if(!weekday || !start || !end){
      roomSelect.innerHTML = `<option value="">Chọn phòng</option>`;
      return;
    }
    const sb = getSb();
    try{
      const {data: rooms}     = await sb.from("rooms").select("id,room_name,capacity").order("room_name");
      const {data: schedules} = await sb.from("class_schedules").select("room_id,start_time,end_time,class_id").eq("weekday",parseInt(weekday));
      const filteredSchedules = (schedules||[]).filter(s => initial.class_id ? s.class_id !== initial.class_id : true);
      const occupied = new Set();
      filteredSchedules.forEach(s => {
        if(s.start_time.slice(0,5) < end && s.end_time.slice(0,5) > start) occupied.add(s.room_id);
      });
      const freeRooms = (rooms||[]).filter(r => !occupied.has(r.id) || r.id === initial.room_id);
      roomSelect.innerHTML = "";
      roomSelect.appendChild(new Option("Chọn phòng",""));
      freeRooms.forEach(r => roomSelect.appendChild(new Option(r.room_name + (r.capacity ? ` (${r.capacity})` : ""), r.id)));
      if(initial.room_id) roomSelect.value = initial.room_id;
      if(!freeRooms.length) roomSelect.innerHTML = `<option>Không có phòng trống</option>`;
    }catch(err){ console.error(err); }
  }

  weekdaySelect.onchange = refreshRooms;
  startInput.onchange    = refreshRooms;
  endInput.onchange      = refreshRooms;
  setTimeout(refreshRooms, 0);
  return row;
}

addScheduleBtn.onclick = () => schedulesEl.appendChild(createScheduleRow());

/* ══════════════════════════════════════════════
   TEACHER PICKER
══════════════════════════════════════════════ */
let _allTeachers = [];

async function loadTeacherPicker(){
  const sb = getSb();
  const { data } = await sb.from("users").select("id,full_name").eq("role","teacher").order("full_name");
  _allTeachers = data || [];
  renderTeacherPicker();
}

function renderTeacherPicker(){
  const wrap = document.getElementById("teacherPickerWrap");
  if(!wrap) return;

  wrap.innerHTML = _allTeachers.map(t => {
    const checked = selectedTeacherIds.has(t.id) ? "checked" : "";
    return `
      <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;
        border-radius:8px;border:1.5px solid ${selectedTeacherIds.has(t.id) ? "var(--gold)" : "var(--border)"};
        background:${selectedTeacherIds.has(t.id) ? "var(--gold-pale)" : "var(--white)"};
        cursor:pointer;transition:.15s;margin-bottom:4px;font-size:.85rem"
        id="tlabel_${t.id}">
        <input type="checkbox" value="${t.id}" ${checked}
          style="width:16px;height:16px;accent-color:var(--navy)"
          onchange="window._onTeacherToggle('${t.id}',this)">
        <span style="font-weight:500;color:var(--navy)">${t.full_name}</span>
      </label>`;
  }).join("");
}

window._onTeacherToggle = function(teacherId, cb){
  if(cb.checked) selectedTeacherIds.add(teacherId);
  else           selectedTeacherIds.delete(teacherId);
  // Cập nhật style label
  const lbl = document.getElementById("tlabel_" + teacherId);
  if(lbl){
    lbl.style.borderColor  = cb.checked ? "var(--gold)" : "var(--border)";
    lbl.style.background   = cb.checked ? "var(--gold-pale)" : "var(--white)";
  }
};

/* ══════════════════════════════════════════════
   GRADES & SUBJECTS
══════════════════════════════════════════════ */
async function loadGrades(){
  const sb = getSb();
  const {data} = await sb.from("grades").select("id,name").order("name");
  gradeSelect.innerHTML = '<option value="">-- Chọn khối --</option>';
  data.forEach(g => gradeSelect.appendChild(new Option(g.name, g.id)));
}

async function loadSubjects(gradeId){
  const sb = getSb();
  const {data} = await sb.from("subjects").select("id,name").eq("grade_id",gradeId).order("name");
  subjectSelect.innerHTML = '<option value="">-- Chọn môn --</option>';
  data.forEach(s => subjectSelect.appendChild(new Option(s.name, s.id)));
}

gradeSelect.onchange = () => loadSubjects(gradeSelect.value);

/* ══════════════════════════════════════════════
   SUBMIT
══════════════════════════════════════════════ */
form.onsubmit = async (e) => {
  e.preventDefault();
  const sb = getSb();

  const class_name   = form.class_name.value.trim();
  const grade_id     = gradeSelect.value;
  const subject_id   = subjectSelect.value;
  const tuition_type = tuitionType.value;
  const tuition_fee  = parseInt(tuitionFee.value || 0);
  const makeup_fee   = makeupFee?.value ? parseInt(makeupFee.value) : null;

  let classId;

  if(editingClassId){
    await sb.from("classes").update({ class_name, grade_id, subject_id, tuition_type, tuition_fee, makeup_fee }).eq("id", editingClassId);
    classId = editingClassId;
  } else {
    const {data, error} = await sb.from("classes").insert([{ class_name, grade_id, subject_id, tuition_type, tuition_fee, makeup_fee }]).select("id").single();
    if(error) throw error;
    classId = data.id;
  }

  /* Lưu schedules */
  const rows   = [...schedulesEl.querySelectorAll(".schedule-row")];
  const inserts = [];
  rows.forEach(r => {
    const weekday = r.children[0].value;
    const start   = r.children[1].value;
    const end     = r.children[2].value;
    const room    = r.children[3].value || null;
    if(!weekday || !start || !end) return;
    inserts.push({ class_id: classId, weekday: parseInt(weekday), start_time: start, end_time: end, room_id: room, effective_from: "2000-01-01" });
  });
  if(editingClassId){
    const { error: delErr } = await sb.from("class_schedules").delete().eq("class_id", classId);
    if(delErr){ alert("Lỗi xóa lịch cũ: "+delErr.message); return; }
  }
  if(inserts.length){
    const { error: insErr } = await sb.from("class_schedules").insert(inserts);
    if(insErr){ alert("Lỗi lưu lịch: "+insErr.message); return; }
  }

  /* Lưu giáo viên — xóa cũ rồi insert lại */
  await sb.from("class_teachers").delete().eq("class_id", classId);
  if(selectedTeacherIds.size > 0){
    const teacherRows = [...selectedTeacherIds].map(tid => ({
      class_id:   classId,
      teacher_id: tid,
      role:       "main",
    }));
    const {error} = await sb.from("class_teachers").insert(teacherRows);
    if(error) console.error("Lỗi lưu giáo viên:", error.message);
  }

  alert("Đã lưu lớp ✓");
  document.getElementById("createClassPopup").classList.add("hidden");
  if(window.loadMyClasses) window.loadMyClasses();
};

/* ══════════════════════════════════════════════
   RESET / FILL EDIT
══════════════════════════════════════════════ */
window.resetClassForm = function(){
  editingClassId = null;
  selectedTeacherIds = new Set();
  form.reset();
  schedulesEl.innerHTML = "";
  schedulesEl.appendChild(createScheduleRow());
  renderTeacherPicker();
};

window.fillEditClass = async function(classId){
  editingClassId = classId;
  const sb = getSb();

  const [{data: cls}, {data: schedules}, {data: existingTeachers}] = await Promise.all([
    sb.from("classes").select("*").eq("id", classId).single(),
    sb.from("class_schedules").select("*").eq("class_id", classId).order("weekday"),
    sb.from("class_teachers").select("teacher_id").eq("class_id", classId),
  ]);

  /* Load form fields */
  form.class_name.value  = cls.class_name;
  gradeSelect.value      = cls.grade_id;
  await loadSubjects(cls.grade_id);
  subjectSelect.value    = cls.subject_id;
  tuitionType.value      = cls.tuition_type;
  tuitionFee.value       = cls.tuition_fee;
  if(makeupFee) makeupFee.value = cls.makeup_fee || "";

  /* Load schedules */
  schedulesEl.innerHTML = "";
  if(schedules?.length){
    schedules.forEach(s => schedulesEl.appendChild(createScheduleRow({
      weekday:    s.weekday,
      start_time: s.start_time.slice(0,5),
      end_time:   s.end_time.slice(0,5),
      room_id:    s.room_id,
      class_id:   classId,
    })));
  } else {
    schedulesEl.appendChild(createScheduleRow());
  }

  /* Load giáo viên đã assign */
  selectedTeacherIds = new Set((existingTeachers||[]).map(t => t.teacher_id));
  renderTeacherPicker();

  document.getElementById("createClassPopup").classList.remove("hidden");
};

/* ── Init ── */
loadGrades();
loadTeacherPicker();

})();
