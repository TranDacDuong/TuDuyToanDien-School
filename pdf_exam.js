const PDF_STATE = {
  user: null,
  role: "student",
  grades: [],
  subjects: [],
  exams: [],
  questions: [],
  results: [],
  answers: [],
  draftQuestions: [],
  editingExamId: null,
  activeExamId: null,
  attemptExamId: null,
  attemptResultId: null,
  attemptSeconds: 0,
  attemptTimer: null,
  attemptAnswers: {},
  classId: null,
  courseId: null,
};

const PDF_TYPE_ORDER = ["multi_choice", "true_false", "short_answer", "essay"];

const PDF_EL = {
  toolbar: document.getElementById("toolbar"),
  keyword: document.getElementById("keyword"),
  gradeFilter: document.getElementById("gradeFilter"),
  subjectFilter: document.getElementById("subjectFilter"),
  statusFilter: document.getElementById("statusFilter"),
  reloadBtn: document.getElementById("reloadPdfExamBtn"),
  openBtn: document.getElementById("openPdfExamBtn"),
  grid: document.getElementById("pdfExamGrid"),
  empty: document.getElementById("pdfExamEmpty"),
  adminToolbar: document.getElementById("adminToolbar"),
  examModal: document.getElementById("pdfExamModal"),
  examModalTitle: document.getElementById("pdfExamModalTitle"),
  examForm: document.getElementById("pdfExamForm"),
  examTitle: document.getElementById("pdfExamTitle"),
  examStatus: document.getElementById("pdfExamStatus"),
  examGrade: document.getElementById("pdfExamGrade"),
  examSubject: document.getElementById("pdfExamSubject"),
  examDuration: document.getElementById("pdfExamDuration"),
  examTotal: document.getElementById("pdfExamTotal"),
  examDriveInput: document.getElementById("pdfExamDriveInput"),
  examDescription: document.getElementById("pdfExamDescription"),
  draftQuestionList: document.getElementById("pdfDraftQuestionList"),
  openDraftQuestionBtn: document.getElementById("openPdfDraftQuestionBtn"),
  removeDraftQuestionBtn: document.getElementById("removePdfDraftQuestionBtn"),
  screen: document.getElementById("pdfExamScreen"),
  screenTitle: document.getElementById("pdfExamScreenTitle"),
  summaryChips: document.getElementById("pdfExamSummaryChips"),
  summaryText: document.getElementById("pdfExamSummaryText"),
  summaryMeta: document.getElementById("pdfExamSummaryMeta"),
  openDriveBtn: document.getElementById("pdfExamOpenDriveBtn"),
  submissionBtn: document.getElementById("pdfExamSubmissionBtn"),
  addQuestionBtn: document.getElementById("pdfExamAddQuestionBtn"),
  editBtn: document.getElementById("pdfExamEditBtn"),
  takeBtn: document.getElementById("pdfExamTakeBtn"),
  questionList: document.getElementById("pdfQuestionList"),
  submissionModal: document.getElementById("pdfSubmissionModal"),
  submissionTitle: document.getElementById("pdfSubmissionTitle"),
  submissionBody: document.getElementById("pdfSubmissionBody"),
  attemptShell: document.getElementById("pdfAttemptShell"),
  attemptTitle: document.getElementById("pdfAttemptTitle"),
  attemptClock: document.getElementById("pdfAttemptClock"),
  submitBtn: document.getElementById("pdfSubmitBtn"),
  attemptNav: document.getElementById("pdfAttemptNav"),
  attemptQuestions: document.getElementById("pdfAttemptQuestions"),
  pdfFrame: document.getElementById("pdfDriveFrame"),
  reviewShell: document.getElementById("pdfReviewShell"),
  reviewTitle: document.getElementById("pdfReviewTitle"),
  reviewScore: document.getElementById("pdfReviewScore"),
  reviewFrame: document.getElementById("pdfReviewFrame"),
  reviewQuestions: document.getElementById("pdfReviewQuestions"),
  pdfPaneLabel: document.getElementById("pdfPaneLabel"),
  pdfPaneOpenLink: document.getElementById("pdfPaneOpenLink"),
  detailFrame: document.getElementById("pdfDetailFrame"),
  detailPaneLabel: document.getElementById("pdfDetailPaneLabel"),
  detailPaneOpenLink: document.getElementById("pdfDetailPaneOpenLink"),
};

function setPdfRouteLoading(active) {
  document.documentElement.classList.toggle("pdf-route-loading", !!active);
}

bindPdfEvents();
initPdfExam();

function bindPdfEvents() {
  PDF_EL.openBtn?.addEventListener("click", () => openPdfExamModal());
  PDF_EL.reloadBtn?.addEventListener("click", () => loadPdfData(true));
  PDF_EL.examForm?.addEventListener("submit", submitPdfExamForm);
  PDF_EL.openDraftQuestionBtn?.addEventListener("click", addPdfDraftQuestionInline);
  PDF_EL.removeDraftQuestionBtn?.addEventListener("click", removeLastPdfDraftQuestion);
  PDF_EL.editBtn?.addEventListener("click", () => PDF_STATE.activeExamId && openPdfExamModal(PDF_STATE.activeExamId));
  PDF_EL.addQuestionBtn?.addEventListener("click", () => PDF_STATE.activeExamId && openPdfExamModal(PDF_STATE.activeExamId));
  PDF_EL.takeBtn?.addEventListener("click", () => PDF_STATE.activeExamId && openPdfAttempt(PDF_STATE.activeExamId));
  PDF_EL.submissionBtn?.addEventListener("click", () => PDF_STATE.activeExamId && openPdfSubmissions(PDF_STATE.activeExamId));
  PDF_EL.submitBtn?.addEventListener("click", () => submitPdfAttempt(false));
  [PDF_EL.keyword, PDF_EL.gradeFilter, PDF_EL.subjectFilter, PDF_EL.statusFilter].forEach((el) => {
    el?.addEventListener("input", renderPdfExamGrid);
    el?.addEventListener("change", renderPdfExamGrid);
  });
  PDF_EL.gradeFilter?.addEventListener("change", () => fillPdfSubjects(PDF_EL.subjectFilter, PDF_EL.gradeFilter.value, "Tất cả môn"));
  PDF_EL.examGrade?.addEventListener("change", () => fillPdfSubjects(PDF_EL.examSubject, PDF_EL.examGrade.value, "Chọn môn"));
}

async function initPdfExam() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    location.href = "index.html";
    return;
  }

  PDF_STATE.user = user;

  const [{ data: profile }, { data: grades }, { data: subjects }] = await Promise.all([
    sb.from("users").select("role").eq("id", user.id).single(),
    sb.from("grades").select("id,name").order("name"),
    sb.from("subjects").select("id,name,grade_id").order("name"),
  ]);

  PDF_STATE.role = profile?.role || "student";
  PDF_STATE.grades = grades || [];
  PDF_STATE.subjects = subjects || [];

  fillPdfGrades(PDF_EL.gradeFilter, "Tất cả khối");
  fillPdfGrades(PDF_EL.examGrade, "Chọn khối");
  fillPdfSubjects(PDF_EL.subjectFilter, "", "Tất cả môn");
  fillPdfSubjects(PDF_EL.examSubject, "", "Chọn môn");

  if (PDF_STATE.role === "admin" || PDF_STATE.role === "teacher") {
    if (PDF_EL.adminToolbar) PDF_EL.adminToolbar.style.display = "";
  } else {
    if (PDF_EL.statusFilter) {
      PDF_EL.statusFilter.value = "open";
      PDF_EL.statusFilter.classList.add("hidden");
    }
    if (PDF_EL.toolbar) PDF_EL.toolbar.style.gridTemplateColumns = "1.2fr repeat(2,minmax(150px,220px)) auto";
  }

  await loadPdfData(false);
  handlePdfRouteParams();
}

