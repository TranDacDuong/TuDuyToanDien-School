-- SQL Pure Database Function: Tự động đánh giá học sinh bình thường lúc 23h00
-- Không phụ thuộc Edge Function deployment. Chạy trực tiếp 100% trong PostgreSQL.

CREATE OR REPLACE FUNCTION public.auto_evaluate_daily_sessions(
  p_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_date date := COALESCE(p_date, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
  v_admin_id uuid;
  v_session RECORD;
  v_student RECORD;
  v_template_content text;
  v_templates text[];
  v_template_count integer;
  v_idx integer;
  v_parent_id uuid;
  v_parent_name text;
  v_formatted_msg text;
  v_eval_id uuid;
  v_total_evaluated integer := 0;
  v_total_notifications integer := 0;
BEGIN
  -- 1. Lấy ID Admin làm evaluator_id mặc định
  SELECT id INTO v_admin_id FROM public.users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM public.users LIMIT 1;
  END IF;

  -- 2. Tải danh sách 31 mẫu tự động
  SELECT array_agg(content) INTO v_templates
  FROM public.evaluation_message_templates
  WHERE section_type = 'auto_normal' AND active = true;

  v_template_count := COALESCE(array_length(v_templates, 1), 0);
  IF v_template_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Chưa có mẫu auto_normal trong csdl.');
  END IF;

  -- 3. Lặp qua các buổi học diễn ra trong ngày
  FOR v_session IN
    SELECT
      cs.id AS session_id,
      cs.class_id,
      cs.session_date,
      c.class_name,
      COALESCE(s.name, 'bài học') AS subject_name
    FROM public.class_sessions cs
    JOIN public.classes c ON c.id = cs.class_id
    LEFT JOIN public.subjects s ON s.id = c.subject_id
    WHERE cs.session_date = v_target_date
  LOOP
    -- 4. Lặp qua học sinh đang học chưa gửi nhận xét
    FOR v_student IN
      SELECT
        st.student_id,
        u.full_name AS student_name
      FROM public.class_students st
      JOIN public.users u ON u.id = st.student_id
      WHERE st.class_id = v_session.class_id
        AND (st.joined_at IS NULL OR st.joined_at::date <= v_target_date)
        AND (st.left_at IS NULL OR st.left_at::date >= v_target_date)
        AND NOT EXISTS (
          SELECT 1 FROM public.session_student_evaluations e
          WHERE e.class_session_id = v_session.session_id
            AND e.student_id = st.student_id
            AND e.state = 'sent'
        )
    LOOP
      -- Lấy thông tin Phụ huynh
      SELECT
        ps.parent_id,
        COALESCE(pu.full_name, 'Quý phụ huynh')
      INTO v_parent_id, v_parent_name
      FROM public.parent_students ps
      JOIN public.users pu ON pu.id = ps.parent_id
      WHERE ps.student_id = v_student.student_id
        AND ps.revoked_at IS NULL
      LIMIT 1;

      IF v_parent_name IS NULL THEN
        v_parent_name := 'Quý phụ huynh';
      END IF;

      -- Chọn ngẫu nhiên 1 trong 31 mẫu
      v_idx := (abs(hashtext(v_student.student_id::text || '_' || v_target_date::text)) % v_template_count) + 1;
      v_template_content := v_templates[v_idx];

      -- Thay thế biến
      v_formatted_msg := REPLACE(v_template_content, '{ten_phu_huynh}', v_parent_name);
      v_formatted_msg := REPLACE(v_formatted_msg, '{ten_hoc_sinh}', v_student.student_name);
      v_formatted_msg := REPLACE(v_formatted_msg, '{mon_hoc}', v_session.subject_name);
      v_formatted_msg := REPLACE(v_formatted_msg, '{ngay_hoc}', to_char(v_target_date, 'DD/MM/YYYY'));
      v_formatted_msg := REPLACE(v_formatted_msg, '{ten_lop}', v_session.class_name);
      v_formatted_msg := REPLACE(v_formatted_msg, '{ten_giao_vien}', 'Giáo viên MindUp');

      -- Insert vào session_student_evaluations
      INSERT INTO public.session_student_evaluations (
        class_session_id,
        class_id,
        student_id,
        evaluator_id,
        generated_message,
        final_message,
        template_selection,
        state,
        sent_at
      )
      VALUES (
        v_session.session_id,
        v_session.class_id,
        v_student.student_id,
        v_admin_id,
        v_formatted_msg,
        v_formatted_msg,
        jsonb_build_object('auto_generated', true, 'template_index', v_idx),
        'sent',
        now()
      )
      ON CONFLICT (class_session_id, student_id) DO UPDATE SET
        generated_message = EXCLUDED.generated_message,
        final_message = EXCLUDED.final_message,
        state = 'sent',
        sent_at = now()
      RETURNING id INTO v_eval_id;

      v_total_evaluated := v_total_evaluated + 1;

      -- Gửi thông báo cho tất cả Phụ huynh liên kết
      IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.notifications (
          user_id,
          actor_id,
          type,
          title,
          message,
          target_url,
          meta
        )
        SELECT
          ps.parent_id,
          v_admin_id,
          'session_evaluation',
          'MindUp - Tư duy Toàn Diện',
          v_formatted_msg,
          'class.html?openClassId=' || v_session.class_id,
          jsonb_build_object(
            'student_id', v_student.student_id,
            'class_id', v_session.class_id,
            'class_session_id', v_session.session_id,
            'evaluation_id', v_eval_id,
            'session_date', v_target_date,
            'auto_generated', true
          )
        FROM public.parent_students ps
        WHERE ps.student_id = v_student.student_id
          AND ps.revoked_at IS NULL;

        v_total_notifications := v_total_notifications + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'target_date', v_target_date,
    'total_evaluated', v_total_evaluated,
    'total_notifications', v_total_notifications
  );
END;
$$;

-- Bật extension pg_cron nếu chưa có
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Hủy job cũ (nếu có)
SELECT cron.unschedule(jobid) 
FROM cron.job 
WHERE jobname = 'auto-session-evaluations-daily';

-- Đăng ký Cron Job trực tiếp trong PostgreSQL chạy lúc 23h05 (16h05 UTC)
SELECT cron.schedule(
  'auto-session-evaluations-daily',
  '5 16 * * *',
  $$ SELECT public.auto_evaluate_daily_sessions(); $$
);
