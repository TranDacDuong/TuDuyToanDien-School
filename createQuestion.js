let answerCount = 4
let grades=[]
let subjects=[]
let chapters=[]

const typeText={
multi_choice:"Nhiều lựa chọn",
true_false:"Đúng/Sai",
short_answer:"Trả lời ngắn",
essay:"Tự luận"
}

/* LOAD DIFFICULTY */

for(let i=1;i<=10;i++){
difficulty.innerHTML+=`<option value="${i}">${i}</option>`
}

/* LOAD GRADES */

async function loadGrades(){

grades=(await sb.from("grades").select("*")).data

grades.sort((a,b)=>parseInt(a.name)-parseInt(b.name))

grade.innerHTML="<option value=''>Chọn khối</option>"

grades.forEach(g=>{
grade.innerHTML+=`<option value="${g.id}">${g.name}</option>`
})

}

/* LOAD SUBJECT */

grade.onchange=async()=>{

subjects=(await sb
.from("subjects")
.select("*")
.eq("grade_id",grade.value)).data

subject.innerHTML="<option value=''>Chọn môn</option>"

subjects.forEach(s=>{
subject.innerHTML+=`<option value="${s.id}">${s.name}</option>`
})

}

/* LOAD CHAPTER */

subject.onchange=async()=>{

chapters=(await sb
.from("chapters")
.select("*")
.eq("subject_id",subject.value)).data

chapter.innerHTML="<option value=''>Chọn chương</option>"

chapters.forEach(c=>{
chapter.innerHTML+=`<option value="${c.id}">${c.name}</option>`
})

}

/* RENDER ANSWER UI */

function renderAnswerUI(){

answerBox.innerHTML=""

const type = question_type.value

if(type==="essay"){
answerBox.innerHTML=""
return
}

/* MULTIPLE CHOICE */

if(type==="multi_choice"){

for(let i=0;i<answerCount;i++){

let letter=String.fromCharCode(65+i)

answerBox.innerHTML+=`

<div class="answerItem">

<input type="checkbox" class="correctBox">

<span>${letter}</span>

</div>

`

}

}

/* TRUE FALSE */

if(type==="true_false"){

for(let i=0;i<answerCount;i++){

let letter=String.fromCharCode(97+i)

answerBox.innerHTML+=`

<div class="answerRow">

<span>${letter})</span>

<button class="answerBtn trueBtn">Đ</button>
<button class="answerBtn falseBtn">S</button>

</div>

`

}

}

/* SHORT ANSWER */

if(type==="short_answer"){

for(let i=0;i<answerCount;i++){

answerBox.innerHTML+=`

<div class="answerRow">

<input class="shortAnswerInput" placeholder="Đáp án ${i+1}">

</div>

`

}

}

}

/* ADD ANSWER */

function addAnswer(){

answerCount++

renderAnswerUI()

}

/* REMOVE ANSWER */

function removeAnswer(){

if(answerCount<=1)return

answerCount--

renderAnswerUI()

}

/* CHANGE TYPE */

question_type.onchange=()=>{

answerCount=4

renderAnswerUI()

}

/* SAVE QUESTION */

async function saveQuestion(){

let answer=""
let answer_text=""
let answer_count=answerCount

const type=question_type.value

/* MULTIPLE CHOICE */

if(type==="multi_choice"){

let boxes=document.querySelectorAll(".correctBox")

boxes.forEach((b,i)=>{

if(b.checked){
answer+=String.fromCharCode(65+i)
}

})

}

/* SHORT ANSWER */

if(type==="short_answer"){

let inputs=document.querySelectorAll(".shortAnswerInput")

let arr=[]

inputs.forEach(i=>{
if(i.value.trim()){
arr.push(i.value.trim())
}
})

answer_text=arr.join(";")

}

/* TRUE FALSE */

if(type==="true_false"){

let rows=document.querySelectorAll(".answerRow")

rows.forEach((r,i)=>{

let letter=String.fromCharCode(97+i)

let trueBtn=r.querySelector(".trueBtn")

if(trueBtn.classList.contains("active")){
answer+=letter
}

})

}

/* PAYLOAD */

const payload={

chapter_id:chapter.value,

question_type:type,

difficulty:difficulty.value,

question_text:questionText.value,

answer_text:answerText.value || answer_text,

answer,

answer_count

}

/* USER */

const {data}=await sb.auth.getUser()

payload.created_by=data.user.id

/* INSERT */

await sb
.from("question_bank")
.insert(payload)

alert("Đã tạo câu hỏi")

resetForm()

}

/* RESET */

function resetForm(){

questionText.value=""
answerText.value=""

questionPreview.style.display="none"
answerPreview.style.display="none"

renderAnswerUI()

}

/* INIT */

async function init(){

await loadGrades()

renderAnswerUI()

}

init()
