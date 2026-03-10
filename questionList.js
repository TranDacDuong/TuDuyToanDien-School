let grades=[]
let questions=[]

const typeText={
multi_choice:"Nhiều lựa chọn",
true_false:"Đúng/Sai",
short_answer:"Trả lời ngắn",
essay:"Tự luận"
}

/* difficulty */

for(let i=1;i<=10;i++){
f_difficulty.innerHTML+=`<option value="${i}">${i}</option>`
}

/* LOAD GRADES */

async function loadGrades(){

grades=(await sb.from("grades").select("*")).data

grades.sort((a,b)=>parseInt(a.name)-parseInt(b.name))

f_grade.innerHTML="<option value=''>Khối</option>"

grades.forEach(g=>{
f_grade.innerHTML+=`<option value="${g.id}">${g.name}</option>`
})

}

/* FILTER SUBJECT BY GRADE */

f_grade.onchange=async()=>{

if(!f_grade.value){
f_subject.innerHTML="<option value=''>Môn</option>"
render()
return
}

let data=(await sb.from("subjects")
.select("*")
.eq("grade_id",f_grade.value)).data

f_subject.innerHTML="<option value=''>Môn</option>"

data.forEach(s=>{
f_subject.innerHTML+=`<option value="${s.id}">${s.name}</option>`
})

render()

}

/* FILTER CHAPTER BY SUBJECT */

f_subject.onchange=async()=>{

if(!f_subject.value){
f_chapter.innerHTML="<option value=''>Chương</option>"
render()
return
}

let data=(await sb.from("chapters")
.select("*")
.eq("subject_id",f_subject.value)).data

f_chapter.innerHTML="<option value=''>Chương</option>"

data.forEach(c=>{
f_chapter.innerHTML+=`<option value="${c.id}">${c.name}</option>`
})

render()

}

f_chapter.onchange=render

/* LOAD QUESTIONS */

async function loadQuestions(){

questions=(await sb
.from("question_bank")
.select(`*,
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
)`)
.eq("hidden",false)).data

render()

}

/* RENDER */

function render(){

let list=[...questions]

questionTable.innerHTML=""

if(f_grade.value)
list=list.filter(q=>q.chapters?.subjects?.grades?.id==f_grade.value)

if(f_subject.value)
list=list.filter(q=>q.chapters?.subjects?.id==f_subject.value)

if(f_chapter.value)
list=list.filter(q=>q.chapter_id==f_chapter.value)

if(f_type.value)
list=list.filter(q=>q.question_type===f_type.value)

if(f_difficulty.value)
list=list.filter(q=>q.difficulty==f_difficulty.value)

list.forEach((q,i)=>{

questionTable.innerHTML+=`

<tr>

<td>${i+1}</td>

<td>
${q.image_url ?
`<div class="questionImgBox">
<img class="questionImg"
src="${q.image_url}"
onclick="window.open('${q.image_url}')">
</div>`
:"—"}
</td>

<td>${q.chapters?.subjects?.grades?.name||""}</td>
<td>${q.chapters?.subjects?.name||""}</td>
<td>${q.chapters?.name||""}</td>

<td>${typeText[q.question_type]}</td>

<td>${q.difficulty}</td>

<td class="answerCell">${q.answer||""}</td>

<td>
<button onclick="deleteQ('${q.id}')">Xóa</button>
</td>

</tr>

`

})

}

/* DELETE */

async function deleteQ(id){

if(!confirm("Xóa câu hỏi?"))return

await sb.from("question_bank")
.update({hidden:true})
.eq("id",id)

loadQuestions()

}

/* FILTER */

f_type.onchange=render
f_difficulty.onchange=render

/* INIT */

async function init(){

await loadGrades()
await loadQuestions()

}

init()
