let grades = []
let questions = []
let editingQuestionId = null
let isAdmin = false

const formTitle = document.getElementById("formTitle")
const saveBtn   = document.getElementById("saveBtn")
const typeText  = {
  multi_choice:  "Nhiều lựa chọn",
  true_false:    "Đúng/Sai",
  short_answer:  "Trả lời ngắn",
  essay:         "Tự luận"
}

/* ── Difficulty options ── */
for (let i = 1; i <= 10; i++) {
  f_difficulty.innerHTML += `<option value="${i}">${i}</option>`
}

/* ══════════════════════════════
   LOAD GRADES
══════════════════════════════ */
async function loadGrades(){
  const { data, error } = await sb.from("grades").select("*")
  if(error){ console.error(error); return }
  grades = (data||[]).sort((a,b)=>Number(a.name)-Number(b.name))
  f_grade.innerHTML = "<option value=''>Khối</option>"
  grades.forEach(g => f_grade.innerHTML += `<option value="${g.id}">${g.name}</option>`)
}

/* ── Khối → Môn ── */
f_grade.onchange = async () => {
  f_subject.innerHTML = "<option value=''>Môn</option>"
  f_chapter.innerHTML = "<option value=''>Chương</option>"
  if(!f_grade.value){ render(); return }
  const {data} = await sb.from("subjects").select("*").eq("grade_id", f_grade.value)
  ;(data||[]).forEach(s => f_subject.innerHTML += `<option value="${s.id}">${s.name}</option>`)
  render()
}

/* ── Môn → Chương ── */
f_subject.onchange = async () => {
  f_chapter.innerHTML = "<option value=''>Chương</option>"
  if(!f_subject.value){ render(); return }
  const {data} = await sb.from("chapters").select("*").eq("subject_id", f_subject.value)
  ;(data||[]).forEach(c => f_chapter.innerHTML += `<option value="${c.id}">${c.name}</option>`)
  render()
}
f_chapter.onchange    = render
f_type.onchange       = render
f_difficulty.onchange = render

/* ── Load dropdown người tạo ── */
async function loadCreatorFilter(){
  const { data } = await sb.from("users").select("id,full_name").in("role",["admin","teacher"]).order("full_name")
  const sel = document.getElementById("f_creator")
  if(!sel) return
  sel.innerHTML = "<option value=''>Người tạo</option>"
  ;(data||[]).forEach(u => sel.innerHTML += `<option value="${u.id}">${u.full_name}</option>`)
  sel.onchange = render
}

/* ══════════════════════════════
   LOAD QUESTIONS
══════════════════════════════ */
async function loadQuestions(){
  const {data,error} = await sb.from("question_bank").select(`
    *,
    chapters(id,name,subjects(id,name,grades(id,name))),
    creator:users!created_by(id,full_name)
  `)
  if(error){ console.error(error); return }
  questions = data || []
  render()
}

