let grades = []
let questions = []
let editingQuestionId = null

const formTitle = document.getElementById("formTitle")
const saveBtn = document.getElementById("saveBtn")

const typeText = {
  multi_choice: "Nhiều lựa chọn",
  true_false: "Đúng/Sai",
  short_answer: "Trả lời ngắn",
  essay: "Tự luận"
}

/* =====================
DIFFICULTY
===================== */

for(let i = 1; i <= 10; i++){
  f_difficulty.innerHTML += `<option value="${i}">${i}</option>`
}

/* =====================
LOAD GRADES
===================== */

async function loadGrades(){

  const { data, error } = await sb
    .from("grades")
    .select("*")

  if(error){
    console.error(error)
    return
  }

  grades = data || []

  grades.sort((a,b)=>Number(a.name)-Number(b.name))

  f_grade.innerHTML = "<option value=''>Khối</option>"

  grades.forEach(g=>{
    f_grade.innerHTML += `<option value="${g.id}">${g.name}</option>`
  })

}

/* =====================
FILTER SUBJECT BY GRADE
===================== */

f_grade.onchange = async ()=>{

  f_subject.innerHTML = "<option value=''>Môn</option>"
  f_chapter.innerHTML = "<option value=''>Chương</option>"

  if(!f_grade.value){
    render()
    return
  }

  const { data, error } = await sb
    .from("subjects")
    .select("*")
    .eq("grade_id", f_grade.value)

  if(error){
    console.error(error)
    return
  }

  data.forEach(s=>{
    f_subject.innerHTML += `<option value="${s.id}">${s.name}</option>`
  })

  render()

}

/* =====================
FILTER CHAPTER BY SUBJECT
===================== */

f_subject.onchange = async ()=>{

  f_chapter.innerHTML = "<option value=''>Chương</option>"

  if(!f_subject.value){
    render()
    return
  }

  const { data, error } = await sb
    .from("chapters")
    .select("*")
    .eq("subject_id", f_subject.value)

  if(error){
    console.error(error)
    return
  }

  data.forEach(c=>{
    f_chapter.innerHTML += `<option value="${c.id}">${c.name}</option>`
  })

  render()

}

f_chapter.onchange = render

/* =====================
LOAD QUESTIONS
===================== */

async function loadQuestions(){

  const { data, error } = await sb
    .from("question_bank")
    .select(`
      *,
      chapters(
        id,
        name,
        subjects(
          id,
          name,
          grades(
            id,
            name
          )
        )
      )
    `)
    .eq("hidden", false)

  if(error){
    console.error(error)
    return
  }

  questions = data || []

  render()

}

/* =====================
RENDER
===================== */

function render(){

  let list = [...questions]

  questionTable.innerHTML = ""

  if(f_grade.value)
    list = list.filter(q => q.chapters?.subjects?.grades?.id == f_grade.value)

  if(f_subject.value)
    list = list.filter(q => q.chapters?.subjects?.id == f_subject.value)

  if(f_chapter.value)
    list = list.filter(q => q.chapter_id == f_chapter.value)

  if(f_type.value)
    list = list.filter(q => q.question_type === f_type.value)

  if(f_difficulty.value)
    list = list.filter(q => q.difficulty == f_difficulty.value)

  list.forEach((q,i)=>{

    questionTable.innerHTML += `
      <tr>

      <td>${i+1}</td>

      <td class="questionCell">

        <div class="questionText">
          ${q.question_text || ""}
        </div>

        ${
          q.question_img
          ? `
            <div class="questionImgBox">
              <img class="questionImg"
                   src="${q.question_img}"
                   onclick="window.open('${q.question_img}')">
            </div>
          `
          : ""
        }

      </td>

      <td>${q.chapters?.subjects?.grades?.name || ""}</td>
      <td>${q.chapters?.subjects?.name || ""}</td>
      <td>${q.chapters?.name || ""}</td>

      <td>${typeText[q.question_type] || q.question_type}</td>

      <td>${q.difficulty}</td>

      <td>${q.answer_count || 0}</td>

      <td class="answerCell">
        ${q.answer || ""}
      </td>

      <td>
        <button onclick="editQ('${q.id}')">Sửa</button>
        <button onclick="deleteQ('${q.id}')">Xóa</button>
      </td>

      </tr>
    `

  })

}

/* =====================
DELETE
===================== */

async function deleteQ(id){

  if(!confirm("Xóa câu hỏi?")) return

  const { error } = await sb
    .from("question_bank")
    .update({ hidden:true })
    .eq("id", id)

  if(error){
    console.error(error)
    return
  }

  loadQuestions()

}

/* =====================
FILTER
===================== */

f_type.onchange = render
f_difficulty.onchange = render

/* =====================
INIT
===================== */

async function init(){

  await loadGrades()
  await loadQuestions()

}

init()
