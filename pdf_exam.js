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
  editingQuestionId: null,
  activeExamId: null,
  attemptExamId: null,
  attemptResultId: null,
  attemptSeconds: 0,
  attemptTimer: null,
  attemptAnswers: {},
};

const PDF_EL = {
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
  questionModal: document.getElementById("pdfQuestionModal"),
  questionModalTitle: document.getElementById("pdfQuestionModalTitle"),
  questionForm: document.getElementById("pdfQuestionForm"),
  questionOrder: document.getElementById("pdfQuestionOrder"),
  questionLabel: document.getElementById("pdfQuestionLabel"),
  questionType: document.getElementById("pdfQuestionType"),
  questionPoints: document.getElementById("pdfQuestionPoints"),
  questionAnswerCount: document.getElementById("pdfQuestionAnswerCount"),
  questionAnswer: document.getElementById("pdfQuestionAnswer"),
  partialScoreWrap: document.getElementById("pdfPartialScoreWrap"),
  draftQuestionList: document.getElementById("pdfDraftQuestionList"),
  openDraftQuestionBtn: document.getElementById("openPdfDraftQuestionBtn"),
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
  pdfPaneLabel: document.getElementById("pdfPaneLabel"),
  pdfPaneOpenLink: document.getElementById("pdfPaneOpenLink"),
};

PDF_EL.openBtn?.addEventListener("click", () => openPdfExamModal());
PDF_EL.reloadBtn?.addEventListener("click", () => loadPdfData(true));
PDF_EL.examForm?.addEventListener("submit", submitPdfExamForm);
PDF_EL.questionForm?.addEventListener("submit", submitPdfQuestionForm);
PDF_EL.openDraftQuestionBtn?.addEventListener("click", () => openPdfQuestionModal());
PDF_EL.editBtn?.addEventListener("click", () => PDF_STATE.activeExamId && openPdfExamModal(PDF_STATE.activeExamId));
PDF_EL.addQuestionBtn?.addEventListener("click", () => PDF_STATE.activeExamId && openPdfExamModal(PDF_STATE.activeExamId));
PDF_EL.takeBtn?.addEventListener("click", () => PDF_STATE.activeExamId && openPdfAttempt(PDF_STATE.activeExamId));
PDF_EL.submissionBtn?.addEventListener("click", () => PDF_STATE.activeExamId && openPdfSubmissions(PDF_STATE.activeExamId));
PDF_EL.submitBtn?.addEventListener("click", () => submitPdfAttempt(false));
[PDF_EL.keyword, PDF_EL.gradeFilter, PDF_EL.subjectFilter, PDF_EL.statusFilter].forEach((el) => el?.addEventListener("input", renderPdfExamGrid));
PDF_EL.gradeFilter?.addEventListener("change", () => {
  fillPdfSubjects(PDF_EL.subjectFilter, PDF_EL.gradeFilter.value, "Tất cả môn");
  renderPdfExamGrid();
});
PDF_EL.examGrade?.addEventListener("change", () => fillPdfSubjects(PDF_EL.examSubject, PDF_EL.examGrade.value, "Chọn môn"));
PDF_EL.questionType?.addEventListener("change", renderPartialScoreEditor);
PDF_EL.questionAnswerCount?.addEventListener("input", renderPartialScoreEditor);

initPdfExam();

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
    PDF_EL.adminToolbar.style.display = "";
  } else {
    PDF_EL.statusFilter.value = "open";
    PDF_EL.statusFilter.classList.add("hidden");
    document.getElementById("toolbar").style.gridTemplateColumns = "1.2fr repeat(2,minmax(150px,220px)) auto";
  }

  await loadPdfData(false);
}

async function loadPdfData(reopenScreen) {
  const examQuery = PDF_STATE.role === "student"
    ? sb.from("pdf_exams").select("*").eq("status", "open").order("created_at", { ascending: false })
    : sb.from("pdf_exams").select("*").order("created_at", { ascending: false });
  const resultQuery = PDF_STATE.role === "student"
    ? sb.from("pdf_exam_results").select("*").eq("student_id", PDF_STATE.user.id).order("attempt_no", { ascending: false })
    : sb.from("pdf_exam_results").select("*").order("submitted_at", { ascending: false });

  const [{ data: exams, error: eErr }, { data: questions, error: qErr }, { data: results, error: rErr }, { data: answers, error: aErr }] = await Promise.all([
    examQuery,
    sb.from("pdf_exam_questions").select("*").order("order_no"),
    resultQuery,
    sb.from("pdf_exam_answers").select("*"),
  ]);

  if (eErr || qErr || rErr || aErr) {
    PDF_EL.grid.innerHTML = `<div class="empty"><strong>Không tải được Đề PDF</strong><div>${esc(eErr?.message || qErr?.message || rErr?.message || aErr?.message)}</div></div>`;
    PDF_EL.empty.style.display = "none";
    return;
  }

  PDF_STATE.exams = exams || [];
  PDF_STATE.questions = questions || [];
  PDF_STATE.results = results || [];
  PDF_STATE.answers = answers || [];
  renderPdfExamGrid();

  if (PDF_STATE.activeExamId && reopenScreen !== false) {
    openPdfExamScreen(PDF_STATE.activeExamId);
  }
}

