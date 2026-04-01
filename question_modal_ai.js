(function () {
  async function convertModalWithAI() {
    const text = document.getElementById("questionText").value.trim();
    if (!text && !window._modalPastedImg && !window._modalPdfDataUrl) {
      alert("Nhap noi dung, paste anh hoac upload PDF truoc!");
      return;
    }

    const btn = document.getElementById("qAiBtn");
    const hint = document.getElementById("qAiHint");
    btn.disabled = true;
    btn.innerHTML = '<span class="spin">...</span> Dang phan tich...';
    hint.textContent = "AI dang xu ly...";
    hint.style.color = "";

    try {
      const shared = window.QuestionAIShared;
      if (!shared?.convertToQuestions) throw new Error("Chua tai xong bo AI dung chung.");
      const { questions, warnings } = await shared.convertToQuestions({
        text,
        dataUrl: window._modalPastedImg,
        pdfDataUrl: window._modalPdfDataUrl,
      });
      window._modalPastedImg = null;
      window._modalPdfDataUrl = null;
      if (warnings?.length) {
        hint.textContent = `AI da chuan hoa ${warnings.length} chi tiet, nho kiem tra lai truoc khi luu.`;
        hint.style.color = "#b45309";
      }
      window.startMultiQuestion?.(questions);
    } catch (err) {
      hint.textContent = err.message || "AI khong xu ly duoc noi dung nay.";
      hint.style.color = "var(--red,#ef4444)";
      alert("Loi AI: " + err.message);
    }

    btn.disabled = false;
    btn.innerHTML = "Chuyen doi voi AI";
  }

  async function handleModalPdfChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const hint = document.getElementById("qAiHint");
    const aiBtn = document.getElementById("qAiBtn");

    try {
      const shared = window.QuestionAIShared;
      const validation = shared?.validateFileSize(file, "pdf");
      if (validation && !validation.ok) throw new Error(validation.message);
      if (!shared?.readFileAsDataUrl) throw new Error("Chua tai xong bo AI dung chung.");

      window.clearModalPdfPreview?.();
      window._modalPastedImg = null;
      window._modalPdfDataUrl = await shared.readFileAsDataUrl(file);
      hint.textContent = "Da tai PDF. Bam Chuyen doi voi AI de xu ly ngay.";
      hint.style.color = "var(--green)";
      if (aiBtn) aiBtn.disabled = false;
    } catch (err) {
      window.clearModalPdfPreview?.();
      window._modalPastedImg = null;
      window._modalPdfDataUrl = null;
      hint.textContent = err.message || "PDF khong hop le.";
      hint.style.color = "var(--red,#ef4444)";
      if (aiBtn) aiBtn.disabled = false;
    }

    e.target.value = "";
  }

  window.convertModalWithAI = convertModalWithAI;
  const pdfInput = document.getElementById("qPdfFile");
  if (pdfInput) pdfInput.onchange = handleModalPdfChange;
})();
