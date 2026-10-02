-- ==============================================================================
-- SQL: Tự động gửi nhận xét buổi học cho học sinh (Sau tan học 30 phút)
-- Dự án: MindUp - Tư Duy Toàn Diện
--
-- QUY TẮC HOẠT ĐỘNG:
-- 1. Trong giờ học, giáo viên/trợ giảng bấm chọn các trạng thái của học sinh (Tích cực / Cần khắc phục).
--    Hệ thống frontend tự động tạo nội dung và lưu bản nháp (draft) vào CSDL.
-- 2. Đúng 30 phút sau khi kết thúc buổi học:
--    - Học sinh KHÔNG có trạng thái gì: BỎ QUA hoàn toàn (không gửi tin nhắn/thông báo).
--    - Học sinh CÓ trạng thái: Tự động chuyển draft -> sent và gửi thông báo tới phụ huynh.
-- 3. Đánh dấu class_sessions.auto_eval_sent_at để không gửi lặp lại.
-- ==============================================================================

-- 1. Thêm cột lưu thời điểm đã tự động gửi nhận xét cho buổi học
ALTER TABLE public.class_sessions ADD COLUMN IF NOT EXISTS auto_eval_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS class_sessions_auto_eval_idx ON public.class_sessions (session_date, auto_eval_sent_at);