function fillPdfGrades(el, placeholder) {
  if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>` + PDF_STATE.grades.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("");
}

function fillPdfSubjects(el, gradeId, placeholder) {
  if (!el) return;
  const list = gradeId ? PDF_STATE.subjects.filter((s) => s.grade_id === gradeId) : PDF_STATE.subjects;
  el.innerHTML = `<option value="">${placeholder}</option>` + list.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
}

function getPdfQuestions(examId) {
  return PDF_STATE.questions
    .filter((q) => q.pdf_exam_id === examId)
    .sort((a, b) => (a.order_no || 0) - (b.order_no || 0));
}

function getStudentResults(examId) {
  return PDF_STATE.results
    .filter((r) => r.pdf_exam_id === examId && r.student_id === PDF_STATE.user.id)
    .sort((a, b) => (b.attempt_no || 0) - (a.attempt_no || 0));
}

function getStudentLatestSubmitted(examId) {
  return getStudentResults(examId).find((r) => r.submitted_at) || null;
}

function typeLabel(type) {
  return ({
    multi_choice: "Trắc nghiệm",
    true_false: "Đúng / Sai",
    short_answer: "Trả lời ngắn",
    essay: "Tự luận",
  })[type] || type;
}

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("vi-VN");
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(v) {
  return esc(v).replace(/`/g, "&#96;");
}

function linkify(text) {
  return String(text || "").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function parseDriveInput(input) {
  if (!input) return { fileId: "", previewUrl: "" };
  const value = input.trim();
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{20,})$/,
  ];
  let fileId = "";
  patterns.some((p) => {
    const m = value.match(p);
    if (m) {
      fileId = m[1];
      return true;
    }
    return false;
  });
  return {
    fileId,
    previewUrl: fileId ? `https://drive.google.com/file/d/${fileId}/preview` : "",
  };
}

function getPdfPreviewUrl(exam) {
  return exam?.drive_preview_url || `https://drive.google.com/file/d/${encodeURIComponent(exam.drive_file_id)}/preview`;
}

function getPdfOpenUrl(exam) {
  return `https://drive.google.com/file/d/${encodeURIComponent(exam.drive_file_id)}/view`;
}

window.closePdfExamModal = closePdfExamModal;
window.closePdfQuestionModal = closePdfQuestionModal;
window.closePdfExamScreen = closePdfExamScreen;
window.closePdfSubmissionModal = closePdfSubmissionModal;
window.closePdfAttempt = closePdfAttempt;
window.openPdfQuestionModal = openPdfQuestionModal;
window.deletePdfQuestion = deletePdfQuestion;
window.updatePdfMC = updatePdfMC;
window.updatePdfTF = updatePdfTF;
window.updatePdfText = updatePdfText;
window.scrollPdfQuestion = scrollPdfQuestion;

function renderPdfExamGrid() {
  const keyword = (PDF_EL.keyword.value || "").trim().toLowerCase();
  const gradeId = PDF_EL.gradeFilter.value || "";
  const subjectId = PDF_EL.subjectFilter.value || "";
  const status = (PDF_STATE.role === "student" ? "open" : PDF_EL.statusFilter.value) || "";

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
  document.querySelectorAll("[data-open-pdf-exam]").forEach((btn) => btn.onclick = () => openPdfExamScreen(btn.dataset.openPdfExam));
  document.querySelectorAll("[data-edit-pdf-exam]").forEach((btn) => btn.onclick = () => openPdfExamModal(btn.dataset.editPdfExam));
  document.querySelectorAll("[data-delete-pdf-exam]").forEach((btn) => btn.onclick = () => deletePdfExam(btn.dataset.deletePdfExam));
}

function renderPdfExamCard(exam) {
  const grade = PDF_STATE.grades.find((x) => x.id === exam.grade_id)?.name || "Chưa chọn khối";
  const subject = PDF_STATE.subjects.find((x) => x.id === exam.subject_id)?.name || "Chưa chọn môn";
  const questions = getPdfQuestions(exam.id);
  const latest = getStudentLatestSubmitted(exam.id);
  const score = latest ? (latest.score_total ?? latest.score_auto ?? "?") : null;

  return `<article class="card">
    <div class="card-cover">
      <div class="chips">
        <span class="pill light">${exam.status === "open" ? "Mở" : "Đóng"}</span>
        <span class="pill light">${questions.length} câu</span>
        ${latest ? `<span class="pill light">Đã làm ${score}/${exam.total_points || 0}đ</span>` : ""}
      </div>
      <div>
        <h3 style="margin:0;font-size:1.15rem;line-height:1.35">${esc(exam.title)}</h3>
        <div style="margin-top:4px;font-size:.84rem;color:rgba(255,255,255,.82)">${grade} • ${subject}</div>
      </div>
    </div>
    <div class="card-body">
      <div style="color:#607089;line-height:1.6">${linkify(esc(exam.description || "Đề PDF dùng Google Drive preview để hiển thị đề ở bên trái."))}</div>
      <div class="meta">
        <div><span>Thời lượng</span><strong>${exam.duration_minutes || 0} phút</strong></div>
        <div><span>Tổng điểm</span><strong>${exam.total_points || 0} điểm</strong></div>
      </div>
      <div class="actions">
        <button class="btn btn-outline" type="button" data-open-pdf-exam="${exam.id}">Xem chi tiết</button>
        ${(PDF_STATE.role === "admin" || PDF_STATE.role === "teacher") ? `<button class="btn btn-outline" type="button" data-edit-pdf-exam="${exam.id}">Sửa</button><button class="btn btn-danger" type="button" data-delete-pdf-exam="${exam.id}">Xóa</button>` : ""}
      </div>
    </div>
  </article>`;
}

