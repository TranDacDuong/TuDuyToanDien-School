let grades = []
let questions = []
let editingQuestionId = null
let isAdmin = false
let currentPage = 1
const PAGE_SIZE = 25
const FUZZY_THRESHOLD = 0.86
const MAX_FUZZY_RESULTS = 3

const formTitle = document.getElementById("formTitle")
const saveBtn = document.getElementById("saveBtn")
const duplicateStatusFilter = document.getElementById("f_duplicate_status")
const answerStatusFilter = document.getElementById("f_answer_status")
const typeText = {
  multi_choice: "Nhiều lựa chọn",
  true_false: "Đúng/Sai",
  short_answer: "Trả lời ngắn",
  essay: "Tự luận",
}

let exactDuplicateIds = new Set()
let fuzzySuggestionMap = new Map()
let fuzzyAuditScopeKey = ""
let fuzzyAuditLabel = ""

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

if (duplicateStatusFilter) {
  duplicateStatusFilter.onchange = async () => {
    resetToFirstPage()
    if (duplicateStatusFilter.value === "fuzzy" || duplicateStatusFilter.value === "any") {
      const scopeQuestions = getBaseFilteredQuestions()
      if (!isFuzzyScopeFresh(scopeQuestions)) {
        await runDuplicateAudit()
        return
      }
    }
    render()
  }
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

  questions = (data || []).map(prepareQuestionRecord)
  recomputeExactDuplicates()
  invalidateFuzzyAudit()
  exposeDuplicateHelpers()
  render()
}

function prepareQuestionRecord(q) {
  const normalized = normalizeDuplicateText(q?.question_text || "")
  return {
    ...q,
    _normalized_text: normalized,
    _token_set: buildTokenSet(normalized),
  }
}