/* ══════════════════════════════
   RENDER — click row → mở modal sửa
══════════════════════════════ */
function render(){
  let list = [...questions]

  if(!isAdmin) list = list.filter(q => !q.hidden)

  if(f_grade.value)      list = list.filter(q => q.chapters?.subjects?.grades?.id == f_grade.value)
  if(f_subject.value)    list = list.filter(q => q.chapters?.subjects?.id == f_subject.value)
  if(f_chapter.value)    list = list.filter(q => q.chapter_id == f_chapter.value)
  if(f_type.value)       list = list.filter(q => q.question_type === f_type.value)
  if(f_difficulty.value) list = list.filter(q => q.difficulty == f_difficulty.value)

  const creatorEl = document.getElementById("f_creator")
  if(creatorEl?.value) list = list.filter(q => q.created_by === creatorEl.value)

  questionTable.innerHTML = list.map((q, i) => {
    const faded  = q.hidden ? "faded" : ""
    const hidden = q.hidden ? `style="opacity:.45"` : ""
    const hiddenBadge = q.hidden
      ? `<span style="margin-left:6px;background:#fef3c7;color:#b45309;border:1px solid #fcd34d;padding:1px 7px;border-radius:10px;font-size:.7rem;font-weight:700">Ẩn</span>`
      : ""
    return `
      <tr class="q-row" onclick="editQ('${q.id}')" title="Click để sửa câu hỏi" ${hidden}>
        <td class="${faded}">${i+1}</td>
        <td class="questionCell ${faded}">
          <div class="questionText">${q.question_text || ""}${hiddenBadge}</div>
          ${q.question_img ? `<div class="questionImgBox"><img class="questionImg" src="${q.question_img}" onclick="event.stopPropagation();window.open('${q.question_img}')"></div>` : ""}
        </td>
        <td class="${faded}">${q.chapters?.subjects?.grades?.name || ""}</td>
        <td class="${faded}">${q.chapters?.subjects?.name || ""}</td>
        <td class="${faded}">${q.chapters?.name || ""}</td>
        <td class="${faded}">${typeText[q.question_type] || q.question_type}</td>
        <td class="${faded}">${q.difficulty}</td>
        <td class="${faded}">${q.answer_count || 0}</td>
        <td class="answerCell ${faded}">${q.answer || ""}</td>
        <td class="${faded}" style="font-size:.78rem;color:var(--ink-mid);white-space:nowrap">${q.creator?.full_name || ""}</td>
      </tr>`
  }).join("")

  /* Style con trỏ chuột cho row */
  document.querySelectorAll(".q-row").forEach(r => r.style.cursor = "pointer")
}

/* ══════════════════════════════
   EDIT — mở modal + inject nút Xóa / Khôi phục vào footer modal
══════════════════════════════ */
async function editQ(id){
  const q = questions.find(x => x.id === id)
  if(!q) return
  editingQuestionId = id

  openModal()
  formTitle.innerText = "Sửa câu hỏi"
  saveBtn.innerText   = "Cập nhật"

  /* ── Inject nút Xóa / Khôi phục vào footer modal ── */
  injectActionBtns(q)

  /* ── Khối / Môn / Chương ── */
  const gradeId   = q.chapters?.subjects?.grades?.id
  const subjectId = q.chapters?.subjects?.id
  const chapterId = q.chapter_id

  grade.value = gradeId || ""

  const { data: subjects } = await sb.from("subjects").select("*").eq("grade_id", gradeId)
  subject.innerHTML = "<option value=''>Môn</option>"
  ;(subjects||[]).forEach(s => subject.innerHTML += `<option value="${s.id}">${s.name}</option>`)
  subject.value = subjectId || ""

  const { data: chapters } = await sb.from("chapters").select("*").eq("subject_id", subjectId)
  chapter.innerHTML = "<option value=''>Chương</option>"
  ;(chapters||[]).forEach(c => chapter.innerHTML += `<option value="${c.id}">${c.name}</option>`)
  chapter.value = chapterId || ""

  question_type.value = q.question_type
  difficulty.value    = q.difficulty
  questionText.value  = q.question_text || ""
  answerText.value    = q.answer_text   || ""

  /* FIX 1: Luôn ẩn questionImgBox (ô cũ bên dưới textarea) — ảnh chỉ hiện ở ô Hình vẽ bên phải */
  questionImgBox.style.display = "none"
  answerImgBox.style.display   = q.answer_img ? "block" : "none"
  if(q.answer_img) answerImg.src = q.answer_img

  /* Hiện question_img vào ô Hình vẽ bên phải */
  if (q.question_img && window.showFigure) {
    window._modalFigureBase64 = q.question_img;
    showFigure(q.question_img);
  } else if (window.clearFigure) {
    clearFigure();
  }

  changeType()
  createAnswerInputs(q.answer_count)
  const boxes = document.querySelectorAll("#answerArea .answerBox")

  if(q.question_type === "multi_choice"){
    boxes.forEach((box, idx) => {
      const cb = box.querySelector("input")
      if(cb && q.answer.includes(String.fromCharCode(65+idx))) cb.checked = true
    })
  }
  if(q.question_type === "true_false"){
    boxes.forEach((box, idx) => {
      const st = box.querySelector(".state")
      if(st) st.innerText = q.answer.includes(String.fromCharCode(97+idx)) ? "Đúng" : "Sai"
    })
  }
  if(q.question_type === "short_answer"){
    const inputs = document.querySelectorAll("#answerArea input")
    const arr    = q.answer?.split(";") || []
    inputs.forEach((input, i) => { input.value = arr[i] || "" })
  }
}

