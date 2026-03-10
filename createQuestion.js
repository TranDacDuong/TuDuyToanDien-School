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

/* =========================
USER
========================= */

const { data: { user } } = await sb.auth.getUser()
const userId = user?.id || null

/* =========================
FORM DATA
========================= */

const chapterVal = chapter.value
const typeVal = question_type.value
const difficultyVal = difficulty.value

const questionVal = questionText.value.trim()
const answerVal = answerText.value.trim()

const questionImgSrc = questionImg.src ? questionImg.src : null
const answerImgSrc = answerImg.src ? answerImg.src : null

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
correctAnswer += String.fromCharCode(65 + index)
}

})

}

if(typeVal === "true_false"){

const boxes = document.querySelectorAll("#answerArea .answerBox")

answerCount = boxes.length

boxes.forEach((box,index)=>{

const state = box.querySelector(".correct, .wrong")

if(state.innerText === "Đúng"){
correctAnswer += String.fromCharCode(97 + index)
}

})

}

if(typeVal === "short_answer"){

const inputs = document.querySelectorAll("#answerArea input")

answerCount = inputs.length

correctAnswer = [...inputs].map(i=>i.value).join(";")

}

/* =========================
DATA OBJECT
========================= */

const dataObj = {

chapter_id: chapterVal,
question_type: typeVal,
difficulty: difficultyVal,

question_text: questionVal,
question_img: questionImgSrc,

answer_text: answerVal,
answer_img: answerImgSrc,

answer_count: answerCount,
answer: correctAnswer

}

/* =========================
INSERT / UPDATE
========================= */

let error

if(editingQuestionId){

/* UPDATE */

const res = await sb
.from("question_bank")
.update(dataObj)
.eq("id", editingQuestionId)

error = res.error

}else{

/* INSERT */

dataObj.hidden = false
dataObj.created_by = userId

const res = await sb
.from("question_bank")
.insert([dataObj])

error = res.error

}

/* =========================
RESULT
========================= */

if(error){

console.error(error)
alert(error.message)
return

}

/* =========================
SUCCESS
========================= */

if(editingQuestionId){
alert("Cập nhật câu hỏi thành công")
}else{
alert("Tạo câu hỏi thành công")
}

/* reset edit mode */

editingQuestionId = null

/* reset form */

resetQuestionForm()

/* reload bảng */

loadQuestions()

}

/* LOAD DIFFICULTY */

for(let i = 1; i <= 10; i++){

const option = document.createElement("option")
option.value = i
option.textContent = i

difficulty.appendChild(option)

}

/* NÉN ẢNH */

async function compressImage(file){

return new Promise((resolve)=>{

const img = new Image()
const reader = new FileReader()

reader.onload = function(e){

img.src = e.target.result

}

img.onload = function(){

const canvas = document.createElement("canvas")
const ctx = canvas.getContext("2d")

/* resize tối đa */

const MAX_WIDTH = 1200
const MAX_HEIGHT = 1200

let width = img.width
let height = img.height

if(width > MAX_WIDTH){

height = height * (MAX_WIDTH / width)
width = MAX_WIDTH

}

if(height > MAX_HEIGHT){

width = width * (MAX_HEIGHT / height)
height = MAX_HEIGHT

}

canvas.width = width
canvas.height = height

ctx.drawImage(img,0,0,width,height)

/* nén JPEG */

canvas.toBlob((blob)=>{

resolve(blob)

},"image/jpeg",0.7)

}

reader.readAsDataURL(file)

})

}

function resetQuestionForm(){

/* reset text */

questionText.value = ""
answerText.value = ""

/* reset ảnh */

questionImg.src = ""
answerImg.src = ""

questionImgBox.style.display = "none"
answerImgBox.style.display = "none"

questionImageFile = null
answerImageFile = null

/* reset đáp án */

const checkboxes = document.querySelectorAll("#answerArea input[type='checkbox']")
checkboxes.forEach(cb => cb.checked = false)

const inputs = document.querySelectorAll("#answerArea input[type='text']")
inputs.forEach(i => i.value = "")

}

/* =========================
INIT
========================= */

loadSelectData()