function openPdfExamModal(examId = null) {
  if (!(PDF_STATE.role === "admin" || PDF_STATE.role === "teacher")) return;
  PDF_STATE.editingExamId = examId;
  PDF_EL.examForm.reset();
  fillPdfSubjects(PDF_EL.examSubject, "", "Chọn môn");
  PDF_STATE.draftQuestions = [];

  if (examId) {
    const exam = PDF_STATE.exams.find((x) => x.id === examId);
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
    PDF_STATE.draftQuestions = getPdfQuestions(examId).map((q) => ({ ...q }));
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

  if (!payload.title) return alert("Tên đề không được để trống.");
  if (!PDF_STATE.draftQuestions.length) return alert("Hãy tạo ít nhất 1 đáp án cho đề PDF.");

  let error = null;
  let examId = PDF_STATE.editingExamId;
  if (PDF_STATE.editingExamId) {
    ({ error } = await sb.from("pdf_exams").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", PDF_STATE.editingExamId));
  } else {
    const { data, error: insertErr } = await sb.from("pdf_exams").insert(payload).select("id").single();
    error = insertErr;
    examId = data?.id || null;
  }
  if (error) return alert("Không thể lưu đề PDF: " + error.message);

  const existingQuestions = PDF_STATE.editingExamId ? getPdfQuestions(PDF_STATE.editingExamId) : [];
  const existingIds = new Set(existingQuestions.map((q) => q.id));
  const retainedIds = PDF_STATE.draftQuestions.filter((q) => existingIds.has(q.id)).map((q) => q.id);

  if (PDF_STATE.editingExamId) {
    const removedIds = existingQuestions.filter((q) => !retainedIds.includes(q.id)).map((q) => q.id);
    if (removedIds.length) {
      const { error: delErr } = await sb.from("pdf_exam_questions").delete().in("id", removedIds);
      if (delErr) return alert("Đề đã lưu nhưng không xóa được đáp án cũ: " + delErr.message);
    }
  }

  for (let idx = 0; idx < PDF_STATE.draftQuestions.length; idx++) {
    const q = PDF_STATE.draftQuestions[idx];
    const row = {
      pdf_exam_id: examId,
      order_no: idx + 1,
      label: q.label,
      question_type: q.question_type,
      question_text: null,
      answer: q.answer,
      answer_count: q.answer_count,
      points: q.points,
      partial_points: q.partial_points || null,
    };
    if (existingIds.has(q.id)) {
      const { error: qErr } = await sb.from("pdf_exam_questions").update(row).eq("id", q.id);
      if (qErr) return alert("Đề đã lưu nhưng không cập nhật được đáp án: " + qErr.message);
    } else {
      const { error: qErr } = await sb.from("pdf_exam_questions").insert({ ...row, id: q.id });
      if (qErr) return alert("Đề đã lưu nhưng không tạo được đáp án: " + qErr.message);
    }
  }

  closePdfExamModal();
  await loadPdfData(true);
}

async function deletePdfExam(examId) {
  if (!confirm("Bạn có chắc muốn xóa đề PDF này không?")) return;
  const { error } = await sb.from("pdf_exams").delete().eq("id", examId);
  if (error) return alert("Không thể xóa đề PDF: " + error.message);
  if (PDF_STATE.activeExamId === examId) closePdfExamScreen();
  await loadPdfData(false);
}

function openPdfExamScreen(examId) {
  const exam = PDF_STATE.exams.find((x) => x.id === examId);
  if (!exam) return;
  PDF_STATE.activeExamId = examId;
  PDF_EL.screen.classList.add("show");
  PDF_EL.screenTitle.textContent = exam.title || "Chi tiết đề PDF";

  const grade = PDF_STATE.grades.find((x) => x.id === exam.grade_id)?.name || "Chưa chọn khối";
  const subject = PDF_STATE.subjects.find((x) => x.id === exam.subject_id)?.name || "Chưa chọn môn";
  const questions = getPdfQuestions(exam.id);
  const latest = getStudentLatestSubmitted(exam.id);

  PDF_EL.summaryChips.innerHTML = `<span class="pill soft">${exam.status === "open" ? "Đang mở" : "Đã đóng"}</span><span class="pill soft">${esc(grade)}</span><span class="pill soft">${esc(subject)}</span><span class="pill soft">${questions.length} câu</span>`;
  PDF_EL.summaryText.innerHTML = `<div style="color:#607089;line-height:1.7">${linkify(esc(exam.description || "Đề PDF dùng Google Drive preview để hiển thị đề ở bên trái màn làm bài."))}</div>`;
  PDF_EL.summaryMeta.innerHTML = `<div><span>Thời lượng</span><strong>${exam.duration_minutes || 0} phút</strong></div><div><span>Tổng điểm</span><strong>${exam.total_points || 0} điểm</strong></div><div><span>Google Drive</span><strong>${esc(exam.drive_file_id || "")}</strong></div><div><span>Kết quả gần nhất</span><strong>${latest ? (latest.score_total ?? latest.score_auto ?? "?") + "/" + (exam.total_points || 0) + " điểm" : "Chưa làm bài"}</strong></div>`;
  PDF_EL.openDriveBtn.onclick = () => window.open(getPdfOpenUrl(exam), "_blank");

  const canManage = PDF_STATE.role === "admin" || PDF_STATE.role === "teacher";
  PDF_EL.editBtn.classList.toggle("hidden", !canManage);
  PDF_EL.addQuestionBtn.classList.toggle("hidden", !canManage);
  PDF_EL.submissionBtn.classList.toggle("hidden", !canManage);
  PDF_EL.takeBtn.classList.toggle("hidden", canManage || exam.status !== "open");

  PDF_EL.questionList.innerHTML = questions.length
    ? questions.map(renderPdfQuestionRow).join("")
    : `<div class="empty"><strong>Chưa có câu trả lời nào</strong><div>${canManage ? "Hãy thêm câu đầu tiên cho đề PDF này." : "Đề này chưa sẵn sàng để làm bài."}</div></div>`;

  document.querySelectorAll("[data-edit-pdf-question]").forEach((btn) => btn.onclick = () => openPdfQuestionModal(btn.dataset.editPdfQuestion));
  document.querySelectorAll("[data-delete-pdf-question]").forEach((btn) => btn.onclick = () => deletePdfQuestion(btn.dataset.deletePdfQuestion));
}

function closePdfExamScreen() {
  PDF_EL.screen.classList.remove("show");
  PDF_STATE.activeExamId = null;
}

function renderPdfQuestionRow(q) {
  return `<div class="question-row">
    <div class="question-badge"><strong>${esc(q.label || "Câu")}</strong><span>${q.order_no || 1}</span></div>
    <div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <strong style="color:var(--navy)">${esc(q.label || "Câu hỏi")}</strong>
        <span class="pill soft">${typeLabel(q.question_type)}</span>
        <span class="pill soft">${q.points || 0} điểm</span>
      </div>
      <div style="color:#607089;line-height:1.65">${linkify(esc(q.question_text || "Không có mô tả riêng. Học sinh sẽ đọc nội dung chính từ file PDF bên trái."))}</div>
      <div class="hint" style="margin-top:8px">Đáp án đúng: <b>${esc(q.answer || "")}</b></div>
    </div>
    <div class="question-actions"></div>
  </div>`;
}

function openPdfQuestionModal(questionId = null) {
  if (!(PDF_STATE.role === "admin" || PDF_STATE.role === "teacher")) return;
  PDF_STATE.editingQuestionId = questionId;
  PDF_EL.questionForm.reset();

  const next = PDF_STATE.draftQuestions.length + 1;
  PDF_EL.questionOrder.value = next;
  PDF_EL.questionType.value = "multi_choice";
  PDF_EL.questionPoints.value = "0.25";
  PDF_EL.questionAnswerCount.value = "4";

  if (questionId) {
    const q = PDF_STATE.draftQuestions.find((x) => x.id === questionId);
    if (!q) return;
    PDF_EL.questionModalTitle.textContent = "Sửa câu trả lời";
    PDF_EL.questionOrder.value = q.order_no || next;
    PDF_EL.questionLabel.value = q.label || "";
    PDF_EL.questionType.value = q.question_type || "multi_choice";
    PDF_EL.questionPoints.value = q.points ?? 0;
    PDF_EL.questionAnswerCount.value = q.answer_count || 4;
    PDF_EL.questionAnswer.value = q.answer || "";
  } else {
    PDF_EL.questionModalTitle.textContent = "Thêm câu trả lời";
  }
  renderPartialScoreEditor(questionId ? (PDF_STATE.draftQuestions.find((x) => x.id === questionId)?.partial_points || null) : null);
  PDF_EL.questionModal.classList.add("show");
}

function closePdfQuestionModal() {
  PDF_EL.questionModal.classList.remove("show");
  PDF_STATE.editingQuestionId = null;
}

async function submitPdfQuestionForm(ev) {
  ev.preventDefault();

  const payload = {
    order_no: Number(PDF_EL.questionOrder.value || 1),
    label: PDF_EL.questionLabel.value.trim(),
    question_type: PDF_EL.questionType.value,
    question_text: null,
    answer: PDF_EL.questionAnswer.value.trim(),
    answer_count: Number(PDF_EL.questionAnswerCount.value || 4),
    points: Number(PDF_EL.questionPoints.value || 0),
    partial_points: readPartialScores(),
  };

  if (!payload.label || !payload.answer) return alert("Nhãn câu và đáp án đúng không được để trống.");

  if (PDF_STATE.editingQuestionId) {
    PDF_STATE.draftQuestions = PDF_STATE.draftQuestions.map((q) => q.id === PDF_STATE.editingQuestionId ? { ...q, ...payload } : q);
  } else {
    PDF_STATE.draftQuestions.push({ ...payload, id: crypto.randomUUID() });
  }
  PDF_STATE.draftQuestions = PDF_STATE.draftQuestions
    .sort((a, b) => (a.order_no || 0) - (b.order_no || 0))
    .map((q, idx) => ({ ...q, order_no: idx + 1 }));

  closePdfQuestionModal();
  renderDraftQuestionList();
}

async function deletePdfQuestion(questionId) {
  if (!confirm("Bạn có chắc muốn xóa câu này không?")) return;
  PDF_STATE.draftQuestions = PDF_STATE.draftQuestions
    .filter((q) => q.id !== questionId)
    .map((q, idx) => ({ ...q, order_no: idx + 1 }));
  renderDraftQuestionList();
}

function renderDraftQuestionList() {
  PDF_EL.draftQuestionList.innerHTML = PDF_STATE.draftQuestions.length
    ? PDF_STATE.draftQuestions
      .sort((a, b) => (a.order_no || 0) - (b.order_no || 0))
      .map((q) => `<div style="display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 14px;border:1px solid rgba(39,58,91,.08);border-radius:14px;background:#fff">
        <div style="font-weight:800;color:var(--navy)">Câu ${q.order_no || 1}</div>
        <div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px"><strong>${esc(q.label || "")}</strong><span class="pill soft">${typeLabel(q.question_type)}</span><span class="pill soft">${q.points || 0} điểm</span></div>
          <div class="hint">Đáp án đúng: <b>${esc(q.answer || "")}</b>${q.partial_points ? ` • Điểm theo số ý đúng: ${Object.entries(q.partial_points).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn btn-outline btn-sm" type="button" onclick="openPdfQuestionModal('${q.id}')">Sửa</button><button class="btn btn-danger btn-sm" type="button" onclick="deletePdfQuestion('${q.id}')">Xóa</button></div>
      </div>`).join("")
    : `<div class="empty"><strong>Chưa có đáp án nào</strong><div>Hãy thêm đáp án cho đề PDF ngay trong form này.</div></div>`;
}

function renderPartialScoreEditor(existing = null) {
  const type = PDF_EL.questionType.value;
  const count = Math.max(1, Number(PDF_EL.questionAnswerCount.value || 1));
  if (!(type === "multi_choice" || type === "true_false")) {
    PDF_EL.partialScoreWrap.innerHTML = `<div class="hint">Loại câu này không dùng điểm theo số ý đúng.</div>`;
    return;
  }
  const scores = existing || {};
  PDF_EL.partialScoreWrap.innerHTML = `<div class="hint">Nhập điểm tương ứng với số ý làm đúng. Nếu để trống sẽ mặc định chỉ chấm khi đúng hoàn toàn.</div>
    <div style="display:grid;grid-template-columns:repeat(${Math.min(count, 4)},minmax(110px,1fr));gap:8px">
      ${Array.from({ length: count }, (_, i) => i + 1).map((num) => `<label style="display:grid;gap:6px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:#fff"><span style="font-size:.78rem;font-weight:700;color:var(--ink-mid)">${num} ý đúng</span><input class="input pdf-partial-input" data-count="${num}" type="number" min="0" step="0.25" value="${scores[num] ?? ""}"></label>`).join("")}
    </div>`;
}

function readPartialScores() {
  const inputs = Array.from(document.querySelectorAll(".pdf-partial-input"));
  if (!inputs.length) return null;
  const out = {};
  inputs.forEach((input) => {
    const v = String(input.value || "").trim();
    if (v !== "") out[input.dataset.count] = Number(v);
  });
  return Object.keys(out).length ? out : null;
}

async function openPdfAttempt(examId) {
  const exam = PDF_STATE.exams.find((x) => x.id === examId);
  if (!exam || exam.status !== "open") return;
  const questions = getPdfQuestions(examId);
  if (!questions.length) return alert("Đề PDF này chưa có câu trả lời để học sinh làm bài.");

  PDF_STATE.attemptExamId = examId;
  PDF_STATE.attemptAnswers = {};

  const results = getStudentResults(examId);
  const unfinished = results.find((r) => !r.submitted_at && (r.seconds_left ?? 0) > 0);

  if (unfinished) {
    PDF_STATE.attemptResultId = unfinished.id;
    PDF_STATE.attemptSeconds = Math.max(0, (unfinished.seconds_left || 0) - 300);
    const { data: saved } = await sb.from("pdf_exam_answers").select("question_id,answer").eq("result_id", unfinished.id);
    (saved || []).forEach((row) => { PDF_STATE.attemptAnswers[row.question_id] = row.answer || ""; });
  } else {
    const attemptNo = (results[0]?.attempt_no || 0) + 1;
    const { data: newResult, error } = await sb.from("pdf_exam_results").insert({
      pdf_exam_id: examId,
      student_id: PDF_STATE.user.id,
      attempt_no: attemptNo,
      seconds_left: (exam.duration_minutes || 60) * 60,
    }).select("id").single();
    if (error) return alert("Không thể khởi tạo bài làm: " + error.message);
    PDF_STATE.attemptResultId = newResult.id;
    PDF_STATE.attemptSeconds = (exam.duration_minutes || 60) * 60;
  }

  PDF_EL.attemptShell.classList.add("show");
  PDF_EL.attemptTitle.textContent = exam.title || "Làm đề PDF";
  PDF_EL.pdfPaneLabel.textContent = `Đề PDF • ${exam.title || ""}`;
  PDF_EL.pdfFrame.src = getPdfPreviewUrl(exam);
  PDF_EL.pdfPaneOpenLink.href = getPdfOpenUrl(exam);
  renderPdfAttemptUI(exam, questions);
  startPdfAttemptTimer();
}

function renderPdfAttemptUI(exam, questions) {
  PDF_EL.attemptNav.innerHTML = questions.map((q, i) => `<div class="nav-pill" onclick="scrollPdfQuestion('${q.id}')" title="${escAttr(q.label || ("Câu " + (i + 1)))}">${i + 1}<span id="pdfNavDot_${q.id}"></span></div>`).join("");
  PDF_EL.attemptQuestions.innerHTML = questions.map((q, i) => renderPdfAttemptQuestion(q, i + 1)).join("");
  questions.forEach((q) => updatePdfNav(q.id));
  updatePdfAttemptClock();
}

function renderPdfAttemptQuestion(q, index) {
  const answer = PDF_STATE.attemptAnswers[q.id] || "";
  let answerCol = "";

  if (q.question_type === "multi_choice") {
    const count = Math.max(2, Number(q.answer_count || 4));
    answerCol = `<div class="opt-col">` + Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i)).map((opt) => `
      <label id="pdfLbl_${q.id}_${opt}" class="option-label ${answer.includes(opt) ? "active" : ""}">
        <input type="checkbox" id="pdfCb_${q.id}_${opt}" value="${opt}" ${answer.includes(opt) ? "checked" : ""} onchange="updatePdfMC('${q.id}')">
        <span class="option-key">${opt}</span>
      </label>`).join("") + `</div>`;
  } else if (q.question_type === "true_false") {
    const count = Math.max(2, Number(q.answer_count || 4));
    answerCol = `<div class="opt-col">` + Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i)).map((lbl) => `
      <div class="tf-row">
        <span><strong>${lbl})</strong></span>
        <div class="tf-actions">
          <label><input type="radio" name="pdfTf_${q.id}_${lbl}" value="T" ${answer.includes(lbl + "T") ? "checked" : ""} onchange="updatePdfTF('${q.id}')"> Đ</label>
          <label><input type="radio" name="pdfTf_${q.id}_${lbl}" value="F" ${answer.includes(lbl + "F") ? "checked" : ""} onchange="updatePdfTF('${q.id}')"> S</label>
        </div>
      </div>`).join("") + `</div>`;
  } else if (q.question_type === "short_answer") {
    answerCol = `<input class="short-input" value="${escAttr(answer)}" oninput="updatePdfText('${q.id}',this.value)" placeholder="Nhập đáp án">`;
  } else {
    answerCol = `<textarea class="essay-box" oninput="updatePdfText('${q.id}',this.value)" placeholder="Viết câu trả lời">${esc(answer)}</textarea>`;
  }

  return `<div class="answer-card" id="pdfQCard_${q.id}">
    <div class="answer-card-hd">
      <span class="num">${index}</span>
      <strong>${esc(q.label || ("Câu " + index))}</strong>
      <span class="pill soft">${typeLabel(q.question_type)}</span>
      <span style="margin-left:auto;font-size:.78rem;color:var(--ink-mid)">${q.points || 0} điểm</span>
    </div>
    <div class="answer-card-bd" style="grid-template-columns:1fr">
      ${answerCol}
    </div>
  </div>`;
}

function updatePdfText(qid, val) {
  PDF_STATE.attemptAnswers[qid] = val;
  updatePdfNav(qid);
}

function updatePdfMC(qid) {
  const vals = Array.from(document.querySelectorAll(`[id^="pdfCb_${qid}_"]:checked`)).map((x) => x.value).join("");
  PDF_STATE.attemptAnswers[qid] = vals;
  document.querySelectorAll(`[id^="pdfCb_${qid}_"]`).forEach((cb) => {
    document.getElementById(`pdfLbl_${qid}_${cb.value}`)?.classList.toggle("active", cb.checked);
  });
  updatePdfNav(qid);
}

function updatePdfTF(qid) {
  let value = "";
  document.querySelectorAll(`input[name^="pdfTf_${qid}_"]:checked`).forEach((r) => { value += r.name.split("_").pop() + r.value; });
  PDF_STATE.attemptAnswers[qid] = value;
  updatePdfNav(qid);
}

function updatePdfNav(qid) {
  const dot = document.getElementById(`pdfNavDot_${qid}`);
  if (dot) dot.style.background = (PDF_STATE.attemptAnswers[qid] || "").trim() ? "var(--green)" : "var(--border)";
}

function scrollPdfQuestion(qid) {
  document.getElementById(`pdfQCard_${qid}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updatePdfAttemptClock() {
  const m = String(Math.floor(Math.max(0, PDF_STATE.attemptSeconds) / 60)).padStart(2, "0");
  const s = String(Math.max(0, PDF_STATE.attemptSeconds) % 60).padStart(2, "0");
  PDF_EL.attemptClock.textContent = `${m}:${s}`;
  PDF_EL.attemptClock.style.color = PDF_STATE.attemptSeconds < 300 ? "#ef4444" : "var(--gold-light)";
}

function startPdfAttemptTimer() {
  clearInterval(PDF_STATE.attemptTimer);
  PDF_STATE.attemptTimer = setInterval(async () => {
    PDF_STATE.attemptSeconds--;
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
  const rows = Object.entries(PDF_STATE.attemptAnswers)
    .filter(([, ans]) => String(ans || "").trim())
    .map(([question_id, answer]) => ({ result_id: PDF_STATE.attemptResultId, question_id, answer }));
  if (rows.length) await sb.from("pdf_exam_answers").upsert(rows, { onConflict: "result_id,question_id" });
}

async function closePdfAttempt() {
  if (!PDF_STATE.attemptResultId) {
    PDF_EL.attemptShell.classList.remove("show");
    return;
  }
  if (!confirm("Bạn muốn thoát? Tiến trình sẽ được lưu và khi vào lại sẽ bị trừ 5 phút.")) return;
  clearInterval(PDF_STATE.attemptTimer);
  await savePdfAttemptProgress();
  PDF_EL.attemptShell.classList.remove("show");
}

async function submitPdfAttempt(auto) {
  if (!auto && !confirm("Bạn chắc chắn muốn nộp bài?")) return;
  clearInterval(PDF_STATE.attemptTimer);

  const exam = PDF_STATE.exams.find((x) => x.id === PDF_STATE.attemptExamId);
  const questions = getPdfQuestions(PDF_STATE.attemptExamId);
  let scoreAuto = 0;

  const rows = questions.map((q) => {
    const answer = (PDF_STATE.attemptAnswers[q.id] || "").trim();
    let isCorrect = null;
    let score = 0;

    if (q.question_type === "multi_choice") {
      const a = new Set(answer.toUpperCase().split("").filter(Boolean));
      const b = new Set((q.answer || "").toUpperCase().split("").filter(Boolean));
      isCorrect = a.size === b.size && [...a].every((x) => b.has(x));
      const hasWrong = [...a].some((x) => !b.has(x));
      const correctCount = [...a].filter((x) => b.has(x)).length;
      score = isCorrect ? (q.points || 0) : getPartialScore(q, correctCount, hasWrong);
    } else if (q.question_type === "true_false") {
      isCorrect = answer.toLowerCase() === (q.answer || "").toLowerCase();
      const { correctCount, hasWrong } = countTrueFalseMatches(answer, q.answer || "");
      score = isCorrect ? (q.points || 0) : getPartialScore(q, correctCount, hasWrong);
    } else if (q.question_type === "short_answer") {
      isCorrect = (q.answer || "").split(";").map((x) => x.trim().toLowerCase()).includes(answer.toLowerCase());
      score = isCorrect ? (q.points || 0) : 0;
    } else {
      isCorrect = null;
      score = 0;
    }

    if (q.question_type !== "essay") scoreAuto += score;
    return {
      result_id: PDF_STATE.attemptResultId,
      question_id: q.id,
      answer,
      is_correct: isCorrect,
      score_earned: score,
    };
  });

  if (rows.length) {
    await sb.from("pdf_exam_answers").upsert(rows, { onConflict: "result_id,question_id" });
  }

  const hasEssay = questions.some((q) => q.question_type === "essay");
  const finalScore = Math.round(scoreAuto * 100) / 100;

  await sb.from("pdf_exam_results").update({
    submitted_at: new Date().toISOString(),
    score_auto: finalScore,
    score_total: hasEssay ? null : finalScore,
    seconds_left: null,
  }).eq("id", PDF_STATE.attemptResultId);

  PDF_EL.attemptShell.classList.remove("show");
  await loadPdfData(true);
  await openPdfReview(PDF_STATE.attemptResultId, exam?.title || "Đề PDF");
}

async function openPdfSubmissions(examId) {
  const exam = PDF_STATE.exams.find((x) => x.id === examId);
  if (!exam) return;

  const results = PDF_STATE.results.filter((r) => r.pdf_exam_id === examId && r.submitted_at);
  const studentIds = [...new Set(results.map((r) => r.student_id))];
  let users = [];
  if (studentIds.length) {
    const { data } = await sb.from("users").select("id,full_name,avatar_url").in("id", studentIds);
    users = data || [];
  }
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const latestByStudent = {};
  results.forEach((r) => { if (!latestByStudent[r.student_id]) latestByStudent[r.student_id] = r; });

  PDF_EL.submissionTitle.textContent = `Bài đã nộp - ${exam.title}`;
  PDF_EL.submissionBody.innerHTML = results.length
    ? `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#0f3c73;color:#fff"><th style="padding:12px;text-align:left">Học sinh</th><th style="padding:12px;text-align:center">Điểm tự động</th><th style="padding:12px;text-align:center">Tổng</th><th style="padding:12px;text-align:center">Nộp lúc</th><th style="padding:12px;text-align:center">Chi tiết</th></tr></thead><tbody>${Object.values(latestByStudent).map((r) => `<tr style="border-bottom:1px solid rgba(39,58,91,.08)"><td style="padding:12px"><div style="display:flex;align-items:center;gap:10px"><img src="${escAttr(userMap[r.student_id]?.avatar_url || "default-avatar.png")}" style="width:36px;height:36px;border-radius:50%;object-fit:cover"><strong>${esc(userMap[r.student_id]?.full_name || "Học sinh")}</strong></div></td><td style="padding:12px;text-align:center">${r.score_auto ?? "—"}</td><td style="padding:12px;text-align:center;font-weight:700;color:var(--navy)">${r.score_total ?? r.score_auto ?? "—"}</td><td style="padding:12px;text-align:center">${fmtDateTime(r.submitted_at)}</td><td style="padding:12px;text-align:center"><button class="btn btn-outline btn-sm" type="button" data-open-pdf-review="${r.id}|${escAttr(exam.title)}">Xem bài</button></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty"><strong>Chưa có bài nộp nào</strong><div>Đề PDF này chưa có học sinh làm bài.</div></div>`;

  PDF_EL.submissionModal.classList.add("show");
  document.querySelectorAll("[data-open-pdf-review]").forEach((btn) => btn.onclick = () => {
    const [rid, title] = btn.dataset.openPdfReview.split("|");
    openPdfReview(rid, title);
  });
}

async function openPdfReview(resultId, title) {
  const [{ data: result }, { data: answerRows }] = await Promise.all([
    sb.from("pdf_exam_results").select("*").eq("id", resultId).single(),
    sb.from("pdf_exam_answers").select("*").eq("result_id", resultId),
  ]);
  const exam = PDF_STATE.exams.find((x) => x.id === result?.pdf_exam_id);
  const questions = getPdfQuestions(result?.pdf_exam_id || "");
  const ansMap = {};
  (answerRows || []).forEach((a) => { ansMap[a.question_id] = a; });

  PDF_EL.submissionTitle.textContent = `Xem lại bài - ${title}`;
  PDF_EL.submissionBody.innerHTML = `<div class="review-wrap">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div><div style="font-weight:700;color:var(--navy)">${esc(title)}</div><div class="hint">Kết quả bài làm đề PDF</div></div>
      <div style="font-size:.92rem;color:var(--ink-mid)">Tự động: <b>${result?.score_auto ?? 0}</b><br><span style="color:var(--navy);font-weight:700">Tổng: ${result?.score_total ?? "Chưa chấm"} / ${exam?.total_points || 0}</span></div>
    </div>
    ${questions.map((q, i) => renderPdfReviewCard(q, ansMap[q.id], i + 1)).join("")}
  </div>`;
  PDF_EL.submissionModal.classList.add("show");
}

function renderPdfReviewCard(q, ans, index) {
  const answer = ans?.answer || "";
  const score = ans?.score_earned ?? 0;
  const correct = q.answer || "";
  const ok = ans?.is_correct;

  return `<div class="answer-card">
    <div class="answer-card-hd">
      <span class="num">${index}</span>
      <strong>${esc(q.label || ("Câu " + index))}</strong>
      <span class="pill soft">${typeLabel(q.question_type)}</span>
      <span style="margin-left:auto;font-size:.78rem;color:var(--ink-mid)">${q.points || 0} điểm</span>
    </div>
    <div class="answer-card-bd" style="grid-template-columns:1fr">
      <div>
        <div style="padding:10px 12px;border-radius:12px;background:${ok === true ? "#f0fdf4" : ok === false ? "#fef2f2" : "#fff7ed"};border:1px solid ${ok === true ? "#86efac" : ok === false ? "#fca5a5" : "#fdba74"}">
          <div style="font-weight:700;color:${ok === true ? "var(--green)" : ok === false ? "var(--red)" : "#b45309"}">${ok === true ? "Đúng" : ok === false ? "Sai" : "Tự luận / chờ chấm"}</div>
          <div style="margin-top:4px;font-size:.84rem">Bạn làm: <b>${esc(answer || "Bỏ qua")}</b></div>
          ${ok === false || q.question_type === "essay" ? `<div style="margin-top:4px;font-size:.84rem">Đáp án chuẩn: <b>${esc(correct || "—")}</b></div>` : ""}
          <div style="margin-top:6px;font-size:.84rem;font-weight:700">Điểm: ${score}/${q.points || 0}</div>
        </div>
      </div>
    </div>
  </div>`;
}

function closePdfSubmissionModal() {
  PDF_EL.submissionModal.classList.remove("show");
}

function countTrueFalseMatches(answer, correct) {
  const parse = (src) => {
    const out = {};
    for (let i = 0; i < src.length; i += 2) {
      const key = src[i];
      const val = src[i + 1];
      if (key && val) out[key.toLowerCase()] = val.toUpperCase();
    }
    return out;
  };
  const a = parse(answer || "");
  const b = parse(correct || "");
  let correctCount = 0;
  let hasWrong = false;
  Object.keys(a).forEach((key) => {
    if (b[key] && a[key] === b[key]) correctCount += 1;
    else hasWrong = true;
  });
  return { correctCount, hasWrong };
}

function getPartialScore(q, correctCount, hasWrong) {
  if (!q.partial_points || hasWrong) return 0;
  const value = q.partial_points[String(correctCount)];
  return value == null ? 0 : Number(value);
}
