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

  window.PublicExamSupport = {
    getDraft,
    saveDraft,
    clearDraft,
    formatSyncTime,
    computeAnalytics,
    toast,
  };
})();
