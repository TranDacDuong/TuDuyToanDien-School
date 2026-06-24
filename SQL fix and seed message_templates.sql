-- ====================================================================
-- SQL Migration & Seeding: Khởi tạo và đồng bộ mẫu tin nhắn MindUp Bot
-- Chạy trong Supabase > SQL Editor để đảm bảo bảng tồn tại và có đủ dữ liệu
-- ====================================================================

-- 1. Đảm bảo bảng tồn tại
CREATE TABLE IF NOT EXISTS public.message_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  content     TEXT NOT NULL,
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bật Row Level Security (RLS)
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- 3. Xoá policy cũ nếu có để tránh xung đột trùng lặp
DROP POLICY IF EXISTS "Admin can manage message_templates" ON public.message_templates;
DROP POLICY IF EXISTS "msg_templates_admin_all" ON public.message_templates;
DROP POLICY IF EXISTS "msg_templates_read_authenticated" ON public.message_templates;

-- 4. Tạo Policy cho Admin & Giáo viên (Full quyền Đọc + Ghi)
CREATE POLICY "msg_templates_admin_all"
  ON public.message_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

-- 5. Tạo Policy cho mọi user đã đăng nhập đều có quyền Đọc (để hệ thống gửi tin nhắn tự động gọi mẫu)
CREATE POLICY "msg_templates_read_authenticated"
  ON public.message_templates
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 6. Nạp dữ liệu (seed) các mẫu mặc định nếu chưa tồn tại
INSERT INTO public.message_templates (id, name, content, is_enabled) VALUES
('exam_result', 'Báo cáo kết quả bài làm', '📊 Chúc mừng em đã hoàn thành đề *{{exam_title}}* với kết quả **{{score}}/{{total_points}}** điểm!

Hãy xem lại chi tiết bài làm để rút kinh nghiệm cho các câu chưa đúng nhé! 💪

__ACTION__{"type":"view_result","label":"👁 Xem lại bài làm","url":"{{review_url}}"}', true),

('low_score_review', 'Cảnh báo điểm thấp & đề ôn tập', '⚠️ Kết quả đề luyện tập *{{exam_title}}* của em chưa đạt yêu cầu (**{{score}}/{{total_points}}** điểm).

Thầy cô đã tạo riêng cho em một **Đề ôn tập lỗi sai** cùng chủ đề. Hãy làm ngay để sửa các lỗi sai nhé!

__ACTION__{"type":"open_exam","label":"✏️ Làm đề ôn tập","url":"{{review_exam_url}}"}', true),

('review_exam_reminder', 'Nhắc làm đề ôn tập lỗi sai', '⏰ Nhắc nhở: Đề ôn tập lỗi sai **"{{exam_title}}"** của em vẫn chưa được hoàn thành.

Hãy dành ra 15 phút làm bài để sửa các câu đã làm sai nhé! 📚

__ACTION__{"type":"open_exam","label":"✏️ Làm đề ôn tập","url":"{{review_exam_url}}"}', true),

('absent_notification', 'Thông báo vắng học (1 buổi)', '😔 Hôm nay em **{{student_name}}** đã vắng mặt trong buổi học lớp **{{class_name}}** ngày **{{session_date}}**.

Thầy cô rất nhớ em, không biết em có gặp khó khăn gì không? Hãy nhắn lại cho thầy cô nhé!

__ACTION__{"type":"reply","label":"📞 Liên hệ thầy cô","url":""}', true),

('consecutive_absent_warning', 'Cảnh báo vắng liên tiếp', '🚨 Thầy cô nhận thấy em **{{student_name}}** đã nghỉ học **{{absent_count}} buổi liên tiếp** tại lớp **{{class_name}}**.

Việc nghỉ nhiều có thể khiến em bị hổng kiến thức. Trợ giảng đã sẵn sàng hỗ trợ em học bù, hãy nhắn lại ngay nhé!

__ACTION__{"type":"reply","label":"💬 Nhắn trợ giảng học bù","url":""}', true),

('session_reminder_1h', 'Nhắc lịch học (1 giờ trước)', '⏰ Nhắc nhở: Lớp học **{{class_name}}** của em sẽ bắt đầu lúc **{{start_time}}** hôm nay. Đừng quên chuẩn bị bài và tài liệu nhé! 📚', true),

('session_reminder_7h', 'Nhắc lịch học (7 giờ sáng)', '🌅 Chào buổi sáng! Hôm nay em có buổi học lớp **{{class_name}}** lúc **{{start_time}}**. Chuẩn bị tinh thần tốt nhé! ☀️', true),

('new_exam_notification', 'Thông báo đề luyện tập mới', '📝 Thầy cô vừa mở đề luyện tập mới **"{{exam_title}}"** cho lớp **{{class_name}}**. Em hãy vào làm để củng cố bài học nhé!

__ACTION__{"type":"open_exam","label":"📝 Làm bài ngay","url":"{{exam_url}}"}', true),

('session_evaluation_widget', 'Đánh giá buổi học (khảo sát)', '⭐ Buổi học lớp **{{class_name}}** hôm nay thế nào em nhỉ? Hãy cho thầy cô biết mức độ hiểu bài của em nhé!

__EVALUATION__{"sessionId":"{{session_id}}","options":[{"value":"understood","label":"😊 Hiểu bài"},{"value":"partial","label":"😐 Mơ hồ"},{"value":"confused","label":"🙁 Khó hiểu"}]}', true),

('praise_high_score', 'Khen ngợi điểm xuất sắc (≥9đ)', '🌟 Xuất sắc! Em đã đạt thành tích **{{score}}/{{total_points}}** điểm trong đề luyện tập *{{exam_title}}*.

Thầy cô rất tự hào về sự cố gắng của em! Tiếp tục phát huy nhé! 🏆', true),

('praise_improvement', 'Khen ngợi tiến bộ thông thường', '📈 Khen ngợi em đã có sự tiến bộ! Điểm số của em trong đề luyện tập *{{exam_title}}* đã tăng **+{{improvement}}** điểm so với lần trước cùng môn.

Sự nỗ lực không ngừng nghỉ của em đang đơm hoa kết trái! 🌸', true),

('praise_big_improvement', 'Ghi nhận tiến bộ vượt bậc (≥3đ)', '🎉 Tuyệt vời! Thầy cô ghi nhận sự tiến bộ vượt bậc của em!

Điểm số đề *{{exam_title}}* của em đã tăng **+{{improvement}} điểm** so với đề trước cùng môn, đạt **{{score}}/{{total_points}}** điểm.

Sự cố gắng không ngừng nghỉ của em đang mang lại quả ngọt đó! 🍀', true),

('late_study_warning', 'Cảnh báo học muộn (sau 23:30)', '🌙 Thầy cô thấy em vừa hoàn thành đề luyện tập *{{exam_title}}* vào lúc đêm muộn.

Rất khen tinh thần tự giác của em, nhưng hãy cố gắng sắp xếp học sớm hơn để bảo vệ sức khỏe và đầu óc minh mẫn nhé! 💤', true),

('tuition_reminder_1', 'Nhắc học phí (ngày 1 tháng)', '💰 Thông báo học phí: Tháng **{{month_label}}** đã bắt đầu. Học phí lớp **{{class_name}}** cho học sinh **{{student_name}}** cần được nộp trước ngày 10/{{month}}. Cảm ơn quý phụ huynh đã đồng hành cùng MindUp! 🙏', true),

('tuition_reminder_3', 'Nhắc học phí (ngày 8 - còn 2 ngày)', '⚠️ Nhắc nhở: Còn 2 ngày nữa là đến hạn nộp học phí tháng **{{month_label}}** cho học sinh **{{student_name}}**. Vui lòng hoàn thành trước ngày 10/{{month}} để tránh gián đoạn học tập!', true),

('tuition_overdue', 'Thông báo học phí quá hạn', '🚨 Học phí tháng **{{month_label}}** của học sinh **{{student_name}}** lớp **{{class_name}}** đã quá hạn nộp. Vui lòng liên hệ nhà trường ngay để sắp xếp việc nộp học phí. Trân trọng!', true),

('tuition_confirmed', 'Xác nhận học phí đã nộp thành công', '✅ MindUp xác nhận đã nhận đủ học phí **tháng {{month_label}}** của học sinh **{{student_name}}** lớp **{{class_name}}** (số tiền: **{{amount}}đ**).

Cảm ơn quý phụ huynh đã luôn đồng hành cùng MindUp! 🙏

__ACTION__{"type":"url","label":"🧾 Xem lịch sử học phí","url":"tuition.html"}', true),

('birthday_wish', 'Chúc mừng sinh nhật', '🎉🎂 Chúc mừng sinh nhật em **{{student_name}}**!

MindUp - Tư Duy Toàn Diện chúc em tuổi mới luôn tràn đầy niềm vui, sức khỏe dồi dào, học tập thật tốt và đạt được nhiều kết quả cao trong năm học này nhé! 🌟', true),

('welcome_new_student', 'Chào mừng học viên mới', '🚀 Chào mừng em **{{student_name}}** đã chính thức gia nhập gia đình MindUp - Tư Duy Toàn Diện!

Đây là kênh liên hệ trực tiếp 24/7 giữa em và thầy cô. Bất cứ khi nào có câu hỏi hoặc cần hỗ trợ, em cứ nhắn tin ở đây nhé. Cùng nhau chinh phục các điểm số cao! 🏆

__ACTION__{"type":"url","label":"📖 Hướng dẫn học tập","url":"courses.html"}', true)
ON CONFLICT (id) DO NOTHING;
