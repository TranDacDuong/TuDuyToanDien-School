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

/* VALIDATE */

if(!grade.value){

alert("Chưa chọn khối")
return

}

if(!subject.value){

alert("Chưa chọn môn")
return

}

if(!chapter.value){

alert("Chưa chọn chương")
return

}

if(!question_type.value){

alert("Chưa chọn loại câu hỏi")
return

}

if(!difficulty.value){

alert("Chưa chọn mức độ")
return

}

const qContent = getQuestionContent()

if(!qContent){

alert("Chưa nhập câu hỏi")
return

}

const aContent = getAnswerContent()


/* INSERT DB */

const {error} = await sb
.from("questions")
.insert({

grade_id: grade.value,
subject_id: subject.value,
chapter_id: chapter.value,

type: question_type.value,
difficulty_id: difficulty.value,

question_text: qContent,
answer_text: aContent

})

if(error){

console.error(error)

alert("Lưu thất bại")

return

}


alert("Đã lưu câu hỏi")

closeModal()

location.reload()

}


/* =========================
INIT
========================= */

loadSelectData()
