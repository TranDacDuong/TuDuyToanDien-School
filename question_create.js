/* =========================
   ELEMENTS
========================= */
const grade         = document.getElementById("grade");
const subject       = document.getElementById("subject");
const chapter       = document.getElementById("chapter");
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
    chapter.innerHTML = `<option value="">Chọn chương</option>`;
    if (!grade.value) return;

    const { data: subjects, error } = await sb
      .from("subjects").select("*").eq("grade_id", grade.value).order("id");
    if (error) { console.error(error); return; }
    subjects?.forEach(s => subject.appendChild(new Option(s.name, s.id)));
  });

  subject.addEventListener("change", async () => {
    chapter.innerHTML = `<option value="">Chọn chương</option>`;
    if (!subject.value) return;

    const { data: chapters, error } = await sb
      .from("chapters").select("*").eq("subject_id", subject.value).order("id");
    if (error) { console.error(error); return; }
    chapters?.forEach(c => chapter.appendChild(new Option(c.name, c.id)));
  });
}

/* =========================
   NÉN ẢNH
========================= */
async function compressImage(file) {
  return new Promise((resolve) => {
    const img    = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    img.onload = () => {
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > MAX) { h = h * (MAX / w); w = MAX; }
      if (h > MAX) { w = w * (MAX / h); h = MAX; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(resolve, "image/jpeg", 0.7);
    };
    reader.readAsDataURL(file);
  });
}

/* =========================
   LƯU CÂU HỎI
========================= */
async function saveQuestion(shouldClose = true) {
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id || null;

  const chapterVal  = chapter.value;
  const typeVal     = question_type.value;
  const diffVal     = parseInt(difficulty.value) || null;
  const questionVal = questionText.value.trim();
  const answerVal   = answerText.value.trim();

  if (!chapterVal) { alert("Vui lòng chọn chương!"); return; }
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
    boxes.forEach((box, i) => {
      tfStates.push(box.querySelector(".state")?.innerText === "Đúng" ? "T" : "F");
    });
    correctAnswer = window.QuestionAnswerFormat?.encodeTrueFalseSelections?.(tfStates, answerCount) || tfStates.join("");
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
      // Base64 mới — upload lên Storage
      try {
        const arr = figData.split(",");
        const mtype = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        const u8 = new Uint8Array(bstr.length);
        for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
        const blob = new Blob([u8], { type: mtype });
        const fileName = crypto.randomUUID() + ".jpg";
        const { error: upErr } = await sb.storage.from("question-images").upload(fileName, blob);
        if (!upErr) {
          const { data: urlData } = sb.storage.from("question-images").getPublicUrl(fileName);
          figureImgUrl = urlData.publicUrl;
        }
      } catch(e) { console.error("Upload hình vẽ lỗi:", e); }
    }
  }

  const dataObj = {
    chapter_id:    chapterVal || null,
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
