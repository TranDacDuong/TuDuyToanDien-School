-- ====================================================================
-- SQL Migration: Hệ thống MindUp Bot & Tin nhắn Tự động
-- Chạy file này trong Supabase SQL Editor (Database > SQL Editor)
-- ====================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. Thêm 'bot' vào enum user_role và tạo tài khoản Bot MindUp
--    (Nếu chưa tồn tại)
-- ──────────────────────────────────────────────────────────────────
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'bot';


INSERT INTO public.users (
  id,
  full_name,
  role,
  email,
  avatar_url,
  created_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'MindUp - Tư Duy Toàn Diện',
  'bot',
  'bot@mindup.internal',
  'favicon.png',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role;

-- ──────────────────────────────────────────────────────────────────
-- 2. Thêm cột real_sender_id vào bảng messages
--    (Lưu người gửi thực sự khi gửi qua danh nghĩa Bot)
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS real_sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────
-- 3. Tạo bảng message_templates
--    (Admin quản lý nội dung các mẫu tin nhắn tự động)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_templates (
  id          TEXT PRIMARY KEY,          -- e.g. 'exam_result', 'absent_notification'
  name        TEXT NOT NULL,             -- Tên mẫu hiển thị cho Admin
  content     TEXT NOT NULL,             -- Nội dung mẫu (có {{placeholder}})
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────────
-- 4. Tạo bảng session_evaluations
--    (Lưu phản hồi đánh giá buổi học của học sinh qua widget chat)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_evaluations (
  id            BIGSERIAL PRIMARY KEY,
  session_id    TEXT NOT NULL,   -- format: {class_id}_{date}_{session_no}
  student_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  response      TEXT NOT NULL,   -- 'understood' | 'partial' | 'confused'
  responded_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, student_id)
);

-- ──────────────────────────────────────────────────────────────────
-- 5. RLS Policies cho message_templates
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- Cho phép Admin đọc và sửa
CREATE POLICY "Admin can manage message_templates"
  ON public.message_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

-- ──────────────────────────────────────────────────────────────────
-- 6. RLS Policies cho session_evaluations
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.session_evaluations ENABLE ROW LEVEL SECURITY;

-- Học sinh có thể chèn phản hồi của mình
CREATE POLICY "Students can insert their own evaluations"
  ON public.session_evaluations
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- Staff có thể xem tất cả
CREATE POLICY "Staff can read all evaluations"
  ON public.session_evaluations
  FOR SELECT
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'assistant')
    )
  );

-- ──────────────────────────────────────────────────────────────────
-- 7. Cập nhật RLS SELECT & INSERT cho conversations và messages
-- ──────────────────────────────────────────────────────────────────

-- a) Policy SELECT cho conversations (Staff xem được cuộc trò chuyện của Học sinh với Bot)
DROP POLICY IF EXISTS conversations_select_policy ON public.conversations;
CREATE POLICY conversations_select_policy ON public.conversations
  FOR SELECT
  USING (
    (
      kind = 'direct'
      AND direct_key IS NOT NULL
      AND (
        split_part(direct_key, '_', 1) = auth.uid()::text
        OR split_part(direct_key, '_', 2) = auth.uid()::text
      )
    )
    OR (
      direct_key LIKE '%00000000-0000-0000-0000-000000000001%'
      AND (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE id = auth.uid() AND role = 'admin'
        )
        OR EXISTS (
          SELECT 1 FROM public.class_students cs
          JOIN public.class_teachers ct ON cs.class_id = ct.class_id
          WHERE ct.teacher_id = auth.uid()
            AND (
              cs.student_id::text = split_part(direct_key, '_', 1)
              OR cs.student_id::text = split_part(direct_key, '_', 2)
            )
        )
      )
    )
  );

-- b) Policy INSERT cho conversations
DROP POLICY IF EXISTS "Bot can create conversations" ON public.conversations;
CREATE POLICY "Bot can create conversations"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    direct_key LIKE '%00000000-0000-0000-0000-000000000001%'
    OR auth.uid() IS NOT NULL
  );

