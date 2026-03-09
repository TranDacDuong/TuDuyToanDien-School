/* MODAL */

function openModal(){

modal.style.display="flex"

}

function closeModal(){

modal.style.display="none"

}


/* ANSWER UI */

let answerCount = 4

function renderAnswerUI(){

answerBox.innerHTML=""

const type = question_type.value

if(type==="essay") return

for(let i=0;i<answerCount;i++){

let letter = String.fromCharCode(65+i)

answerBox.innerHTML+=`

<div class="answerItem">
<input type="checkbox">
<span>${letter}</span>
</div>

`
}

if(type==="true_false"){

answerBox.innerHTML=""

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

if(type==="short_answer"){

answerBox.innerHTML=""

for(let i=0;i<answerCount;i++){

answerBox.innerHTML+=`

<div class="answerRow">
<input placeholder="Đáp án ${i+1}">
</div>

`

}

}

}

function addAnswer(){

answerCount++
renderAnswerUI()

}

function removeAnswer(){

if(answerCount<=1) return

answerCount--
renderAnswerUI()

}

question_type.onchange = () => {

answerCount = 4
renderAnswerUI()

}


/* PASTE IMAGE */

document.addEventListener("paste",function(e){

const items = e.clipboardData.items

for(let item of items){

if(item.type.indexOf("image")!==-1){

const file = item.getAsFile()

const reader = new FileReader()

reader.onload=function(ev){

questionPreview.src = ev.target.result
questionPreview.style.display="block"

}

reader.readAsDataURL(file)

}

}

})

renderAnswerUI()