function handlePdfRouteParams() {
  const params = new URLSearchParams(location.search);
  PDF_STATE.classId = params.get("classId") || null;
  PDF_STATE.courseId = params.get("courseId") || null;
  const examId = params.get("exam");
  const action = params.get("action");
  const resultId = params.get("resultId");
  if (!examId && action === "create" && (PDF_STATE.role === "admin" || PDF_STATE.role === "teacher")) {
    setPdfRouteLoading(false);
    openPdfExamModal();
    return;
  }
  if (!examId) {
    setPdfRouteLoading(false);
    return;
  }
  if (action === "edit" && (PDF_STATE.role === "admin" || PDF_STATE.role === "teacher")) {
    setPdfRouteLoading(false);
    openPdfExamModal(examId);
    return;
  }
  if (action === "review" && resultId) {
    const title = PDF_STATE.exams.find((item) => item.id === examId)?.title || "Đề PDF";
    openPdfReview(resultId, title);
    return;
  }
  if (PDF_STATE.role === "student") openPdfAttempt(examId);
  else openPdfExamScreen(examId);
}

async function loadPdfData(reopenScreen) {
  const examQuery = PDF_STATE.role === "student"
    ? sb.from("pdf_exams").select("*").eq("status", "open").order("created_at", { ascending: false })
    : sb.from("pdf_exams").select("*").order("created_at", { ascending: false });

  const baseResult = sb.from("pdf_exam_results").select("*");
  if (PDF_STATE.classId) baseResult.eq("class_id", PDF_STATE.classId);
  if (PDF_STATE.courseId) baseResult.eq("course_id", PDF_STATE.courseId);
  const resultQuery = PDF_STATE.role === "student"
    ? baseResult.eq("student_id", PDF_STATE.user.id).order("attempt_no", { ascending: false })
    : baseResult.order("submitted_at", { ascending: false });

  const [{ data: exams, error: examErr }, { data: questions, error: questionErr }, { data: results, error: resultErr }, { data: answers, error: answerErr }] = await Promise.all([
    examQuery,
    sb.from("pdf_exam_questions").select("*").order("order_no"),
    resultQuery,
    sb.from("pdf_exam_answers").select("*"),
  ]);

  const firstError = examErr || questionErr || resultErr || answerErr;
  if (firstError) {
    setPdfRouteLoading(false);
    PDF_EL.grid.innerHTML = `<div class="empty"><strong>Không tải được Đề PDF</strong><div>${esc(firstError.message)}</div></div>`;
    PDF_EL.empty.style.display = "none";
    return;
  }

  PDF_STATE.exams = exams || [];
  PDF_STATE.questions = questions || [];
  PDF_STATE.results = results || [];
  PDF_STATE.answers = answers || [];
  renderPdfExamGrid();

  if (PDF_STATE.activeExamId && reopenScreen !== false) openPdfExamScreen(PDF_STATE.activeExamId);
}

function fillPdfGrades(el, placeholder) {
  if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>` + PDF_STATE.grades.map((grade) => `<option value="${grade.id}">${esc(grade.name)}</option>`).join("");
}

function fillPdfSubjects(el, gradeId, placeholder) {
  if (!el) return;
  const list = gradeId ? PDF_STATE.subjects.filter((subject) => subject.grade_id === gradeId) : PDF_STATE.subjects;
  el.innerHTML = `<option value="">${placeholder}</option>` + list.map((subject) => `<option value="${subject.id}">${esc(subject.name)}</option>`).join("");
}

function getPdfQuestions(examId) {
  return PDF_STATE.questions.filter((q) => q.pdf_exam_id === examId).sort((a, b) => (a.order_no || 0) - (b.order_no || 0));
}

function getStudentResults(examId) {
  return PDF_STATE.results
    .filter((result) => result.pdf_exam_id === examId && result.student_id === PDF_STATE.user.id)
    .sort((a, b) => (b.attempt_no || 0) - (a.attempt_no || 0));
}

function getStudentLatestSubmitted(examId) {
  return getStudentResults(examId).find((result) => result.submitted_at) || null;
}

function typeLabel(type) {
  return ({
    multi_choice: "Trắc nghiệm",
    true_false: "Đúng / Sai",
    short_answer: "Trả lời ngắn",
    essay: "Tự luận",
  })[type] || type;
}

function fmtDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("vi-VN");
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(value) {
  return esc(value).replace(/`/g, "&#96;");
}

function linkify(text) {
  return String(text || "").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function parseDriveInput(input) {
  const value = String(input || "").trim();
  if (!value) return { fileId: "", previewUrl: "" };
  const patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/, /^([a-zA-Z0-9_-]{20,})$/];
  let fileId = "";
  patterns.some((pattern) => {
    const match = value.match(pattern);
    if (match) {
      fileId = match[1];
      return true;
    }
    return false;
  });
  return { fileId, previewUrl: fileId ? `https://drive.google.com/file/d/${fileId}/preview` : "" };
}

function getPdfPreviewUrl(exam) {
  return exam?.drive_preview_url || `https://drive.google.com/file/d/${encodeURIComponent(exam.drive_file_id)}/preview`;
}

function getPdfOpenUrl(exam) {
  return `https://drive.google.com/file/d/${encodeURIComponent(exam.drive_file_id)}/view`;
}

function normalizePdfQuestionType(type) {
  return PDF_TYPE_ORDER.includes(type) ? type : "multi_choice";
}

function getPdfQuestionDefaultsByType(type, count = 4) {
  const safeCount = Math.max(1, count);
  if (type === "true_false") {
    return {
      points: 1,
      answer_count: safeCount,
      answer: Array.from({ length: safeCount }, (_, idx) => `${String.fromCharCode(97 + idx)}Đ`).join(""),
      partial_points: safeCount === 4 ? { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1 } : Object.fromEntries(Array.from({ length: safeCount + 1 }, (_, idx) => [idx, idx === safeCount ? 1 : 0])),
    };
  }
  if (type === "short_answer") {
    return { points: 0.5, answer_count: safeCount, answer: "", partial_points: Object.fromEntries(Array.from({ length: safeCount + 1 }, (_, idx) => [idx, idx === safeCount ? 0.5 : 0])) };
  }
  if (type === "essay") {
    return { points: 0.5, answer_count: 1, answer: "", partial_points: null };
  }
  return { points: 0.25, answer_count: safeCount, answer: "A", partial_points: Object.fromEntries(Array.from({ length: safeCount + 1 }, (_, idx) => [idx, idx === safeCount ? 0.25 : 0])) };
}

function getPdfDefaultQuestion(order) {
  const defaults = getPdfQuestionDefaultsByType("multi_choice", 4);
  return { id: crypto.randomUUID(), order_no: order, label: `Câu ${order}`, question_type: "multi_choice", question_text: null, answer: defaults.answer, answer_count: defaults.answer_count, points: defaults.points, partial_points: defaults.partial_points };
}