-- c) Policy SELECT cho messages (Staff đọc được tin nhắn Bot)
DROP POLICY IF EXISTS messages_select_policy ON public.messages;
CREATE POLICY messages_select_policy ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (
          (
            c.kind = 'direct'
            AND c.direct_key IS NOT NULL
            AND (
              split_part(c.direct_key, '_', 1) = auth.uid()::text
              OR split_part(c.direct_key, '_', 2) = auth.uid()::text
            )
          )
          OR (
            c.direct_key LIKE '%00000000-0000-0000-0000-000000000001%'
            AND (
              EXISTS (
                SELECT 1 FROM public.users
                WHERE id = auth.uid() AND role = 'admin'
              )
              OR EXISTS (
                SELECT 1 FROM public.class_students cs
                JOIN public.class_teachers ct ON cs.class_id = ct.class_id
                WHERE ct.teacher_id = auth.uid()
                  AND (
                    cs.student_id::text = split_part(c.direct_key, '_', 1)
                    OR cs.student_id::text = split_part(c.direct_key, '_', 2)
                  )
              )
            )
          )
        )
    )
  );

-- d) Policy INSERT cho messages
DROP POLICY IF EXISTS "Bot can insert messages" ON public.messages;
CREATE POLICY "Bot can insert messages"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = '00000000-0000-0000-0000-000000000001'
    OR sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────────
-- 8. Trigger tự động tạo thông báo (notifications) cho hội thoại Bot
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_mindup_bot_message_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_direct_key TEXT;
  v_partner_id UUID;
  v_sender_name TEXT;
  v_staff_id UUID;
BEGIN
  -- Lấy direct_key và loại cuộc trò chuyện
  SELECT direct_key INTO v_direct_key
  FROM public.conversations
  WHERE id = NEW.conversation_id AND kind = 'direct';

  -- Nếu là cuộc trò chuyện với Bot MindUp
  IF v_direct_key LIKE '%00000000-0000-0000-0000-000000000001%' THEN
    -- Xác định ID của đối tác (học sinh/phụ huynh)
    v_partner_id := (
      SELECT id::uuid
      FROM (
        SELECT split_part(v_direct_key, '_', 1) AS id
        UNION
        SELECT split_part(v_direct_key, '_', 2) AS id
      ) t
      WHERE t.id <> '00000000-0000-0000-0000-000000000001'
      LIMIT 1
    );

    IF NEW.sender_id = '00000000-0000-0000-0000-000000000001' THEN
      -- Trường hợp 1: Bot gửi tin nhắn (hoặc staff trả lời dưới tên Bot) -> Tạo thông báo cho học sinh/PH
      INSERT INTO public.notifications (user_id, actor_id, type, ref_id, message)
      VALUES (
        v_partner_id,
        '00000000-0000-0000-0000-000000000001',
        'message_new',
        NEW.conversation_id,
        'Bạn có tin nhắn mới từ MindUp - Tư Duy Toàn Diện'
      );
    ELSE
      -- Trường hợp 2: Học sinh/PH gửi tin nhắn -> Tạo thông báo cho tất cả admin và giáo viên/trợ giảng quản lý học sinh này
      SELECT full_name INTO v_sender_name FROM public.users WHERE id = NEW.sender_id;
      IF v_sender_name IS NULL THEN
        v_sender_name := 'Học sinh';
      END IF;

      FOR v_staff_id IN (
        SELECT id FROM public.users WHERE role = 'admin'
        UNION
        SELECT DISTINCT ct.teacher_id 
        FROM public.class_students cs 
        JOIN public.class_teachers ct ON cs.class_id = ct.class_id 
        WHERE cs.student_id = NEW.sender_id
      ) LOOP
        -- Tránh tự thông báo cho chính mình (nếu staff bằng cách nào đó gửi trực tiếp)
        IF v_staff_id <> NEW.sender_id THEN
          INSERT INTO public.notifications (user_id, actor_id, type, ref_id, message)
          VALUES (
            v_staff_id,
            NEW.sender_id,
            'message_new',
            NEW.conversation_id,
            v_sender_name || ' đã nhắn tin cho MindUp'
          );
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mindup_bot_message_notifications ON public.messages;
CREATE TRIGGER trg_mindup_bot_message_notifications
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_mindup_bot_message_notifications();

-- ──────────────────────────────────────────────────────────────────
-- 9. Cron Jobs tự động (pg_cron) - Học phí & Sinh nhật
--    LƯU Ý: Các cron job dưới đây gọi Edge Functions
--    Cần tạo Edge Functions tương ứng trong Supabase
-- ──────────────────────────────────────────────────────────────────

-- Nhắc học phí ngày 1 hàng tháng (00:05 ngày 1)
SELECT cron.schedule(
  'mindup-tuition-reminder-day1',
  '5 0 1 * *',  -- 00:05 ngày 1 mỗi tháng
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/mindup-tuition-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('day_offset', 0)
  );
  $$
);

