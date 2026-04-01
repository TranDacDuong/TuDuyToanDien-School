(function () {
  async function convertModalWithAI() {
    const text = document.getElementById("questionText").value.trim();
    if (!text && !window._modalPastedImg) {
      alert("Nhap noi dung hoac paste anh truoc!");
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
      });
      window._modalPastedImg = null;
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

  window.convertModalWithAI = convertModalWithAI;
})();