function buildPdfPartialDefaults(type, count, points, existing) {
  const current = { ...(existing || {}) };
  const partial = {};
  if (type === "true_false" && count === 4) {
    partial[0] = Number(current[0] ?? 0);
    partial[1] = Number(current[1] ?? 0.1);
    partial[2] = Number(current[2] ?? 0.25);
    partial[3] = Number(current[3] ?? 0.5);
    partial[4] = Number(current[4] ?? 1);
    return partial;
  }
  for (let idx = 0; idx <= count; idx += 1) partial[idx] = Number(current[idx] ?? (idx === count ? points : 0));
  return partial;
}

function normalizePdfDraftAnswer(type, answer, count) {
  if (type === "essay") return "";
  if (type === "multi_choice") {
    const allowed = Array.from({ length: count }, (_, idx) => String.fromCharCode(65 + idx));
    const current = String(answer || "").toUpperCase().split("").filter((letter, idx, arr) => allowed.includes(letter) && arr.indexOf(letter) === idx).join("");
    return current || "A";
  }
  if (type === "true_false") {
    const map = {};
    const raw = String(answer || "");
    for (let idx = 0; idx < raw.length; idx += 2) map[raw[idx]?.toLowerCase()] = raw[idx + 1] || "Đ";
    return Array.from({ length: count }, (_, idx) => {
      const key = String.fromCharCode(97 + idx);
      return `${key}${map[key] || "Đ"}`;
    }).join("");
  }
  const values = String(answer || "").split("|");
  return Array.from({ length: count }, (_, idx) => values[idx] || "").join("|").replace(/\|+$/g, "");
}

function withPdfPartialDefaults(question) {
  const type = normalizePdfQuestionType(question.question_type || "multi_choice");
  const defaults = getPdfQuestionDefaultsByType(type, question.answer_count || 4);
  const count = type === "essay" ? 1 : Math.max(1, Number(question.answer_count || defaults.answer_count || 1));
  const points = Number(question.points ?? defaults.points);
  const answer = normalizePdfDraftAnswer(type, question.answer ?? defaults.answer, count);
  return {
    ...question,
    question_type: type,
    answer_count: count,
    points,
    answer,
    partial_points: type === "essay" ? null : buildPdfPartialDefaults(type, count, points, question.partial_points || {}),
  };
}

function cyclePdfDraftType(id) {
  const current = PDF_STATE.draftQuestions.find((q) => q.id === id)?.question_type || "multi_choice";
  const next = PDF_TYPE_ORDER[(PDF_TYPE_ORDER.indexOf(current) + 1) % PDF_TYPE_ORDER.length];
  updatePdfDraftType(id, next);
}

function addPdfDraftQuestionInline() {
  const next = PDF_STATE.draftQuestions.length + 1;
  PDF_STATE.draftQuestions.push(getPdfDefaultQuestion(next));
  renderDraftQuestionList();
}

function removeLastPdfDraftQuestion() {
  if (!PDF_STATE.draftQuestions.length) return;
  PDF_STATE.draftQuestions = PDF_STATE.draftQuestions.slice(0, -1).map((question, idx) => ({ ...question, order_no: idx + 1, label: `Câu ${idx + 1}` }));
  renderDraftQuestionList();
}

function updatePdfDraftField(id, field, value) {
  PDF_STATE.draftQuestions = PDF_STATE.draftQuestions.map((question) => {
    if (question.id !== id) return question;
    return withPdfPartialDefaults({ ...question, [field]: field === "points" ? Number(value || 0) : value });
  });
  renderDraftQuestionList();
}

function updatePdfDraftType(id, type) {
  PDF_STATE.draftQuestions = PDF_STATE.draftQuestions.map((question) => {
    if (question.id !== id) return question;
    const defaults = getPdfQuestionDefaultsByType(type, type === "essay" ? 1 : 4);
    return withPdfPartialDefaults({ ...question, question_type: type, answer_count: defaults.answer_count, points: defaults.points, answer: defaults.answer, partial_points: defaults.partial_points });
  });
  renderDraftQuestionList();
}

function updatePdfDraftAnswerCount(id, delta) {
  PDF_STATE.draftQuestions = PDF_STATE.draftQuestions.map((question) => {
    if (question.id !== id || question.question_type === "essay") return question;
    const maxCount = question.question_type === "multi_choice" ? 20 : 8;
    const nextCount = Math.max(1, Math.min(maxCount, Number(question.answer_count || 1) + delta));
    return withPdfPartialDefaults({ ...question, answer_count: nextCount, answer: normalizePdfDraftAnswer(question.question_type, question.answer, nextCount), partial_points: buildPdfPartialDefaults(question.question_type, nextCount, Number(question.points || 0), question.partial_points || {}) });
  });
  renderDraftQuestionList();
}

function updatePdfDraftPartial(id, count, value) {
  PDF_STATE.draftQuestions = PDF_STATE.draftQuestions.map((question) => {
    if (question.id !== id) return question;
    const partial = { ...(question.partial_points || {}) };
    partial[count] = Number(value || 0);
    return withPdfPartialDefaults({ ...question, partial_points: partial });
  });
}

function updatePdfDraftMC(id, key, checked) {
  const question = PDF_STATE.draftQuestions.find((q) => q.id === id);
  if (!question) return;
  const current = new Set(String(question.answer || "").toUpperCase().split("").filter(Boolean));
  if (checked) current.add(key);
  else current.delete(key);
  updatePdfDraftField(id, "answer", Array.from(current).sort().join(""));
}

function parsePdfTrueFalse(answer, count) {
  const out = {};
  const raw = String(answer || "");
  for (let idx = 0; idx < raw.length; idx += 2) {
    const key = raw[idx];
    const value = raw[idx + 1];
    if (key && value) out[key.toLowerCase()] = value.toUpperCase();
  }
  Array.from({ length: count }, (_, idx) => String.fromCharCode(97 + idx)).forEach((key) => {
    if (!out[key]) out[key] = "Đ";
  });
  return out;
}

function updatePdfDraftTF(id, key) {
  const question = PDF_STATE.draftQuestions.find((q) => q.id === id);
  if (!question) return;
  const parsed = parsePdfTrueFalse(question.answer, question.answer_count || 4);
  parsed[key] = parsed[key] === "Đ" ? "S" : "Đ";
  updatePdfDraftField(id, "answer", Object.keys(parsed).sort().map((item) => `${item}${parsed[item]}`).join(""));
}

function updatePdfDraftShort(id, index, value) {
  const question = PDF_STATE.draftQuestions.find((q) => q.id === id);
  if (!question) return;
  const parts = String(question.answer || "").split("|");
  parts[index] = value.trim();
  updatePdfDraftField(id, "answer", parts.filter(Boolean).join("|"));
}

function renderPdfTypeToggle(question) {
  return `<button class="draft-type-btn active" type="button" onclick="cyclePdfDraftType('${question.id}')">${typeLabel(question.question_type)}</button>`;
}

