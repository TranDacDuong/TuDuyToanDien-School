/* =========================
KHAI BÁO ELEMENT
========================= */

const modal = document.getElementById("modal")

const questionText = document.getElementById("questionText")
const answerText = document.getElementById("answerText")

const questionModeBtn = document.getElementById("questionModeBtn")
const answerModeBtn = document.getElementById("answerModeBtn")

const question_type = document.getElementById("question_type")
const answerBox = document.getElementById("answerBox")

const difficulty = document.getElementById("difficulty")


/* =========================
MODAL
========================= */

function openModal(){

modal.style.display="flex"

}

function closeModal(){

modal.style.display="none"

}


/* =========================
MODE CHỮ / ẢNH
========================= */

let questionMode = "image"
let answerMode = "image"


function toggleQuestionMode(){

if(questionMode==="image"){

questionMode="text"
questionModeBtn.innerText="Chữ"
questionText.readOnly=false

}else{

questionMode="image"
questionModeBtn.innerText="Ảnh"
questionText.readOnly=true
questionText.value=""

}

}


function toggleAnswerMode(){

if(answerMode==="image"){

answerMode="text"
answerModeBtn.innerText="Chữ"
answerText.readOnly=false

}else{

answerMode="image"
answerModeBtn.innerText="Ảnh"
answerText.readOnly=true
answerText.value=""

}

}


/* =========================
CHẶN GÕ CHỮ KHI Ở CHẾ ĐỘ ẢNH
========================= */

questionText.addEventListener("keydown",function(e){

if(questionMode==="image"){

e.preventDefault()

}

})


answerText.addEventListener("keydown",function(e){

if(answerMode==="image"){

e.preventDefault()

}

})


/* =========================
PASTE IMAGE
========================= */

document.addEventListener("paste",function(e){

const items = e.clipboardData.items

for(let item of items){

if(item.type.indexOf("image")!==-1){

const file = item.getAsFile()

const reader = new FileReader()

reader.onload=function(ev){

if(document.activeElement===questionText && questionMode==="image"){

questionText.dataset.image = ev.target.result
questionText.value="[Ảnh câu hỏi]"

}

if(document.activeElement===answerText && answerMode==="image"){

answerText.dataset.image = ev.target.result
answerText.value="[Ảnh đáp án]"

}

}

reader.readAsDataURL(file)

}

}

})


/* =========================
MỨC ĐỘ 1 → 10
========================= */

function loadDifficulty(){

difficulty.innerHTML=""

for(let i=1;i<=10;i++){

difficulty.innerHTML+=`<option value="${i}">${i}</option>`

}

}


/* =========================
ANSWER UI
========================= */

let answerCount = 4


function renderAnswerUI(){

answerBox.innerHTML=""

const type = question_type.value


/* MULTIPLE CHOICE */

if(type==="multi_choice"){

for(let i=0;i<answerCount;i++){

let letter = String.fromCharCode(65+i)

answerBox.innerHTML+=`

<div class="answerItem">

<input type="checkbox">

<span>${letter}</span>

<input placeholder="Đáp án">

</div>

`

}

}


/* TRUE FALSE */

if(type==="true_false"){

for(let i=0;i<answerCount;i++){

let letter = String.fromCharCode(97+i)

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

answerBox.innerHTML=`<input placeholder="Đáp án">`

}


/* ESSAY */

if(type==="essay"){

answerBox.innerHTML=""

}

}



/* =========================
THÊM / BỚT ĐÁP ÁN
========================= */

function addAnswer(){

answerCount++
renderAnswerUI()

}

function removeAnswer(){

if(answerCount<=1) return

answerCount--
renderAnswerUI()

}



/* =========================
ĐỔI LOẠI CÂU HỎI
========================= */

question_type.addEventListener("change",function(){

if(question_type.value==="short_answer"){

answerCount=1

}else{

answerCount=4

}

renderAnswerUI()

})


/* =========================
INIT
========================= */

loadDifficulty()
renderAnswerUI()
