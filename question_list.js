let grades = []
let questions = []
let editingQuestionId = null
let isAdmin = false
let currentRole = ""
let currentPage = 1
const PAGE_SIZE = 25
const FUZZY_THRESHOLD = 0.86
const MAX_FUZZY_RESULTS = 3

const formTitle = document.getElementById("formTitle")
const saveBtn = document.getElementById("saveBtn")
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
let duplicateReviewGroups = []
let selectedQuestionIds = new Set()
const questionPageParams = new URLSearchParams(window.location.search)

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

  questions = (data || []).map(prepareQuestionRecord)
  recomputeExactDuplicates()
  invalidateFuzzyAudit()
  exposeDuplicateHelpers()
  updateQuickActionStats()
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

function updateQuickActionStats() {
  const missingEl = document.getElementById("quickMissingCount")
  const duplicateEl = document.getElementById("quickDuplicateCount")
  if (missingEl) missingEl.textContent = `${questions.filter(isAnswerMissing).length} câu`
  if (duplicateEl) duplicateEl.textContent = `${exactDuplicateIds.size} câu`
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

  if (answerStatusFilter?.value === "missing") list = list.filter(isAnswerMissing)
  if (answerStatusFilter?.value === "complete") list = list.filter((q) => !isAnswerMissing(q))

  return list
}

function getVisiblePageQuestions() {
  const list = getFilteredQuestions()
  const startIndex = (currentPage - 1) * PAGE_SIZE
  return list.slice(startIndex, startIndex + PAGE_SIZE)
}

function pruneQuestionSelection() {
  const validIds = new Set(questions.map((q) => q.id))
  selectedQuestionIds.forEach((id) => {
    if (!validIds.has(id)) selectedQuestionIds.delete(id)
  })
}

function syncAdminQuestionUi() {
  const bulkBar = document.getElementById("bulkBar")
  const selectCol = document.getElementById("questionSelectCol")
  if (bulkBar) bulkBar.style.display = isAdmin ? "" : "none"
  if (selectCol) selectCol.style.display = isAdmin ? "" : "none"
  if (!isAdmin) selectedQuestionIds.clear()
}

function updateBulkBar(pageList = getVisiblePageQuestions()) {
  const bar = document.getElementById("bulkBar")
  const summary = document.getElementById("bulkSelectionSummary")
  const selectPage = document.getElementById("bulkSelectPage")
  const hideBtn = document.getElementById("bulkHideBtn")
  const restoreBtn = document.getElementById("bulkRestoreBtn")
  const deleteBtn = document.getElementById("bulkDeleteBtn")
  if (!bar || !summary || !selectPage) return
  if (!isAdmin) {
    bar.classList.add("hidden")
    return
  }

  const selectedCount = selectedQuestionIds.size
  bar.classList.toggle("hidden", !questions.length)
  const selectedItems = questions.filter((q) => selectedQuestionIds.has(q.id))
  const hiddenCount = selectedItems.filter((q) => q.hidden).length
  const visibleCount = selectedItems.filter((q) => !q.hidden).length
  const visibleIds = pageList.map((q) => q.id)
  const checkedOnPage = visibleIds.length > 0 && visibleIds.every((id) => selectedQuestionIds.has(id))
  selectPage.checked = checkedOnPage
  selectPage.indeterminate = !checkedOnPage && visibleIds.some((id) => selectedQuestionIds.has(id))
  if (hideBtn) hideBtn.disabled = visibleCount === 0
  if (restoreBtn) {
    restoreBtn.disabled = hiddenCount === 0
    restoreBtn.style.display = isAdmin ? "" : "none"
  }
  if (deleteBtn) deleteBtn.textContent = isAdmin ? "Xoa da chon" : "An da chon"

  if (!selectedCount) {
    summary.textContent = "Chưa chọn câu nào."
    return
  }

  summary.textContent =
    `Đã chọn ${selectedCount} câu` +
    (hiddenCount ? ` • ${hiddenCount} câu đang ẩn` : "") +
    (!isAdmin ? " • Xóa sẽ chuyển thành ẩn" : "")
}

