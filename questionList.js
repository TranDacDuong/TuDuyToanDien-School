let grades = []
let questions = []
let editingQuestionId = null
let isAdmin = false

const formTitle = document.getElementById("formTitle")
const saveBtn = document.getElementById("saveBtn")

const typeText = {
multi_choice:"Nhiều lựa chọn",
true_false:"Đúng/Sai",
short_answer:"Trả lời ngắn",
essay:"Tự luận"
}


/* =========================
DIFFICULTY
========================= */

f_difficulty.innerHTML =
"<option value=''>Mức độ</option>" +
Array.from({length:10},(_,i)=>
`<option value="${i+1}">${i+1}</option>`
).join("")


/* =========================
LOAD GRADES
========================= */

async function loadGrades(){

const {data,error} = await sb
.from("grades")
.select("*")
.order("id")

if(error) return console.error(error)

grades = data || []

f_grade.innerHTML =
"<option value=''>Khối</option>" +
grades.map(g=>`<option value="${g.id}">${g.name}</option>`).join("")

}


/* =========================
GRADE → SUBJECT
========================= */

f_grade.onchange = async ()=>{

f_subject.innerHTML = "<option value=''>Môn</option>"
f_chapter.innerHTML = "<option value=''>Chương</option>"

if(!f_grade.value) return render()

const {data,error} = await sb
.from("subjects")
.select("*")
.eq("grade_id",f_grade.value)

if(error) return console.error(error)

f_subject.innerHTML +=
data.map(s=>`<option value="${s.id}">${s.name}</option>`).join("")

render()

}


/* =========================
SUBJECT → CHAPTER
========================= */

f_subject.onchange = async ()=>{

f_chapter.innerHTML = "<option value=''>Chương</option>"

if(!f_subject.value) return render()

const {data,error} = await sb
.from("chapters")
.select("*")
.eq("subject_id",f_subject.value)

if(error) return console.error(error)

f_chapter.innerHTML +=
data.map(c=>`<option value="${c.id}">${c.name}</option>`).join("")

render()

}

f_chapter.onchange = render


/* =========================
LOAD QUESTIONS
========================= */

async function loadQuestions(){

const {data,error} = await sb
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

if(error) return console.error(error)

questions = data || []

render()

}


/* =========================
RENDER
========================= */

function render(){

let list = [...questions]

if(!isAdmin){
list = list.filter(q=>!q.hidden)
}

list = list.filter(q=>{

if(f_grade.value &&
q.chapters?.subjects?.grades?.id != f_grade.value)
return false

if(f_subject.value &&
q.chapters?.subjects?.id != f_subject.value)
return false

if(f_chapter.value &&
q.chapter_id != f_chapter.value)
return false

if(f_type.value &&
q.question_type !== f_type.value)
return false

if(f_difficulty.value &&
q.difficulty != f_difficulty.value)
return false

return true

})


let html=""

list.forEach((q,i)=>{

const grade=q.chapters?.subjects?.grades
const subject=q.chapters?.subjects
const chapter=q.chapters

const faded=q.hidden?"faded":""

html+=`
<tr>

<td class="${faded}">${i+1}</td>

<td class="questionCell ${faded}">

<div class="questionText">
${q.question_text||""}
</div>

${q.question_img?`
<div class="questionImgBox">
<img class="questionImg"
src="${q.question_img}"
onclick="window.open('${q.question_img}')">
</div>`:""}

</td>

<td class="${faded}">${grade?.name||""}</td>
<td class="${faded}">${subject?.name||""}</td>
<td class="${faded}">${chapter?.name||""}</td>

<td class="${faded}">
${typeText[q.question_type]||q.question_type}
</td>

<td class="${faded}">${q.difficulty||""}</td>

<td class="${faded}">
${q.answer_count||0}
</td>

<td class="${faded}">
${q.answer||""}
</td>

<td>

<button onclick="editQ('${q.id}')">
Sửa
</button>

<button onclick="deleteQ('${q.id}')"
style="background:#dc2626">
Xóa
</button>

${q.hidden?`
<button onclick="restoreQ('${q.id}')"
style="background:#16a34a">
Khôi phục
</button>
`:""}

</td>

</tr>
`

})

questionTable.innerHTML =
html || `<tr><td colspan="10">Không có câu hỏi</td></tr>`

}


/* =========================
RESTORE
========================= */

async function restoreQ(id){

if(!confirm("Khôi phục câu hỏi này?")) return

const {error}=await sb
.from("question_bank")
.update({hidden:false})
.eq("id",id)

if(error){
console.error(error)
alert(error.message)
return
}

loadQuestions()

}


/* =========================
DELETE
========================= */

async function deleteQ(id){

if(!confirm("Xóa câu hỏi?")) return

let res

if(isAdmin){

if(!confirm("Admin sẽ xóa vĩnh viễn!")) return

res = await sb
.from("question_bank")
.delete()
.eq("id",id)

}else{

res = await sb
.from("question_bank")
.update({hidden:true})
.eq("id",id)

}

if(res.error){
console.error(res.error)
alert(res.error.message)
return
}

loadQuestions()

}


/* =========================
FILTER
========================= */

f_type.onchange = render
f_difficulty.onchange = render


/* =========================
USER ROLE
========================= */

async function getUserRole(){

const {data:{user}}=await sb.auth.getUser()

if(!user) return

const {data,error}=await sb
.from("users")
.select("role")
.eq("id",user.id)
.single()

if(error) return console.error(error)

isAdmin = data.role === "admin"

}


/* =========================
INIT
========================= */

async function init(){

await getUserRole()
await loadGrades()
await loadQuestions()

}

init()
