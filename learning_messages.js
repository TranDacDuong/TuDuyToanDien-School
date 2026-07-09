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

  function notificationContent({ title, message, targetUrl }) {
    return [
      title ? `🔔 ${title}` : "🔔 Thông báo từ MindUp",
      cleanText(message),
      targetUrl ? `\n__ACTION__{"type":"url","label":"Mở chi tiết","url":"${String(targetUrl).replace(/"/g, '\\"')}"}` : "",
    ].filter(Boolean).join("\n");
  }

  window.LearningMessages = {
    BOT_NAME,
    sendToAllAudiences,
    sendToAudience,
    sessionEvaluationContent,
    sessionScoreContent,
    notificationContent,
  };
})();