function toggleQuestionSelection(id, force) {
  const shouldSelect = typeof force === "boolean" ? force : !selectedQuestionIds.has(id)
  if (shouldSelect) selectedQuestionIds.add(id)
  else selectedQuestionIds.delete(id)
  updateBulkBar()
}

window.toggleQuestionSelection = toggleQuestionSelection

function clearQuestionSelection() {
  selectedQuestionIds.clear()
  document.querySelectorAll(".row-selector").forEach((input) => {
    input.checked = false
  })
  updateBulkBar()
}

window.clearQuestionSelection = clearQuestionSelection

function toggleSelectVisible(force) {
  const pageList = getVisiblePageQuestions()
  pageList.forEach((q) => {
    if (force) selectedQuestionIds.add(q.id)
    else selectedQuestionIds.delete(q.id)
  })
  render()
}

function getSelectedQuestions() {
  return questions.filter((q) => selectedQuestionIds.has(q.id))
}

async function hideSelectedQuestions() {
  const selected = getSelectedQuestions().filter((q) => !q.hidden)
  if (!selected.length) {
    alert("Chưa có câu nào phù hợp để ẩn.")
    return
  }
  if (!confirm(`Ẩn ${selected.length} câu đã chọn?`)) return
  const ids = selected.map((q) => q.id)
  const res = await sb.from("question_bank").update({ hidden: true }).in("id", ids)
  if (res.error) {
    alert(res.error.message)
    return
  }
  if (isAdmin) {
    await window.AppAdminTools?.recordAudit?.("question_bulk_hide", {
      target_type: "question",
      question_ids: ids,
      total: ids.length,
    })
  }
  clearQuestionSelection()
  loadQuestions()
}

async function restoreSelectedQuestions() {
  const selected = getSelectedQuestions().filter((q) => q.hidden)
  if (!selected.length) {
    alert("Không có câu ẩn nào trong phần đã chọn để khôi phục.")
    return
  }
  if (!confirm(`Khôi phục ${selected.length} câu đã chọn?`)) return
  const ids = selected.map((q) => q.id)
  const res = await sb.from("question_bank").update({ hidden: false }).in("id", ids)
  if (res.error) {
    alert(res.error.message)
    return
  }
  if (isAdmin) {
    await window.AppAdminTools?.recordAudit?.("question_bulk_restore", {
      target_type: "question",
      question_ids: ids,
      total: ids.length,
    })
  }
  clearQuestionSelection()
  loadQuestions()
}

async function deleteSelectedQuestions() {
  const selected = getSelectedQuestions()
  if (!selected.length) {
    alert("Chưa chọn câu nào để xóa.")
    return
  }

  if (!isAdmin) {
    return hideSelectedQuestions()
  }

  if (
    !confirm(
      `Đang chọn ${selected.length} câu. Hệ thống sẽ bỏ qua các câu còn nằm trong đề thi và xóa vĩnh viễn các câu hợp lệ. Tiếp tục?`
    )
  ) {
    return
  }

  const ids = selected.map((q) => q.id)
  const { data: usages, error: usageError } = await sb
    .from("exam_questions")
    .select("question_id")
    .in("question_id", ids)

  if (usageError) {
    alert("Lỗi kiểm tra đề thi: " + usageError.message)
    return
  }

  const blockedIds = new Set((usages || []).map((item) => item.question_id))
  const deletableIds = ids.filter((id) => !blockedIds.has(id))

  if (!deletableIds.length) {
    alert("Tất cả các câu đã chọn đều đang nằm trong đề thi, chưa thể xóa.")
    return
  }

  const answerDeleteRes = await sb.from("exam_answers").delete().in("question_id", deletableIds)
  if (answerDeleteRes.error) {
    alert("Không xóa được bài làm gắn với các câu đã chọn: " + answerDeleteRes.error.message)
    return
  }

  const deleteRes = await sb.from("question_bank").delete().in("id", deletableIds)
  if (deleteRes.error) {
    alert("Không thể xóa câu hỏi: " + deleteRes.error.message)
    return
  }

  await window.AppAdminTools?.recordAudit?.("question_bulk_delete", {
    target_type: "question",
    question_ids: deletableIds,
    blocked_question_ids: [...blockedIds],
    deleted_total: deletableIds.length,
    blocked_total: blockedIds.size,
  })

  clearQuestionSelection()
  await loadQuestions()
  alert(
    blockedIds.size
      ? `Đã xóa ${deletableIds.length} câu. Bỏ qua ${blockedIds.size} câu vì vẫn đang nằm trong đề thi.`
      : `Đã xóa ${deletableIds.length} câu đã chọn.`
  )
}

