/**
 * mindup_bot.js
 * Helper gửi tin nhắn tự động dưới danh nghĩa MindUp - Tư Duy Toàn Diện
 * Tất cả tin nhắn từ hệ thống đều gửi qua hàm này.
 */
(function () {
  // ID của tài khoản Bot MindUp trong bảng users
  const MINDUP_BOT_ID = '00000000-0000-0000-0000-000000000001';

  function getSb() {
    if (window.sb) return window.sb;
    if (typeof sb !== 'undefined') return sb;
    throw new Error('Supabase chưa sẵn sàng');
  }

  /**
   * Lấy hoặc tạo cuộc trò chuyện giữa MindUp Bot và một user
   * (Dùng SECURITY DEFINER RPC để bỏ qua RLS)
   */
  async function ensureBotConversation(userId) {
    const sb = getSb();
    const { data, error } = await sb.rpc('ensure_bot_conversation', { p_user_id: userId });
    if (error) throw error;
    return data;
  }


  /**
   * Lấy template tin nhắn từ database (hoặc dùng mặc định nếu chưa có)
   */
  async function getTemplate(templateId, defaultContent) {
    try {
      const sb = getSb();
      const { data } = await sb
        .from('message_templates')
        .select('content, is_enabled')
        .eq('id', templateId)
        .maybeSingle();
      if (data && data.is_enabled === false) return null; // Đã bị tắt
      return data?.content || defaultContent;
    } catch {
      return defaultContent;
    }
  }

  /**
   * Render template: thay thế các placeholder {{key}} bằng giá trị thực tế
   */
  function renderTemplate(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
  }

  function buildSessionUnderstandingScale(sessionId) {
    const options = Array.from({ length: 11 }, (_, score) => ({
      value: String(score),
      label: score === 0
        ? '0 - Không hiểu bài'
        : score === 10
          ? '10 - Hiểu bài'
          : String(score)
    }));
    return '__EVALUATION__' + JSON.stringify({ sessionId, scale: '0_10_understanding', options });
  }

  /**
   * Hàm gốc: Gửi một tin nhắn từ Bot MindUp đến một user
   * @param {string} userId - ID người nhận
   * @param {string} content - Nội dung tin nhắn (có thể chứa __ACTION__JSON cho interactive)
   * @param {string|null} realSenderId - ID người gửi thực sự (null = hệ thống tự động)
   */
  async function sendBotMessage(userId, content, realSenderId = null) {
    if (!userId || !content) return null;
    try {
      const sb = getSb();
      const conversationId = await ensureBotConversation(userId);

      // Dùng SECURITY DEFINER RPC để bypass RLS
      const { data: msgId, error } = await sb.rpc('send_bot_message', {
        p_conversation_id: conversationId,
        p_content: content,
        p_real_sender_id: realSenderId || null
      });

      if (error) {
        console.warn('[MindUpBot] Không gửi được tin nhắn:', error.message);
        return null;
      }
      mirrorStudentBotMessage(userId, content, realSenderId).catch(() => {});
      return msgId || null;
    } catch (err) {
      console.warn('[MindUpBot] Lỗi khi gửi tin nhắn:', err);
      return null;
    }
  }

  async function mirrorStudentBotMessage(userId, content, realSenderId = null) {
    if (!window.LearningMessages || !userId || !content) return;
    try {
      const sb = getSb();
      const { data } = await sb.from('users').select('id,role').eq('id', userId).maybeSingle();
      if (data?.role !== 'student') return;
      await window.LearningMessages.sendToAllAudiences({
        studentId: userId,
        content,
        realSenderId: realSenderId || null
      });
    } catch (error) {
      console.warn('[MindUpBot] Không mirror được tin học tập:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CÁC HÀM GỬI TIN NHẮN THEO TỪNG LOẠI SỰ KIỆN
  // ═══════════════════════════════════════════════════════════

  /**
   * Tin nhắn 7: Báo cáo kết quả làm bài
   */
  async function sendExamResultMessage(studentId, { examTitle, score, totalPoints, resultId, examId, courseId, classId }) {
    const defaultContent =
      '📊 Chúc mừng em đã hoàn thành đề *{{exam_title}}* với kết quả **{{score}}/{{total_points}}** điểm!\n\nHãy xem lại chi tiết bài làm để rút kinh nghiệm cho các câu chưa đúng nhé! 💪\n\n__ACTION__{"type":"view_result","label":"👁 Xem lại bài làm","url":"{{review_url}}"}';

    const tpl = await getTemplate('exam_result', defaultContent);
    if (!tpl) return null;

    let reviewUrl = '';
    if (classId && resultId) {
      reviewUrl = `class.html?openClassId=${classId}&resultId=${resultId}`;
    } else if (courseId && examId) {
      reviewUrl = `course_practice.html?examId=${examId}&courseId=${courseId}`;
    }

    const content = renderTemplate(tpl, {
      exam_title: examTitle,
      score: score,
      total_points: totalPoints,
      review_url: reviewUrl
    });

    return sendBotMessage(studentId, content);
  }

  /**
   * Tin nhắn 8: Cảnh báo điểm thấp & thông báo đề ôn tập lỗi sai được tạo
   */
  async function sendLowScoreAndReviewExamMessage(studentId, { examTitle, score, totalPoints, reviewExamId, courseId, classId }) {
    const defaultContent =
      '⚠️ Kết quả đề luyện tập *{{exam_title}}* của em chưa đạt yêu cầu (**{{score}}/{{total_points}}** điểm).\n\nThầy cô đã tạo riêng cho em một **Đề ôn tập lỗi sai** cùng chủ đề. Hãy làm ngay để sửa các lỗi sai nhé!\n\n__ACTION__{"type":"open_exam","label":"✏️ Làm đề ôn tập","url":"{{review_exam_url}}"}';

    const tpl = await getTemplate('low_score_review', defaultContent);
    if (!tpl) return null;

    let reviewExamUrl = '';
    if (classId) {
      reviewExamUrl = `class.html?openClassId=${classId}`;
    } else if (courseId && reviewExamId) {
      reviewExamUrl = `course_practice.html?examId=${reviewExamId}&courseId=${courseId}`;
    }

    const content = renderTemplate(tpl, {
      exam_title: examTitle,
      score: score,
      total_points: totalPoints,
      review_exam_url: reviewExamUrl
    });

    return sendBotMessage(studentId, content);
  }

  /**
   * Tin nhắn 9: Nhắc làm đề ôn tập lỗi sai (Gửi sau 2 ngày nếu chưa làm)
   */
  async function sendReviewExamReminderMessage(studentId, { examTitle, reviewExamId, courseId, classId }) {
    const defaultContent =
      '⏰ Nhắc nhở: Đề ôn tập lỗi sai **"{{exam_title}}"** của em vẫn chưa được hoàn thành.\n\nHãy dành ra 15 phút làm bài để sửa các câu đã làm sai nhé! 📚\n\n__ACTION__{"type":"open_exam","label":"✏️ Làm đề ôn tập","url":"{{review_exam_url}}"}';

    const tpl = await getTemplate('review_exam_reminder', defaultContent);
    if (!tpl) return null;

    let reviewExamUrl = '';
    if (classId) {
      reviewExamUrl = `class.html?openClassId=${classId}`;
    } else if (courseId && reviewExamId) {
      reviewExamUrl = `course_practice.html?examId=${reviewExamId}&courseId=${courseId}`;
    }

    const content = renderTemplate(tpl, {
      exam_title: examTitle,
      review_exam_url: reviewExamUrl
    });

    return sendBotMessage(studentId, content);
  }

  /**
   * Tin nhắn 10: Khen ngợi thành tích xuất sắc / tiến bộ
   */
  async function sendPraiseMessage(studentId, { examTitle, score, totalPoints, isHighScore, improvement }) {
    let defaultContent, templateId;
    if (isHighScore) {
      defaultContent =
        '🌟 Xuất sắc! Em đã đạt thành tích **{{score}}/{{total_points}}** điểm trong đề luyện tập *{{exam_title}}*.\n\nThầy cô rất tự hào về sự cố gắng của em! Tiếp tục phát huy nhé! 🏆\n\n__ACTION__{"type":"reply","label":"💬 Phản hồi thầy cô","url":""}';
      templateId = 'praise_high_score';
    } else {
      defaultContent =
        '📈 Khen ngợi em **{{student_name}}** đã có sự tiến bộ vượt bậc! Điểm số của em trong đề luyện tập *{{exam_title}}* đã tăng **+{{improvement}}** điểm so với lần trước cùng môn.\n\nSự nỗ lực không ngừng nghỉ của em đang đơm hoa kết trái! 🌸\n\n__ACTION__{"type":"reply","label":"💬 Phản hồi thầy cô","url":""}';
      templateId = 'praise_improvement';
    }

    const tpl = await getTemplate(templateId, defaultContent);
    if (!tpl) return null;

    const content = renderTemplate(tpl, {
      exam_title: examTitle,
      score: score,
      total_points: totalPoints,
      improvement: improvement || ''
    });

    return sendBotMessage(studentId, content);
  }

  /**
   * Tin nhắn 11: Tiến bộ vượt bậc (tăng từ 3 điểm trở lên)
   */
  async function sendBigImprovementMessage(studentId, { examTitle, score, totalPoints, improvement }) {
    const defaultContent =
      '🎉 Tuyệt vời! Thầy cô ghi nhận sự tiến bộ vượt bậc của em!\n\nĐiểm số đề *{{exam_title}}* của em đã tăng **+{{improvement}} điểm** so với đề trước cùng môn, đạt **{{score}}/{{total_points}}** điểm.\n\nSự cố gắng không ngừng nghỉ của em đang mang lại quả ngọt đó! 🍀\n\n__ACTION__{"type":"reply","label":"💬 Phản hồi thầy cô","url":""}';

    const tpl = await getTemplate('praise_big_improvement', defaultContent);
    if (!tpl) return null;

    const content = renderTemplate(tpl, {
      exam_title: examTitle,
      score: score,
      total_points: totalPoints,
      improvement: improvement
    });

    return sendBotMessage(studentId, content);
  }

  /**
   * Tin nhắn 12: Cảnh báo học tập muộn
   */
  async function sendLateStudyWarningMessage(studentId, { examTitle }) {
    const defaultContent =
      '🌙 Thầy cô thấy em vừa hoàn thành đề luyện tập *{{exam_title}}* vào lúc đêm muộn.\n\nRất khen tinh thần tự giác của em, nhưng hãy cố gắng sắp xếp học sớm hơn để bảo vệ sức khỏe và đầu óc minh mẫn nhé! 💤\n\n__ACTION__{"type":"reply","label":"💬 Phản hồi thầy cô","url":""}';

    const tpl = await getTemplate('late_study_warning', defaultContent);
    if (!tpl) return null;

    const content = renderTemplate(tpl, { exam_title: examTitle });
    return sendBotMessage(studentId, content);
  }

  /**
   * Tin nhắn 5: Thông báo đề luyện tập mới
   */
  async function sendNewExamNotification(studentId, { examTitle, className, examId, courseId, classId }) {
    const defaultContent =
      '📝 Thầy cô vừa mở đề luyện tập mới **"{{exam_title}}"** cho lớp **{{class_name}}**. Em hãy vào làm để củng cố bài học nhé!\n\n__ACTION__{"type":"open_exam","label":"📝 Làm bài ngay","url":"{{exam_url}}"}';

    const tpl = await getTemplate('new_exam_notification', defaultContent);
    if (!tpl) return null;

    let examUrl = '';
    if (classId) examUrl = `class.html?openClassId=${classId}`;
    else if (courseId && examId) examUrl = `course_practice.html?examId=${examId}&courseId=${courseId}`;

    const content = renderTemplate(tpl, {
      exam_title: examTitle,
      class_name: className,
      exam_url: examUrl
    });

    return sendBotMessage(studentId, content);
  }

  /**
   * Tin nhắn 3: Báo vắng học (1 buổi) — gọi sau khi điểm danh
   */
  async function sendAbsentMessage(studentId, { studentName, className, sessionDate }) {
    const defaultContent =
      '😔 Hôm nay em **{{student_name}}** đã vắng mặt trong buổi học lớp **{{class_name}}** ngày **{{session_date}}**.\n\nThầy cô rất nhớ em, không biết em có gặp khó khăn gì không? Hãy nhắn lại cho thầy cô nhé!\n\n__ACTION__{"type":"reply","label":"📞 Liên hệ thầy cô","url":""}';

    const tpl = await getTemplate('absent_notification', defaultContent);
    if (!tpl) return null;

    const content = renderTemplate(tpl, {
      student_name: studentName,
      class_name: className,
      session_date: sessionDate
    });

    return sendBotMessage(studentId, content);
  }

  /**
   * Tin nhắn 4: Cảnh báo vắng liên tiếp — gọi sau khi điểm danh
   */
  async function sendConsecutiveAbsentMessage(studentId, { studentName, className, absentCount }) {
    const defaultContent =
      '🚨 Thầy cô nhận thấy em **{{student_name}}** đã nghỉ học **{{absent_count}} buổi liên tiếp** tại lớp **{{class_name}}**.\n\nViệc nghỉ nhiều có thể khiến em bị hổng kiến thức. Trợ giảng đã sẵn sàng hỗ trợ em học bù, hãy nhắn lại ngay nhé!\n\n__ACTION__{"type":"reply","label":"💬 Nhắn trợ giảng học bù","url":""}';

    const tpl = await getTemplate('consecutive_absent_warning', defaultContent);
    if (!tpl) return null;

    const content = renderTemplate(tpl, {
      student_name: studentName,
      class_name: className,
      absent_count: absentCount
    });

    return sendBotMessage(studentId, content);
  }

  /**
   * Tin nhắn 13: Yêu cầu đánh giá buổi học (Interactive Widget)
   */
  async function sendSessionEvaluationWidget(studentId, { className, sessionId }) {
    const defaultContent =
      '⭐ Buổi học lớp **{{class_name}}** hôm nay thế nào em nhỉ? Hãy chấm mức độ hiểu bài của em theo thang điểm từ **0 đến 10** nhé!\n\n0 = Không hiểu bài, 10 = Hiểu bài\n\n__EVALUATION__{"sessionId":"{{session_id}}","scale":"0_10_understanding","options":[{"value":"0","label":"0 - Không hiểu bài"},{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3","label":"3"},{"value":"4","label":"4"},{"value":"5","label":"5"},{"value":"6","label":"6"},{"value":"7","label":"7"},{"value":"8","label":"8"},{"value":"9","label":"9"},{"value":"10","label":"10 - Hiểu bài"}]}';

    const tpl = await getTemplate('session_evaluation_widget', defaultContent);
    if (!tpl) return null;

    const rendered = renderTemplate(tpl, {
      class_name: className,
      session_id: sessionId
    });
    const baseContent = rendered.replace(/__EVALUATION__[\s\S]*$/i, '').trim();
    const helperLine = /0\s*=|0\s*-/i.test(baseContent) && /10\s*=|10\s*-/i.test(baseContent)
      ? ''
      : '\n\n0 = Không hiểu bài, 10 = Hiểu bài';
    const content = `${baseContent}${helperLine}\n\n${buildSessionUnderstandingScale(sessionId)}`;

    return sendBotMessage(studentId, content);
  }

  /**
   * Tin nhắn 19: Chào mừng học viên mới
   */
  async function sendWelcomeMessage(studentId, { studentName }) {
    const defaultContent =
      '🚀 Chào mừng em **{{student_name}}** đã chính thức gia nhập gia đình MindUp - Tư Duy Toàn Diện!\n\nĐây là kênh liên hệ trực tiếp 24/7 giữa em và thầy cô. Bất cứ khi nào có câu hỏi hoặc cần hỗ trợ, em cứ nhắn tin ở đây nhé. Cùng nhau chinh phục các điểm số cao! 🏆\n\n__ACTION__{"type":"url","label":"📖 Hướng dẫn học tập","url":"courses.html"}';

    const tpl = await getTemplate('welcome_new_student', defaultContent);
    if (!tpl) return null;

    const content = renderTemplate(tpl, { student_name: studentName });
    return sendBotMessage(studentId, content);
  }

  /**
   * Tin nhắn 17: Xác nhận nộp học phí thành công
   */
  async function sendTuitionConfirmMessage(parentId, { studentName, className, monthLabel, amount }) {
    const defaultContent =
      '✅ MindUp xác nhận đã nhận đủ học phí **tháng {{month_label}}** của học sinh **{{student_name}}** lớp **{{class_name}}** (số tiền: **{{amount}}đ**).\n\nCảm ơn quý phụ huynh đã luôn đồng hành cùng MindUp! 🙏\n\n__ACTION__{"type":"url","label":"🧾 Xem lịch sử học phí","url":"tuition.html"}';

    const tpl = await getTemplate('tuition_confirmed', defaultContent);
    if (!tpl) return null;

    const content = renderTemplate(tpl, {
      student_name: studentName,
      class_name: className,
      month_label: monthLabel,
      amount: amount?.toLocaleString('vi-VN') || '0'
    });

    return sendBotMessage(parentId, content);
  }

  /**
   * Tin nhắn 18: Chúc mừng sinh nhật (gọi từ cron hoặc từ login của học sinh)
   */
  async function sendBirthdayMessage(studentId, { studentName }) {
    const defaultContent =
      '🎉🎂 Chúc mừng sinh nhật em **{{student_name}}**!\n\nMindUp - Tư Duy Toàn Diện chúc em tuổi mới luôn tràn đầy niềm vui, sức khỏe dồi dào, học tập thật tốt và đạt được nhiều kết quả cao trong năm học này nhé! 🌟\n\n__ACTION__{"type":"reply","label":"💬 Gửi lời cảm ơn","url":""}';

    const tpl = await getTemplate('birthday_wish', defaultContent);
    if (!tpl) return null;

    const content = renderTemplate(tpl, { student_name: studentName });
    return sendBotMessage(studentId, content);
  }

  // Export ra window
  window.MindUpBot = {
    BOT_ID: MINDUP_BOT_ID,
    sendBotMessage,
    ensureBotConversation,
    // Các hàm theo loại sự kiện
    sendExamResultMessage,
    sendLowScoreAndReviewExamMessage,
    sendReviewExamReminderMessage,
    sendPraiseMessage,
    sendBigImprovementMessage,
    sendLateStudyWarningMessage,
    sendNewExamNotification,
    sendAbsentMessage,
    sendConsecutiveAbsentMessage,
    sendSessionEvaluationWidget,
    sendWelcomeMessage,
    sendTuitionConfirmMessage,
    sendBirthdayMessage,
  };
})();
