(function () {
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function buildOpsAlert(title, description, page, style = "", buttonLabel = "Mở ngay") {
    return `<div class="ops-alert ${style}"><div><strong>${title}</strong><span>${description}</span></div><button class="ops-link ${style === "danger" ? "" : "secondary"}" type="button" onclick="openDashboardPage('${page}')">${buttonLabel}</button></div>`;
  }

  async function loadAdminOps() {
    const alertsEl = document.getElementById("opsAlerts");
    try {
      const today = new Date();
      const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
      const [
        { data: students },
        { data: classes },
        { data: questions },
        { data: exams },
        { data: requests },
        { data: tuitions },
        { data: logs },
        { data: examResults },
        { data: classRoster },
        { data: examAnswers },
      ] = await Promise.all([
        sb.from("users").select("id,full_name").eq("role", "student"),
        sb.from("classes").select("id,name,hidden"),
        sb.from("question_bank").select("id,answer,question_text"),
        sb.from("exams").select("id"),
        sb.from("course_registration_requests").select("id").eq("status", "pending"),
        sb.from("tuition_payments").select("id,amount_due,amount_paid").eq("month", monthStart),
        sb.from("admin_action_logs").select("id,status").eq("status", "error").order("created_at", { ascending: false }).limit(5),
        sb.from("exam_results").select("student_id,class_id,exam_id,score_auto,score_total,submitted_at,exam:exams(total_points,title)").not("submitted_at", "is", null).limit(2000),
        sb.from("class_students").select("class_id,student_id,left_at").is("left_at", null),
        sb.from("exam_answers").select("question_id,is_correct,question:question_bank(question_text)").limit(4000),
      ]);

      const questionList = questions || [];
      const normalizedMap = new Map();
      questionList.forEach((item) => {
        const key = String(item.question_text || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        if (!key) return;
        const list = normalizedMap.get(key) || [];
        list.push(item.id);
        normalizedMap.set(key, list);
      });

      let duplicateCount = 0;
      normalizedMap.forEach((ids) => {
        if (ids.length > 1) duplicateCount += ids.length;
      });

      const missingAnswerCount = questionList.filter((item) => !String(item.answer || "").trim()).length;
      const tuitionMissingCount = (tuitions || []).filter((item) => Number(item.amount_paid || 0) < Number(item.amount_due || 0)).length;
      const requestCount = (requests || []).length;
      const adminErrorCount = (logs || []).length;
      const studentNameMap = {};
      (students || []).forEach((item) => {
        studentNameMap[item.id] = item.full_name || item.id;
      });

      const submittedResults = (examResults || []).filter((item) => item.submitted_at);
      const pendingEssayCount = submittedResults.filter((item) => item.score_total === null).length;
      const normalizedScores = submittedResults
        .map((item) => {
          const totalPts = Number(item.exam?.total_points || 0);
          const score = Number(item.score_total ?? item.score_auto);
          if (!Number.isFinite(totalPts) || totalPts <= 0 || !Number.isFinite(score)) return null;
          return { ...item, ratio: score / totalPts, score, totalPts };
        })
        .filter(Boolean);

      const avgScorePct = normalizedScores.length
        ? Math.round((normalizedScores.reduce((sum, item) => sum + item.ratio, 0) / normalizedScores.length) * 100)
        : null;

      const bestByStudent = new Map();
      normalizedScores.forEach((item) => {
        const prev = bestByStudent.get(item.student_id);
        if (!prev || item.ratio > prev.ratio) bestByStudent.set(item.student_id, item);
      });
      const lowProgressStudents = Array.from(bestByStudent.values()).filter((item) => item.ratio < 0.5);

      const classStatsMap = new Map();
      normalizedScores.forEach((item) => {
        if (!item.class_id) return;
        const prev = classStatsMap.get(item.class_id) || { classId: item.class_id, total: 0, count: 0 };
        prev.total += item.ratio;
        prev.count += 1;
        classStatsMap.set(item.class_id, prev);
      });

      const classNameMap = {};
      (classes || []).forEach((item) => {
        classNameMap[item.id] = item.name || item.id;
      });

      const classPerformance = Array.from(classStatsMap.values())
        .map((item) => ({
          ...item,
          avgPct: Math.round((item.total / item.count) * 100),
          className: classNameMap[item.classId] || "Chưa đặt tên lớp",
        }))
        .sort((a, b) => a.avgPct - b.avgPct)
        .slice(0, 5);

      const examStatsMap = new Map();
      normalizedScores.forEach((item) => {
        const prev = examStatsMap.get(item.exam_id) || {
          examId: item.exam_id,
          title: item.exam?.title || "Đề kiểm tra",
          total: 0,
          count: 0,
        };
        prev.total += item.ratio;
        prev.count += 1;
        examStatsMap.set(item.exam_id, prev);
      });

      const examInsights = Array.from(examStatsMap.values())
        .map((item) => ({ ...item, avgPct: Math.round((item.total / item.count) * 100) }))
        .sort((a, b) => a.avgPct - b.avgPct);
      const hardExam = examInsights[0] || null;
      const easyExam = examInsights.length ? examInsights[examInsights.length - 1] : null;

      const activeStudents = new Set((classRoster || []).map((item) => item.student_id));
      const progressItems = Array.from(bestByStudent.values())
        .filter((item) => activeStudents.has(item.student_id))
        .sort((a, b) => a.ratio - b.ratio)
        .slice(0, 5);

      const questionStatsMap = new Map();
      (examAnswers || []).forEach((item) => {
        const key = item.question_id;
        const prev = questionStatsMap.get(key) || {
          wrong: 0,
          total: 0,
          text: String(item.question?.question_text || "").split(/\r?\n/)[0].trim(),
        };
        prev.total += 1;
        if (item.is_correct === false) prev.wrong += 1;
        questionStatsMap.set(key, prev);
      });
      const wrongQuestions = Array.from(questionStatsMap.values())
        .filter((item) => item.total >= 3)
        .map((item) => ({ ...item, wrongPct: Math.round((item.wrong / item.total) * 100) }))
        .sort((a, b) => b.wrongPct - a.wrongPct)
        .slice(0, 5);

      setText("opsStudentCount", String((students || []).length));
      setText("opsClassCount", String((classes || []).filter((item) => !item.hidden).length));
      setText("opsQuestionCount", String(questionList.length));
      setText("opsExamCount", String((exams || []).length));
      setText("opsPendingEssayCount", String(pendingEssayCount));
      setText("opsAverageScore", avgScorePct === null ? "—" : `${avgScorePct}%`);

      const alerts = [];
      if (missingAnswerCount) alerts.push(buildOpsAlert(`${missingAnswerCount} câu hỏi chưa có đáp án`, "Đây là nhóm dễ gây lỗi khi tạo đề hoặc nhập dữ liệu hàng loạt. Nên rà trước.", "question.html?answer=missing", "danger", "Rà ngay"));
      if (duplicateCount) alerts.push(buildOpsAlert(`${duplicateCount} câu nghi trùng`, "Dữ liệu trùng làm giáo viên khó chọn câu đúng và dễ tạo đề lặp.", "question.html?focus=duplicates", "warn", "Kiểm tra"));
      if (requestCount) alerts.push(buildOpsAlert(`${requestCount} yêu cầu đăng ký khóa học đang chờ`, "Nên xử lý sớm để học sinh vào học đúng tiến độ và tránh tồn đọng.", "courses.html?focus=requests", "warn", "Mở khóa học"));
      if (tuitionMissingCount) alerts.push(buildOpsAlert(`${tuitionMissingCount} học sinh còn thiếu học phí tháng này`, "Theo dõi sớm giúp hạn chế dồn nợ sang các tháng sau.", "tuition.html", "", "Xem học phí"));
      if (adminErrorCount) alerts.push(buildOpsAlert(`${adminErrorCount} thao tác admin gần đây bị lỗi`, "Nên kiểm tra lại log thao tác để tránh dữ liệu bị bỏ dở giữa chừng.", "sourcedata.html?tab=adminLogs&logStatus=error", "", "Mở log"));
      if (pendingEssayCount) alerts.push(buildOpsAlert(`${pendingEssayCount} bài tự luận đang chờ chấm`, "Nên chấm sớm để học sinh xem lại kết quả đầy đủ và giáo viên theo dõi tiến độ chuẩn hơn.", "public_exam.html", "warn", "Mở đề thi"));
      if (lowProgressStudents.length) alerts.push(buildOpsAlert(`${lowProgressStudents.length} học sinh đang có điểm tốt nhất dưới 50%`, "Nhóm này nên được theo dõi sớm để giao bài bổ trợ hoặc liên hệ giáo viên phụ trách.", "class.html", "danger", "Mở lớp học"));
      alertsEl.innerHTML = alerts.length
        ? alerts.join("")
        : '<div class="ops-empty">Hiện chưa có cảnh báo vận hành nổi bật. Hệ thống đang ở trạng thái khá sạch và ổn định.</div>';

      const classPerformanceEl = document.getElementById("opsClassPerformance");
      if (classPerformanceEl) {
        classPerformanceEl.innerHTML = classPerformance.length
          ? classPerformance.map((item) => `<div class="ops-list-item"><strong>${item.className}</strong><span>Điểm trung bình bài nộp: ${item.avgPct}% • ${item.count} lượt nộp</span></div>`).join("")
          : '<div class="ops-empty">Chưa có đủ dữ liệu điểm theo lớp.</div>';
      }

      const progressEl = document.getElementById("opsStudentProgress");
      if (progressEl) {
        progressEl.innerHTML = progressItems.length
          ? progressItems.map((item) => `<div class="ops-list-item"><strong>${studentNameMap[item.student_id] || item.student_id}</strong><span>Điểm tốt nhất hiện tại: ${Math.round(item.ratio * 100)}% • ${item.exam?.title || "Đề kiểm tra"}</span></div>`).join("")
          : '<div class="ops-empty">Chưa có nhóm học sinh nào đủ dữ liệu để cảnh báo tiến độ.</div>';
      }

      const examInsightsEl = document.getElementById("opsExamInsights");
      if (examInsightsEl) {
        const items = [];
        if (hardExam) items.push(`<div class="ops-list-item"><strong>Đề khó nhất: ${hardExam.title}</strong><span>Điểm trung bình hiện tại: ${hardExam.avgPct}% • ${hardExam.count} lượt nộp</span></div>`);
        if (easyExam && easyExam.examId !== hardExam?.examId) items.push(`<div class="ops-list-item"><strong>Đề dễ nhất: ${easyExam.title}</strong><span>Điểm trung bình hiện tại: ${easyExam.avgPct}% • ${easyExam.count} lượt nộp</span></div>`);
        examInsightsEl.innerHTML = items.length
          ? items.join("")
          : '<div class="ops-empty">Chưa đủ dữ liệu để phân loại đề khó/dễ.</div>';
      }

      const questionInsightsEl = document.getElementById("opsQuestionInsights");
      if (questionInsightsEl) {
        questionInsightsEl.innerHTML = wrongQuestions.length
          ? wrongQuestions.map((item, index) => `<div class="ops-list-item"><strong>Câu khó #${index + 1}</strong><span>${item.wrongPct}% học sinh làm sai • ${item.text || "Nội dung câu hỏi"}</span></div>`).join("")
          : '<div class="ops-empty">Chưa đủ dữ liệu để xác định câu nào hay sai.</div>';
      }
    } catch (error) {
      console.warn("loadAdminOps failed", error);
      if (alertsEl) alertsEl.innerHTML = '<div class="ops-empty">Không tải được bảng điều hành lúc này. Bạn vẫn có thể mở trực tiếp các màn quản trị để làm việc.</div>';
    }
  }

  window.DashboardOps = {
    loadAdminOps,
  };
})();