window.hideSelectedQuestions = hideSelectedQuestions
window.restoreSelectedQuestions = restoreSelectedQuestions
window.deleteSelectedQuestions = deleteSelectedQuestions

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
  duplicateReviewGroups = []
  closeDuplicateReview()
}

function render() {
  const list = getFilteredQuestions()
  const totalItems = list.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  currentPage = Math.min(currentPage, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pageList = list.slice(startIndex, startIndex + PAGE_SIZE)
  pruneQuestionSelection()

  questionTable.innerHTML = pageList.length
    ? pageList
        .map((q, i) => {
          const faded = q.hidden ? "faded" : ""
          const hidden = q.hidden ? `style="opacity:.45"` : ""
          const missingAnswer = isAnswerMissing(q)
          const checked = selectedQuestionIds.has(q.id) ? "checked" : ""
          const rowClass = [
            missingAnswer ? "row-missing-answer" : "",
          ].filter(Boolean).join(" ")
          const hiddenBadge = q.hidden ? `<span class="hidden-badge">Ẩn</span>` : ""
          const statusBadge = missingAnswer
            ? `<span class="status-badge status-missing">Chưa có đáp án</span>`
            : `<span class="status-badge status-ok">${q.question_type === "essay" ? "Không bắt buộc" : "Đã có đáp án"}</span>`

          return `
      <tr class="q-row ${rowClass}" onclick="editQ('${q.id}')" title="Click để sửa câu hỏi" ${hidden}>
        ${isAdmin ? `<td class="selectCol ${faded}" onclick="event.stopPropagation()">
          <input type="checkbox" class="row-selector" ${checked} onchange="toggleQuestionSelection('${q.id}', this.checked)">
        </td>` : ""}
        <td class="${faded}">${startIndex + i + 1}</td>
        <td class="questionCell ${faded}">
          <div class="questionText">${escapeHtml(q.question_text || "").replace(/\n/g, "<br>")}${hiddenBadge}</div>
          ${q.question_img ? `<div class="questionImgBox"><img class="questionImg" src="${q.question_img}" onclick="event.stopPropagation();window.open('${q.question_img}')"></div>` : ""}
        </td>
        <td class="${faded}">${q.chapters?.subjects?.grades?.name || ""}</td>
        <td class="${faded}">${q.chapters?.subjects?.name || ""}</td>
        <td class="${faded}">${q.chapters?.name || ""}</td>
        <td class="${faded}">${typeText[q.question_type] || q.question_type}</td>
        <td class="${faded}">${statusBadge}</td>
        <td class="${faded}">${q.difficulty ?? ""}</td>
        <td class="${faded}">${q.answer_count || 0}</td>
        <td class="answerCell ${faded}">${escapeHtml(q.answer || "")}</td>
        <td class="${faded}" style="font-size:.78rem;color:var(--ink-mid);white-space:nowrap">${escapeHtml(q.creator?.full_name || "")}</td>
      </tr>`
        })
        .join("")
    : `<tr><td colspan="${isAdmin ? 12 : 11}" style="text-align:center;padding:28px;color:var(--ink-light)">Chưa có câu hỏi phù hợp với bộ lọc hiện tại.</td></tr>`

  document.querySelectorAll(".q-row").forEach((r) => {
    r.style.cursor = "pointer"
  })
  updateQuickActionStats()
  updateBulkBar(pageList)
  renderPagination(totalItems, totalPages, pageList.length, startIndex)
}

function scoreKeepCandidate(q) {
  let score = 0
  if (!isAnswerMissing(q)) score += 4
  if (q.question_img) score += 2
  if (q.hidden) score -= 2
  if (q.difficulty) score += 1
  return score
}

function buildDuplicateReviewGroups(items) {
  const itemMap = new Map(items.map((item) => [item.id, item]))
  const adjacency = new Map()
  const addEdge = (a, b) => {
    if (!itemMap.has(a) || !itemMap.has(b) || a === b) return
    if (!adjacency.has(a)) adjacency.set(a, new Set())
    if (!adjacency.has(b)) adjacency.set(b, new Set())
    adjacency.get(a).add(b)
    adjacency.get(b).add(a)
  }

  const exactBuckets = new Map()
  items.forEach((item) => {
    if (!item._normalized_text) return
    const bucket = exactBuckets.get(item._normalized_text) || []
    bucket.push(item.id)
    exactBuckets.set(item._normalized_text, bucket)
  })

  exactBuckets.forEach((ids) => {
    if (ids.length < 2) return
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) addEdge(ids[i], ids[j])
    }
  })

  fuzzySuggestionMap.forEach((suggestions, id) => {
    suggestions.forEach((suggestion) => addEdge(id, suggestion.id))
  })

  const visited = new Set()
  const groups = []
  items.forEach((item) => {
    if (visited.has(item.id) || !adjacency.has(item.id)) return
    const queue = [item.id]
    const ids = []
    while (queue.length) {
      const current = queue.shift()
      if (visited.has(current)) continue
      visited.add(current)
      ids.push(current)
      ;(adjacency.get(current) || []).forEach((neighbor) => {
        if (!visited.has(neighbor)) queue.push(neighbor)
      })
    }

    if (ids.length < 2) return

    const members = ids
      .map((id) => itemMap.get(id))
      .filter(Boolean)
      .sort((a, b) => scoreKeepCandidate(b) - scoreKeepCandidate(a))

    const recommendedId = members[0]?.id || ""
    const hasExact = members.some((member) => exactDuplicateIds.has(member.id))
    groups.push({
      kind: hasExact ? "exact" : "fuzzy",
      members,
      recommendedId,
    })
  })

  groups.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "exact" ? -1 : 1
    return b.members.length - a.members.length
  })
  return groups
}

