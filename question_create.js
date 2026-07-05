/* =========================
   ELEMENTS
========================= */
const grade         = document.getElementById("grade");
const subject       = document.getElementById("subject");
const topic         = document.getElementById("topic");
const question_type = document.getElementById("question_type");
const difficulty    = document.getElementById("difficulty");
const questionText  = document.getElementById("questionText");
const answerText    = document.getElementById("answerText");
const questionImg   = document.getElementById("questionImg");
const answerImg     = document.getElementById("answerImg");
const questionImgBox = document.getElementById("questionImgBox");
const answerImgBox   = document.getElementById("answerImgBox");

/* =========================
   DIFFICULTY OPTIONS (chỉ ở đây, không trùng với question_list.js)
========================= */
for (let i = 1; i <= 10; i++) {
  difficulty.appendChild(new Option(i, i));
}

/* =========================
   LOAD SELECT DATA
========================= */
async function loadSelectData() {
  const { data: grades, error: gErr } = await sb.from("grades").select("*").order("id");
  if (gErr) { console.error(gErr); return; }

  grade.innerHTML = `<option value="">Chọn khối</option>`;
  grades?.forEach(g => grade.appendChild(new Option(g.name, g.id)));

  grade.addEventListener("change", async () => {
    subject.innerHTML = `<option value="">Chọn môn</option>`;
    topic.innerHTML = `<option value="">Chọn chủ đề</option>`;
    if (!grade.value) return;

    const { data: subjects, error } = await sb
      .from("subjects").select("*").eq("grade_id", grade.value).order("id");
    if (error) { console.error(error); return; }
    subjects?.forEach(s => subject.appendChild(new Option(s.name, s.id)));
  });

  subject.addEventListener("change", async () => {
    topic.innerHTML = `<option value="">Chọn chủ đề</option>`;
    if (!subject.value) return;

    const { data: topics, error } = await sb
      .from("topics").select("*").eq("subject_id", subject.value).order("name");
    if (error) { console.error(error); return; }
    topics?.forEach(t => topic.appendChild(new Option(t.name, t.id)));
  });
}

/* =========================
   LƯU CÂU HỎI
========================= */
async function saveQuestion(shouldClose = true) {
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id || null;

  const topicVal    = topic.value;
  const typeVal     = question_type.value;
  const diffVal     = parseInt(difficulty.value) || null;
  const questionVal = questionText.value.trim();
  const answerVal   = answerText.value.trim();

  if (!topicVal) { alert("Vui lòng chọn chủ đề!"); return; }
  if (!questionVal && questionImgBox.style.display !== "block") {
    alert("Vui lòng nhập nội dung câu hỏi!"); return;
  }

  let answerCount   = 0;
  let correctAnswer = "";

  const deriveAnswerStatus = (type, answerValue) => {
    if (type === "essay") return "reviewed"
    return String(answerValue || "").trim() ? "reviewed" : "missing"
  }

  /* ── Lấy đáp án đúng ── */
  if (typeVal === "multi_choice") {
    const boxes = document.querySelectorAll("#answerArea .answerBox");
    answerCount = boxes.length;
    boxes.forEach((box, i) => {
      if (box.querySelector("input[type='checkbox']")?.checked) {
        correctAnswer += String.fromCharCode(65 + i);
      }
    });
  }

  if (typeVal === "true_false") {
    const boxes = document.querySelectorAll("#answerArea .answerBox");
    answerCount = boxes.length;
    const tfStates = [];
    let hasUnset = false;
    boxes.forEach((box, i) => {
      const stateText = box.querySelector(".state")?.innerText || "";
      if (stateText === "Đúng") tfStates.push("T");
      else if (stateText === "Sai") tfStates.push("F");
      else hasUnset = true;
    });
    correctAnswer = hasUnset
      ? ""
      : (window.QuestionAnswerFormat?.encodeTrueFalseSelections?.(tfStates, answerCount) || tfStates.join(""));
  }

  if (typeVal === "short_answer") {
    const inputs = document.querySelectorAll("#answerArea .shortRow input");
    answerCount = inputs.length;
    correctAnswer = [...inputs].map(i => i.value.trim()).join(";");
  }

  // Upload hình vẽ nếu có (base64 → Supabase Storage URL)
  let figureImgUrl = null;
  if (questionImgBox.style.display === "block" && questionImg.src) {
    figureImgUrl = questionImg.src; // đã là URL từ Storage
  } else if (window._modalFigureBase64) {
    const figData = window._modalFigureBase64;
    if (figData.startsWith("http")) {
      // Đã là URL (khi edit câu hỏi cũ)
      figureImgUrl = figData;
    } else {
      // Base64 mới — upload lên Drive
      try {
        const uploaded = await window.MindupImageUpload.uploadDataUrl(figData, {
          kind: "question",
          folder: "questions",
          fileName: crypto.randomUUID() + ".jpg",
        });
        figureImgUrl = window.MindupImageUpload.getDisplayUrl(uploaded);
      } catch(e) { console.error("Upload hình vẽ lỗi:", e); }
    }
  }

  const dataObj = {
    topic_id:      topicVal || null,
    question_type: typeVal,
    difficulty:    diffVal,
    question_text: questionVal || null,
    question_img:  figureImgUrl || null,
    answer_text:   answerVal || null,
    answer_img:    answerImgBox.style.display === "block" ? answerImg.src : null,
    answer_count:  answerCount,
    answer:        correctAnswer || null,
    answer_status: deriveAnswerStatus(typeVal, correctAnswer),
    created_by:    userId,
  };

  /* ── INSERT / UPDATE ── */
  let error;

  if (editingQuestionId) {
    // FIX: bắt error từ kết quả trả về
    const res = await sb.from("question_bank").update(dataObj).eq("id", editingQuestionId);
    error = res.error;
  } else {
    const res = await sb.from("question_bank").insert([dataObj]);
    error = res.error;
  }

  if (error) {
    console.error(error);
    alert("Lỗi lưu câu hỏi: " + error.message);
    return;
  }

  alert(editingQuestionId ? "Cập nhật câu hỏi thành công!" : "Tạo câu hỏi thành công!");
  editingQuestionId = null;
  if (shouldClose) closeModal();
  loadQuestions();
}

/* =========================
   INIT
========================= */
loadSelectData();
