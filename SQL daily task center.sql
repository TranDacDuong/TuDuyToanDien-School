-- MindUp Daily Task Center
-- Safe to run repeatedly.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'friend_request', 'friend_accept', 'post_like', 'post_comment', 'post_approved',
    'post_rejected', 'message_new', 'course_created', 'course_enrolled',
    'course_request_approved', 'course_request_rejected', 'course_session_added',
    'course_session_updated', 'class_session_added', 'class_session_updated',
    'class_exam_added', 'session_evaluation', 'tuition_due', 'tuition_reminder',
    'trial_lesson_request', 'task_assigned', 'task_daily_digest',
    'task_due_reminder', 'task_overdue'
  )
);

CREATE TABLE IF NOT EXISTS public.daily_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  task_type text NOT NULL,
  source_type text,
  source_id text,
  source_key text NOT NULL UNIQUE,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent', 'important', 'normal')),
  available_on date NOT NULL DEFAULT CURRENT_DATE,
  due_at timestamptz,
  action_url text,
  auto_generated boolean NOT NULL DEFAULT true,
  verification_mode text NOT NULL DEFAULT 'manual'
    CHECK (verification_mode IN (
      'manual', 'attendance', 'session_evaluation', 'tuition',
      'exam_grading', 'student_exam', 'trial_request', 'parent_link', 'class_staff'
    )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.daily_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  completed_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.daily_tasks(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.task_assignments(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notification_kind text NOT NULL,
  notification_date date NOT NULL DEFAULT CURRENT_DATE,
  task_id uuid REFERENCES public.daily_tasks(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.task_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  daily_digest_enabled boolean NOT NULL DEFAULT true,
  daily_digest_time time NOT NULL DEFAULT '07:00',
  due_reminders_enabled boolean NOT NULL DEFAULT true,
  overdue_reminders_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_start time NOT NULL DEFAULT '21:30',
  quiet_hours_end time NOT NULL DEFAULT '06:30',
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_tasks_day_due_idx
  ON public.daily_tasks (available_on, due_at, priority);
CREATE INDEX IF NOT EXISTS daily_tasks_source_idx
  ON public.daily_tasks (source_type, source_id);
CREATE INDEX IF NOT EXISTS task_assignments_user_status_idx
  ON public.task_assignments (user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS task_events_task_created_idx
  ON public.task_events (task_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS task_notification_logs_dedupe_idx
  ON public.task_notification_logs (
    user_id,
    notification_kind,
    notification_date,
    COALESCE(task_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE OR REPLACE FUNCTION public.touch_daily_task_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_tasks_touch_updated_at ON public.daily_tasks;
CREATE TRIGGER daily_tasks_touch_updated_at
BEFORE UPDATE ON public.daily_tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_daily_task_updated_at();

DROP TRIGGER IF EXISTS task_assignments_touch_updated_at ON public.task_assignments;
CREATE TRIGGER task_assignments_touch_updated_at
BEFORE UPDATE ON public.task_assignments
FOR EACH ROW EXECUTE FUNCTION public.touch_daily_task_updated_at();

DROP TRIGGER IF EXISTS task_preferences_touch_updated_at ON public.task_preferences;
CREATE TRIGGER task_preferences_touch_updated_at
BEFORE UPDATE ON public.task_preferences
FOR EACH ROW EXECUTE FUNCTION public.touch_daily_task_updated_at();

CREATE OR REPLACE FUNCTION public.is_admin(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = check_user_id AND role::text = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.upsert_generated_task(
  p_user_id uuid,
  p_source_key text,
  p_title text,
  p_description text,
  p_task_type text,
  p_source_type text,
  p_source_id text,
  p_priority text,
  p_available_on date,
  p_due_at timestamptz,
  p_action_url text,
  p_verification_mode text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
BEGIN
  INSERT INTO public.daily_tasks (
    title, description, task_type, source_type, source_id, source_key,
    priority, available_on, due_at, action_url, auto_generated,
    verification_mode, metadata
  )
  VALUES (
    p_title, p_description, p_task_type, p_source_type, p_source_id, p_source_key,
    p_priority, p_available_on, p_due_at, p_action_url, true,
    p_verification_mode, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (source_key) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    priority = EXCLUDED.priority,
    available_on = EXCLUDED.available_on,
    due_at = EXCLUDED.due_at,
    action_url = EXCLUDED.action_url,
    metadata = EXCLUDED.metadata
  RETURNING id INTO v_task_id;

  INSERT INTO public.task_assignments (task_id, user_id)
  VALUES (v_task_id, p_user_id)
  ON CONFLICT (task_id, user_id) DO NOTHING;

  INSERT INTO public.task_preferences (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_task_id;
END;
$$;

-- Placeholder so refresh_daily_tasks can be created before the full verifier below.
CREATE OR REPLACE FUNCTION public.sync_verified_task_statuses(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_daily_tasks(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_role text;
  v_count integer := 0;
  r record;
  v_due timestamptz;
BEGIN
  IF v_actor IS NOT NULL AND NOT public.is_admin(v_actor) THEN
    p_user_id := v_actor;
  END IF;
  IF p_user_id IS NOT NULL AND v_actor IS NOT NULL AND p_user_id <> v_actor AND NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Class schedules for staff.
  FOR r IN
    SELECT u.id AS user_id, c.id AS class_id, c.class_name, cs.id AS session_id,
      cs.session_date, cs.starts_at, cs.ends_at, l.name AS lesson_name
    FROM public.users u
    JOIN public.class_teachers ct ON ct.teacher_id = u.id
    JOIN public.classes c ON c.id = ct.class_id AND COALESCE(c.hidden, false) = false
    JOIN public.class_sessions cs ON cs.class_id = c.id
      AND cs.session_date BETWEEN v_today - 1 AND v_today + 7
    LEFT JOIN public.lessons l ON l.id = cs.lesson_id
    WHERE u.role::text IN ('admin', 'teacher', 'assistant')
      AND (p_user_id IS NULL OR u.id = p_user_id)
  LOOP
    v_due := COALESCE(
      r.starts_at,
      ((r.session_date::text || ' 07:00:00+07')::timestamptz)
    );
    PERFORM public.upsert_generated_task(
      r.user_id, 'class_schedule:' || r.session_id || ':' || r.user_id,
      'Lịch phụ trách lớp ' || r.class_name,
      COALESCE(r.lesson_name, 'Buổi học') || ' - ' || to_char(r.session_date, 'DD/MM/YYYY'),
      'class_schedule', 'class_session', r.session_id::text, 'normal',
      r.session_date, v_due, 'class.html?openClassId=' || r.class_id,
      'manual', jsonb_build_object('class_id', r.class_id, 'session_id', r.session_id)
    );
    v_count := v_count + 1;
  END LOOP;

  -- Student class schedules.
  FOR r IN
    SELECT u.id AS user_id, c.id AS class_id, c.class_name, cs.id AS session_id,
      cs.session_date, cs.starts_at, l.name AS lesson_name
    FROM public.users u
    JOIN public.class_students st ON st.student_id = u.id
      AND st.joined_at::date <= v_today + 7
      AND (st.left_at IS NULL OR st.left_at::date >= v_today - 1)
    JOIN public.classes c ON c.id = st.class_id AND COALESCE(c.hidden, false) = false
    JOIN public.class_sessions cs ON cs.class_id = c.id
      AND cs.session_date BETWEEN v_today AND v_today + 7
    LEFT JOIN public.lessons l ON l.id = cs.lesson_id
    WHERE u.role::text = 'student'
      AND false
      AND (p_user_id IS NULL OR u.id = p_user_id)
  LOOP
    v_due := COALESCE(r.starts_at, ((r.session_date::text || ' 07:00:00+07')::timestamptz));
    PERFORM public.upsert_generated_task(
      r.user_id, 'student_schedule:' || r.session_id || ':' || r.user_id,
      'Lịch học lớp ' || r.class_name,
      COALESCE(r.lesson_name, 'Buổi học') || ' - ' || to_char(r.session_date, 'DD/MM/YYYY'),
      'class_schedule', 'class_session', r.session_id::text, 'normal',
      r.session_date, v_due, 'class.html?openClassId=' || r.class_id,
      'manual', jsonb_build_object('class_id', r.class_id, 'session_id', r.session_id)
    );
    v_count := v_count + 1;
  END LOOP;

  -- Parent class schedules.
  FOR r IN
    SELECT p.id AS user_id, child.id AS student_id, child.full_name AS student_name,
      c.id AS class_id, c.class_name, cs.id AS session_id, cs.session_date, cs.starts_at
    FROM public.users p
    JOIN public.parent_students ps ON ps.parent_id = p.id AND ps.revoked_at IS NULL
    JOIN public.users child ON child.id = ps.student_id
    JOIN public.class_students st ON st.student_id = child.id
      AND (st.left_at IS NULL OR st.left_at::date >= v_today)
    JOIN public.classes c ON c.id = st.class_id AND COALESCE(c.hidden, false) = false
    JOIN public.class_sessions cs ON cs.class_id = c.id
      AND cs.session_date BETWEEN v_today AND v_today + 7
    WHERE p.role::text = 'parent'
      AND false
      AND (p_user_id IS NULL OR p.id = p_user_id)
  LOOP
    v_due := COALESCE(r.starts_at, ((r.session_date::text || ' 07:00:00+07')::timestamptz));
    PERFORM public.upsert_generated_task(
      r.user_id, 'parent_schedule:' || r.session_id || ':' || r.student_id || ':' || r.user_id,
      'Lịch học của ' || COALESCE(r.student_name, 'học sinh'),
      r.class_name || ' - ' || to_char(r.session_date, 'DD/MM/YYYY'),
      'child_schedule', 'class_session', r.session_id::text, 'normal',
      r.session_date, v_due, 'class.html?openClassId=' || r.class_id,
      'manual', jsonb_build_object('student_id', r.student_id, 'class_id', r.class_id)
    );
    v_count := v_count + 1;
  END LOOP;

  -- Attendance and session evaluation after each class session.
  FOR r IN
    SELECT u.id AS user_id, c.id AS class_id, c.class_name, cs.id AS session_id,
      cs.session_date, cs.ends_at
    FROM public.users u
    JOIN public.class_teachers ct ON ct.teacher_id = u.id
    JOIN public.classes c ON c.id = ct.class_id AND COALESCE(c.hidden, false) = false
    JOIN public.class_sessions cs ON cs.class_id = c.id
      AND cs.session_date BETWEEN v_today - 7 AND v_today
    WHERE u.role::text IN ('admin', 'teacher', 'assistant')
      AND (p_user_id IS NULL OR u.id = p_user_id)
  LOOP
    v_due := COALESCE(r.ends_at, ((r.session_date::text || ' 21:00:00+07')::timestamptz));
    PERFORM public.upsert_generated_task(
      r.user_id, 'attendance:' || r.session_id || ':' || r.user_id,
      'Hoàn thành điểm danh - ' || r.class_name,
      'Kiểm tra và hoàn tất điểm danh buổi ' || to_char(r.session_date, 'DD/MM/YYYY'),
      'attendance', 'class_session', r.session_id::text, 'important',
      r.session_date, v_due, 'class.html?openClassId=' || r.class_id,
      'attendance', jsonb_build_object('class_id', r.class_id, 'session_date', r.session_date)
    );
    PERFORM public.upsert_generated_task(
      r.user_id, 'session_evaluation:' || r.session_id || ':' || r.user_id,
      'Đánh giá học sinh - ' || r.class_name,
      'Gửi nhận xét sau buổi học ' || to_char(r.session_date, 'DD/MM/YYYY'),
      'session_evaluation', 'class_session', r.session_id::text, 'important',
      r.session_date, v_due + interval '2 hours', 'class.html?openClassId=' || r.class_id,
      'session_evaluation', jsonb_build_object('class_id', r.class_id, 'session_id', r.session_id)
    );
    v_count := v_count + 2;
  END LOOP;

  -- Class and course exams for students.
  FOR r IN
    SELECT st.student_id AS user_id, c.id AS class_id, c.class_name,
      cs.id AS session_id, cs.session_date, cs.ends_at, cs.exam_id, cs.pdf_exam_id
    FROM public.class_students st
    JOIN public.classes c ON c.id = st.class_id AND COALESCE(c.hidden, false) = false
    JOIN public.class_sessions cs ON cs.class_id = c.id
      AND cs.session_date BETWEEN v_today - 3 AND v_today + 14
      AND (cs.exam_id IS NOT NULL OR cs.pdf_exam_id IS NOT NULL)
    WHERE (st.left_at IS NULL OR st.left_at::date >= v_today)
      AND false
      AND (p_user_id IS NULL OR st.student_id = p_user_id)
  LOOP
    v_due := COALESCE(r.ends_at, ((r.session_date::text || ' 23:00:00+07')::timestamptz));
    PERFORM public.upsert_generated_task(
      r.user_id, 'student_exam:' || r.session_id || ':' || r.user_id,
      'Hoàn thành bài luyện tập - ' || r.class_name,
      'Bài luyện tập của buổi học ' || to_char(r.session_date, 'DD/MM/YYYY'),
      'student_exam', 'class_session', r.session_id::text,
      CASE WHEN r.session_date < v_today THEN 'urgent' ELSE 'important' END,
      LEAST(r.session_date, v_today), v_due, 'class.html?openClassId=' || r.class_id,
      'student_exam', jsonb_build_object('exam_id', r.exam_id, 'pdf_exam_id', r.pdf_exam_id, 'class_id', r.class_id, 'student_id', r.user_id)
    );
    v_count := v_count + 1;
  END LOOP;

  -- Course sessions and practice exams for enrolled students.
  FOR r IN
    SELECT ce.student_id AS user_id, c.id AS course_id, c.name AS course_name,
      cs.id AS session_id, cs.exam_id, cs.pdf_exam_id, cs.open_day,
      (COALESCE(c.start_date, c.created_at::date) + (GREATEST(COALESCE(cs.open_day, 1), 1) - 1))::date AS open_date,
      l.name AS lesson_name
    FROM public.course_enrollments ce
    JOIN public.courses c ON c.id = ce.course_id
    JOIN public.course_sessions cs ON cs.course_id = c.id
    LEFT JOIN public.lessons l ON l.id = cs.lesson_id
    WHERE (COALESCE(c.start_date, c.created_at::date) + (GREATEST(COALESCE(cs.open_day, 1), 1) - 1))::date
      BETWEEN v_today - 3 AND v_today + 14
      AND false
      AND (p_user_id IS NULL OR ce.student_id = p_user_id)
  LOOP
    PERFORM public.upsert_generated_task(
      r.user_id, 'course_session:' || r.session_id || ':' || r.user_id,
      'Học buổi mới - ' || r.course_name,
      COALESCE(r.lesson_name, 'Nội dung khóa học') || ' mở ngày ' || to_char(r.open_date, 'DD/MM/YYYY'),
      'course_session', 'course_session', r.session_id::text, 'normal',
      r.open_date, (r.open_date::text || ' 22:00:00+07')::timestamptz,
      'courses.html?courseId=' || r.course_id, 'manual',
      jsonb_build_object('course_id', r.course_id, 'session_id', r.session_id)
    );
    IF r.exam_id IS NOT NULL OR r.pdf_exam_id IS NOT NULL THEN
      PERFORM public.upsert_generated_task(
        r.user_id, 'course_exam:' || r.session_id || ':' || r.user_id,
        'Hoàn thành bài luyện tập - ' || r.course_name,
        COALESCE(r.lesson_name, 'Bài luyện tập trong khóa học'),
        'student_exam', 'course_session', r.session_id::text,
        CASE WHEN r.open_date < v_today THEN 'urgent' ELSE 'important' END,
        LEAST(r.open_date, v_today), (r.open_date::text || ' 23:00:00+07')::timestamptz,
        'courses.html?courseId=' || r.course_id, 'student_exam',
        jsonb_build_object('exam_id', r.exam_id, 'pdf_exam_id', r.pdf_exam_id, 'course_id', r.course_id, 'student_id', r.user_id)
      );
    END IF;
    v_count := v_count + CASE WHEN r.exam_id IS NOT NULL OR r.pdf_exam_id IS NOT NULL THEN 2 ELSE 1 END;
  END LOOP;

  -- Tuition for students and linked parents.
  FOR r IN
    SELECT tp.id AS payment_id, tp.student_id, tp.month, tp.amount_due, tp.amount_paid,
      c.id AS class_id, c.class_name, target.user_id
    FROM public.tuition_payments tp
    LEFT JOIN public.classes c ON c.id = tp.class_id
    CROSS JOIN LATERAL (
      SELECT tp.student_id AS user_id
      UNION
      SELECT ps.parent_id FROM public.parent_students ps
      WHERE ps.student_id = tp.student_id AND ps.revoked_at IS NULL
    ) target
    WHERE tp.amount_paid < tp.amount_due
      AND false
      AND tp.month >= date_trunc('month', v_today - interval '1 month')::date
      AND tp.month <= date_trunc('month', v_today + interval '1 month')::date
      AND (p_user_id IS NULL OR target.user_id = p_user_id)
  LOOP
    PERFORM public.upsert_generated_task(
      r.user_id, 'tuition:' || r.payment_id || ':' || r.user_id,
      'Hoàn tất học phí ' || to_char(r.month, 'MM/YYYY'),
      COALESCE(r.class_name, 'Học phí MindUp') || ' - còn thiếu ' ||
        trim(to_char(r.amount_due - r.amount_paid, 'FM999G999G999G990')) || ' đ',
      'tuition', 'tuition_payment', r.payment_id::text,
      CASE WHEN r.month < date_trunc('month', v_today)::date THEN 'urgent' ELSE 'important' END,
      GREATEST(r.month, v_today), (r.month + interval '9 days 23 hours')::timestamptz,
      'tuition.html?month=' || to_char(r.month, 'YYYY-MM'),
      'tuition', jsonb_build_object('payment_id', r.payment_id, 'student_id', r.student_id)
    );
    v_count := v_count + 1;
  END LOOP;

  -- Pending essay grading for teachers/admin.
  FOR r IN
    SELECT er.id AS result_id, er.class_id, er.course_id, er.exam_id, e.title AS exam_title,
      COALESCE(c.class_name, 'Bài kiểm tra') AS class_name, u.id AS user_id
    FROM public.exam_results er
    JOIN public.exams e ON e.id = er.exam_id
    LEFT JOIN public.classes c ON c.id = er.class_id
    LEFT JOIN public.courses co ON co.id = er.course_id
    JOIN public.users u ON (
      u.role::text = 'admin'
      OR EXISTS (
        SELECT 1 FROM public.class_teachers ct
        WHERE ct.class_id = er.class_id AND ct.teacher_id = u.id
      )
      OR EXISTS (
        SELECT 1 FROM public.course_managers cm
        WHERE cm.course_id = er.course_id AND cm.teacher_id = u.id
      )
    )
    WHERE er.submitted_at IS NOT NULL AND er.score_total IS NULL
      AND u.role::text IN ('admin', 'teacher')
      AND (p_user_id IS NULL OR u.id = p_user_id)
  LOOP
    PERFORM public.upsert_generated_task(
      r.user_id, 'exam_grading:' || r.result_id || ':' || r.user_id,
      'Chấm bài tự luận - ' || COALESCE(r.exam_title, 'Bài kiểm tra'),
      r.class_name || ' đang có bài chờ chấm.',
      'exam_grading', 'exam_result', r.result_id::text, 'important',
      v_today, now() + interval '24 hours',
      CASE
        WHEN r.class_id IS NOT NULL THEN 'class.html?openClassId=' || r.class_id
        WHEN r.course_id IS NOT NULL THEN 'courses.html?courseId=' || r.course_id
        ELSE 'exam.html'
      END,
      'exam_grading',
      jsonb_build_object('result_id', r.result_id, 'exam_id', r.exam_id, 'class_id', r.class_id, 'course_id', r.course_id)
    );
    v_count := v_count + 1;
  END LOOP;

  -- Admin operations.
  FOR r IN SELECT id AS user_id FROM public.users
    WHERE role::text = 'admin' AND (p_user_id IS NULL OR id = p_user_id)
  LOOP
    PERFORM public.upsert_generated_task(
      r.user_id, 'admin_trial_requests:' || v_today || ':' || r.user_id,
      'Xử lý yêu cầu học thử',
      'Kiểm tra các yêu cầu học thử chưa chốt lịch hoặc chưa xử lý.',
      'trial_request', 'trial_requests', v_today::text, 'important',
      v_today, (v_today::text || ' 17:00:00+07')::timestamptz,
      'trial_requests.html', 'trial_request', '{}'::jsonb
    );
    PERFORM public.upsert_generated_task(
      r.user_id, 'admin_parent_links:' || v_today || ':' || r.user_id,
      'Kiểm tra liên kết phụ huynh',
      'Liên kết tài khoản phụ huynh cho học sinh đang hoạt động còn thiếu.',
      'parent_link', 'parent_students', v_today::text, 'normal',
      v_today, (v_today::text || ' 18:00:00+07')::timestamptz,
      'sourcedata.html?tab=students', 'parent_link', '{}'::jsonb
    );
    PERFORM public.upsert_generated_task(
      r.user_id, 'admin_class_staff:' || v_today || ':' || r.user_id,
      'Kiểm tra nhân sự lớp học',
      'Kiểm tra lớp đang hoạt động chưa có giáo viên hoặc trợ giảng phụ trách.',
      'class_staff', 'classes', v_today::text, 'normal',
      v_today, (v_today::text || ' 18:00:00+07')::timestamptz,
      'class.html', 'class_staff', '{}'::jsonb
    );
    v_count := v_count + 3;
  END LOOP;

  PERFORM public.sync_verified_task_statuses(p_user_id);
  RETURN jsonb_build_object('ok', true, 'processed', v_count, 'date', v_today);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_verified_task_statuses(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NOT NULL
     AND NOT public.is_admin(v_actor_id) THEN
    p_user_id := v_actor_id;
  END IF;

  WITH verified AS (
    SELECT a.id
    FROM public.task_assignments a
    JOIN public.daily_tasks t ON t.id = a.task_id
    WHERE a.status <> 'completed'
      AND (p_user_id IS NULL OR a.user_id = p_user_id)
      AND (
        (t.verification_mode = 'attendance' AND (
          SELECT count(DISTINCT at.student_id)
          FROM public.attendance at
          WHERE at.class_id = (t.metadata->>'class_id')::uuid
            AND at.date = (t.metadata->>'session_date')::date
        ) >= (
          SELECT count(*) FROM public.class_students cs
          WHERE cs.class_id = (t.metadata->>'class_id')::uuid
            AND cs.joined_at::date <= (t.metadata->>'session_date')::date
            AND (cs.left_at IS NULL OR cs.left_at::date >= (t.metadata->>'session_date')::date)
        ))
        OR
        (t.verification_mode = 'session_evaluation' AND (
          SELECT count(DISTINCT e.student_id)
          FROM public.session_student_evaluations e
          WHERE e.class_session_id = (t.metadata->>'session_id')::uuid
            AND e.state = 'sent'
        ) >= (
          SELECT count(*) FROM public.class_students cs
          WHERE cs.class_id = (t.metadata->>'class_id')::uuid
            AND (cs.left_at IS NULL OR cs.left_at::date >= t.available_on)
        ))
        OR
        (t.verification_mode = 'tuition' AND EXISTS (
          SELECT 1 FROM public.tuition_payments tp
          WHERE tp.id = (t.metadata->>'payment_id')::uuid
            AND tp.amount_paid >= tp.amount_due
        ))
        OR
        (t.verification_mode = 'exam_grading' AND EXISTS (
          SELECT 1 FROM public.exam_results er
          WHERE er.id = (t.metadata->>'result_id')::uuid
            AND er.score_total IS NOT NULL
        ))
        OR
        (t.verification_mode = 'student_exam' AND (
          (
            NULLIF(t.metadata->>'exam_id', '') IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.exam_results er
              WHERE er.exam_id = (t.metadata->>'exam_id')::uuid
                AND er.student_id = (t.metadata->>'student_id')::uuid
                AND er.submitted_at IS NOT NULL
            )
          )
          OR
          (
            NULLIF(t.metadata->>'pdf_exam_id', '') IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.pdf_exam_results pr
              WHERE pr.pdf_exam_id = (t.metadata->>'pdf_exam_id')::uuid
                AND pr.student_id = (t.metadata->>'student_id')::uuid
                AND pr.submitted_at IS NOT NULL
            )
          )
        ))
        OR
        (t.verification_mode = 'trial_request' AND NOT EXISTS (
          SELECT 1 FROM public.trial_lesson_requests tr
          WHERE tr.status IN ('new', 'contacted', 'pending_schedule')
        ))
        OR
        (t.verification_mode = 'parent_link' AND NOT EXISTS (
          SELECT 1 FROM public.class_students cs
          WHERE (cs.left_at IS NULL OR cs.left_at >= now())
            AND NOT EXISTS (
              SELECT 1 FROM public.parent_students ps
              WHERE ps.student_id = cs.student_id AND ps.revoked_at IS NULL
            )
        ))
        OR
        (t.verification_mode = 'class_staff' AND NOT EXISTS (
          SELECT 1 FROM public.classes c
          WHERE COALESCE(c.hidden, false) = false
            AND (
              NOT EXISTS (SELECT 1 FROM public.class_teachers ct WHERE ct.class_id = c.id)
              OR NOT EXISTS (
                SELECT 1 FROM public.class_teachers ct
                JOIN public.users u ON u.id = ct.teacher_id
                WHERE ct.class_id = c.id AND u.role::text = 'assistant'
              )
            )
        ))
      )
  )
  UPDATE public.task_assignments a
  SET status = 'completed', completed_at = now()
  FROM verified v
  WHERE a.id = v.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_task_assignment_status(
  p_assignment_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS public.task_assignments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.task_assignments;
  v_old_status text;
  v_verification text;
BEGIN
  IF p_status NOT IN ('open', 'in_progress', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO v_assignment
  FROM public.task_assignments
  WHERE id = p_assignment_id;

  SELECT verification_mode INTO v_verification
  FROM public.daily_tasks
  WHERE id = v_assignment.task_id;

  IF v_assignment.id IS NULL THEN RAISE EXCEPTION 'Assignment not found'; END IF;
  IF v_assignment.user_id <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_status = 'completed' AND v_verification <> 'manual' AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'This task is completed automatically after the related work is done';
  END IF;

  v_old_status := v_assignment.status;
  UPDATE public.task_assignments
  SET status = p_status,
      completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE NULL END
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  INSERT INTO public.task_events (
    task_id, assignment_id, actor_id, event_type, from_status, to_status, note
  ) VALUES (
    v_assignment.task_id, v_assignment.id, auth.uid(), 'status_changed',
    v_old_status, p_status, p_note
  );
  RETURN v_assignment;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_old_task_assignments(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_deleted_assignments integer := 0;
  v_deleted_tasks integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin(v_actor) THEN
    p_user_id := v_actor;
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_actor AND NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  WITH deleted AS (
    DELETE FROM public.task_assignments a
    USING public.daily_tasks t
    WHERE a.task_id = t.id
      AND (p_user_id IS NULL OR a.user_id = p_user_id)
      AND COALESCE((t.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, t.available_on) < v_today
    RETURNING a.id
  )
  SELECT count(*) INTO v_deleted_assignments FROM deleted;

  WITH deleted_tasks AS (
    DELETE FROM public.daily_tasks t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.task_assignments a WHERE a.task_id = t.id
    )
    RETURNING t.id
  )
  SELECT count(*) INTO v_deleted_tasks FROM deleted_tasks;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_assignments', v_deleted_assignments,
    'deleted_tasks', v_deleted_tasks,
    'before_date', v_today
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_task(
  p_title text,
  p_description text,
  p_priority text,
  p_due_at timestamptz,
  p_action_url text,
  p_user_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid := gen_random_uuid();
  v_user_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF trim(COALESCE(p_title, '')) = '' OR COALESCE(array_length(p_user_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Title and assignees are required';
  END IF;

  INSERT INTO public.daily_tasks (
    id, title, description, task_type, source_type, source_id, source_key,
    priority, available_on, due_at, action_url, auto_generated,
    verification_mode, created_by
  ) VALUES (
    v_task_id, trim(p_title), NULLIF(trim(COALESCE(p_description, '')), ''),
    'manual', 'manual', v_task_id::text, 'manual:' || v_task_id,
    COALESCE(p_priority, 'normal'), (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    p_due_at, NULLIF(trim(COALESCE(p_action_url, '')), ''), false, 'manual', auth.uid()
  );

  FOREACH v_user_id IN ARRAY p_user_ids LOOP
    INSERT INTO public.task_assignments (task_id, user_id, assigned_by)
    VALUES (v_task_id, v_user_id, auth.uid());
    INSERT INTO public.task_preferences (user_id) VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;

  INSERT INTO public.task_events (task_id, actor_id, event_type, metadata)
  VALUES (v_task_id, auth.uid(), 'created', jsonb_build_object('assignee_count', array_length(p_user_ids, 1)));
  RETURN v_task_id;
END;
$$;

ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_tasks_select ON public.daily_tasks;
CREATE POLICY daily_tasks_select ON public.daily_tasks FOR SELECT TO authenticated USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.task_assignments a
    WHERE a.task_id = daily_tasks.id AND a.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS daily_tasks_admin_write ON public.daily_tasks;
CREATE POLICY daily_tasks_admin_write ON public.daily_tasks FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS task_assignments_select ON public.task_assignments;
CREATE POLICY task_assignments_select ON public.task_assignments FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.is_admin(auth.uid())
);
DROP POLICY IF EXISTS task_assignments_admin_write ON public.task_assignments;
CREATE POLICY task_assignments_admin_write ON public.task_assignments FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS task_events_select ON public.task_events;
CREATE POLICY task_events_select ON public.task_events FOR SELECT TO authenticated USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.task_assignments a
    WHERE a.task_id = task_events.task_id AND a.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS task_events_admin_write ON public.task_events;
CREATE POLICY task_events_admin_write ON public.task_events FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS task_notification_logs_select ON public.task_notification_logs;
CREATE POLICY task_notification_logs_select ON public.task_notification_logs FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.is_admin(auth.uid())
);
DROP POLICY IF EXISTS task_notification_logs_admin_write ON public.task_notification_logs;
CREATE POLICY task_notification_logs_admin_write ON public.task_notification_logs FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS task_preferences_select ON public.task_preferences;
CREATE POLICY task_preferences_select ON public.task_preferences FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.is_admin(auth.uid())
);
DROP POLICY IF EXISTS task_preferences_insert ON public.task_preferences;
CREATE POLICY task_preferences_insert ON public.task_preferences FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS task_preferences_update ON public.task_preferences;
CREATE POLICY task_preferences_update ON public.task_preferences FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

REVOKE ALL ON FUNCTION public.upsert_generated_task(uuid, text, text, text, text, text, text, text, date, timestamptz, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_daily_tasks(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_verified_task_statuses(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_task_assignment_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_old_task_assignments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_manual_task(text, text, text, timestamptz, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_daily_tasks(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_verified_task_statuses(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_task_assignment_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_old_task_assignments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_task(text, text, text, timestamptz, text, uuid[]) TO authenticated;
