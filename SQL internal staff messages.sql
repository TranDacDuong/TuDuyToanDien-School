-- Internal MindUp staff/admin messages for tasks, attendance and operations.
-- Safe to run repeatedly in Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS real_sender_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_key text;

CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_message_key_unique
  ON public.messages (conversation_id, message_key)
  WHERE message_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mindup_primary_admin()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.users
  WHERE role::text = 'admin'
  ORDER BY created_at ASC NULLS LAST, id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_internal_staff_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_role, '') NOT IN ('admin', 'student', 'parent', 'bot', 'guest')
$$;

CREATE OR REPLACE FUNCTION public.internal_staff_user_ids()
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE public.is_internal_staff_role(u.role::text)
$$;

CREATE OR REPLACE FUNCTION public.ensure_internal_staff_conversation(
  p_staff_id uuid,
  p_admin_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := COALESCE(p_admin_id, public.mindup_primary_admin());
  v_conv_id uuid;
  v_direct_key text;
BEGIN
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'staff_id is required';
  END IF;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No admin account found';
  END IF;

  v_direct_key := (
    SELECT string_agg(id::text, '_' ORDER BY id::text)
    FROM (VALUES (v_admin_id), (p_staff_id)) AS t(id)
  );

  INSERT INTO public.conversations (kind, direct_key)
  VALUES ('direct', v_direct_key)
  ON CONFLICT (direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conv_id, v_admin_id), (v_conv_id, p_staff_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN v_conv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_internal_message(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_conversation_id uuid,
  p_message text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_recipient_id IS NULL OR p_conversation_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (
    user_id, actor_id, type, ref_id, message, is_read, meta, created_at
  )
  VALUES (
    p_recipient_id,
    p_actor_id,
    'message_new',
    p_conversation_id,
    COALESCE(NULLIF(trim(p_message), ''), 'Bạn có tin nhắn nội bộ mới.'),
    false,
    COALESCE(p_meta, '{}'::jsonb) || jsonb_build_object('conversation_id', p_conversation_id, 'internal_staff_thread', true),
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_internal_staff_message(
  p_staff_id uuid,
  p_sender_id uuid,
  p_content text,
  p_message_key text DEFAULT NULL,
  p_replace_existing boolean DEFAULT false,
  p_notify boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := public.mindup_primary_admin();
  v_conv_id uuid;
  v_msg_id uuid;
  v_recipient_id uuid;
BEGIN
  IF p_staff_id IS NULL OR p_sender_id IS NULL OR NULLIF(trim(COALESCE(p_content, '')), '') IS NULL THEN
    RAISE EXCEPTION 'staff_id, sender_id and content are required';
  END IF;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No admin account found';
  END IF;

  IF p_sender_id NOT IN (p_staff_id, v_admin_id) THEN
    RAISE EXCEPTION 'Sender must be the admin or staff member in this thread';
  END IF;

  v_conv_id := public.ensure_internal_staff_conversation(p_staff_id, v_admin_id);

  IF p_replace_existing AND p_message_key IS NOT NULL THEN
    DELETE FROM public.messages
    WHERE conversation_id = v_conv_id
      AND message_key = p_message_key;
  END IF;

  IF p_message_key IS NULL THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id)
    VALUES (v_conv_id, p_sender_id, p_content, NULL)
    RETURNING id INTO v_msg_id;
  ELSE
    INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id, message_key, created_at)
    VALUES (v_conv_id, p_sender_id, p_content, NULL, p_message_key, now())
    ON CONFLICT (conversation_id, message_key) WHERE message_key IS NOT NULL
    DO UPDATE SET
      sender_id = EXCLUDED.sender_id,
      content = EXCLUDED.content,
      created_at = EXCLUDED.created_at
    RETURNING id INTO v_msg_id;
  END IF;

  IF p_notify THEN
    v_recipient_id := CASE WHEN p_sender_id = p_staff_id THEN v_admin_id ELSE p_staff_id END;
    PERFORM public.notify_internal_message(
      v_recipient_id,
      p_sender_id,
      v_conv_id,
      left(regexp_replace(p_content, '\s+', ' ', 'g'), 220),
      jsonb_build_object('message_key', p_message_key)
    );
  END IF;

  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.task_result_summary(p_note text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_payload jsonb;
  v_lines text := '';
  r record;
BEGIN
  IF NULLIF(trim(COALESCE(p_note, '')), '') IS NULL THEN
    RETURN '';
  END IF;

  BEGIN
    v_payload := p_note::jsonb;
  EXCEPTION WHEN others THEN
    RETURN p_note;
  END;

  IF COALESCE((v_payload->>'__task_result_v2')::boolean, false) IS NOT TRUE THEN
    RETURN p_note;
  END IF;

  IF NULLIF(trim(COALESCE(v_payload->>'note', '')), '') IS NOT NULL THEN
    v_lines := v_lines || 'Ghi chú: ' || trim(v_payload->>'note') || E'\n';
  END IF;

  FOR r IN
    SELECT key, value
    FROM jsonb_each(COALESCE(v_payload->'requirements', '{}'::jsonb))
  LOOP
    v_lines := v_lines
      || '• ' || r.key || ': '
      || COALESCE(NULLIF(trim(r.value->>'value'), ''), '(chưa nhập nội dung)')
      || CASE WHEN COALESCE((r.value->>'done')::boolean, false) THEN ' — Đã hoàn thành' ELSE ' — Chưa hoàn thành' END
      || E'\n';
  END LOOP;

  RETURN trim(v_lines);
END;
$$;

CREATE OR REPLACE FUNCTION public.task_completed_requirement_count(p_note text)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_payload jsonb;
  v_count int := 0;
BEGIN
  IF NULLIF(trim(COALESCE(p_note, '')), '') IS NULL THEN
    RETURN 0;
  END IF;

  BEGIN
    v_payload := p_note::jsonb;
  EXCEPTION WHEN others THEN
    RETURN 0;
  END;

  SELECT count(*)::int
  INTO v_count
  FROM jsonb_each(COALESCE(v_payload->'requirements', '{}'::jsonb)) req
  WHERE COALESCE((req.value->>'done')::boolean, false);

  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_task_rows_for_day(
  p_staff_id uuid,
  p_day date DEFAULT NULL,
  p_include_overdue boolean DEFAULT false
)
RETURNS TABLE (
  assignment_id uuid,
  task_id uuid,
  title text,
  description text,
  priority text,
  status text,
  available_on date,
  due_at timestamptz,
  action_url text,
  requirements_count int,
  completed_requirements int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT COALESCE(p_day, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS day
  ),
  base AS (
    SELECT
      a.id AS assignment_id,
      t.id AS task_id,
      t.title,
      t.description,
      t.priority,
      a.status,
      t.available_on,
      t.due_at,
      t.action_url,
      COALESCE(jsonb_array_length(t.metadata->'requirements'), 0) AS requirements_count,
      public.task_completed_requirement_count(latest_result.note) AS completed_requirements
    FROM public.task_assignments a
    JOIN public.daily_tasks t ON t.id = a.task_id
    LEFT JOIN LATERAL (
      SELECT e.note
      FROM public.task_events e
      WHERE e.assignment_id = a.id
        AND e.note IS NOT NULL
      ORDER BY e.created_at DESC
      LIMIT 1
    ) latest_result ON true
    CROSS JOIN params p
    WHERE a.user_id = p_staff_id
      AND a.status <> 'cancelled'
      AND t.available_on <= p.day
      AND (
        t.available_on = p.day
        OR (
          t.due_at IS NOT NULL
          AND (t.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p.day
        )
        OR (
          p_include_overdue
          AND COALESCE((t.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, t.available_on) < p.day
          AND a.status <> 'completed'
        )
      )
  )
  SELECT *
  FROM base
  ORDER BY
    CASE WHEN status = 'completed' THEN 1 ELSE 0 END,
    CASE priority WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
    due_at NULLS LAST,
    title;
$$;

CREATE OR REPLACE FUNCTION public.build_staff_task_digest_content(
  p_staff_id uuid,
  p_day date DEFAULT NULL,
  p_slot text DEFAULT '0800'
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := COALESCE(p_day, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
  v_open_count int;
  v_done_count int;
  v_total_count int;
  v_overdue_count int;
  v_content text;
  r record;
BEGIN
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE status = 'completed')::int,
    count(*) FILTER (WHERE status <> 'completed')::int,
    count(*) FILTER (
      WHERE status <> 'completed'
        AND COALESCE((due_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, available_on) < v_day
    )::int
  INTO v_total_count, v_done_count, v_open_count, v_overdue_count
  FROM public.staff_task_rows_for_day(p_staff_id, v_day, true);

  IF COALESCE(v_total_count, 0) = 0 THEN
    RETURN '';
  END IF;

  v_content := CASE p_slot
    WHEN '1530' THEN '📌 Cập nhật công việc lúc 15:30'
    ELSE '📌 Công việc hôm nay lúc 08:00'
  END || E'\n'
    || 'Ngày: ' || to_char(v_day, 'DD/MM/YYYY') || E'\n'
    || 'Tổng: ' || v_total_count || ' • Còn làm: ' || v_open_count || ' • Đã xong: ' || v_done_count
    || CASE WHEN v_overdue_count > 0 THEN ' • Quá hạn: ' || v_overdue_count ELSE '' END
    || E'\n\n';

  FOR r IN
    SELECT *
    FROM public.staff_task_rows_for_day(p_staff_id, v_day, true)
    LIMIT 20
  LOOP
    v_content := v_content
      || CASE WHEN r.status = 'completed' THEN '✅ ' WHEN r.priority = 'urgent' THEN '🚨 ' WHEN r.priority = 'important' THEN '⚠️ ' ELSE '• ' END
      || r.title
      || CASE WHEN r.due_at IS NOT NULL THEN ' — Hạn: ' || to_char(r.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') ELSE '' END
      || CASE WHEN r.requirements_count > 0 THEN ' — Mục nộp: ' || r.completed_requirements || '/' || r.requirements_count ELSE '' END
      || CASE WHEN r.status = 'completed' THEN ' — Đã hoàn thành' ELSE '' END
      || E'\n';
  END LOOP;

  v_content := v_content || E'\n__ACTION__{"type":"url","label":"📋 Mở Công việc","url":"tasks.html"}';
  RETURN trim(v_content);
END;
$$;

CREATE OR REPLACE FUNCTION public.send_staff_task_submission_messages(
  p_day date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := COALESCE(p_day, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
  v_count int := 0;
  r record;
  v_content text;
BEGIN
  FOR r IN
    SELECT
      e.id AS event_id,
      e.actor_id AS staff_id,
      e.created_at,
      e.note,
      t.title,
      u.full_name,
      u.email
    FROM public.task_events e
    JOIN public.task_assignments a ON a.id = e.assignment_id
    JOIN public.daily_tasks t ON t.id = e.task_id
    JOIN public.users u ON u.id = e.actor_id
    WHERE e.event_type = 'status_changed'
      AND e.to_status = 'completed'
      AND e.actor_id = a.user_id
      AND (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_day
  LOOP
    v_content := '✅ '
      || COALESCE(r.full_name, r.email, 'Nhân viên')
      || ' đã nộp kết quả công việc: '
      || r.title
      || E'\n'
      || COALESCE(NULLIF(public.task_result_summary(r.note), ''), 'Không có ghi chú chi tiết.')
      || E'\n\n__ACTION__{"type":"url","label":"📋 Xem công việc","url":"tasks.html"}';

    PERFORM public.insert_internal_staff_message(
      r.staff_id,
      r.staff_id,
      v_content,
      'internal_task_submission:' || r.event_id::text,
      false,
      true
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_internal_task_digest(
  p_slot text DEFAULT '0800',
  p_day date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := COALESCE(p_day, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
  v_admin_id uuid := public.mindup_primary_admin();
  v_content text;
  v_conv_id uuid;
  v_count int := 0;
  r record;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No admin account found';
  END IF;

  FOR r IN SELECT user_id FROM public.internal_staff_user_ids() LOOP
    v_conv_id := public.ensure_internal_staff_conversation(r.user_id, v_admin_id);

    IF p_slot = '1530' THEN
      DELETE FROM public.messages
      WHERE conversation_id = v_conv_id
        AND message_key = 'internal_task_digest:' || v_day::text || ':0800:' || r.user_id::text;
    END IF;

    v_content := public.build_staff_task_digest_content(r.user_id, v_day, p_slot);
    IF NULLIF(v_content, '') IS NULL THEN
      CONTINUE;
    END IF;

    PERFORM public.insert_internal_staff_message(
      r.user_id,
      v_admin_id,
      v_content,
      'internal_task_digest:' || v_day::text || ':' || p_slot || ':' || r.user_id::text,
      true,
      true
    );
    v_count := v_count + 1;
  END LOOP;

  IF p_slot = '1530' THEN
    v_count := v_count + public.send_staff_task_submission_messages(v_day);
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_staff_attendance_reminder(
  p_check_type text,
  p_day date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := COALESCE(p_day, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
  v_admin_id uuid := public.mindup_primary_admin();
  v_count int := 0;
  v_title text;
  r record;
BEGIN
  IF p_check_type NOT IN ('check_in', 'check_out') THEN
    RAISE EXCEPTION 'Invalid check type';
  END IF;

  v_title := CASE WHEN p_check_type = 'check_in' THEN 'chấm công vào' ELSE 'chấm công ra' END;

  FOR r IN
    SELECT s.user_id
    FROM public.internal_staff_user_ids() s
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.staff_attendance_logs l
      WHERE l.user_id = s.user_id
        AND l.check_type = p_check_type
        AND (l.checked_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_day
        AND l.is_valid = true
    )
  LOOP
    PERFORM public.insert_internal_staff_message(
      r.user_id,
      v_admin_id,
      '⏰ Nhắc ' || v_title || E'\n'
        || 'Ngày: ' || to_char(v_day, 'DD/MM/YYYY') || E'\n'
        || 'Vui lòng mở tab Công việc và thực hiện ' || v_title || ' nếu bạn đang làm việc tại trung tâm.'
        || E'\n\n__ACTION__{"type":"url","label":"✅ Mở Công việc","url":"tasks.html"}',
      'internal_attendance_reminder:' || v_day::text || ':' || p_check_type || ':' || r.user_id::text,
      true,
      true
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_unfinished_task_reminders(
  p_kind text DEFAULT 'night',
  p_day date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := COALESCE(p_day, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
  v_target_day date := CASE WHEN p_kind = 'morning_urgent' THEN v_day - 1 ELSE v_day END;
  v_admin_id uuid := public.mindup_primary_admin();
  v_count int := 0;
  v_open int;
  r record;
  task_row record;
  v_content text;
BEGIN
  FOR r IN SELECT user_id FROM public.internal_staff_user_ids() LOOP
    SELECT count(*)::int INTO v_open
    FROM public.staff_task_rows_for_day(r.user_id, v_target_day, p_kind = 'morning_urgent')
    WHERE status <> 'completed';

    IF COALESCE(v_open, 0) = 0 THEN
      CONTINUE;
    END IF;

    v_content := CASE
      WHEN p_kind = 'morning_urgent' THEN '🚨 KHẨN CẤP: Công việc hôm qua vẫn chưa hoàn thiện'
      ELSE '⚠️ Yêu cầu hoàn thiện công việc trong ngày'
    END || E'\n'
      || 'Còn ' || v_open || ' công việc/mục cần xử lý.'
      || E'\n';

    FOR task_row IN
      SELECT *
      FROM public.staff_task_rows_for_day(r.user_id, v_target_day, p_kind = 'morning_urgent')
      WHERE status <> 'completed'
      LIMIT 10
    LOOP
      v_content := v_content || E'\n• ' || task_row.title
        || CASE WHEN task_row.due_at IS NOT NULL THEN ' — Hạn: ' || to_char(task_row.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') ELSE '' END
        || CASE WHEN task_row.requirements_count > 0 THEN ' — Mục nộp: ' || task_row.completed_requirements || '/' || task_row.requirements_count ELSE '' END;
    END LOOP;

    v_content := v_content || E'\n\n__ACTION__{"type":"url","label":"📋 Hoàn thiện ngay","url":"tasks.html"}';

    PERFORM public.insert_internal_staff_message(
      r.user_id,
      v_admin_id,
      v_content,
      'internal_unfinished:' || v_target_day::text || ':' || p_kind || ':' || r.user_id::text,
      true,
      true
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Optional: send a staff-side internal message immediately when a manual task is submitted.
CREATE OR REPLACE FUNCTION public.send_internal_task_status_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.daily_tasks%ROWTYPE;
  v_actor public.users%ROWTYPE;
  v_content text;
BEGIN
  IF NEW.event_type <> 'status_changed'
     OR NEW.to_status <> 'completed'
     OR NEW.assignment_id IS NULL
     OR NEW.actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.* INTO v_task
  FROM public.daily_tasks t
  WHERE t.id = NEW.task_id;

  SELECT u.* INTO v_actor
  FROM public.users u
  WHERE u.id = NEW.actor_id;

  IF v_task.id IS NULL OR v_actor.id IS NULL OR NOT public.is_internal_staff_role(v_actor.role::text) THEN
    RETURN NEW;
  END IF;

  v_content := '✅ '
    || COALESCE(v_actor.full_name, v_actor.email, 'Nhân viên')
    || ' đã nộp kết quả công việc: '
    || v_task.title
    || E'\n'
    || COALESCE(NULLIF(public.task_result_summary(NEW.note), ''), 'Không có ghi chú chi tiết.')
    || E'\n\n__ACTION__{"type":"url","label":"📋 Xem công việc","url":"tasks.html"}';

  PERFORM public.insert_internal_staff_message(
    NEW.actor_id,
    NEW.actor_id,
    v_content,
    'internal_task_submission:' || NEW.id::text,
    false,
    true
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_events_internal_message ON public.task_events;
-- Keep staff submission messages grouped with the 15:30 task digest.
-- If an older trigger exists from a previous version, removing it prevents
-- result-submission messages from being sent immediately at random times.

-- Cron schedules use UTC. Vietnam time = UTC+7.
DO $$
BEGIN
  PERFORM cron.unschedule('mindup-internal-task-digest-0800');
EXCEPTION WHEN others THEN NULL;
END $$;
SELECT cron.schedule('mindup-internal-task-digest-0800', '0 1 * * *', $$SELECT public.send_internal_task_digest('0800');$$);

DO $$
BEGIN
  PERFORM cron.unschedule('mindup-internal-attendance-checkin-1525');
EXCEPTION WHEN others THEN NULL;
END $$;
SELECT cron.schedule('mindup-internal-attendance-checkin-1525', '25 8 * * *', $$SELECT public.send_staff_attendance_reminder('check_in');$$);

DO $$
BEGIN
  PERFORM cron.unschedule('mindup-internal-task-digest-1530');
EXCEPTION WHEN others THEN NULL;
END $$;
SELECT cron.schedule('mindup-internal-task-digest-1530', '30 8 * * *', $$SELECT public.send_internal_task_digest('1530');$$);

DO $$
BEGIN
  PERFORM cron.unschedule('mindup-internal-unfinished-2100');
EXCEPTION WHEN others THEN NULL;
END $$;
SELECT cron.schedule('mindup-internal-unfinished-2100', '0 14 * * *', $$SELECT public.send_unfinished_task_reminders('night');$$);

DO $$
BEGIN
  PERFORM cron.unschedule('mindup-internal-attendance-checkout-2155');
EXCEPTION WHEN others THEN NULL;
END $$;
SELECT cron.schedule('mindup-internal-attendance-checkout-2155', '55 14 * * *', $$SELECT public.send_staff_attendance_reminder('check_out');$$);

-- Morning urgent reminder for unfinished tasks from the previous day.
DO $$
BEGIN
  PERFORM cron.unschedule('mindup-internal-unfinished-next-morning');
EXCEPTION WHEN others THEN NULL;
END $$;
SELECT cron.schedule('mindup-internal-unfinished-next-morning', '5 1 * * *', $$SELECT public.send_unfinished_task_reminders('morning_urgent');$$);

GRANT EXECUTE ON FUNCTION public.mindup_primary_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_internal_staff_role(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.internal_staff_user_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_internal_staff_conversation(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_internal_staff_message(uuid, uuid, text, text, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_internal_task_digest(text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_staff_task_submission_messages(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_staff_attendance_reminder(text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_unfinished_task_reminders(text, date) TO authenticated, service_role;