function renderDuplicateReview() {
  const wrap = document.getElementById("duplicateReview")
  const summary = document.getElementById("duplicateReviewSummary")
  const groupsEl = document.getElementById("duplicateReviewGroups")
  if (!wrap || !summary || !groupsEl) return

  if (!duplicateReviewGroups.length) {
    wrap.style.display = "block"
    summary.textContent = fuzzyAuditLabel || "KhÃ´ng phÃ¡t hiá»‡n cÃ¢u trÃ¹ng trong pháº¡m vi Ä‘ang lá»c."
    groupsEl.innerHTML = `
      <div class="dup-group">
        <div class="dup-group-hd">
          <div style="font-weight:700;color:var(--navy)">KhÃ´ng cÃ³ nhÃ³m trÃ¹ng nÃ o</div>
          <div style="font-size:.8rem;color:var(--ink-light)">Há»‡ thá»‘ng Ä‘Ã£ cháº¡y kiá»ƒm tra trong pháº¡m vi hiá»‡n táº¡i.</div>
        </div>
      </div>
    `
    return
  }

  wrap.style.display = "block"
  summary.textContent = `Có ${duplicateReviewGroups.length} nhóm câu trùng/có thể trùng trong phạm vi đang lọc.`
  groupsEl.innerHTML = duplicateReviewGroups
    .map((group, index) => {
      const groupLabel = group.kind === "exact" ? "Trùng tuyệt đối" : "Có thể trùng"
      return `
        <div class="dup-group">
          <div class="dup-group-hd">
            <div style="font-weight:700;color:var(--navy)">Nhóm ${index + 1} • ${groupLabel}</div>
            <div style="font-size:.8rem;color:var(--ink-light)">${group.members.length} câu đứng cạnh nhau để rà nhanh</div>
          </div>
          <div class="dup-group-list">
            ${group.members.map((member) => renderDuplicateReviewItem(member, group)).join("")}
          </div>
        </div>
      `
    })
    .join("")
}

