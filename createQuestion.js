/* =========================
ELEMENT
========================= */

const grade = document.getElementById("grade")
const subject = document.getElementById("subject")
const chapter = document.getElementById("chapter")

const question_type = document.getElementById("question_type")
const difficulty = document.getElementById("difficulty")

const questionText = document.getElementById("questionText")
const answerText = document.getElementById("answerText")


/* =========================
LOAD SELECT DATA
========================= */

async function loadSelectData(){

/* LOAD KHỐI */

const {data:grades,error:gErr} = await sb
.from("grades")
.select("*")
.order("id")

if(gErr){

console.error(gErr)
alert("Không load được khối")
return

}

grade.innerHTML = `<option value="">Chọn khối</option>`

grades?.forEach(g=>{

grade.innerHTML += `
<option value="${g.id}">
${g.name}
</option>
`

})

/* =========================
CHỌN KHỐI → LOAD MÔN
========================= */

grade.addEventListener("change", async ()=>{

subject.innerHTML = ""
chapter.innerHTML = ""

if(!grade.value) return

const {data:subjects,error} = await sb
.from("subjects")
.select("*")
.eq("grade_id",grade.value)
.order("id")

if(error){

console.error(error)
alert("Không load được môn")
return

}

subject.innerHTML = `<option value="">Chọn môn</option>`

subjects?.forEach(s=>{

subject.innerHTML += `
<option value="${s.id}">
${s.name}
</option>
`

})

})


/* =========================
CHỌN MÔN → LOAD CHƯƠNG
========================= */

subject.addEventListener("change", async ()=>{

chapter.innerHTML = ""

if(!subject.value) return

const {data:chapters,error} = await sb
.from("chapters")
.select("*")
.eq("subject_id",subject.value)
.order("id")

if(error){

console.error(error)
alert("Không load được chương")
return

}

chapter.innerHTML = `<option value="">Chọn chương</option>`

chapters?.forEach(c=>{

chapter.innerHTML += `
<option value="${c.id}">
${c.name}
</option>
`

})

})
}


/* =========================
LẤY NỘI DUNG CÂU HỎI
========================= */

function getQuestionContent(){

if(questionText.dataset.image){

return questionText.dataset.image

}

return questionText.value.trim()

}


function getAnswerContent(){

if(answerText.dataset.image){

return answerText.dataset.image

}

return answerText.value.trim()

}


/* =========================
LƯU CÂU HỎI
========================= */

async function saveQuestion(){

const chapterVal = chapter.value
const typeVal = question_type.value
const difficultyVal = difficulty.value

const questionVal = questionText.value.trim()
const answerVal = answerText.value.trim()

const questionImgSrc = questionImg.src || null
const answerImgSrc = answerImg.src || null

let answerCount = 0
let correctAnswer = ""

/* =========================
LẤY ĐÁP ÁN
========================= */

if(typeVal === "multi_choice"){

const boxes = document.querySelectorAll("#answerArea .answerBox")

answerCount = boxes.length

boxes.forEach((box,index)=>{

const checkbox = box.querySelector("input")

if(checkbox.checked){

correctAnswer += String.fromCharCode(65 + index)  // A B C D

}

})

}

if(typeVal === "true_false"){

const boxes = document.querySelectorAll("#answerArea .answerBox")

answerCount = boxes.length

boxes.forEach((box,index)=>{

const state = box.querySelector(".correct, .wrong")

if(state.innerText === "Đúng"){

correctAnswer += String.fromCharCode(97 + index) // a b c d

}

})

}

if(typeVal === "short_answer"){

const inputs = document.querySelectorAll("#answerArea input")

answerCount = inputs.length

correctAnswer = [...inputs].map(i=>i.value).join(";")

}

/* =========================
LƯU DATABASE
========================= */

const { data, error } = await sb
.from("question_bank")
.insert([
{
chapter_id: chapterVal,
question_type: typeVal,
difficulty: difficultyVal,

question_text: questionVal,
question_img: questionImgSrc,

answer_text: answerVal,
answer_img: answerImgSrc,

answer_count: answerCount,
answer: correctAnswer,
hidden: false
}
])

if(error){

console.error(error)
alert(error.message)

}else{

alert("Lưu thành công")

closeModal()

}

}

/* LOAD DIFFICULTY */

for(let i = 1; i <= 10; i++){

const option = document.createElement("option")
option.value = i
option.textContent = i

difficulty.appendChild(option)

}

/* =========================
INIT
========================= */

loadSelectData()
