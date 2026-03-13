/* =========================
   ELEMENT
========================= */

const class_name = document.getElementById("class_name")

const grade = document.getElementById("grade")
const subject = document.getElementById("subject")

const tuition_type = document.getElementById("tuition_type")
const tuition_fee = document.getElementById("tuition_fee")

const scheduleArea = document.getElementById("scheduleArea")



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

}



/* =========================
   THÊM BUỔI HỌC
========================= */

function addSchedule(){

scheduleArea.innerHTML += `

<div class="scheduleRow">

<select class="weekday">

<option value="1">Thứ 2</option>
<option value="2">Thứ 3</option>
<option value="3">Thứ 4</option>
<option value="4">Thứ 5</option>
<option value="5">Thứ 6</option>
<option value="6">Thứ 7</option>
<option value="7">Chủ nhật</option>

</select>

<input type="time" class="start_time">

<input type="time" class="end_time">

</div>

`

}



/* =========================
   LƯU LỚP
========================= */

async function saveClass(){

/* USER */

const { data: { user } } = await sb.auth.getUser()

const userId = user?.id || null


/* FORM DATA */

const className = class_name.value.trim()
const gradeVal = grade.value
const subjectVal = subject.value
const tuitionType = tuition_type.value
const tuitionFee = tuition_fee.value


/* VALIDATE */

if(!className){
alert("Nhập tên lớp")
return
}

if(!gradeVal){
alert("Chọn khối")
return
}

if(!subjectVal){
alert("Chọn môn")
return
}


/* INSERT CLASS */

const {data:newClass,error} = await sb
.from("classes")
.insert({
class_name:className,
grade:gradeVal,
subject:subjectVal,
tuition_type:tuitionType,
tuition_fee:tuitionFee,
created_by:userId
})
.select()
.single()

if(error){
console.error(error)
alert("Tạo lớp lỗi")
return
}


const classId = newClass.id


/* =========================
   INSERT SCHEDULE
========================= */

const rows = document.querySelectorAll(".scheduleRow")

for(let r of rows){

const weekday = r.querySelector(".weekday").value
const start = r.querySelector(".start_time").value
const end = r.querySelector(".end_time").value

if(!start || !end) continue

await sb
.from("class_schedules")
.insert({

class_id:classId,
weekday:weekday,
start_time:start,
end_time:end

})

}


/* =========================
   SUCCESS
========================= */

alert("Tạo lớp thành công")

resetClassForm()

loadClasses()

}



/* =========================
   RESET FORM
========================= */

function resetClassForm(){

class_name.value = ""
grade.value = ""
subject.innerHTML = ""

tuition_fee.value = ""

scheduleArea.innerHTML = ""

addSchedule()

}



/* =========================
   INIT
========================= */

loadSelectData()

addSchedule()