-- Nhắc học phí ngày 8 (còn 2 ngày)
SELECT cron.schedule(
  'mindup-tuition-reminder-day8',
  '5 0 8 * *',  -- 00:05 ngày 8 mỗi tháng
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/mindup-tuition-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('day_offset', 8)
  );
  $$
);

-- Nhắc học phí quá hạn ngày 11
SELECT cron.schedule(
  'mindup-tuition-overdue-day11',
  '5 8 11 * *',  -- 08:05 ngày 11 mỗi tháng
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/mindup-tuition-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('day_offset', 11)
  );
  $$
);

-- Chúc sinh nhật học sinh lúc 7 giờ sáng hàng ngày
SELECT cron.schedule(
  'mindup-birthday-wish',
  '0 7 * * *',  -- 07:00 mỗi ngày
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/mindup-birthday-wish',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Nhắc lịch học lúc 7 giờ sáng các buổi học
SELECT cron.schedule(
  'mindup-session-reminder-morning',
  '0 7 * * *',  -- 07:00 mỗi ngày
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/mindup-session-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('hours_before', 999)
  );
  $$
);

-- ──────────────────────────────────────────────────────────────────
-- 10. Cập nhật Supabase Auth để Bot user tồn tại trong auth.users
--     (BẮT BUỘC để các policy hoạt động khi gọi từ client-side)
-- ──────────────────────────────────────────────────────────────────
-- LƯU Ý QUAN TRỌNG: Vì Bot ID '00000000-0000-0000-0000-000000000001'
-- không tồn tại trong auth.users, việc gọi supabase.from('messages').insert()
-- với sender_id = BOT_ID từ client sẽ bị RLS từ chối.
-- 
-- GIẢI PHÁP ĐỀ NGHỊ (chọn một):
-- Cách 1: Thêm Bot vào auth.users qua Supabase Dashboard > Authentication > Users
--         Email: bot@mindup.internal
--         Password: (tạo ngẫu nhiên, không dùng)
--         User ID: 00000000-0000-0000-0000-000000000001 (custom UUID)
--
-- Cách 2: Dùng Service Role Key trong mindup_bot.js thay vì user session
--         (Cần backend/Edge Function, không thể expose key trên frontend)
--
-- Cách 3 (KHUYẾN NGHỊ): Tạo policy SECURITY DEFINER function
--         để gọi insert tin nhắn bot mà không cần auth.uid() = BOT_ID

-- Function để Bot insert message không cần auth (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.send_bot_message(
  p_conversation_id UUID,
  p_content TEXT,
  p_real_sender_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_msg_id UUID;
BEGIN
  INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id)
  VALUES (p_conversation_id, '00000000-0000-0000-0000-000000000001', p_content, p_real_sender_id)
  RETURNING id INTO v_msg_id;
  RETURN v_msg_id;
END;
$$;

-- Function để Bot tạo conversation
CREATE OR REPLACE FUNCTION public.ensure_bot_conversation(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv_id UUID;
  v_direct_key TEXT;
BEGIN
  v_direct_key := (
    SELECT string_agg(id::text, '_' ORDER BY id::text)
    FROM (VALUES ('00000000-0000-0000-0000-000000000001'::uuid), (p_user_id)) AS t(id)
  );
  
  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE direct_key = v_direct_key;
  
  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (kind, direct_key)
    VALUES ('direct', v_direct_key)
    RETURNING id INTO v_conv_id;
  END IF;
  
  RETURN v_conv_id;
END;
$$;

-- Grant execute cho authenticated users
GRANT EXECUTE ON FUNCTION public.send_bot_message TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_bot_conversation TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- HOÀN THÀNH
-- ──────────────────────────────────────────────────────────────────
-- Sau khi chạy SQL này:
-- 1. Vào sourcedata.html > Tab "💬 Tin nhắn tự động" để xem/sửa mẫu tin nhắn
-- 2. Học sinh sẽ thấy kênh "MindUp - Tư Duy Toàn Diện" ghim đầu danh sách tin nhắn
-- 3. Hệ thống tự động gửi tin nhắn sau khi:
--    - Học sinh nộp bài thi (kết quả, khen, cảnh báo điểm thấp)
--    - Giáo viên điểm danh vắng
--    - Kế toán xác nhận học phí
-- 4. Các cron job cần pg_cron và net extensions được bật trong Supabase
