/* =========================
ELEMENT
========================= */

const questionText = document.getElementById("questionText")
const answerText = document.getElementById("answerText")

const questionModeBtn = document.getElementById("questionModeBtn")
const answerModeBtn = document.getElementById("answerModeBtn")

const question_type = document.getElementById("question_type")
const answerBox = document.getElementById("answerBox")
const difficulty = document.getElementById("difficulty")


/* =========================
MỨC ĐỘ 1 → 10
========================= */

function loadDifficulty(){

if(!difficulty) return

difficulty.innerHTML=""

for(let i=1;i<=10;i++){

const option=document.createElement("option")
option.value=i
option.textContent=i

difficulty.appendChild(option)

}

}


/* =========================
CHẾ ĐỘ CHỮ / ẢNH
========================= */

let questionMode = "image"
let answerMode = "image"


function toggleQuestionMode(){

if(questionMode==="image"){

questionMode="text"

if(questionModeBtn) questionModeBtn.innerText="Chữ"
if(questionText){
questionText.readOnly=false
questionText.dataset.image=""
}

}else{

questionMode="image"

if(questionModeBtn) questionModeBtn.innerText="Ảnh"

if(questionText){
questionText.readOnly=true
questionText.value=""
questionText.dataset.image=""
}

}

}


function toggleAnswerMode(){

if(answerMode==="image"){

answerMode="text"

if(answerModeBtn) answerModeBtn.innerText="Chữ"

if(answerText){
answerText.readOnly=false
answerText.dataset.image=""
}

}else{

answerMode="image"

if(answerModeBtn) answerModeBtn.innerText="Ảnh"

if(answerText){
answerText.readOnly=true
answerText.value=""
answerText.dataset.image=""
}

}

}


/* =========================
CHẶN GÕ CHỮ KHI MODE ẢNH
========================= */

if(questionText){

questionText.addEventListener("keydown",e=>{

if(questionMode==="image"){

e.preventDefault()

}

})

}

if(answerText){

answerText.addEventListener("keydown",e=>{

if(answerMode==="image"){

e.preventDefault()

}

})

}


/* =========================
PASTE IMAGE
========================= */

document.addEventListener("paste",function(e){

const items = e.clipboardData?.items

if(!items) return

for(let item of items){

if(item.type.indexOf("image")!==-1){

const file = item.getAsFile()

if(!file) continue

const reader = new FileReader()

reader.onload=function(ev){

const imgData = ev.target.result

if(document.activeElement===questionText){

if(questionMode==="text") return

questionText.dataset.image = imgData
questionText.value = "[Ảnh câu hỏi]"

}

else if(document.activeElement===answerText){

if(answerMode==="text") return

answerText.dataset.image = imgData
answerText.value = "[Ảnh đáp án]"

}

}

reader.readAsDataURL(file)

}

}

})



/* =========================
ANSWER UI
========================= */

let answerCount = 4


function renderAnswerUI(){

if(!answerBox || !question_type) return

answerBox.innerHTML=""

const type = question_type.value


/* MULTIPLE CHOICE */

if(type==="multi_choice"){

const html = Array.from({length:answerCount},(_,i)=>{

let letter = String.fromCharCode(65+i)

return `

<div class="answerItem">

<input type="checkbox">

<span>${letter}</span>

<input class="answerInput" placeholder="Đáp án">

</div>

`

}).join("")

answerBox.innerHTML = html

}


/* TRUE FALSE */

if(type==="true_false"){

const html = Array.from({length:answerCount},(_,i)=>{

let letter = String.fromCharCode(97+i)

return `

<div class="answerRow">

<span>${letter})</span>

<button type="button" class="answerBtn trueBtn">Đ</button>
<button type="button" class="answerBtn falseBtn">S</button>

</div>

`

}).join("")

answerBox.innerHTML = html

}


/* SHORT ANSWER */

if(type==="short_answer"){

answerBox.innerHTML=`

<input class="answerInput" placeholder="Đáp án">

`

}


/* ESSAY */

if(type==="essay"){

answerBox.innerHTML=""

}

}



/* =========================
THÊM BỚT ĐÁP ÁN
========================= */

function addAnswer(){

if(question_type.value==="short_answer") return

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

if(question_type){

question_type.addEventListener("change",()=>{

if(question_type.value==="short_answer"){

answerCount=1

}else{

answerCount=4

}

renderAnswerUI()

})

}


/* =========================
INIT
========================= */

loadDifficulty()
renderAnswerUI()
