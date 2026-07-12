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
    return /Could not find the function|schema cache|PGRST202|send_student_learning_message|upsert_student_learning_message/i.test(error?.message || "");
  }

  async function sendToAllAudiences({ studentId, content, realSenderId = null, messageKey = null }) {
    const text = cleanText(content);
    if (!studentId || !text) return { skipped: true };
    try {
      if (messageKey) {
        const { data, error } = await getSb().rpc("upsert_student_learning_message", {
          p_student_id: studentId,
          p_content: text,
          p_message_key: messageKey,
          p_real_sender_id: realSenderId || null,
          p_audience_user_ids: null,
        });
        if (!error) return { count: data || 0, upserted: true };
        if (!isMissingLearningRpc(error)) {
          console.warn("[LearningMessages] upsert all failed:", error);
          return { error };
        }
      }
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

  function scoreDistributionText(distribution) {
    const rows = Array.isArray(distribution) ? distribution : [];
    if (!rows.length) return "";
    return [
      "Phổ điểm trong lớp:",
      ...rows.map(item => {
        const count = Number(item.count || 0);
        const bar = count > 0 ? "█".repeat(Math.min(count, 12)) : "·";
        return `${item.label}: ${bar} ${count}`;
      })
    ].join("\n");
  }

  function sessionScoreContent({ studentName, className, lessonName, sessionDate, score, maxScore = 10, note, rank, totalRanked, distribution }) {
    const normalizedScore = maxScore ? Math.round((Number(score || 0) / Number(maxScore || 10)) * 100) / 10 : Number(score || 0);
    const rankLine = rank && totalRanked
      ? `Xếp hạng trong lớp: **${rank}/${totalRanked}**`
      : "";
    const distributionBlock = scoreDistributionText(distribution);
    return [
      `📊 Điểm BTVN/Đề luyện tập${className ? ` lớp **${className}**` : ""}`,
      studentName ? `Học sinh: **${studentName}**` : "",
      lessonName ? `Bài/buổi: **${lessonName}**` : "",
      sessionDate ? `Ngày học: **${sessionDate}**` : "",
      `Điểm: **${score}/${maxScore}**`,
      maxScore && Number(maxScore) !== 10 ? `Quy đổi thang 10: **${normalizedScore}/10**` : "",
      rankLine,
      distributionBlock ? `\n${distributionBlock}` : "",
      cleanText(note) ? `Ghi chú: ${cleanText(note)}` : "",
    ].filter(Boolean).join("\n");
  }

  function sessionScoreStatsBlock({ rank, totalRanked, distribution }) {
    const lines = [];
    if (rank && totalRanked) lines.push(`Xếp hạng trong lớp: **${rank}/${totalRanked}**`);
    const distributionBlock = scoreDistributionText(distribution);
    if (distributionBlock) lines.push(distributionBlock);
    return lines.join("\n\n");
  }

  function appendScoreStatsIfMissing(content, stats) {
    const text = cleanText(content);
    const block = sessionScoreStatsBlock(stats);
    if (!text || !block) return text;
    const hasRank = /xếp\s*hạng/i.test(text);
    const hasDistribution = /phổ\s*điểm/i.test(text);
    if (hasRank && hasDistribution) return text;
    const actionMatch = text.match(/\n*__(ACTION|EVALUATION)__\s*\{/i);
    if (!actionMatch || actionMatch.index === undefined) return `${text}\n\n${block}`;
    const beforeAction = text.slice(0, actionMatch.index).trimEnd();
    const actionPart = text.slice(actionMatch.index).trimStart();
    return `${beforeAction}\n\n${block}\n\n${actionPart}`.trim();
  }

  async function sessionScoreContentAsync({ studentName, className, lessonName, sessionDate, score, maxScore = 10, note, rank, totalRanked, distribution }) {
    const fallback = sessionScoreContent({ studentName, className, lessonName, sessionDate, score, maxScore, note, rank, totalRanked, distribution });
    const content = await templateContent("session_score_notice", fallback, {
      student_name: studentName || "",
      class_name: className || "",
      lesson_name: lessonName || "",
      session_date: sessionDate || "",
      score: score ?? "",
      max_score: maxScore ?? 10,
      rank: rank || "",
      total_ranked: totalRanked || "",
      score_distribution: scoreDistributionText(distribution),
      note: cleanText(note),
    });
    const withStats = appendScoreStatsIfMissing(content, { rank, totalRanked, distribution });
    return appendActionIfMissing(withStats, { type: "reply", label: "💬 Hỏi lại thầy cô" });
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