function renderInlinePdfAnswerEditor(question) {
  if (question.question_type === "essay") {
    return `<div class="draft-inline-group"><span class="draft-inline-label">Đáp án:</span><span class="hint">Tự luận không có đáp án tự động.</span></div>`;
  }
  if (question.question_type === "multi_choice") {
    const selected = new Set(String(question.answer || "").toUpperCase().split("").filter(Boolean));
    return `<div class="draft-inline-group"><span class="draft-inline-label">Đáp án:</span><div class="count-stepper"><button class="icon-btn" type="button" onclick="updatePdfDraftAnswerCount('${question.id}',-1)">-</button><button class="icon-btn" type="button" onclick="updatePdfDraftAnswerCount('${question.id}',1)">+</button></div>${Array.from({ length: question.answer_count }, (_, idx) => { const key = String.fromCharCode(65 + idx); return `<label class="draft-inline-option"><input type="checkbox" ${selected.has(key) ? "checked" : ""} onchange="updatePdfDraftMC('${question.id}','${key}',this.checked)"><span>${key}</span></label>`; }).join("")}</div>`;
  }
  if (question.question_type === "true_false") {
    const parsed = parsePdfTrueFalse(question.answer, question.answer_count || 4);
    return `<div class="draft-inline-group"><span class="draft-inline-label">Đáp án:</span><div class="count-stepper"><button class="icon-btn" type="button" onclick="updatePdfDraftAnswerCount('${question.id}',-1)">-</button><button class="icon-btn" type="button" onclick="updatePdfDraftAnswerCount('${question.id}',1)">+</button></div>${Array.from({ length: question.answer_count }, (_, idx) => { const key = String.fromCharCode(97 + idx); const state = parsed[key] || "Đ"; return `<button class="tf-state ${state === "Đ" ? "correct" : "wrong"}" type="button" onclick="updatePdfDraftTF('${question.id}','${key}')">${key.toUpperCase()}</button>`; }).join("")}</div>`;
  }
  const values = String(question.answer || "").split("|");
  return `<div class="draft-inline-group"><span class="draft-inline-label">Đáp án:</span><div class="count-stepper"><button class="icon-btn" type="button" onclick="updatePdfDraftAnswerCount('${question.id}',-1)">-</button><button class="icon-btn" type="button" onclick="updatePdfDraftAnswerCount('${question.id}',1)">+</button></div>${Array.from({ length: question.answer_count }, (_, idx) => `<input class="input draft-inline-text" type="text" value="${escAttr(values[idx] || "")}" oninput="updatePdfDraftShort('${question.id}',${idx},this.value)" placeholder="Ý ${idx + 1}">`).join("")}</div>`;
}

function renderInlinePdfPartialEditor(question) {
  if (question.question_type === "essay") {
    return `<div class="draft-inline-partials"><span class="draft-inline-label">Điểm chi tiết:</span><span class="hint">Tự luận chấm thủ công.</span></div>`;
  }
  return `<div class="draft-inline-partials"><span class="draft-inline-label">Điểm chi tiết:</span>${Array.from({ length: question.answer_count + 1 }, (_, idx) => `<label class="draft-inline-partial"><span>${idx} ý</span><input class="input" type="number" min="0" step="0.05" value="${question.partial_points?.[idx] ?? 0}" oninput="updatePdfDraftPartial('${question.id}',${idx},this.value)"></label>`).join("")}</div>`;
}

function renderDraftQuestionList() {
  PDF_EL.draftQuestionList.className = "draft-answer-list";
  PDF_EL.draftQuestionList.innerHTML = PDF_STATE.draftQuestions.length
    ? PDF_STATE.draftQuestions.sort((a, b) => (a.order_no || 0) - (b.order_no || 0)).map((item, idx) => {
      const question = withPdfPartialDefaults({ ...item, order_no: idx + 1, label: `Câu ${idx + 1}` });
      return `<div class="draft-answer-item" id="pdfDraftRow_${question.id}"><div class="draft-answer-topline"><div class="draft-inline-title">Câu ${idx + 1}</div><div class="draft-inline-group"><span class="draft-inline-label">Loại câu:</span>${renderPdfTypeToggle(question)}${renderInlinePdfAnswerEditor(question)}</div><button class="btn btn-danger btn-sm" type="button" onclick="deletePdfQuestion('${question.id}')">Xóa</button></div><div class="draft-answer-bottomline"><div class="draft-inline-group"><span class="draft-inline-label">Điểm câu:</span><input class="input draft-inline-point" type="number" min="0" step="0.05" value="${question.points ?? 0}" oninput="updatePdfDraftField('${question.id}','points',this.value)"></div><div></div>${renderInlinePdfPartialEditor(question)}</div></div>`;
    }).join("")
    : `<div class="empty"><strong>Chưa có đáp án nào</strong><div>Hãy bấm + Thêm đáp án để thêm trực tiếp từng câu bên dưới.</div></div>`;
}

function renderPdfExamGrid() {
  const keyword = String(PDF_EL.keyword?.value || "").trim().toLowerCase();
  const gradeId = PDF_EL.gradeFilter?.value || "";
  const subjectId = PDF_EL.subjectFilter?.value || "";
  const status = PDF_STATE.role === "student" ? "open" : (PDF_EL.statusFilter?.value || "");
  const list = PDF_STATE.exams.filter((exam) => {
    const text = `${exam.title || ""} ${exam.description || ""}`.toLowerCase();
    if (keyword && !text.includes(keyword)) return false;
    if (gradeId && exam.grade_id !== gradeId) return false;
    if (subjectId && exam.subject_id !== subjectId) return false;
    if (status && exam.status !== status) return false;
    return true;
  });
  PDF_EL.empty.style.display = list.length ? "none" : "block";
  PDF_EL.grid.innerHTML = list.map(renderPdfExamCard).join("");
  document.querySelectorAll("[data-open-pdf-exam]").forEach((button) => button.onclick = () => {
    const examId = button.dataset.openPdfExam;
    if (PDF_STATE.role === "student") openPdfAttempt(examId);
    else openPdfExamScreen(examId);
  });
  document.querySelectorAll("[data-edit-pdf-exam]").forEach((button) => button.onclick = () => openPdfExamModal(button.dataset.editPdfExam));
  document.querySelectorAll("[data-delete-pdf-exam]").forEach((button) => button.onclick = () => deletePdfExam(button.dataset.deletePdfExam));
}

function renderPdfExamCard(exam) {
  const grade = PDF_STATE.grades.find((item) => item.id === exam.grade_id)?.name || "Chưa chọn khối";
  const subject = PDF_STATE.subjects.find((item) => item.id === exam.subject_id)?.name || "Chưa chọn môn";
  const questions = getPdfQuestions(exam.id);
  const latest = getStudentLatestSubmitted(exam.id);
  const score = latest ? (latest.score_total ?? latest.score_auto ?? "?") : null;
  return `<article class="card"><div class="card-cover"><div class="chips"><span class="pill light">${exam.status === "open" ? "Mở" : "Đóng"}</span><span class="pill light">${questions.length} câu</span>${latest ? `<span class="pill light">Đã làm ${score}/${exam.total_points || 0}đ</span>` : ""}</div><div><h3 style="margin:0;font-size:1.15rem;line-height:1.35">${esc(exam.title)}</h3><div style="margin-top:4px;font-size:.84rem;color:rgba(255,255,255,.82)">${esc(grade)} • ${esc(subject)}</div></div></div><div class="card-body"><div style="color:#607089;line-height:1.6">${linkify(esc(exam.description || "Đề PDF dùng Google Drive preview để hiển thị đề ở bên trái."))}</div><div class="meta"><div><span>Thời lượng</span><strong>${exam.duration_minutes || 0} phút</strong></div><div><span>Tổng điểm</span><strong>${exam.total_points || 0} điểm</strong></div></div><div class="actions"><button class="btn btn-outline" type="button" data-open-pdf-exam="${exam.id}">${PDF_STATE.role === "student" ? "Làm bài" : "Xem chi tiết"}</button>${(PDF_STATE.role === "admin" || PDF_STATE.role === "teacher") ? `<button class="btn btn-outline" type="button" data-edit-pdf-exam="${exam.id}">Sửa</button><button class="btn btn-danger" type="button" data-delete-pdf-exam="${exam.id}">Xóa</button>` : ""}</div></div></article>`;
}

