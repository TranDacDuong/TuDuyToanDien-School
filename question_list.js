let grades = []
let questions = []
let editingQuestionId = null
let isAdmin = false
let currentPage = 1
const PAGE_SIZE = 25

const formTitle = document.getElementById("formTitle")
const saveBtn = document.getElementById("saveBtn")
const answerStatusFilter = document.getElementById("f_answer_status")
const typeText = {
  multi_choice: "Nhiều lựa chọn",
  true_false: "Đúng/Sai",
  short_answer: "Trả lời ngắn",
  essay: "Tự luận",
}

function resetToFirstPage() {
  currentPage = 1
}

for (let i = 1; i <= 10; i++) {
  f_difficulty.innerHTML += `<option value="${i}">${i}</option>`
}

async function loadGrades() {
  const { data, error } = await sb.from("grades").select("*")
  if (error) {
    console.error(error)
    return
  }

  grades = (data || []).sort((a, b) => Number(a.name) - Number(b.name))
  f_grade.innerHTML = "<option value=''>Khối</option>"
  grades.forEach((g) => {
    f_grade.innerHTML += `<option value="${g.id}">${g.name}</option>`
  })
}

f_grade.onchange = async () => {
  resetToFirstPage()
  f_subject.innerHTML = "<option value=''>Môn</option>"
  f_chapter.innerHTML = "<option value=''>Chương</option>"
  if (!f_grade.value) {
    render()
    return
  }

  const { data } = await sb.from("subjects").select("*").eq("grade_id", f_grade.value)
  ;(data || []).forEach((s) => {
    f_subject.innerHTML += `<option value="${s.id}">${s.name}</option>`
  })
  render()
}

f_subject.onchange = async () => {
  resetToFirstPage()
  f_chapter.innerHTML = "<option value=''>Chương</option>"
  if (!f_subject.value) {
    render()
    return
  }

  const { data } = await sb.from("chapters").select("*").eq("subject_id", f_subject.value)
  ;(data || []).forEach((c) => {
    f_chapter.innerHTML += `<option value="${c.id}">${c.name}</option>`
  })
  render()
}

f_chapter.onchange = () => {
  resetToFirstPage()
  render()
}

f_type.onchange = () => {
  resetToFirstPage()
  render()
}

if (answerStatusFilter) {
  answerStatusFilter.onchange = () => {
    resetToFirstPage()
    render()
  }
}

f_difficulty.onchange = () => {
  resetToFirstPage()
  render()
}

async function loadCreatorFilter() {
  const { data } = await sb.from("users").select("id,full_name").in("role", ["admin", "teacher"]).order("full_name")
  const sel = document.getElementById("f_creator")
  if (!sel) return

  sel.innerHTML = "<option value=''>Người tạo</option>"
  ;(data || []).forEach((u) => {
    sel.innerHTML += `<option value="${u.id}">${u.full_name}</option>`
  })
  sel.onchange = () => {
    resetToFirstPage()
    render()
  }
}

async function loadQuestions() {
  const { data, error } = await sb.from("question_bank").select(`
    *,
    chapters(id,name,subjects(id,name,grades(id,name))),
    creator:users!created_by(id,full_name)
  `)

  if (error) {
    console.error(error)
    return
  }

  questions = data || []
  render()
}

function isAnswerMissing(q) {
  const answer = String(q?.answer || "").trim()
  return !answer
}

function getFilteredQuestions() {
  let list = [...questions]

  if (!isAdmin) list = list.filter((q) => !q.hidden)

  if (f_grade.value) list = list.filter((q) => q.chapters?.subjects?.grades?.id == f_grade.value)
  if (f_subject.value) list = list.filter((q) => q.chapters?.subjects?.id == f_subject.value)
  if (f_chapter.value) list = list.filter((q) => q.chapter_id == f_chapter.value)
  if (f_type.value) list = list.filter((q) => q.question_type === f_type.value)
  if (answerStatusFilter?.value === "missing") list = list.filter(isAnswerMissing)
  if (answerStatusFilter?.value === "complete") list = list.filter((q) => !isAnswerMissing(q))
  if (f_difficulty.value) list = list.filter((q) => q.difficulty == f_difficulty.value)

  const creatorEl = document.getElementById("f_creator")
  if (creatorEl?.value) list = list.filter((q) => q.created_by === creatorEl.value)

  return list
}

