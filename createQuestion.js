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

const gradeVal = grade.value
const subjectVal = subject.value
const chapterVal = chapter.value
const typeVal = question_type.value
const difficultyVal = difficulty.value

const questionVal = questionText.value
const answerVal = answerText.value

/* IMAGE */

const questionImgSrc = questionImg.src || null
const answerImgSrc = answerImg.src || null


const { data, error } = await sb
.from("questions")
.insert([
{
grade: gradeVal,
subject: subjectVal,
chapter: chapterVal,
question_type: typeVal,
difficulty: difficultyVal,
question_text: questionVal,
answer_text: answerVal,
question_img: questionImgSrc,
answer_img: answerImgSrc
}
])

if(error){

console.error(error)
alert("Lỗi lưu câu hỏi")

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