function normalizeDuplicateText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\\dfrac/g, "\\frac")
    .replace(/^\s*cau\s*\d+\s*[:.)-]?\s*/i, "")
    .replace(/\[bang\]|\[\/bang\]/g, " ")
    .replace(/[|]/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/[“”"']/g, " ")
    .replace(/[.,;!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function buildTokenSet(normalized) {
  return new Set(
    String(normalized || "")
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  )
}

function buildQuestionSnapshot(q) {
  return {
    id: q.id,
    question_type: q.question_type || "essay",
    chapter_id: q.chapter_id || "",
    question_text: q.question_text || "",
    normalized_text: q._normalized_text || normalizeDuplicateText(q.question_text || ""),
    token_set: q._token_set || buildTokenSet(q._normalized_text || normalizeDuplicateText(q.question_text || "")),
  }
}

function recomputeExactDuplicates() {
  const groups = new Map()
  questions.forEach((q) => {
    if (!q._normalized_text) return
    const list = groups.get(q._normalized_text) || []
    list.push(q.id)
    groups.set(q._normalized_text, list)
  })

  exactDuplicateIds = new Set()
  groups.forEach((ids) => {
    if (ids.length > 1) ids.forEach((id) => exactDuplicateIds.add(id))
  })
}

function isAnswerMissing(q) {
  const answer = String(q?.answer || "").trim()
  return !answer
}

function getDuplicateState(q) {
  if (exactDuplicateIds.has(q.id)) return "exact"
  if (fuzzySuggestionMap.has(q.id)) return "fuzzy"
  return ""
}

function getBaseFilteredQuestions() {
  let list = [...questions]

  if (!isAdmin) list = list.filter((q) => !q.hidden)
  if (f_grade.value) list = list.filter((q) => q.chapters?.subjects?.grades?.id == f_grade.value)
  if (f_subject.value) list = list.filter((q) => q.chapters?.subjects?.id == f_subject.value)
  if (f_chapter.value) list = list.filter((q) => q.chapter_id == f_chapter.value)
  if (f_type.value) list = list.filter((q) => q.question_type === f_type.value)
  if (f_difficulty.value) list = list.filter((q) => q.difficulty == f_difficulty.value)

  const creatorEl = document.getElementById("f_creator")
  if (creatorEl?.value) list = list.filter((q) => q.created_by === creatorEl.value)

  return list
}

function getFilteredQuestions() {
  let list = getBaseFilteredQuestions()

  if (duplicateStatusFilter?.value === "exact") list = list.filter((q) => getDuplicateState(q) === "exact")
  if (duplicateStatusFilter?.value === "fuzzy") list = list.filter((q) => getDuplicateState(q) === "fuzzy")
  if (duplicateStatusFilter?.value === "any") list = list.filter((q) => getDuplicateState(q))
  if (answerStatusFilter?.value === "missing") list = list.filter(isAnswerMissing)
  if (answerStatusFilter?.value === "complete") list = list.filter((q) => !isAnswerMissing(q))

  return list
}

function getScopeKey(items) {
  return (items || []).map((item) => item.id).sort().join("|")
}

function isFuzzyScopeFresh(items) {
  return fuzzyAuditScopeKey && fuzzyAuditScopeKey === getScopeKey(items)
}

function invalidateFuzzyAudit() {
  fuzzySuggestionMap = new Map()
  fuzzyAuditScopeKey = ""
  fuzzyAuditLabel = ""
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
          const duplicateState = getDuplicateState(q)
          const rowClass = [
            missingAnswer ? "row-missing-answer" : "",
            duplicateState === "exact" ? "row-duplicate-exact" : "",
            duplicateState === "fuzzy" ? "row-duplicate-fuzzy" : "",
          ].filter(Boolean).join(" ")
          const hiddenBadge = q.hidden ? `<span class="hidden-badge">Ẩn</span>` : ""
          const duplicateBadge = buildDuplicateBadge(q)
          const statusBadge = missingAnswer
            ? `<span class="status-badge status-missing">Chưa có đáp án</span>`
            : `<span class="status-badge status-ok">${q.question_type === "essay" ? "Không bắt buộc" : "Đã có đáp án"}</span>`

          return `
      <tr class="q-row ${rowClass}" onclick="editQ('${q.id}')" title="Click để sửa câu hỏi" ${hidden}>
        <td class="${faded}">${startIndex + i + 1}</td>
        <td class="questionCell ${faded}">
          <div class="questionText">${escapeHtml(q.question_text || "").replace(/\n/g, "<br>")}${hiddenBadge}</div>
          ${q.question_img ? `<div class="questionImgBox"><img class="questionImg" src="${q.question_img}" onclick="event.stopPropagation();window.open('${q.question_img}')"></div>` : ""}
        </td>
        <td class="${faded}">${q.chapters?.subjects?.grades?.name || ""}</td>
        <td class="${faded}">${q.chapters?.subjects?.name || ""}</td>
        <td class="${faded}">${q.chapters?.name || ""}</td>
        <td class="${faded}">${typeText[q.question_type] || q.question_type}</td>
        <td class="${faded}">${duplicateBadge}</td>
        <td class="${faded}">${statusBadge}</td>
        <td class="${faded}">${q.difficulty ?? ""}</td>
        <td class="${faded}">${q.answer_count || 0}</td>
        <td class="answerCell ${faded}">${escapeHtml(q.answer || "")}</td>
        <td class="${faded}" style="font-size:.78rem;color:var(--ink-mid);white-space:nowrap">${escapeHtml(q.creator?.full_name || "")}</td>
      </tr>`
        })
        .join("")
    : `<tr><td colspan="12" style="text-align:center;padding:28px;color:var(--ink-light)">Chưa có câu hỏi phù hợp với bộ lọc hiện tại.</td></tr>`

  document.querySelectorAll(".q-row").forEach((r) => {
    r.style.cursor = "pointer"
  })
  renderPagination(totalItems, totalPages, pageList.length, startIndex)
}

function buildDuplicateBadge(q) {
  const duplicateState = getDuplicateState(q)
  if (duplicateState === "exact") {
    return `<span class="status-badge dup-badge-exact" title="Trùng với ít nhất một câu khác sau khi chuẩn hóa nội dung.">Trùng tuyệt đối</span>`
  }

  if (duplicateState === "fuzzy") {
    const suggestions = fuzzySuggestionMap.get(q.id) || []
    const top = suggestions[0]
    const title = top
      ? `Câu gần nhất: ${(top.question_text || "").slice(0, 160).replace(/\n/g, " ")} (${Math.round(top.score * 100)}%)`
      : "Có câu gần giống sau khi kiểm tra trùng."
    return `<span class="status-badge dup-badge-fuzzy" title="${escapeHtml(title)}">Có thể trùng</span>`
  }

  return `<span class="status-badge dup-badge-clean">Chưa phát hiện</span>`
}

function renderPagination(totalItems, totalPages, visibleCount, startIndex) {
  const infoEl = document.getElementById("questionPagerInfo")
  const statusEl = document.getElementById("questionPagerStatus")
  const prevBtn = document.getElementById("questionPrevPage")
  const nextBtn = document.getElementById("questionNextPage")

  if (infoEl) {
    if (totalItems) {
      const suffix = fuzzyAuditLabel ? ` • ${fuzzyAuditLabel}` : ""
      infoEl.textContent = `Hiển thị ${startIndex + 1}-${startIndex + visibleCount} trên tổng ${totalItems} câu hỏi${suffix}`
    } else {
      infoEl.textContent = "Không có câu hỏi nào để hiển thị"
    }
  }

  if (statusEl) statusEl.textContent = `Trang ${currentPage}/${totalPages}`
  if (prevBtn) prevBtn.disabled = currentPage <= 1
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function sharesEnoughTokens(tokensA, tokensB) {
  let shared = 0
  for (const token of tokensA) {
    if (!tokensB.has(token)) continue
    shared += 1
    if (shared >= 2) return true
  }
  return false
}

function computeTokenJaccard(tokensA, tokensB) {
  if (!tokensA.size || !tokensB.size) return 0
  let intersection = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1
  }
  const union = new Set([...tokensA, ...tokensB]).size || 1
  return intersection / union
}

function buildNgrams(text, size = 3) {
  const compact = String(text || "").replace(/\s+/g, " ")
  const grams = new Set()
  if (!compact) return grams
  if (compact.length <= size) {
    grams.add(compact)
    return grams
  }
  for (let i = 0; i <= compact.length - size; i++) {
    grams.add(compact.slice(i, i + size))
  }
  return grams
}

function computeDiceSimilarity(a, b) {
  const gramsA = buildNgrams(a)
  const gramsB = buildNgrams(b)
  if (!gramsA.size || !gramsB.size) return 0

  let overlap = 0
  for (const gram of gramsA) {
    if (gramsB.has(gram)) overlap += 1
  }

  return (2 * overlap) / (gramsA.size + gramsB.size)
}

function computeSimilarity(snapshotA, snapshotB) {
  const tokenScore = computeTokenJaccard(snapshotA.token_set, snapshotB.token_set)
  const diceScore = computeDiceSimilarity(snapshotA.normalized_text, snapshotB.normalized_text)
  return (tokenScore * 0.55) + (diceScore * 0.45)
}

function isCandidatePair(snapshotA, snapshotB) {
  if (!snapshotA.normalized_text || !snapshotB.normalized_text) return false
  if (snapshotA.question_type !== snapshotB.question_type) return false

  const lenA = snapshotA.normalized_text.length
  const lenB = snapshotB.normalized_text.length
  if (Math.abs(lenA - lenB) > Math.max(24, Math.max(lenA, lenB) * 0.35)) return false
  if (!sharesEnoughTokens(snapshotA.token_set, snapshotB.token_set)) return false

  return true
}

function groupSnapshotsForFuzzy(items) {
  const groups = new Map()
  items.forEach((item) => {
    const snapshot = buildQuestionSnapshot(item)
    if (!snapshot.normalized_text) return
    const key = `${snapshot.question_type}|${snapshot.chapter_id || "all"}`
    const list = groups.get(key) || []
    list.push(snapshot)
    groups.set(key, list)
  })
  return groups
}

function computeFuzzySuggestions(items) {
  const results = new Map()
  const groups = groupSnapshotsForFuzzy(items)

  groups.forEach((snapshots) => {
    for (let i = 0; i < snapshots.length; i++) {
      for (let j = i + 1; j < snapshots.length; j++) {
        const a = snapshots[i]
        const b = snapshots[j]
        if (a.normalized_text === b.normalized_text) continue
        if (!isCandidatePair(a, b)) continue

        const score = computeSimilarity(a, b)
        if (score < FUZZY_THRESHOLD) continue

        pushSuggestion(results, a.id, { id: b.id, score, question_text: b.question_text })
        pushSuggestion(results, b.id, { id: a.id, score, question_text: a.question_text })
      }
    }
  })

  return results
}

function pushSuggestion(map, id, suggestion) {
  const list = map.get(id) || []
  if (list.some((item) => item.id === suggestion.id)) return
  list.push(suggestion)
  list.sort((a, b) => b.score - a.score)
  map.set(id, list.slice(0, MAX_FUZZY_RESULTS))
}

async function runDuplicateAudit() {
  const scopeQuestions = getBaseFilteredQuestions()
  const scopeKey = getScopeKey(scopeQuestions)

  if (!scopeQuestions.length) {
    fuzzySuggestionMap = new Map()
    fuzzyAuditScopeKey = scopeKey
    fuzzyAuditLabel = "Không có câu nào để kiểm tra trùng"
    render()
    return
  }

  fuzzySuggestionMap = computeFuzzySuggestions(scopeQuestions)
  fuzzyAuditScopeKey = scopeKey
  const count = fuzzySuggestionMap.size
  fuzzyAuditLabel = count
    ? `Đã gợi ý ${count} câu có thể trùng trong phạm vi đang lọc`
    : "Không phát hiện câu gần trùng trong phạm vi đang lọc"

  render()
}

function inspectImportedQuestions(importedQuestions) {
  const bankSnapshots = questions.map(buildQuestionSnapshot)
  return importedQuestions.map((question) => {
    const snapshot = buildQuestionSnapshot(question)
    const exactMatches = bankSnapshots.filter(
      (candidate) =>
        candidate.normalized_text &&
        candidate.normalized_text === snapshot.normalized_text &&
        candidate.question_type === snapshot.question_type
    )

    const fuzzyMatches = bankSnapshots
      .filter((candidate) => candidate.id && candidate.normalized_text !== snapshot.normalized_text && isCandidatePair(snapshot, candidate))
      .map((candidate) => ({
        id: candidate.id,
        score: computeSimilarity(snapshot, candidate),
        question_text: candidate.question_text,
      }))
      .filter((candidate) => candidate.score >= FUZZY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_FUZZY_RESULTS)

    return {
      ...question,
      _duplicateMeta: {
        exactMatches,
        fuzzyMatches,
      },
    }
  })
}

function exposeDuplicateHelpers() {
  window.QuestionDuplicateShared = {
    normalizeDuplicateText,
    inspectImportedQuestions,
    runDuplicateAudit,
    getQuestionBankSnapshot: () => questions.map(buildQuestionSnapshot),
  }
  window.runDuplicateAudit = runDuplicateAudit
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
      alert("Lỗi kiểm tra đề thi: " + checkErr.message)
      return
    }

    if (usages.length > 0) {
      const examNames = [...new Set(usages.map((u) => u.exams?.title || u.exam_id).filter(Boolean))]
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

    const answerDeleteRes = await sb.from("exam_answers").delete().eq("question_id", id)
    if (answerDeleteRes.error) {
      alert(
        "Không xóa được các bài làm gắn với câu hỏi này: " +
          answerDeleteRes.error.message
      )
      return
    }

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