function renderDuplicateReviewItem(member, group) {
  const recommended = member.id === group.recommendedId
  const dupState = getDuplicateState(member)
  const dupLabel = dupState === "exact" ? "Trùng tuyệt đối" : dupState === "fuzzy" ? "Có thể trùng" : "Liên quan"
  return `
    <div class="dup-item ${recommended ? "recommended" : ""}">
      <div>
        <div class="dup-item-title">
          <span>${recommended ? "Gợi ý giữ lại" : "Câu cần so"}</span>
          <span class="status-badge ${dupState === "exact" ? "dup-badge-exact" : dupState === "fuzzy" ? "dup-badge-fuzzy" : "dup-badge-clean"}">${dupLabel}</span>
        </div>
        <div class="dup-item-text">${escapeHtml(member.question_text || "").replace(/\n/g, "<br>")}</div>
      </div>
      <div class="dup-meta">Môn<br><b>${escapeHtml(member.chapters?.subjects?.name || "")}</b></div>
      <div class="dup-meta">Chương<br><b>${escapeHtml(member.chapters?.name || "")}</b></div>
      <div class="dup-meta">Đáp án<br><b>${escapeHtml(member.answer || "(trống)")}</b></div>
      <div class="dup-actions">
        <button type="button" class="dup-mini" onclick="event.stopPropagation();editQ('${member.id}')">Sửa</button>
        <button type="button" class="dup-mini" onclick="event.stopPropagation();deleteQ('${member.id}')">Xóa</button>
      </div>
    </div>
  `
}

function closeDuplicateReview() {
  const wrap = document.getElementById("duplicateReview")
  if (wrap) wrap.style.display = "none"
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
    duplicateReviewGroups = []
    render()
    renderDuplicateReview()
    return
  }

  fuzzySuggestionMap = computeFuzzySuggestions(scopeQuestions)
  fuzzyAuditScopeKey = scopeKey
  duplicateReviewGroups = buildDuplicateReviewGroups(scopeQuestions)
  const count = fuzzySuggestionMap.size
  fuzzyAuditLabel = count
    ? `Đã gợi ý ${count} câu có thể trùng trong phạm vi đang lọc`
    : "Không phát hiện câu gần trùng trong phạm vi đang lọc"

  render()
  renderDuplicateReview()
  document.getElementById("duplicateReview")?.scrollIntoView({ behavior: "smooth", block: "start" })
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
  window.closeDuplicateReview = closeDuplicateReview
}

function applyQueryFilters() {
  const answerFilter = questionPageParams.get("answer")
  if (answerFilter === "missing" && answerStatusFilter) {
    answerStatusFilter.value = "missing"
  }
}

window.applyQuickQuestionAction = function (action) {
  if (action === "missing" && answerStatusFilter) {
    answerStatusFilter.value = "missing"
    resetToFirstPage()
    render()
    return
  }
  if (action === "duplicates") runDuplicateAudit()
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

    const outcome = await window.AppAdminTools?.runAdminAction?.({
      action: "question_delete",
      details: {
        target_type: "question",
        target_id: id,
      },
      errorPrefix: "Không thể xóa câu hỏi",
      operation: async () => {
        const answerDeleteRes = await sb.from("exam_answers").delete().eq("question_id", id)
        if (answerDeleteRes.error) {
          throw new Error(
            "Không xóa được các bài làm gắn với câu hỏi này: " +
              answerDeleteRes.error.message
          )
        }
        const res = await sb.from("question_bank").delete().eq("id", id)
        if (res.error) throw res.error
        return true
      },
    })
    if (!outcome?.ok) return
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
  currentRole = data?.role || ""
  isAdmin = currentRole === "admin"
  syncAdminQuestionUi()
}

async function init() {
  await getUserRole()
  applyQueryFilters()
  await loadGrades()
  await loadCreatorFilter()
  await loadQuestions()
  if (questionPageParams.get("focus") === "duplicates") {
    setTimeout(() => runDuplicateAudit(), 180)
  }
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

document.getElementById("bulkSelectPage")?.addEventListener("change", (event) => {
  toggleSelectVisible(Boolean(event.target?.checked))
})

document.getElementById("duplicateReview")?.addEventListener("click", (event) => {
  if (event.target?.id === "duplicateReview") closeDuplicateReview()
})

init()