function openPdfExamModal(examId = null) {
  if (!(PDF_STATE.role === "admin" || PDF_STATE.role === "teacher")) return;
  PDF_STATE.editingExamId = examId;
  PDF_EL.examForm.reset();
  PDF_STATE.draftQuestions = [];
  fillPdfSubjects(PDF_EL.examSubject, "", "Chọn môn");
  if (examId) {
    const exam = PDF_STATE.exams.find((item) => item.id === examId);
    if (!exam) return;
    PDF_EL.examModalTitle.textContent = "Sửa đề PDF";
    PDF_EL.examTitle.value = exam.title || "";
    PDF_EL.examStatus.value = exam.status || "open";
    PDF_EL.examGrade.value = exam.grade_id || "";
    fillPdfSubjects(PDF_EL.examSubject, exam.grade_id || "", "Chọn môn");
    PDF_EL.examSubject.value = exam.subject_id || "";
    PDF_EL.examDuration.value = exam.duration_minutes || 60;
    PDF_EL.examTotal.value = exam.total_points || 10;
    PDF_EL.examDriveInput.value = exam.drive_file_id || exam.drive_preview_url || "";
    PDF_EL.examDescription.value = exam.description || "";
    PDF_STATE.draftQuestions = getPdfQuestions(examId).map((question) => withPdfPartialDefaults({ ...question }));
  } else {
    PDF_EL.examModalTitle.textContent = "Tạo đề PDF";
    PDF_EL.examStatus.value = "open";
    PDF_EL.examDuration.value = 60;
    PDF_EL.examTotal.value = 10;
  }
  renderDraftQuestionList();
  PDF_EL.examModal.classList.add("show");
}

function closePdfExamModal() {
  PDF_EL.examModal.classList.remove("show");
  PDF_STATE.editingExamId = null;
}

