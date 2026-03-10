/* ELEMENT */

const questionText = document.getElementById("questionText")
const answerText = document.getElementById("answerText")

const questionPreview = document.getElementById("questionPreview")
const answerPreview = document.getElementById("answerPreview")

const questionModeBtn = document.getElementById("questionModeBtn")
const answerModeBtn = document.getElementById("answerModeBtn")

let questionMode = "image"
let answerMode = "image"


/* MODE TOGGLE */

function toggleQuestionMode(){

if(questionMode==="image"){

questionMode="text"
questionModeBtn.innerText="Chữ"

questionText.readOnly=false
questionPreview.style.display="none"

}else{

questionMode="image"
questionModeBtn.innerText="Ảnh"

questionText.readOnly=true
questionText.value=""
questionPreview.style.display="none"

}

}

function toggleAnswerMode(){

if(answerMode==="image"){

answerMode="text"
answerModeBtn.innerText="Chữ"

answerText.readOnly=false
answerPreview.style.display="none"

}else{

answerMode="image"
answerModeBtn.innerText="Ảnh"

answerText.readOnly=true
answerText.value=""
answerPreview.style.display="none"

}

}


/* CHẶN GÕ */

questionText.addEventListener("keydown",e=>{
if(questionMode==="image") e.preventDefault()
})

answerText.addEventListener("keydown",e=>{
if(answerMode==="image") e.preventDefault()
})


/* PASTE IMAGE */

document.addEventListener("paste",function(e){

const items=e.clipboardData?.items
if(!items) return

for(let item of items){

if(item.type.indexOf("image")!==-1){

const file=item.getAsFile()
const reader=new FileReader()

reader.onload=function(event){

const imgData=event.target.result

if(document.activeElement===questionText){

if(questionMode==="text") return

questionPreview.src=imgData
questionPreview.style.display="block"

questionText.dataset.image=imgData
questionText.value="[Ảnh câu hỏi]"

}

if(document.activeElement===answerText){

if(answerMode==="text") return

answerPreview.src=imgData
answerPreview.style.display="block"

answerText.dataset.image=imgData
answerText.value="[Ảnh đáp án]"

}

}

reader.readAsDataURL(file)

}

}

})
