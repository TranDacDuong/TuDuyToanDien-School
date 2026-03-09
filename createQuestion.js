/* LOAD DỮ LIỆU BAN ĐẦU */

async function loadSelectData(){

/* KHỐI */

let {data:grades,error} = await sb
.from("grades")
.select("*")
.order("id")

grade.innerHTML = `<option value="">Chọn khối</option>`

grades.forEach(g=>{
grade.innerHTML += `<option value="${g.id}">${g.name}</option>`
})


/* MỨC ĐỘ */

let {data:levels} = await sb
.from("difficulty_levels")
.select("*")
.order("id")

difficulty.innerHTML = `<option value="">Chọn mức độ</option>`

levels.forEach(l=>{
difficulty.innerHTML += `<option value="${l.id}">${l.name}</option>`
})

}



/* CHỌN KHỐI → LOAD MÔN */

grade.onchange = async function(){

subject.innerHTML = ""
chapter.innerHTML = ""

if(!grade.value) return

let {data:subjects} = await sb
.from("subjects")
.select("*")
.eq("grade_id",grade.value)

subject.innerHTML = `<option value="">Chọn môn</option>`

subjects.forEach(s=>{
subject.innerHTML += `<option value="${s.id}">${s.name}</option>`
})

}



/* CHỌN MÔN → LOAD CHƯƠNG */

subject.onchange = async function(){

chapter.innerHTML = ""

if(!subject.value) return

let {data:chapters} = await sb
.from("chapters")
.select("*")
.eq("subject_id",subject.value)

chapter.innerHTML = `<option value="">Chọn chương</option>`

chapters.forEach(c=>{
chapter.innerHTML += `<option value="${c.id}">${c.name}</option>`
})

}



/* LƯU CÂU HỎI */

async function saveQuestion(){

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

if(!questionText.value){
alert("Chưa nhập câu hỏi")
return
}



/* INSERT */

let {error} = await sb
.from("questions")
.insert({

grade_id: grade.value,
subject_id: subject.value,
chapter_id: chapter.value,
type: question_type.value,
difficulty_id: difficulty.value,
question_text: questionText.value,
answer_text: answerText.value

})

if(error){

console.log(error)
alert("Lưu thất bại")

return

}

alert("Đã lưu câu hỏi")

closeModal()

location.reload()

}



/* INIT */

loadSelectData()
