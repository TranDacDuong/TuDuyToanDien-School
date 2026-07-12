(function () {
  const BOT_NAME = "MindUp - Tư Duy Toàn Diện";

  function getSb() {
    if (window.sb) return window.sb;
    if (typeof sb !== "undefined") return sb;
    throw new Error("Supabase chưa sẵn sàng");
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  async function getTemplate(templateId, defaultContent) {
    if (!templateId) return defaultContent;
    try {
      const { data, error } = await getSb()
        .from("message_templates")
        .select("content,is_enabled")
        .eq("id", templateId)
        .maybeSingle();
      if (error) return defaultContent;
      if (data && data.is_enabled === false) return null;
      return data?.content || defaultContent;
    } catch {
      return defaultContent;
    }
  }

  function renderTemplate(template, vars = {}) {
    return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = vars[key];
      return value === undefined || value === null ? "" : String(value);
    });
  }

  async function templateContent(templateId, defaultContent, vars = {}) {
    const template = await getTemplate(templateId, defaultContent);
    if (template === null) return null;
    return renderTemplate(template, vars);
  }

  function hasEmbeddedAction(content) {
    return /__(ACTION|EVALUATION)__\s*\{/i.test(String(content || ""));
  }

  function actionToken({ type = "url", label = "Mở chi tiết", url = "" } = {}) {
    return `__ACTION__${JSON.stringify({ type, label, url })}`;
  }

  function appendActionIfMissing(content, action) {
    const text = cleanText(content);
    if (!text || hasEmbeddedAction(text) || !action) return text;
    return `${text}\n\n${actionToken(action)}`;
  }

  function isMissingLearningRpc(error) {
    return /Could not find the function|schema cache|PGRST202|send_student_learning_message/i.test(error?.message || "");
  }

  async function sendToAllAudiences({ studentId, content, realSenderId = null }) {
    const text = cleanText(content);
    if (!studentId || !text) return { skipped: true };
    try {
      const { data, error } = await getSb().rpc("send_student_learning_message", {
        p_student_id: studentId,
        p_content: text,
        p_real_sender_id: realSenderId || null,
        p_audience_user_ids: null,
      });
      if (error) {
        if (!isMissingLearningRpc(error)) console.warn("[LearningMessages] send all failed:", error);
        return { error, missingRpc: isMissingLearningRpc(error) };
      }
      return { count: data || 0 };
    } catch (error) {
      console.warn("[LearningMessages] send all exception:", error);
      return { error };
    }
  }

  async function sendToAudience({ studentId, audienceUserId, content, realSenderId = null }) {
    const text = cleanText(content);
    if (!studentId || !audienceUserId || !text) return { skipped: true };
    try {
      const { data, error } = await getSb().rpc("send_student_learning_message_to_audience", {
        p_student_id: studentId,
        p_audience_user_id: audienceUserId,
        p_content: text,
        p_real_sender_id: realSenderId || null,
      });
      if (error) {
        if (!isMissingLearningRpc(error)) console.warn("[LearningMessages] send audience failed:", error);
        return { error, missingRpc: isMissingLearningRpc(error) };
      }
      return { messageId: data || null };
    } catch (error) {
      console.warn("[LearningMessages] send audience exception:", error);
      return { error };
    }
  }

  function sessionEvaluationContent({ studentName, className, sessionDate, message }) {
    return [
      `📝 Nhận xét buổi học${className ? ` lớp **${className}**` : ""}${sessionDate ? ` ngày **${sessionDate}**` : ""}`,
      studentName ? `Học sinh: **${studentName}**` : "",
      "",
      cleanText(message),
    ].filter(line => line !== "").join("\n");
  }

  async function sessionEvaluationContentAsync({ studentName, className, sessionDate, message }) {
    const fallback = sessionEvaluationContent({ studentName, className, sessionDate, message });
    const content = await templateContent("session_evaluation_notice", fallback, {
      student_name: studentName || "",
      class_name: className || "",
      session_date: sessionDate || "",
      message: cleanText(message),
    });
    return appendActionIfMissing(content, { type: "reply", label: "💬 Phản hồi nhận xét" });
  }

  function sessionScoreContent({ studentName, className, lessonName, sessionDate, score, maxScore = 10, note }) {
    return [
      `📊 Điểm BTVN/Đề luyện tập${className ? ` lớp **${className}**` : ""}`,
      studentName ? `Học sinh: **${studentName}**` : "",
      lessonName ? `Bài/buổi: **${lessonName}**` : "",
      sessionDate ? `Ngày học: **${sessionDate}**` : "",
      `Điểm: **${score}/${maxScore}**`,
      cleanText(note) ? `Ghi chú: ${cleanText(note)}` : "",
    ].filter(Boolean).join("\n");
  }

  async function sessionScoreContentAsync({ studentName, className, lessonName, sessionDate, score, maxScore = 10, note }) {
    const fallback = sessionScoreContent({ studentName, className, lessonName, sessionDate, score, maxScore, note });
    const content = await templateContent("session_score_notice", fallback, {
      student_name: studentName || "",
      class_name: className || "",
      lesson_name: lessonName || "",
      session_date: sessionDate || "",
      score: score ?? "",
      max_score: maxScore ?? 10,
      note: cleanText(note),
    });
    return appendActionIfMissing(content, { type: "reply", label: "💬 Hỏi lại thầy cô" });
  }

  function notificationContent({ title, message, targetUrl }) {
    return [
      title ? `🔔 ${title}` : "🔔 Thông báo từ MindUp",
      cleanText(message),
      targetUrl ? `\n__ACTION__{"type":"url","label":"Mở chi tiết","url":"${String(targetUrl).replace(/"/g, '\\"')}"}` : "",
    ].filter(Boolean).join("\n");
  }

  async function notificationContentAsync({ title, message, targetUrl, templateId = "learning_notification" }) {
    const fallback = notificationContent({ title, message, targetUrl });
    const content = await templateContent(templateId, fallback, {
      title: title || "",
      message: cleanText(message),
      target_url: targetUrl || "",
    });
    return appendActionIfMissing(content, targetUrl
      ? { type: "url", label: "Mở chi tiết", url: targetUrl }
      : { type: "reply", label: "💬 Phản hồi MindUp" });
  }

  window.LearningMessages = {
    BOT_NAME,
    getTemplate,
    renderTemplate,
    templateContent,
    sendToAllAudiences,
    sendToAudience,
    sessionEvaluationContent,
    sessionEvaluationContentAsync,
    sessionScoreContent,
    sessionScoreContentAsync,
    notificationContent,
    notificationContentAsync,
  };
})();