-- 2. Hàm PostgreSQL tự động kiểm tra và gửi nhận xét sau tan học 30 phút
CREATE OR REPLACE FUNCTION public.auto_send_session_evaluations_after_30m(
  p_session_id uuid DEFAULT NULL,
  p_target_date date DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_vn timestamptz := now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_target_date date := COALESCE(p_target_date, v_now_vn::date);
  v_session RECORD;
  v_eval RECORD;
  v_admin_id uuid;
  v_eval_count integer := 0;
  v_notif_count integer := 0;
  v_rows integer;
  v_sessions_processed integer := 0;
BEGIN
  -- Lấy ID Admin làm evaluator/actor mặc định nếu cần
  SELECT id INTO v_admin_id FROM public.users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM public.users LIMIT 1;
  END IF;

  -- Quét các buổi học cần xử lý:
  FOR v_session IN
    SELECT
      cs.id AS session_id,
      cs.class_id,
      cs.session_date,
      cs.ends_at,
      c.class_name,
      COALESCE(s.name, 'bài học') AS subject_name,
      -- Tính thời gian kết thúc buổi học:
      -- 1) cs.ends_at nếu có
      -- 2) Hoặc lấy end_time từ class_schedules theo thứ trong tuần (1=Thứ 2 ... 7=Chủ nhật)
      -- 3) Mặc định 21:00 nếu chưa cấu hình
      COALESCE(
        cs.ends_at,
        (
          SELECT ((cs.session_date::text || ' ' || sch.end_time::text)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
          FROM public.class_schedules sch
          WHERE sch.class_id = cs.class_id
            AND sch.weekday = EXTRACT(ISODOW FROM cs.session_date)
            AND sch.effective_from <= cs.session_date
          ORDER BY sch.effective_from DESC, sch.end_time DESC
          LIMIT 1
        ),
        ((cs.session_date::text || ' 21:00:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      ) AS calculated_ends_at
    FROM public.class_sessions cs
    JOIN public.classes c ON c.id = cs.class_id
    LEFT JOIN public.subjects s ON s.id = c.subject_id
    WHERE (p_session_id IS NOT NULL AND cs.id = p_session_id)
       OR (p_session_id IS NULL
           AND cs.session_date <= v_target_date
           AND cs.session_date >= (v_target_date - INTERVAL '3 days')::date
           AND (cs.auto_eval_sent_at IS NULL OR p_force = true))
  LOOP
    -- Kiểm tra điều kiện: Đã qua 30 phút kể từ giờ kết thúc buổi học
    IF p_force = false AND (v_session.calculated_ends_at + INTERVAL '30 minutes') > now() THEN
      -- Chưa đủ 30 phút sau khi tan học, bỏ qua để lần quét sau xử lý tiếp
      CONTINUE;
    END IF;

    -- Lặp qua các học sinh CÓ TRẠNG THÁI đang ở trạng thái 'draft'
    -- Bỏ qua hoàn toàn những học sinh không có trạng thái nào (không gửi)
    FOR v_eval IN
      SELECT
        sse.id AS eval_id,
        sse.student_id,
        COALESCE(sse.evaluator_id, v_admin_id) AS evaluator_id,
        sse.final_message,
        sse.generated_message,
        u.full_name AS student_name
      FROM public.session_student_evaluations sse
      JOIN public.users u ON u.id = sse.student_id
      WHERE sse.class_session_id = v_session.session_id
        AND sse.state = 'draft'
        AND EXISTS (
          SELECT 1
          FROM public.session_student_evaluation_statuses sses
          WHERE sses.evaluation_id = sse.id
        )
    LOOP
      -- Đảm bảo có nội dung nhận xét trước khi gửi
      IF v_eval.final_message IS NULL OR TRIM(v_eval.final_message) = '' THEN
        v_eval.final_message := COALESCE(v_eval.generated_message,
          'Kính gửi Quý phụ huynh, giáo viên gửi nhận xét tình hình học tập môn ' || v_session.subject_name || ' ngày ' || to_char(v_session.session_date, 'DD/MM/YYYY') || ' của em ' || v_eval.student_name || '.');
      END IF;

      -- Cập nhật bản ghi sang đã gửi ('sent')
      UPDATE public.session_student_evaluations
      SET state = 'sent',
          final_message = v_eval.final_message,
          sent_at = now(),
          updated_at = now()
      WHERE id = v_eval.eval_id;

      v_eval_count := v_eval_count + 1;

      -- Gửi thông báo tới tài khoản phụ huynh liên kết
      INSERT INTO public.notifications (
        user_id,
        actor_id,
        type,
        title,
        message,
        ref_id,
        target_url,
        meta
      )
      SELECT
        ps.parent_id,
        v_eval.evaluator_id,
        'session_evaluation',
        'MindUp - Tư duy Toàn Diện',
        v_eval.final_message,
        v_eval.eval_id,
        'class.html?openClassId=' || v_session.class_id,
        jsonb_build_object(
          'student_id', v_eval.student_id,
          'class_id', v_session.class_id,
          'class_session_id', v_session.session_id,
          'evaluation_id', v_eval.eval_id,
          'session_date', v_session.session_date,
          'auto_sent_after_30m', true,
          'sender_name', 'MindUp - Tư duy Toàn Diện',
          'sender_avatar', 'pwa-icon-192.png',
          'branded_sender', true
        )
      FROM public.parent_students ps
      WHERE ps.student_id = v_eval.student_id
        AND ps.revoked_at IS NULL;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_notif_count := v_notif_count + COALESCE(v_rows, 0);
    END LOOP;

    -- Đánh dấu buổi học đã hoàn thành tự động gửi (kể cả khi lớp không có học sinh nào cần gửi)
    UPDATE public.class_sessions
    SET auto_eval_sent_at = now()
    WHERE id = v_session.session_id;

    v_sessions_processed := v_sessions_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'sessions_processed', v_sessions_processed,
    'evaluations_sent', v_eval_count,
    'notifications_sent', v_notif_count,
    'scanned_at', now()
  );
END;
$$;

-- 3. Hàm tương thích ngược cho các lời gọi cũ (nếu có)
CREATE OR REPLACE FUNCTION public.auto_evaluate_daily_sessions(p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.auto_send_session_evaluations_after_30m(NULL, p_date, false);
END;
$$;

-- 4. Cấu hình pg_cron chạy tự động mỗi 10 phút một lần
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Xóa job cũ nếu tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) 
    FROM cron.job 
    WHERE jobname IN ('auto-session-evaluations-daily', 'auto-session-evaluations-30m');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Đăng ký Cron Job mới: chạy định kỳ mỗi 10 phút
SELECT cron.schedule(
  'auto-session-evaluations-30m',
  '*/10 * * * *',
  $$ SELECT public.auto_send_session_evaluations_after_30m(); $$
);