function render() {
  const list = getFilteredQuestions()
  const totalItems = list.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  currentPage = Math.min(currentPage, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pageList = list.slice(startIndex, startIndex + PAGE_SIZE)

  questionTable.innerHTML = pageList.length
    ? pageList
        .map((q, i) => {
          const faded = q.hidden ? "faded" : ""
          const hidden = q.hidden ? `style="opacity:.45"` : ""
          const missingAnswer = isAnswerMissing(q)
          const rowClass = missingAnswer ? "row-missing-answer" : ""
          const hiddenBadge = q.hidden
            ? `<span class="hidden-badge">Ẩn</span>`
            : ""
          const statusBadge = missingAnswer
            ? `<span class="status-badge status-missing">Chưa có đáp án</span>`
            : `<span class="status-badge status-ok">${q.question_type === "essay" ? "Không bắt buộc" : "Đã có đáp án"}</span>`

          return `
      <tr class="q-row ${rowClass}" onclick="editQ('${q.id}')" title="Click để sửa câu hỏi" ${hidden}>
        <td class="${faded}">${startIndex + i + 1}</td>
        <td class="questionCell ${faded}">
          <div class="questionText">${q.question_text || ""}${hiddenBadge}</div>
          ${q.question_img ? `<div class="questionImgBox"><img class="questionImg" src="${q.question_img}" onclick="event.stopPropagation();window.open('${q.question_img}')"></div>` : ""}
        </td>
        <td class="${faded}">${q.chapters?.subjects?.grades?.name || ""}</td>
        <td class="${faded}">${q.chapters?.subjects?.name || ""}</td>
        <td class="${faded}">${q.chapters?.name || ""}</td>
        <td class="${faded}">${typeText[q.question_type] || q.question_type}</td>
        <td class="${faded}">${statusBadge}</td>
        <td class="${faded}">${q.difficulty ?? ""}</td>
        <td class="${faded}">${q.answer_count || 0}</td>
        <td class="answerCell ${faded}">${q.answer || ""}</td>
        <td class="${faded}" style="font-size:.78rem;color:var(--ink-mid);white-space:nowrap">${q.creator?.full_name || ""}</td>
      </tr>`
        })
        .join("")
    : `<tr><td colspan="11" style="text-align:center;padding:28px;color:var(--ink-light)">Chưa có câu hỏi phù hợp với bộ lọc hiện tại.</td></tr>`

  document.querySelectorAll(".q-row").forEach((r) => {
    r.style.cursor = "pointer"
  })
  renderPagination(totalItems, totalPages, pageList.length, startIndex)
}

function renderPagination(totalItems, totalPages, visibleCount, startIndex) {
  const infoEl = document.getElementById("questionPagerInfo")
  const statusEl = document.getElementById("questionPagerStatus")
  const prevBtn = document.getElementById("questionPrevPage")
  const nextBtn = document.getElementById("questionNextPage")

  if (infoEl) {
    if (totalItems) {
      infoEl.textContent = `Hiển thị ${startIndex + 1}-${startIndex + visibleCount} trên tổng ${totalItems} câu hỏi`
    } else {
      infoEl.textContent = "Không có câu hỏi nào để hiển thị"
    }
  }

  if (statusEl) statusEl.textContent = `Trang ${currentPage}/${totalPages}`
  if (prevBtn) prevBtn.disabled = currentPage <= 1
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages
}

async function editQ(id) {
  const q = questions.find((x) => x.id === id)
  if (!q) return
  editingQuestionId = id

  openModal()
  formTitle.innerText = "Sửa câu hỏi"
  saveBtn.innerText = "Cập nhật"

  injectActionBtns(q)

  const gradeId = q.chapters?.subjects?.grades?.id
  const subjectId = q.chapters?.subjects?.id
  const chapterId = q.chapter_id

  grade.value = gradeId || ""

  const { data: subjects } = await sb.from("subjects").select("*").eq("grade_id", gradeId)
  subject.innerHTML = "<option value=''>Môn</option>"
  ;(subjects || []).forEach((s) => {
    subject.innerHTML += `<option value="${s.id}">${s.name}</option>`
  })
  subject.value = subjectId || ""

  const { data: chapters } = await sb.from("chapters").select("*").eq("subject_id", subjectId)
  chapter.innerHTML = "<option value=''>Chương</option>"
  ;(chapters || []).forEach((c) => {
    chapter.innerHTML += `<option value="${c.id}">${c.name}</option>`
  })
  chapter.value = chapterId || ""

  question_type.value = q.question_type
  difficulty.value = q.difficulty
  questionText.value = q.question_text || ""
  answerText.value = q.answer_text || ""

  questionImgBox.style.display = "none"
  answerImgBox.style.display = q.answer_img ? "block" : "none"
  if (q.answer_img) answerImg.src = q.answer_img

  if (q.question_img && window.showFigure) {
    window._modalFigureBase64 = q.question_img
    showFigure(q.question_img)
  } else if (window.clearFigure) {
    clearFigure()
  }

  changeType()
  createAnswerInputs(q.answer_count)
  const boxes = document.querySelectorAll("#answerArea .answerBox")

  if (q.question_type === "multi_choice") {
    boxes.forEach((box, idx) => {
      const cb = box.querySelector("input")
      if (cb && q.answer.includes(String.fromCharCode(65 + idx))) cb.checked = true
    })
  }

  if (q.question_type === "true_false") {
    boxes.forEach((box, idx) => {
      const st = box.querySelector(".state")
      if (st) st.innerText = q.answer.includes(String.fromCharCode(97 + idx)) ? "Đúng" : "Sai"
    })
  }

  if (q.question_type === "short_answer") {
    const inputs = document.querySelectorAll("#answerArea input")
    const arr = q.answer?.split(";") || []
    inputs.forEach((input, i) => {
      input.value = arr[i] || ""
    })
  }
}

function injectActionBtns(q) {
  let wrap = document.getElementById("modalActionBtns")
  if (!wrap) {
    wrap = document.createElement("div")
    wrap.id = "modalActionBtns"
    wrap.style.cssText = "display:flex;gap:8px;margin-top:10px"
    saveBtn.parentNode.insertBefore(wrap, saveBtn.nextSibling)
  }
  wrap.innerHTML = ""

  const delBtn = document.createElement("button")
  delBtn.innerText = isAdmin ? "🗑 Xóa vĩnh viễn" : "🗑 Xóa"
  delBtn.style.cssText = "background:#ef4444;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:var(--font-body);font-weight:600;font-size:.85rem"
  delBtn.onclick = () => deleteQ(q.id)
  wrap.appendChild(delBtn)

  if (q.hidden) {
    const restBtn = document.createElement("button")
    restBtn.innerText = "↩ Khôi phục"
    restBtn.style.cssText = "background:#16a34a;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:var(--font-body);font-weight:600;font-size:.85rem"
    restBtn.onclick = () => restoreQ(q.id)
    wrap.appendChild(restBtn)
  }
}

async function restoreQ(id) {
  if (!confirm("Khôi phục câu hỏi này?")) return
  const { error } = await sb.from("question_bank").update({ hidden: false }).eq("id", id)
  if (error) {
    alert(error.message)
    return
  }
  closeModal?.()
  loadQuestions()
}

async function deleteQ(id) {
  if (!confirm("Xóa câu hỏi này?")) return

  if (isAdmin) {
    const { data: usages, error: checkErr } = await sb
      .from("exam_questions")
      .select("exam_id, exams(title)")
      .eq("question_id", id)

    if (checkErr) {
      alert("Lỗi kiểm tra: " + checkErr.message)
      return
    }

    if (usages && usages.length > 0) {
      const examNames = [...new Set(usages.map((u) => u.exams?.title || u.exam_id))]
      alert(
        "⚠ Không thể xóa!\n\nCâu hỏi này đang được dùng trong " +
          usages.length +
          " đề thi:\n" +
          examNames.map((n) => "• " + n).join("\n") +
          "\n\nHãy xóa câu hỏi khỏi các đề trên trước."
      )
      return
    }

    if (!confirm("Câu hỏi không thuộc đề nào. Xóa vĩnh viễn, không thể khôi phục?")) return
    const res = await sb.from("question_bank").delete().eq("id", id)
    if (res.error) {
      alert(res.error.message)
      return
    }
  } else {
    const res = await sb.from("question_bank").update({ hidden: true }).eq("id", id)
    if (res.error) {
      alert(res.error.message)
      return
    }
  }

  closeModal?.()
  loadQuestions()
}

async function getUserRole() {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return
  const { data } = await sb.from("users").select("role").eq("id", user.id).single()
  if (data?.role === "admin") isAdmin = true
}

async function init() {
  await getUserRole()
  await loadGrades()
  await loadCreatorFilter()
  await loadQuestions()
}

document.getElementById("questionPrevPage")?.addEventListener("click", () => {
  if (currentPage <= 1) return
  currentPage -= 1
  render()
})

document.getElementById("questionNextPage")?.addEventListener("click", () => {
  const filtered = getFilteredQuestions()
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  if (currentPage >= totalPages) return
  currentPage += 1
  render()
})

init()