/* ── Thêm nút Xóa / Khôi phục vào footer của modal form ── */
function injectActionBtns(q){
  /* Tìm hoặc tạo container action bên dưới saveBtn */
  let wrap = document.getElementById("modalActionBtns")
  if(!wrap){
    wrap = document.createElement("div")
    wrap.id = "modalActionBtns"
    wrap.style.cssText = "display:flex;gap:8px;margin-top:10px"
    saveBtn.parentNode.insertBefore(wrap, saveBtn.nextSibling)
  }
  wrap.innerHTML = ""

  /* Nút Xóa */
  const delBtn = document.createElement("button")
  delBtn.innerText = isAdmin ? "🗑 Xóa vĩnh viễn" : "🗑 Xóa"
  delBtn.style.cssText = "background:#ef4444;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:var(--font-body);font-weight:600;font-size:.85rem"
  delBtn.onclick = () => deleteQ(q.id)
  wrap.appendChild(delBtn)

  /* Nút Khôi phục — chỉ hiện nếu đang ẩn */
  if(q.hidden){
    const restBtn = document.createElement("button")
    restBtn.innerText = "↩ Khôi phục"
    restBtn.style.cssText = "background:#16a34a;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:var(--font-body);font-weight:600;font-size:.85rem"
    restBtn.onclick = () => restoreQ(q.id)
    wrap.appendChild(restBtn)
  }
}

/* ══════════════════════════════
   RESTORE / DELETE
══════════════════════════════ */
async function restoreQ(id){
  if(!confirm("Khôi phục câu hỏi này?")) return
  const {error} = await sb.from("question_bank").update({hidden:false}).eq("id",id)
  if(error){ alert(error.message); return }
  closeModal?.()
  loadQuestions()
}

async function deleteQ(id){
  if(!confirm("Xóa câu hỏi này?")) return

  if(isAdmin){
    // Kiểm tra câu hỏi có đang nằm trong đề nào không
    const { data: usages, error: checkErr } = await sb
      .from("exam_questions")
      .select("exam_id, exams(title)")
      .eq("question_id", id)

    if(checkErr){ alert("Lỗi kiểm tra: " + checkErr.message); return }

    if(usages && usages.length > 0){
      const examNames = [...new Set(usages.map(u => u.exams?.title || u.exam_id))]
      alert(
        "⚠ Không thể xóa!\n\nCâu hỏi này đang được dùng trong " + usages.length + " đề thi:\n" +
        examNames.map(n => "• " + n).join("\n") +
        "\n\nHãy xóa câu hỏi khỏi các đề trên trước."
      )
      return
    }

    if(!confirm("Câu hỏi không thuộc đề nào. Xóa vĩnh viễn, không thể khôi phục?")) return
    const res = await sb.from("question_bank").delete().eq("id", id)
    if(res.error){ alert(res.error.message); return }

  } else {
    // Giáo viên: chỉ ẩn
    const res = await sb.from("question_bank").update({hidden:true}).eq("id", id)
    if(res.error){ alert(res.error.message); return }
  }

  closeModal?.()
  loadQuestions()
}

/* ══════════════════════════════
   USER ROLE
══════════════════════════════ */
async function getUserRole(){
  const {data:{user}} = await sb.auth.getUser()
  if(!user) return
  const {data} = await sb.from("users").select("role").eq("id",user.id).single()
  if(data?.role === "admin") isAdmin = true
}

/* ══════════════════════════════
   INIT
══════════════════════════════ */
async function init(){
  await getUserRole()
  await loadGrades()
  await loadCreatorFilter()
  await loadQuestions()
}

init()