async function submitPdfExamForm(ev) {
  ev.preventDefault();
  const parsed = parseDriveInput(PDF_EL.examDriveInput.value.trim());
  if (!parsed.fileId) return alert("Hãy nhập Google Drive file ID hoặc link chia sẻ hợp lệ.");
  if (!PDF_EL.examTitle.value.trim()) return alert("Tên đề không được để trống.");
  if (!PDF_STATE.draftQuestions.length) return alert("Hãy tạo ít nhất 1 đáp án cho đề PDF.");

  const payload = {
    title: PDF_EL.examTitle.value.trim(),
    status: PDF_EL.examStatus.value,
    grade_id: PDF_EL.examGrade.value || null,
    subject_id: PDF_EL.examSubject.value || null,
    duration_minutes: Number(PDF_EL.examDuration.value || 60),
    total_points: Number(PDF_EL.examTotal.value || 10),
    drive_file_id: parsed.fileId,
    drive_preview_url: parsed.previewUrl,
    description: PDF_EL.examDescription.value.trim(),
    created_by: PDF_STATE.user.id,
  };

  let examId = PDF_STATE.editingExamId;
  let error = null;
  if (examId) {
    ({ error } = await sb.from("pdf_exams").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", examId));
  } else {
    const { data, error: insertErr } = await sb.from("pdf_exams").insert(payload).select("id").single();
    examId = data?.id || null;
    error = insertErr;
  }
  if (error) return alert("Không thể lưu đề PDF: " + error.message);

  const existing = PDF_STATE.editingExamId ? getPdfQuestions(PDF_STATE.editingExamId) : [];
  const currentIds = PDF_STATE.draftQuestions.map((question) => question.id);
  const removedIds = existing.filter((question) => !currentIds.includes(question.id)).map((question) => question.id);
  if (removedIds.length) {
    const { error: removeErr } = await sb.from("pdf_exam_questions").delete().in("id", removedIds);
    if (removeErr) return alert("Đề đã lưu nhưng không xóa được đáp án cũ: " + removeErr.message);
  }

  for (let idx = 0; idx < PDF_STATE.draftQuestions.length; idx += 1) {
      const question = withPdfPartialDefaults({ ...PDF_STATE.draftQuestions[idx], order_no: idx + 1, label: `Câu ${idx + 1}` });
    const row = {
      pdf_exam_id: examId,
      order_no: idx + 1,
      label: question.label,
      question_type: question.question_type,
      question_text: null,
      answer: question.answer,
      answer_count: question.answer_count,
      points: question.points,
      partial_points: question.partial_points || null,
    };
    if (existing.some((item) => item.id === question.id)) {
      const { error: updateErr } = await sb.from("pdf_exam_questions").update(row).eq("id", question.id);
      if (updateErr) return alert("Đề đã lưu nhưng không cập nhật được đáp án: " + updateErr.message);
    } else {
      const { error: createErr } = await sb.from("pdf_exam_questions").insert({ ...row, id: question.id });
      if (createErr) return alert("Đề đã lưu nhưng không tạo được đáp án: " + createErr.message);
    }
  }

  closePdfExamModal();
  await loadPdfData(true);
}

function deletePdfQuestion(questionId) {
  PDF_STATE.draftQuestions = PDF_STATE.draftQuestions.filter((question) => question.id !== questionId).map((question, idx) => ({ ...question, order_no: idx + 1, label: `Câu ${idx + 1}` }));
  renderDraftQuestionList();
}

async function deletePdfExam(examId) {
  if (!confirm("Bạn có chắc muốn xóa đề PDF này không?")) return;
  const { error } = await sb.from("pdf_exams").delete().eq("id", examId);
  if (error) return alert("Không thể xóa đề PDF: " + error.message);
  if (PDF_STATE.activeExamId === examId) closePdfExamScreen();
  await loadPdfData(false);
}

function openPdfExamScreen(examId) {
  const exam = PDF_STATE.exams.find((item) => item.id === examId);
  if (!exam) return;
  PDF_STATE.activeExamId = examId;
  PDF_EL.screen.classList.add("show");
  setPdfRouteLoading(false);
  PDF_EL.screenTitle.textContent = exam.title || "Chi tiết đề PDF";
  const grade = PDF_STATE.grades.find((item) => item.id === exam.grade_id)?.name || "Chưa chọn khối";
  const subject = PDF_STATE.subjects.find((item) => item.id === exam.subject_id)?.name || "Chưa chọn môn";
  const questions = getPdfQuestions(exam.id);
  const latest = getStudentLatestSubmitted(exam.id);
  PDF_EL.summaryChips.innerHTML = `<span class="pill soft">${exam.status === "open" ? "Đang mở" : "Đã đóng"}</span><span class="pill soft">${esc(grade)}</span><span class="pill soft">${esc(subject)}</span><span class="pill soft">${questions.length} câu</span>`;
  PDF_EL.summaryText.innerHTML = `<div style="color:#607089;line-height:1.7">${linkify(esc(exam.description || "Đề PDF dùng Google Drive preview để hiển thị đề ở bên trái màn làm bài."))}</div>`;
  PDF_EL.summaryMeta.innerHTML = `<div><span>Thời lượng</span><strong>${exam.duration_minutes || 0} phút</strong></div><div><span>Tổng điểm</span><strong>${exam.total_points || 0} điểm</strong></div><div><span>Google Drive</span><strong>${esc(exam.drive_file_id || "")}</strong></div><div><span>Kết quả gần nhất</span><strong>${latest ? `${latest.score_total ?? latest.score_auto ?? "?"}/${exam.total_points || 0} điểm` : "Chưa làm bài"}</strong></div>`;
  PDF_EL.openDriveBtn.onclick = () => window.open(getPdfOpenUrl(exam), "_blank");
  if (PDF_EL.detailFrame) PDF_EL.detailFrame.src = getPdfPreviewUrl(exam);
  if (PDF_EL.detailPaneOpenLink) PDF_EL.detailPaneOpenLink.href = getPdfOpenUrl(exam);
  if (PDF_EL.detailPaneLabel) PDF_EL.detailPaneLabel.textContent = `Nội dung đề PDF • ${exam.title || ""}`;

  const canManage = PDF_STATE.role === "admin" || PDF_STATE.role === "teacher";
  PDF_EL.editBtn.classList.toggle("hidden", !canManage);
  PDF_EL.addQuestionBtn.classList.toggle("hidden", !canManage);
  PDF_EL.submissionBtn.classList.toggle("hidden", !canManage);
  PDF_EL.takeBtn.classList.toggle("hidden", canManage || exam.status !== "open");
  PDF_EL.questionList.innerHTML = questions.length ? questions.map(renderPdfQuestionRow).join("") : `<div class="empty"><strong>Chưa có câu trả lời nào</strong><div>${canManage ? "Hãy thêm câu đầu tiên cho đề PDF này." : "Đề này chưa sẵn sàng để làm bài."}</div></div>`;
}

function closePdfExamScreen() {
  PDF_EL.screen.classList.remove("show");
  PDF_STATE.activeExamId = null;
}

function returnFromPdfContext() {
  if (PDF_STATE.classId || PDF_STATE.courseId) {
    if (window.history.length > 1) {
      window.history.back();
      return true;
    }
  }
  return false;
}

function renderPdfQuestionRow(question) {
  return `<div class="question-row"><div class="question-main"><div class="question-title"><span class="question-index">Câu ${question.order_no || 1}</span><span class="pill soft">${typeLabel(question.question_type)}</span><span class="pill soft">${question.points || 0} điểm</span></div><div class="question-actions"></div></div><div class="question-answer">Đáp án đúng: <strong>${esc(question.answer || "")}</strong></div></div>`;
}

async function openPdfAttempt(examId) {
  const exam = PDF_STATE.exams.find((item) => item.id === examId);
  if (!exam || exam.status !== "open") return;
  const questions = getPdfQuestions(examId);
  if (!questions.length) return alert("Đề PDF này chưa có câu trả lời để học sinh làm bài.");

  PDF_STATE.attemptExamId = examId;
  PDF_STATE.attemptAnswers = {};

  const results = getStudentResults(examId);
  const unfinished = results.find((result) => !result.submitted_at && (result.seconds_left ?? 0) > 0);
  if (unfinished) {
    PDF_STATE.attemptResultId = unfinished.id;
    PDF_STATE.attemptSeconds = Math.max(0, Number(unfinished.seconds_left || 0) - 300);
    const { data: saved } = await sb.from("pdf_exam_answers").select("question_id,answer").eq("result_id", unfinished.id);
    (saved || []).forEach((row) => { PDF_STATE.attemptAnswers[row.question_id] = row.answer || ""; });
  } else {
    const attemptNo = (results[0]?.attempt_no || 0) + 1;
    const { data, error } = await sb.from("pdf_exam_results").insert({
      pdf_exam_id: examId,
      student_id: PDF_STATE.user.id,
      attempt_no: attemptNo,
      seconds_left: (exam.duration_minutes || 60) * 60,
      class_id: PDF_STATE.classId,
      course_id: PDF_STATE.courseId,
    }).select("id").single();
    if (error) return alert("Không thể khởi tạo bài làm: " + error.message);
    PDF_STATE.attemptResultId = data.id;
    PDF_STATE.attemptSeconds = (exam.duration_minutes || 60) * 60;
  }

  PDF_EL.attemptShell.classList.add("show");
  if (PDF_EL.attemptTitle) PDF_EL.attemptTitle.textContent = exam.title || "Làm đề PDF";
  if (PDF_EL.pdfFrame) PDF_EL.pdfFrame.src = getPdfPreviewUrl(exam);
  if (PDF_EL.pdfPaneOpenLink) PDF_EL.pdfPaneOpenLink.href = getPdfOpenUrl(exam);
  renderPdfAttemptUI(exam, questions);
  setPdfRouteLoading(false);
  startPdfAttemptTimer();
}

function renderPdfAttemptUI(exam, questions) {
  if (PDF_EL.attemptNav) {
    PDF_EL.attemptNav.innerHTML = questions.map((question, idx) => `<div class="nav-pill" id="pdfNav_${question.id}" onclick="scrollPdfQuestion('${question.id}')" title="${escAttr(question.label || `Câu ${idx + 1}`)}">${idx + 1}<span class="pill-dot" id="pdfNavDot_${question.id}"></span></div>`).join("");
  }
  PDF_EL.attemptQuestions.innerHTML = questions.map((question, idx) => renderPdfAttemptQuestion(question, idx + 1)).join("");
  questions.forEach((question) => updatePdfNav(question.id));
  updatePdfAttemptClock();
}

function renderPdfAttemptQuestion(question, index) {
  const answer = PDF_STATE.attemptAnswers[question.id] || "";
  let answerCol = "";
  if (question.question_type === "multi_choice") {
    answerCol = `<div class="opt-col">` + Array.from({ length: Math.max(2, Number(question.answer_count || 4)) }, (_, idx) => {
      const option = String.fromCharCode(65 + idx);
      return `<label id="pdfLbl_${question.id}_${option}" class="option-label ${answer.includes(option) ? "active" : ""}"><input type="checkbox" id="pdfCb_${question.id}_${option}" value="${option}" ${answer.includes(option) ? "checked" : ""} onchange="updatePdfMC('${question.id}')"><span class="option-key">${option}</span></label>`;
    }).join("") + `</div>`;
  } else if (question.question_type === "true_false") {
    answerCol = `<div class="opt-col">` + Array.from({ length: Math.max(2, Number(question.answer_count || 4)) }, (_, idx) => {
      const label = String.fromCharCode(97 + idx);
      return `<div class="tf-row"><span><strong>${label})</strong></span><div class="tf-actions"><label><input type="radio" name="pdfTf_${question.id}_${label}" value="Đ" ${answer.includes(label + "Đ") ? "checked" : ""} onchange="updatePdfTF('${question.id}')"> Đ</label><label><input type="radio" name="pdfTf_${question.id}_${label}" value="S" ${answer.includes(label + "S") ? "checked" : ""} onchange="updatePdfTF('${question.id}')"> S</label></div></div>`;
    }).join("") + `</div>`;
  } else if (question.question_type === "short_answer") {
    answerCol = `<input class="short-input" value="${escAttr(answer)}" oninput="updatePdfText('${question.id}',this.value)" placeholder="Nhập đáp án">`;
  } else {
    answerCol = `<textarea class="essay-box" oninput="updatePdfText('${question.id}',this.value)" placeholder="Viết câu trả lời">${esc(answer)}</textarea>`;
  }
  return `<div class="answer-card" id="pdfQCard_${question.id}">
    <div class="answer-card-hd">
      <span class="num">${index}</span>
      <span style="font-size:.82rem;font-weight:700;color:var(--ink-mid)">${question.points || 0}đ</span>
    </div>
    <div class="answer-card-bd" style="display:block">
      <div class="answer-col">${answerCol}</div>
    </div>
  </div>`;
}

function updatePdfText(questionId, value) {
  PDF_STATE.attemptAnswers[questionId] = value;
  updatePdfNav(questionId);
}

function updatePdfMC(questionId) {
  const values = Array.from(document.querySelectorAll(`[id^="pdfCb_${questionId}_"]:checked`)).map((input) => input.value).join("");
  PDF_STATE.attemptAnswers[questionId] = values;
  document.querySelectorAll(`[id^="pdfCb_${questionId}_"]`).forEach((input) => document.getElementById(`pdfLbl_${questionId}_${input.value}`)?.classList.toggle("active", input.checked));
  updatePdfNav(questionId);
}

function updatePdfTF(questionId) {
  let value = "";
  document.querySelectorAll(`input[name^="pdfTf_${questionId}_"]:checked`).forEach((input) => { value += input.name.split("_").pop() + input.value; });
  PDF_STATE.attemptAnswers[questionId] = value;
  updatePdfNav(questionId);
}

function updatePdfNav(questionId) {
  const pill = document.getElementById(`pdfNav_${questionId}`);
  const dot = document.getElementById(`pdfNavDot_${questionId}`);
  const answered = String(PDF_STATE.attemptAnswers[questionId] || "").trim().length > 0;
  if (dot) dot.style.background = answered ? "var(--green)" : "var(--border)";
  if (pill) pill.classList.toggle("active", answered);
}

function scrollPdfQuestion(questionId) {
  document.getElementById(`pdfQCard_${questionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updatePdfAttemptClock() {
  const minutes = String(Math.floor(Math.max(0, PDF_STATE.attemptSeconds) / 60)).padStart(2, "0");
  const seconds = String(Math.max(0, PDF_STATE.attemptSeconds) % 60).padStart(2, "0");
  PDF_EL.attemptClock.textContent = `${minutes}:${seconds}`;
  PDF_EL.attemptClock.style.color = PDF_STATE.attemptSeconds < 300 ? "#ef4444" : "var(--gold-light)";
}

function startPdfAttemptTimer() {
  clearInterval(PDF_STATE.attemptTimer);
  PDF_STATE.attemptTimer = setInterval(async () => {
    PDF_STATE.attemptSeconds -= 1;
    updatePdfAttemptClock();
    if (PDF_STATE.attemptSeconds % 60 === 0) await savePdfAttemptProgress();
    if (PDF_STATE.attemptSeconds <= 0) {
      clearInterval(PDF_STATE.attemptTimer);
      submitPdfAttempt(true);
    }
  }, 1000);
}

async function savePdfAttemptProgress() {
  if (!PDF_STATE.attemptResultId) return;
  await sb.from("pdf_exam_results").update({ seconds_left: PDF_STATE.attemptSeconds }).eq("id", PDF_STATE.attemptResultId);
  const rows = Object.entries(PDF_STATE.attemptAnswers).filter(([, answer]) => String(answer || "").trim()).map(([question_id, answer]) => ({ result_id: PDF_STATE.attemptResultId, question_id, answer }));
  if (rows.length) await sb.from("pdf_exam_answers").upsert(rows, { onConflict: "result_id,question_id" });
}

async function closePdfAttempt() {
  if (!PDF_STATE.attemptResultId) {
    if (returnFromPdfContext()) return;
    PDF_EL.attemptShell.classList.remove("show");
    return;
  }
  if (!confirm("Bạn muốn thoát? Tiến trình sẽ được lưu và khi vào lại sẽ bị trừ 5 phút.")) return;
  clearInterval(PDF_STATE.attemptTimer);
  await savePdfAttemptProgress();
  if (returnFromPdfContext()) return;
  PDF_EL.attemptShell.classList.remove("show");
}

async function submitPdfAttempt(auto) {
  if (!auto && !confirm("Bạn chắc chắn muốn nộp bài?")) return;
  clearInterval(PDF_STATE.attemptTimer);
  const exam = PDF_STATE.exams.find((item) => item.id === PDF_STATE.attemptExamId);
  const questions = getPdfQuestions(PDF_STATE.attemptExamId);
  let scoreAuto = 0;

  const rows = questions.map((question) => {
    const answer = String(PDF_STATE.attemptAnswers[question.id] || "").trim();
    let isCorrect = null;
    let score = 0;
    if (question.question_type === "multi_choice") {
      const mine = new Set(answer.toUpperCase().split("").filter(Boolean));
      const correct = new Set(String(question.answer || "").toUpperCase().split("").filter(Boolean));
      isCorrect = mine.size === correct.size && [...mine].every((item) => correct.has(item));
      const hasWrong = [...mine].some((item) => !correct.has(item));
      const correctCount = [...mine].filter((item) => correct.has(item)).length;
      score = isCorrect ? Number(question.points || 0) : getPartialScore(question, correctCount, hasWrong);
    } else if (question.question_type === "true_false") {
      isCorrect = answer.toLowerCase() === String(question.answer || "").toLowerCase();
      const { correctCount, hasWrong } = countTrueFalseMatches(answer, question.answer || "");
      score = isCorrect ? Number(question.points || 0) : getPartialScore(question, correctCount, hasWrong);
    } else if (question.question_type === "short_answer") {
      const answers = String(question.answer || "").split("|").map((item) => item.trim().toLowerCase()).filter(Boolean);
      isCorrect = answers.includes(answer.toLowerCase());
      score = isCorrect ? Number(question.points || 0) : getPartialScore(question, isCorrect ? question.answer_count : 0, !isCorrect);
    }
    if (question.question_type !== "essay") scoreAuto += score;
    return { result_id: PDF_STATE.attemptResultId, question_id: question.id, answer, is_correct: isCorrect, score_earned: score };
  });

  if (rows.length) await sb.from("pdf_exam_answers").upsert(rows, { onConflict: "result_id,question_id" });

  const hasEssay = questions.some((question) => question.question_type === "essay");
  const finalScore = Math.round(scoreAuto * 100) / 100;
  await sb.from("pdf_exam_results").update({ submitted_at: new Date().toISOString(), score_auto: finalScore, score_total: hasEssay ? null : finalScore, seconds_left: null }).eq("id", PDF_STATE.attemptResultId);

  PDF_EL.attemptShell.classList.remove("show");
  await loadPdfData(false);
  await openPdfReview(PDF_STATE.attemptResultId, exam?.title || "Đề PDF");
}

async function openPdfSubmissions(examId) {
  const exam = PDF_STATE.exams.find((item) => item.id === examId);
  if (!exam) return;
  const results = PDF_STATE.results.filter((result) => result.pdf_exam_id === examId && result.submitted_at);
  const studentIds = [...new Set(results.map((result) => result.student_id))];
  let users = [];
  if (studentIds.length) {
    const { data } = await sb.from("users").select("id,full_name,avatar_url").in("id", studentIds);
    users = data || [];
  }
  const userMap = Object.fromEntries(users.map((user) => [user.id, user]));
  const latestByStudent = {};
  results.forEach((result) => { if (!latestByStudent[result.student_id]) latestByStudent[result.student_id] = result; });

  PDF_EL.submissionTitle.textContent = `Bài đã nộp - ${exam.title}`;
  PDF_EL.submissionBody.innerHTML = results.length
    ? `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#0f3c73;color:#fff"><th style="padding:12px;text-align:left">Học sinh</th><th style="padding:12px;text-align:center">Điểm tự động</th><th style="padding:12px;text-align:center">Tổng</th><th style="padding:12px;text-align:center">Nộp lúc</th><th style="padding:12px;text-align:center">Chi tiết</th></tr></thead><tbody>${Object.values(latestByStudent).map((result) => `<tr style="border-bottom:1px solid rgba(39,58,91,.08)"><td style="padding:12px"><div style="display:flex;align-items:center;gap:10px"><img src="${escAttr(userMap[result.student_id]?.avatar_url || "default-avatar.png")}" style="width:36px;height:36px;border-radius:50%;object-fit:cover"><strong>${esc(userMap[result.student_id]?.full_name || "Học sinh")}</strong></div></td><td style="padding:12px;text-align:center">${result.score_auto ?? "—"}</td><td style="padding:12px;text-align:center;font-weight:700;color:var(--navy)">${result.score_total ?? result.score_auto ?? "—"}</td><td style="padding:12px;text-align:center">${fmtDateTime(result.submitted_at)}</td><td style="padding:12px;text-align:center"><button class="btn btn-outline btn-sm" type="button" data-open-pdf-review="${result.id}|${escAttr(exam.title)}">Xem bài</button></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty"><strong>Chưa có bài nộp nào</strong><div>Đề PDF này chưa có học sinh làm bài.</div></div>`;

  PDF_EL.submissionModal.classList.add("show");
  document.querySelectorAll("[data-open-pdf-review]").forEach((button) => button.onclick = () => {
    const [resultId, title] = button.dataset.openPdfReview.split("|");
    openPdfReview(resultId, title);
  });
}

async function openPdfReview(resultId, title) {
  const [{ data: result }, { data: answerRows }] = await Promise.all([
    sb.from("pdf_exam_results").select("*").eq("id", resultId).single(),
    sb.from("pdf_exam_answers").select("*").eq("result_id", resultId),
  ]);
  const exam = PDF_STATE.exams.find((item) => item.id === result?.pdf_exam_id);
  const questions = getPdfQuestions(result?.pdf_exam_id || "");
  const answerMap = {};
  (answerRows || []).forEach((row) => { answerMap[row.question_id] = row; });
  const totalText = `${result?.score_total ?? "Chưa chấm"} / ${exam?.total_points || 0}`;
  if (PDF_EL.reviewTitle) PDF_EL.reviewTitle.textContent = `Xem lại bài - ${title}`;
  if (PDF_EL.reviewScore) PDF_EL.reviewScore.textContent = totalText;
  if (PDF_EL.reviewFrame && exam) PDF_EL.reviewFrame.src = getPdfPreviewUrl(exam);
  if (PDF_EL.reviewQuestions) {
    PDF_EL.reviewQuestions.innerHTML = `<div class="review-wrap"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><div style="font-weight:700;color:var(--navy)">${esc(title)}</div><div class="hint">Kết quả bài làm đề PDF</div></div><div style="font-size:.92rem;color:var(--ink-mid)">Tự động: <b>${result?.score_auto ?? 0}</b><br><span style="color:var(--navy);font-weight:700">Tổng: ${totalText}</span></div></div>${questions.map((question, idx) => renderPdfReviewCard(question, answerMap[question.id], idx + 1)).join("")}</div>`;
  }
  PDF_EL.submissionModal.classList.remove("show");
  PDF_EL.reviewShell?.classList.add("show");
  setPdfRouteLoading(false);
}

function renderPdfReviewCard(question, answerRow, index) {
  const answer = answerRow?.answer || "";
  const score = answerRow?.score_earned ?? 0;
  const correct = question.answer || "";
  const ok = answerRow?.is_correct;
  return `<div class="answer-card"><div class="answer-card-hd"><span class="num">${index}</span><strong>${esc(question.label || `Câu ${index}`)}</strong><span class="pill soft">${typeLabel(question.question_type)}</span><span style="margin-left:auto;font-size:.78rem;color:var(--ink-mid)">${question.points || 0} điểm</span></div><div class="answer-card-bd" style="grid-template-columns:1fr"><div><div style="padding:10px 12px;border-radius:12px;background:${ok === true ? "#f0fdf4" : ok === false ? "#fef2f2" : "#fff7ed"};border:1px solid ${ok === true ? "#86efac" : ok === false ? "#fca5a5" : "#fdba74"}"><div style="font-weight:700;color:${ok === true ? "var(--green)" : ok === false ? "var(--red)" : "#b45309"}">${ok === true ? "Đúng" : ok === false ? "Sai" : "Tự luận / chờ chấm"}</div><div style="margin-top:4px;font-size:.84rem">Bạn làm: <b>${esc(answer || "Bỏ qua")}</b></div>${ok === false || question.question_type === "essay" ? `<div style="margin-top:4px;font-size:.84rem">Đáp án chuẩn: <b>${esc(correct || "—")}</b></div>` : ""}<div style="margin-top:6px;font-size:.84rem;font-weight:700">Điểm: ${score}/${question.points || 0}</div></div></div></div></div>`;
}

function closePdfSubmissionModal() {
  PDF_EL.submissionModal.classList.remove("show");
}

function closePdfReview() {
  PDF_EL.reviewShell?.classList.remove("show");
  if (returnFromPdfContext()) return;
}

function countTrueFalseMatches(answer, correct) {
  const parse = (source) => {
    const out = {};
    for (let idx = 0; idx < source.length; idx += 2) {
      const key = source[idx];
      const value = source[idx + 1];
      if (key && value) out[key.toLowerCase()] = value.toUpperCase();
    }
    return out;
  };
  const mine = parse(String(answer || ""));
  const target = parse(String(correct || ""));
  let correctCount = 0;
  let hasWrong = false;
  Object.keys(mine).forEach((key) => {
    if (target[key] && mine[key] === target[key]) correctCount += 1;
    else hasWrong = true;
  });
  return { correctCount, hasWrong };
}

function getPartialScore(question, correctCount, hasWrong) {
  if (!question.partial_points || hasWrong) return 0;
  const value = question.partial_points[String(correctCount)];
  return value == null ? 0 : Number(value);
}

window.closePdfExamModal = closePdfExamModal;
window.closePdfExamScreen = closePdfExamScreen;
window.closePdfSubmissionModal = closePdfSubmissionModal;
window.closePdfReview = closePdfReview;
window.closePdfAttempt = closePdfAttempt;
window.openPdfQuestionModal = addPdfDraftQuestionInline;
window.deletePdfQuestion = deletePdfQuestion;
window.updatePdfDraftField = updatePdfDraftField;
window.updatePdfDraftType = updatePdfDraftType;
window.updatePdfDraftAnswerCount = updatePdfDraftAnswerCount;
window.updatePdfDraftPartial = updatePdfDraftPartial;
window.updatePdfDraftMC = updatePdfDraftMC;
window.updatePdfDraftTF = updatePdfDraftTF;
window.updatePdfDraftShort = updatePdfDraftShort;
window.cyclePdfDraftType = cyclePdfDraftType;
window.updatePdfMC = updatePdfMC;
window.updatePdfTF = updatePdfTF;
window.updatePdfText = updatePdfText;
window.scrollPdfQuestion = scrollPdfQuestion;

