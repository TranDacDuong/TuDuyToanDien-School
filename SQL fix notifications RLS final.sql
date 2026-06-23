-- ============================================
-- Fix notifications RLS policies (FINAL)
-- Chạy từng câu lệnh hoặc toàn bộ trong Supabase SQL Editor
-- Không dùng DO block để tránh lỗi cú pháp
-- ============================================

-- Bước 1: Xoá hết tất cả policy cũ (chạy tất cả DROP bên dưới)
DROP POLICY IF EXISTS notifications_select_policy         ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_policy         ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_actor_policy   ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_staff_policy   ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_trial_policy   ON public.notifications;
DROP POLICY IF EXISTS notifications_update_policy         ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_policy         ON public.notifications;

-- Bước 2: Đảm bảo RLS được bật
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Bước 3: Policy SELECT - người nhận và người gửi đều đọc được
CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = actor_id);

-- Bước 4: Policy UPDATE - người nhận đánh dấu đã đọc
CREATE POLICY notifications_update_policy ON public.notifications
  FOR UPDATE TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Bước 5: Policy DELETE - người nhận hoặc admin xoá thông báo
CREATE POLICY notifications_delete_policy ON public.notifications
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role::text = 'admin'
    )
  );

-- Bước 6: Policy INSERT #1 - người dùng gửi thông báo với actor_id là chính họ
CREATE POLICY notifications_insert_actor_policy ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id);

-- Bước 7: Policy INSERT #2 - admin/teacher/assistant gửi thông báo cho người khác
-- (Cho phép admin gửi thông báo cho học sinh, kể cả khi actor_id != user_id)
CREATE POLICY notifications_insert_staff_policy ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
    )
  );

-- Bước 8: Policy INSERT #3 - cho phép gửi thông báo đăng ký học thử (không cần đăng nhập)
CREATE POLICY notifications_insert_trial_policy ON public.notifications
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    type = 'trial_lesson_request'
    AND actor_id IS NULL
  );
