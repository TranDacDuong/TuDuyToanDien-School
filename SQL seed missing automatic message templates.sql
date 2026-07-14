-- Seed các mẫu còn thiếu trong tab Hệ thống > Tin nhắn tự động.
-- Chạy an toàn nhiều lần: chỉ thêm mới hoặc cập nhật name/content mặc định khi chưa có.

CREATE TABLE IF NOT EXISTS public.message_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  content text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.message_templates (id, name, content, is_enabled, updated_at)
VALUES
  (
    'course_created',
    'Thông báo khóa học mới',
    '📚 MindUp vừa mở khóa học mới **{{course_name}}**.

Em hãy xem chi tiết khóa học và đăng ký nếu phù hợp nhé!

__ACTION__{"type":"url","label":"📖 Xem khóa học","url":"{{target_url}}"}',
    true,
    now()
  ),
  (
    'course_enrolled',
    'Thông báo được thêm vào khóa học',
    '✅ Em đã được thêm vào khóa học **{{course_name}}**.

Hãy vào khóa học để xem nội dung học tập, tài liệu và đề luyện tập nhé!

__ACTION__{"type":"url","label":"📖 Vào khóa học","url":"{{target_url}}"}',
    true,
    now()
  ),
  (
    'course_request_approved',
    'Duyệt yêu cầu đăng ký khóa học',
    '✅ Yêu cầu đăng ký khóa học **{{course_name}}** của em đã được duyệt.

Em đã có thể vào khóa học để bắt đầu học tập.

__ACTION__{"type":"url","label":"📖 Vào khóa học","url":"{{target_url}}"}',
    true,
    now()
  ),
  (
    'course_request_rejected',
    'Từ chối yêu cầu đăng ký khóa học',
    '⚠️ Yêu cầu đăng ký khóa học **{{course_name}}** của em chưa được duyệt.

Nếu cần hỗ trợ, em/phụ huynh hãy nhắn lại cho MindUp nhé.

__ACTION__{"type":"reply","label":"💬 Hỏi lại MindUp","url":""}',
    true,
    now()
  ),
  (
    'course_session_added',
    'Thông báo buổi học mới trong khóa học',
    '📝 Khóa học **{{course_name}}** vừa có buổi học mới.

Buổi {{session_order}}: **{{lesson_name}}**
{{session_extra}}

__ACTION__{"type":"url","label":"📖 Xem buổi học","url":"{{target_url}}"}',
    true,
    now()
  ),
  (
    'course_session_updated',
    'Thông báo cập nhật buổi học trong khóa học',
    '🔄 Buổi học trong khóa **{{course_name}}** vừa được cập nhật.

Buổi {{session_order}}: **{{lesson_name}}**
{{session_extra}}

__ACTION__{"type":"url","label":"📖 Xem cập nhật","url":"{{target_url}}"}',
    true,
    now()
  ),
  (
    'class_session_added',
    'Thông báo buổi học mới trong lớp',
    '📝 Lớp **{{class_name}}** vừa có buổi học mới.

Buổi {{session_order}}: **{{lesson_name}}**
Ngày học: **{{session_date}}**
{{session_extra}}

__ACTION__{"type":"url","label":"📖 Xem buổi học","url":"{{target_url}}"}',
    true,
    now()
  ),
  (
    'class_session_updated',
    'Thông báo cập nhật buổi học trong lớp',
    '🔄 Lớp **{{class_name}}** vừa cập nhật buổi học.

Buổi {{session_order}}: **{{lesson_name}}**
Ngày học: **{{session_date}}**
{{session_extra}}

__ACTION__{"type":"url","label":"📖 Xem cập nhật","url":"{{target_url}}"}',
    true,
    now()
  ),
  (
    'class_exam_added',
    'Thông báo tạo đề ôn tập lỗi sai',
    '⚠️ MindUp đã tạo cho em một đề ôn tập lỗi sai mới.

{{message}}

Hãy làm lại để sửa các câu chưa đúng nhé!

__ACTION__{"type":"url","label":"✏️ Làm đề ôn tập","url":"{{target_url}}"}',
    true,
    now()
  ),
  (
    'session_evaluation',
    'Thông báo nhận xét buổi học',
    '📝 MindUp gửi phụ huynh nhận xét buổi học hôm nay:

{{message}}

__ACTION__{"type":"url","label":"📖 Xem chi tiết","url":"{{target_url}}"}',
    true,
    now()
  ),
  (
    'tuition_due',
    'Nhắc học phí chưa nộp',
    '💰 Thông báo học phí

{{message}}

__ACTION__{"type":"url","label":"🧾 Xem học phí","url":"{{target_url}}"}',
    true,
    now()
  ),
  (
    'tuition_reminder',
    'Nhắc học phí còn thiếu',
    '⚠️ Nhắc học phí còn thiếu

{{message}}

__ACTION__{"type":"url","label":"🧾 Xem học phí","url":"{{target_url}}"}',
    true,
    now()
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  content = COALESCE(NULLIF(public.message_templates.content, ''), EXCLUDED.content),
  is_enabled = COALESCE(public.message_templates.is_enabled, EXCLUDED.is_enabled),
  updated_at = now();
