(function(){

const form = document.getElementById("classForm");
if(!form) return;

const gradeSelect   = document.getElementById("grade_id");
const subjectSelect = document.getElementById("subject_id");
const tuitionType   = document.getElementById("tuition_type");
const tuitionFee    = document.getElementById("tuition_fee");
const makeupFee     = document.getElementById("makeup_fee");
const sessionsPerWeek = document.getElementById("sessions_per_week");
const schedulesEl   = document.getElementById("schedules");
const addScheduleBtn= document.getElementById("addSchedule");
const scheduleEffectiveMonth = document.getElementById("schedule_effective_month");
const scheduleEffectiveMonthWrap = document.getElementById("scheduleEffectiveMonthWrap");

let editingClassId = null;
let selectedTeacherIds = new Set(); // giáo viên được chọn
let editingSchedules = [];

function getSb(){
  if(window.sb) return window.sb;
  if(typeof sb!=="undefined") return sb;
  throw new Error("Supabase chưa sẵn");
}

const WEEKDAYS = [
  {v:1,label:"Thứ 2"},{v:2,label:"Thứ 3"},{v:3,label:"Thứ 4"},
  {v:4,label:"Thứ 5"},{v:5,label:"Thứ 6"},{v:6,label:"Thứ 7"},{v:7,label:"Chủ nhật"}
];

function currentMonthValue(){
  const now = new Date();
  return now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0");
}

function effectiveFromValue(){
  return (scheduleEffectiveMonth?.value || currentMonthValue())+"-01";
}

function getSchedulesForEffectiveMonth(allSchedules, effectiveFrom){
  const eligible = (allSchedules || []).filter(s => (s.effective_from || "2000-01-01") <= effectiveFrom);
  if(!eligible.length) return [];
  const latest = eligible.reduce((max, s) => {
    const value = s.effective_from || "2000-01-01";
    return value > max ? value : max;
  }, "2000-01-01");
  return eligible.filter(s => (s.effective_from || "2000-01-01") === latest);
}

function scheduleSortValue(schedule){
  return [
    Number(schedule?.session_no || 1),
    Number(schedule?.weekday || 0),
    String(schedule?.start_time || "").slice(0,5),
    String(schedule?.end_time || "").slice(0,5),
  ].join("|");
}

function schedulesMatch(a, b){
  return Number(a?.session_no || 1) === Number(b?.session_no || 1) &&
    Number(a?.weekday) === Number(b?.weekday) &&
    String(a?.start_time || "").slice(0,5) === String(b?.start_time || "").slice(0,5) &&
    String(a?.end_time || "").slice(0,5) === String(b?.end_time || "").slice(0,5);
}

function buildScheduleReplacementMap(oldSchedules, newSchedules){
  const replacements = new Map();
  const remainingNew = [...(newSchedules || [])];
  const remainingOld = [];

  [...(oldSchedules || [])].sort((a,b) => scheduleSortValue(a).localeCompare(scheduleSortValue(b))).forEach(old => {
    const exactIndex = remainingNew.findIndex(next => schedulesMatch(old, next));
    if(exactIndex >= 0){
      replacements.set(Number(old.id), remainingNew[exactIndex]);
      remainingNew.splice(exactIndex, 1);
    } else {
      remainingOld.push(old);
    }
  });

  remainingOld
    .sort((a,b) => scheduleSortValue(a).localeCompare(scheduleSortValue(b)))
    .forEach(old => {
      const sameSession = remainingNew
        .map((next, index) => ({ next, index }))
        .find(item => Number(item.next.session_no || 1) === Number(old.session_no || 1));
      if(!sameSession) return;
      replacements.set(Number(old.id), sameSession.next);
      remainingNew.splice(sameSession.index, 1);
    });

  return replacements;
}

function moveDateToReplacementWeekday(dateValue, oldSchedule, newSchedule){
  if(!dateValue || !oldSchedule || !newSchedule) return dateValue;
  const date = new Date(dateValue+"T00:00:00");
  const delta = Number(newSchedule.weekday || 0) - Number(oldSchedule.weekday || 0);
  date.setDate(date.getDate() + delta);
  return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
}

function isMissingRelationError(error){
  const message = String(error?.message || "").toLowerCase();
  return message.includes("does not exist") || message.includes("could not find") || message.includes("relation");
}

function limitScheduleQueryToVersion(query, nextEffectiveFrom){
  return nextEffectiveFrom ? query.lt("date", nextEffectiveFrom) : query;
}

async function migrateClassSessionDates(sb, classId, effectiveFrom, nextEffectiveFrom, oldById, replacements){
  const changedDays = [...replacements.entries()].map(([oldId, next]) => ({
    old: oldById.get(Number(oldId)),
    next,
  })).filter(item => item.old && Number(item.old.weekday) !== Number(item.next.weekday));
  if(!changedDays.length) return null;

  let query = sb.from("class_sessions").select("id,session_date").eq("class_id", classId).gte("session_date", effectiveFrom);
  if(nextEffectiveFrom) query = query.lt("session_date", nextEffectiveFrom);
  const { data: sessions, error } = await query;
  if(error) return isMissingRelationError(error) ? null : error;

  for(const session of sessions || []){
    const date = new Date(session.session_date+"T00:00:00");
    const weekday = date.getDay() === 0 ? 7 : date.getDay();
    const replacement = changedDays.find(item => Number(item.old.weekday) === weekday);
    if(!replacement) continue;
    const { error: updateError } = await sb
      .from("class_sessions")
      .update({ session_date: moveDateToReplacementWeekday(session.session_date, replacement.old, replacement.next) })
      .eq("id", session.id);
    if(updateError) return updateError;
  }
  return null;
}

function renderEditingMonthSchedules(){
  const activeSchedules = editingClassId
    ? getSchedulesForEffectiveMonth(editingSchedules, effectiveFromValue())
    : [];
  renderScheduleGroups(activeSchedules.map(s => ({
    weekday: s.weekday,
    session_no: s.session_no || 1,
    start_time: String(s.start_time || "").slice(0,5),
    end_time: String(s.end_time || "").slice(0,5),
    room_id: s.room_id,
    class_id: editingClassId,
  })));
}

/* ══════════════════════════════════════════════
   SCHEDULE ROW
══════════════════════════════════════════════ */
function createScheduleRow(initial={}, sessionNo=1){
  const row = document.createElement("div");
  row.className = "schedule-row";
  row.dataset.sessionNo = String(initial.session_no || sessionNo || 1);

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
      const {data: schedules} = await sb.from("class_schedules").select("room_id,start_time,end_time,class_id,effective_from").eq("weekday",parseInt(weekday));
      const byClass = {};
      (schedules || []).forEach(s => {
        if(!byClass[s.class_id]) byClass[s.class_id] = [];
        byClass[s.class_id].push(s);
      });
      const filteredSchedules = Object.values(byClass)
        .flatMap(items => getSchedulesForEffectiveMonth(items, effectiveFromValue()))
        .filter(s => initial.class_id ? s.class_id !== initial.class_id : true);
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

function createScheduleGroup(sessionNo, rows=[]){
  const group = document.createElement("div");
  group.className = "schedule-group";
  group.dataset.sessionNo = String(sessionNo);
  group.innerHTML = `
    <div class="schedule-group-head">
      <span>Buổi ${sessionNo}</span>
      <button type="button" class="btn btn-outline btn-sm">+ Thêm lịch</button>
    </div>
    <div class="schedule-group-body"></div>
  `;
  const body = group.querySelector(".schedule-group-body");
  const addBtn = group.querySelector("button");
  const addRow = initial => body.appendChild(createScheduleRow(initial || { session_no: sessionNo }, sessionNo));
  (rows.length ? rows : [{ session_no: sessionNo }]).forEach(addRow);
  addBtn.onclick = () => addRow({ session_no: sessionNo });
  return group;
}

function renderScheduleGroups(existingSchedules=[]){
  const sessionCount = Math.max(1, Math.min(7, parseInt(sessionsPerWeek?.value || 1, 10) || 1));
  const currentRows = existingSchedules.length ? existingSchedules : [...schedulesEl.querySelectorAll(".schedule-row")].map(row => ({
    session_no: Number(row.dataset.sessionNo || row.closest(".schedule-group")?.dataset.sessionNo || 1),
    weekday: row.children[0]?.value || "",
    start_time: row.children[1]?.value || "",
    end_time: row.children[2]?.value || "",
    room_id: row.children[3]?.value || null
  })).filter(row => row.weekday || row.start_time || row.end_time || row.room_id);
  const grouped = {};
  currentRows.forEach(row => {
    const no = Math.max(1, Math.min(sessionCount, Number(row.session_no || 1)));
    if(!grouped[no]) grouped[no] = [];
    grouped[no].push({ ...row, session_no: no });
  });
  schedulesEl.innerHTML = "";
  for(let no=1; no<=sessionCount; no++){
    schedulesEl.appendChild(createScheduleGroup(no, grouped[no] || []));
  }
}

if(addScheduleBtn) addScheduleBtn.onclick = () => renderScheduleGroups();
if(sessionsPerWeek) sessionsPerWeek.onchange = () => renderScheduleGroups();
if(scheduleEffectiveMonth) scheduleEffectiveMonth.onchange = () => renderEditingMonthSchedules();

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
  const sessions_per_week = Math.max(1, Math.min(7, parseInt(sessionsPerWeek?.value || 1, 10) || 1));

  let classId;

  if(editingClassId){
    await sb.from("classes").update({ class_name, grade_id, subject_id, tuition_type, tuition_fee, makeup_fee, sessions_per_week }).eq("id", editingClassId);
    classId = editingClassId;
  } else {
    const {data, error} = await sb.from("classes").insert([{ class_name, grade_id, subject_id, tuition_type, tuition_fee, makeup_fee, sessions_per_week }]).select("id").single();
    if(error) throw error;
    classId = data.id;
  }

  /* Lưu schedules */
  const rows   = [...schedulesEl.querySelectorAll(".schedule-row")];
  const inserts = [];
  rows.forEach(r => {
    const sessionNo = parseInt(r.dataset.sessionNo || r.closest(".schedule-group")?.dataset.sessionNo || 1, 10);
    const weekday = r.children[0].value;
    const start   = r.children[1].value;
    const end     = r.children[2].value;
    const room    = r.children[3].value || null;
    if(!weekday || !start || !end) return;
    inserts.push({ class_id: classId, session_no: sessionNo, weekday: parseInt(weekday), start_time: start, end_time: end, room_id: room, effective_from: editingClassId ? effectiveFromValue() : "2000-01-01" });
  });
  if(!inserts.length){
    alert("Vui lòng nhập ít nhất một lịch học hợp lệ.");
    return;
  }

  if(editingClassId){
    const effectiveFrom = effectiveFromValue();
    const [{ data: oldSchedules }, { data: oldChoices }] = await Promise.all([
      sb.from("class_schedules").select("id,session_no,weekday,start_time,end_time,effective_from").eq("class_id", classId),
      sb.from("class_student_schedules").select("class_id,student_id,session_no,schedule_id").eq("class_id", classId),
    ]);
    const sameMonthIds = (oldSchedules || [])
      .filter(s => (s.effective_from || "2000-01-01") === effectiveFrom)
      .map(s => s.id);
    const nextEffectiveFrom = [...new Set((oldSchedules || [])
      .map(s => s.effective_from || "2000-01-01")
      .filter(value => value > effectiveFrom))]
      .sort()[0] || null;
    const activeOldSchedules = getSchedulesForEffectiveMonth(oldSchedules || [], effectiveFrom);

    const { data: newSchedules, error: insErr } = await sb.from("class_schedules").insert(inserts).select("id,session_no,weekday,start_time,end_time");
    if(insErr){
      alert("Lỗi lưu lịch: "+insErr.message);
      return;
    }
    const newScheduleIds = (newSchedules || []).map(s => s.id);
    const scheduleReplacements = buildScheduleReplacementMap(activeOldSchedules, newSchedules || []);
    const { error: deleteChoiceError } = await sb.from("class_student_schedules").delete().eq("class_id", classId);
    if(deleteChoiceError){
      if(newScheduleIds.length) await sb.from("class_schedules").delete().in("id", newScheduleIds);
      alert("Lỗi cập nhật lịch học sinh: "+deleteChoiceError.message);
      return;
    }
    const oldById = new Map((oldSchedules || []).map(s => [Number(s.id), s]));
    const newBySession = {};
    (newSchedules || []).forEach(s => {
      const no = Number(s.session_no || 1);
      if(!newBySession[no]) newBySession[no] = [];
      newBySession[no].push(s);
    });
    const replacementChoices = (oldChoices || []).map(choice => {
      const old = oldById.get(Number(choice.schedule_id));
      const no = Number(old?.session_no || choice.session_no || 1);
      const candidates = newBySession[no] || [];
      const mapped = scheduleReplacements.get(Number(choice.schedule_id));
      const exact = candidates.find(s =>
        Number(s.weekday) === Number(old?.weekday) &&
        String(s.start_time || "").slice(0,5) === String(old?.start_time || "").slice(0,5) &&
        String(s.end_time || "").slice(0,5) === String(old?.end_time || "").slice(0,5)
      );
      const next = mapped || exact || candidates[0];
      return next ? { class_id: classId, student_id: choice.student_id, session_no: no, schedule_id: next.id } : null;
    }).filter(Boolean);
    if(replacementChoices.length){
      const { error: choiceError } = await sb.from("class_student_schedules").upsert(replacementChoices, { onConflict: "class_id,student_id,session_no" });
      if(choiceError){
        if(oldChoices?.length) await sb.from("class_student_schedules").upsert(oldChoices, { onConflict: "class_id,student_id,session_no" });
        if(newScheduleIds.length) await sb.from("class_schedules").delete().in("id", newScheduleIds);
        alert("Lỗi cập nhật lịch học sinh: "+choiceError.message);
        return;
      }
    }

    const replacedOldIds = [...scheduleReplacements.keys()];
    if(replacedOldIds.length){
      let attendanceQuery = sb
        .from("attendance")
        .select("class_id,student_id,date,status,schedule_id,session_no")
        .eq("class_id", classId)
        .in("schedule_id", replacedOldIds)
        .gte("date", effectiveFrom);
      attendanceQuery = limitScheduleQueryToVersion(attendanceQuery, nextEffectiveFrom);
      const { data: attendanceRows, error: attendanceLoadError } = await attendanceQuery;
      if(attendanceLoadError){
        alert("Lỗi tải dữ liệu điểm danh cũ: "+attendanceLoadError.message);
        return;
      }
      const migratedAttendance = [...new Map((attendanceRows || []).map(row => {
        const old = oldById.get(Number(row.schedule_id));
        const next = scheduleReplacements.get(Number(row.schedule_id));
        const migrated = {
          class_id: classId,
          student_id: row.student_id,
          date: moveDateToReplacementWeekday(row.date, old, next),
          status: row.status,
          schedule_id: next.id,
          session_no: Number(next.session_no || row.session_no || 1),
        };
        return [migrated.class_id+"_"+migrated.student_id+"_"+migrated.date, migrated];
      })).values()];
      if(migratedAttendance.length){
        const { error: attendanceUpsertError } = await sb
          .from("attendance")
          .upsert(migratedAttendance, { onConflict: "class_id,student_id,date" });
        if(attendanceUpsertError){
          alert("Lỗi chuyển dữ liệu điểm danh sang lịch mới: "+attendanceUpsertError.message);
          return;
        }
        let attendanceDeleteQuery = sb
          .from("attendance")
          .delete()
          .eq("class_id", classId)
          .in("schedule_id", replacedOldIds)
          .gte("date", effectiveFrom);
        attendanceDeleteQuery = limitScheduleQueryToVersion(attendanceDeleteQuery, nextEffectiveFrom);
        const { error: attendanceDeleteError } = await attendanceDeleteQuery;
        if(attendanceDeleteError){
          alert("Lỗi dọn dữ liệu điểm danh cũ: "+attendanceDeleteError.message);
          return;
        }
      }
    }

    const classSessionError = await migrateClassSessionDates(
      sb,
      classId,
      effectiveFrom,
      nextEffectiveFrom,
      oldById,
      scheduleReplacements
    );
    if(classSessionError){
      alert("Lỗi chuyển ngày nội dung buổi học sang lịch mới: "+classSessionError.message);
      return;
    }

    if(sameMonthIds.length){
      const { error: delErr } = await sb.from("class_schedules").delete().in("id", sameMonthIds);
      if(delErr){
        await sb.from("class_student_schedules").delete().eq("class_id", classId);
        if(oldChoices?.length) await sb.from("class_student_schedules").upsert(oldChoices, { onConflict: "class_id,student_id,session_no" });
        if(newScheduleIds.length) await sb.from("class_schedules").delete().in("id", newScheduleIds);
        alert("Lỗi thay lịch trong tháng: "+delErr.message);
        return;
      }
    }
  } else {
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

  await window.AppAdminTools?.recordAudit?.(editingClassId ? "class_updated" : "class_created", {
    target_type: "class",
    target_id: classId,
    class_name,
    teacher_count: selectedTeacherIds.size,
    schedule_count: inserts.length,
    sessions_per_week,
  });
  alert("Đã lưu lớp ✓");
  document.getElementById("createClassPopup").classList.add("hidden");
  if(window.loadMyClasses) window.loadMyClasses();
};

/* ══════════════════════════════════════════════
   RESET / FILL EDIT
══════════════════════════════════════════════ */
window.resetClassForm = function(){
  editingClassId = null;
  editingSchedules = [];
  selectedTeacherIds = new Set();
  form.reset();
  if(scheduleEffectiveMonth) scheduleEffectiveMonth.value = currentMonthValue();
  if(scheduleEffectiveMonthWrap) scheduleEffectiveMonthWrap.style.display = "none";
  if(sessionsPerWeek) sessionsPerWeek.value = 1;
  renderScheduleGroups();
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
  editingSchedules = schedules || [];
  if(scheduleEffectiveMonth) scheduleEffectiveMonth.value = currentMonthValue();
  if(scheduleEffectiveMonthWrap) scheduleEffectiveMonthWrap.style.display = "";

  /* Load form fields */
  form.class_name.value  = cls.class_name;
  gradeSelect.value      = cls.grade_id;
  await loadSubjects(cls.grade_id);
  subjectSelect.value    = cls.subject_id;
  tuitionType.value      = cls.tuition_type;
  tuitionFee.value       = cls.tuition_fee;
  if(makeupFee) makeupFee.value = cls.makeup_fee || "";
  if(sessionsPerWeek) sessionsPerWeek.value = cls.sessions_per_week || Math.max(1, ...((schedules || []).map(s => Number(s.session_no || 1))));

  /* Load schedules */
  if(schedules?.length){
    renderEditingMonthSchedules();
  } else {
    renderScheduleGroups();
  }

  /* Load giáo viên đã assign */
  selectedTeacherIds = new Set((existingTeachers||[]).map(t => t.teacher_id));
  renderTeacherPicker();

  document.getElementById("createClassPopup").classList.remove("hidden");
};

/* ── Init ── */
loadGrades();
loadTeacherPicker();
if(scheduleEffectiveMonth) scheduleEffectiveMonth.value = currentMonthValue();
renderScheduleGroups();

})();
