(function () {
  const DRAFT_PREFIX = "tdtd_public_exam_draft_v1:";

  function safeParse(json) {
    try {
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  function draftKey(resultId) {
    return `${DRAFT_PREFIX}${resultId}`;
  }

  function getDraft(resultId) {
    if (!resultId) return null;
    const payload = safeParse(localStorage.getItem(draftKey(resultId)));
    if (!payload || typeof payload !== "object") return null;
    return payload;
  }

  function saveDraft(resultId, payload) {
    if (!resultId) return;
    const nextPayload = {
      updatedAt: new Date().toISOString(),
      answers: payload?.answers || {},
      secondsLeft: Number.isFinite(payload?.secondsLeft) ? payload.secondsLeft : null,
      examId: payload?.examId || null,
      examTitle: payload?.examTitle || "",
    };
    localStorage.setItem(draftKey(resultId), JSON.stringify(nextPayload));
  }

  function clearDraft(resultId) {
    if (!resultId) return;
    localStorage.removeItem(draftKey(resultId));
  }

  function formatSyncTime(iso) {
    if (!iso) return "chưa lưu";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "chưa lưu";
    return date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function buildDifficultyMeta(avgRatio) {
    if (!Number.isFinite(avgRatio)) return { label: "Chưa đủ dữ liệu", tone: "var(--ink-light)" };
    if (avgRatio >= 0.8) return { label: "Dễ", tone: "var(--green)" };
    if (avgRatio >= 0.6) return { label: "Vừa", tone: "var(--amber)" };
    return { label: "Khó", tone: "var(--red)" };
  }

  function computeAnalytics({ results, answers, examQuestions, totalPoints, nameMap, classMap }) {
    const submitted = (results || []).filter((item) => item?.submitted_at);
    const answerRows = answers || [];
    const eqs = (examQuestions || []).filter((eq) => eq?.question);
    const totals = submitted
      .map((item) => Number(item.score_total ?? item.score_auto))
      .filter((value) => Number.isFinite(value));
    const averageScore = totals.length
      ? Math.round((totals.reduce((sum, value) => sum + value, 0) / totals.length) * 100) / 100
      : null;
    const averageRatio = averageScore !== null && totalPoints
      ? averageScore / totalPoints
      : null;
    const pendingEssayCount = submitted.filter((item) => item.score_total === null).length;
    const difficulty = buildDifficultyMeta(averageRatio);

    const questionStats = eqs.map((eq, index) => {
      const qid = eq.question.id;
      const rows = answerRows.filter((item) => item.question_id === qid);
      const answered = rows.filter((item) => String(item.answer || "").trim()).length;
      const correct = rows.filter((item) => item.is_correct === true).length;
      const wrong = rows.filter((item) => item.is_correct === false).length;
      const blank = Math.max(0, submitted.length - answered);
      const correctRate = submitted.length ? correct / submitted.length : 0;
      return {
        index: index + 1,
        qid,
        type: eq.question.question_type,
        stem: String(eq.question.question_text || "").split(/\r?\n/)[0].trim(),
        correct,
        wrong,
        blank,
        answered,
        correctRate,
      };
    });

    const hardestQuestions = questionStats
      .filter((item) => item.type !== "essay")
      .sort((a, b) => a.correctRate - b.correctRate)
      .slice(0, 5);

    const easiestQuestions = questionStats
      .filter((item) => item.type !== "essay")
      .sort((a, b) => b.correctRate - a.correctRate)
      .slice(0, 3);

    const studentBestMap = new Map();
    submitted.forEach((item) => {
      const key = item.student_id;
      const currentScore = Number(item.score_total ?? item.score_auto ?? -1);
      const prev = studentBestMap.get(key);
      const prevScore = Number(prev?.score_total ?? prev?.score_auto ?? -1);
      if (!prev || currentScore > prevScore) {
        studentBestMap.set(key, item);
      }
    });

    const studentProgress = Array.from(studentBestMap.entries())
      .map(([studentId, item]) => ({
        studentId,
        name: nameMap?.[studentId] || "Học sinh",
        className: classMap?.[item.class_id] || "",
        score: Number(item.score_total ?? item.score_auto ?? 0),
        ratio: totalPoints ? Number(item.score_total ?? item.score_auto ?? 0) / totalPoints : 0,
        submittedAt: item.submitted_at || "",
      }))
      .sort((a, b) => a.ratio - b.ratio);

    return {
      submittedCount: submitted.length,
      pendingEssayCount,
      averageScore,
      averageRatio,
      difficulty,
      questionStats,
      hardestQuestions,
      easiestQuestions,
      studentProgress,
    };
  }

  function toast(message, type = "info") {
    const el = document.createElement("div");
    const bg = type === "error"
      ? "linear-gradient(135deg,#991b1b,#ef4444)"
      : type === "success"
      ? "linear-gradient(135deg,#0f5132,#16a34a)"
      : "linear-gradient(135deg,var(--navy),#1d4ed8)";
    el.textContent = message;
    el.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:9999",
      "padding:10px 14px",
      "border-radius:12px",
      "font-size:.82rem",
      "font-weight:700",
      "color:#fff",
      "box-shadow:0 14px 34px rgba(15,23,42,.22)",
      `background:${bg}`,
      "max-width:min(90vw,360px)",
    ].join(";");
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function getSb() {
    return window.sb || sb;
  }

  function ensureQuestionReportModal() {
    let modal = document.getElementById("questionReportModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "questionReportModal";
    modal.style.cssText = "display:none;position:fixed;inset:0;z-index:4000;background:rgba(10,20,40,.52);padding:18px;align-items:center;justify-content:center";
    modal.innerHTML = `
      <div style="width:min(560px,100%);max-height:calc(100vh - 36px);overflow:auto;background:#fff;border-radius:24px;border:1px solid rgba(15,31,61,.08);box-shadow:0 24px 56px rgba(15,23,42,.24);padding:18px 18px 20px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px">
          <div>
            <div style="font-family:var(--font-display);font-size:1.08rem;color:var(--navy)">Báo lỗi câu hỏi</div>
            <div style="font-size:.8rem;color:var(--ink-light);margin-top:4px">Phản hồi này sẽ được gửi tới giáo viên hoặc admin để kiểm tra.</div>
          </div>
          <button type="button" data-report-close style="border:none;background:var(--surface);color:var(--ink-mid);width:32px;height:32px;border-radius:10px;cursor:pointer;font-weight:800">×</button>
        </div>
        <div id="questionReportStem" style="padding:12px 14px;background:#f8fbff;border:1px solid var(--border);border-radius:16px;font-size:.86rem;line-height:1.6;color:var(--ink);white-space:pre-line"></div>
        <div style="display:grid;gap:12px;margin-top:14px">
          <div>
            <label style="display:block;font-size:.76rem;font-weight:800;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Loại lỗi</label>
            <select id="questionReportType" style="width:100%;padding:11px 12px;border:1.5px solid var(--border);border-radius:12px;font:inherit;background:#fff">
              <option value="question_content">Nội dung câu hỏi sai</option>
              <option value="wrong_answer">Đáp án sai</option>
              <option value="image_formula">Hình / công thức lỗi</option>
              <option value="other">Khác</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:.76rem;font-weight:800;color:var(--ink-mid);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Ghi chú thêm</label>
            <textarea id="questionReportNote" style="width:100%;min-height:120px;padding:12px 14px;border:1.5px solid var(--border);border-radius:14px;font:inherit;resize:vertical" placeholder="Ví dụ: đáp án em chọn đúng nhưng hệ thống chấm sai, hoặc công thức đang hiển thị thiếu..."></textarea>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:16px">
          <button type="button" class="btn btn-outline" data-report-close>Hủy</button>
          <button type="button" class="btn btn-primary" id="questionReportSubmit">Gửi báo lỗi</button>
        </div>
      </div>
    `;
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target?.dataset?.reportClose !== undefined) {
        modal.style.display = "none";
      }
    });
    document.body.appendChild(modal);
    return modal;
  }

  async function submitQuestionReport(payload) {
    const user = await window.AppAuth?.getUser?.();
    if (!user) throw new Error("Bạn cần đăng nhập để gửi báo lỗi.");
    const report = {
      question_id: payload.questionId,
      reporter_id: user.id,
      public_exam_id: payload.publicExamId || null,
      exam_result_id: payload.examResultId || null,
      report_type: payload.reportType,
      note: String(payload.note || "").trim() || null,
      source_mode: payload.sourceMode || "review",
      status: "new",
    };
    const { error } = await getSb().from("question_issue_reports").insert(report);
    if (error) throw error;
  }

  function openQuestionReportModal(payload) {
    const modal = ensureQuestionReportModal();
    const stemEl = modal.querySelector("#questionReportStem");
    const typeEl = modal.querySelector("#questionReportType");
    const noteEl = modal.querySelector("#questionReportNote");
    const submitBtn = modal.querySelector("#questionReportSubmit");
    stemEl.textContent = payload.questionStem || "Câu hỏi đang được báo lỗi";
    typeEl.value = "question_content";
    noteEl.value = "";
    modal.style.display = "flex";

    submitBtn.onclick = async () => {
      submitBtn.disabled = true;
      submitBtn.textContent = "Đang gửi...";
      try {
        await submitQuestionReport({
          questionId: payload.questionId,
          publicExamId: payload.publicExamId,
          examResultId: payload.examResultId,
          sourceMode: payload.sourceMode,
          reportType: typeEl.value,
          note: noteEl.value,
        });
        modal.style.display = "none";
        toast("Đã gửi báo lỗi câu hỏi.", "success");
        if (typeof payload.onSubmitted === "function") payload.onSubmitted();
      } catch (error) {
        const message = String(error?.message || "");
        if (message.toLowerCase().includes("question_issue_reports")) {
          toast("Thiếu bảng báo lỗi câu hỏi. Hãy chạy SQL mới.", "error");
        } else {
          toast(message || "Không gửi được báo lỗi.", "error");
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Gửi báo lỗi";
      }
    };
  }

  window.PublicExamSupport = {
    getDraft,
    saveDraft,
    clearDraft,
    formatSyncTime,
    computeAnalytics,
    toast,
    openQuestionReportModal,
    submitQuestionReport,
  };
})();
