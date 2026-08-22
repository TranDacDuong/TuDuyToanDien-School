-- =========================================================
-- WORKFLOW PHÂN CÔNG ĐĂNG BÀI FACEBOOK THEO FANPAGE & CHỈ TIÊU TUẦN TỚI
-- =========================================================

-- 1. Bổ sung các cột phân công Fanpage vào bảng facebook_pages
ALTER TABLE public.facebook_pages
  ADD COLUMN IF NOT EXISTS assigned_staff_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_posts_per_week integer NOT NULL DEFAULT 5 CHECK (target_posts_per_week > 0);

CREATE INDEX IF NOT EXISTS facebook_pages_assigned_staff_idx
  ON public.facebook_pages(assigned_staff_id);

-- 2. Cập nhật RLS Policies cho facebook_pages
DROP POLICY IF EXISTS facebook_pages_select_staff ON public.facebook_pages;
CREATE POLICY facebook_pages_select_staff ON public.facebook_pages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant', 'marketing', 'accountant')
    )
  );

DROP POLICY IF EXISTS facebook_pages_write_staff ON public.facebook_pages;
CREATE POLICY facebook_pages_write_staff ON public.facebook_pages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant', 'marketing')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant', 'marketing')
    )
  );

-- 3. Hàm tự động tính toán tiến độ & đồng bộ Công việc cho Tuần Hiện Tại (Soạn bài cho Tuần Tới)
CREATE OR REPLACE FUNCTION public.sync_facebook_fanpage_weekly_tasks(
  p_week_date date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref_date date := COALESCE(p_week_date, CURRENT_DATE);
  v_current_week_start date;
  v_current_week_end date;
  v_next_week_start date;
  v_next_week_end date;
  v_count integer := 0;
  r RECORD;
  v_scheduled_count integer;
  v_task_id uuid;
  v_progress integer;
  v_status text;
  v_source_key text;
  v_title text;
  v_desc text;
  v_due_at timestamptz;
BEGIN
  -- Bắt đầu và kết thúc của tuần hiện tại (khi nhân viên đang làm việc)
  v_current_week_start := date_trunc('week', v_ref_date::timestamp)::date;
  v_current_week_end := v_current_week_start + 6;
  v_due_at := (v_current_week_end::text || ' 23:59:59')::timestamptz;

  -- Bắt đầu và kết thúc của tuần tới (khi các bài đăng xuất bản)
  v_next_week_start := v_current_week_start + 7;
  v_next_week_end := v_current_week_start + 13;

  FOR r IN
    SELECT
      id,
      page_id,
      page_name,
      assigned_staff_id,
      COALESCE(target_posts_per_week, 5) AS target_posts
    FROM public.facebook_pages
    WHERE is_active = true
      AND assigned_staff_id IS NOT NULL
  LOOP
    -- Đếm số bài đã hẹn lịch cho TUẦN TỚI (v_next_week_start đến v_next_week_end)
    SELECT COUNT(*)
    INTO v_scheduled_count
    FROM public.facebook_scheduled_posts
    WHERE page_id = r.page_id
      AND scheduled_date BETWEEN v_next_week_start AND v_next_week_end
      AND status NOT IN ('cancelled');

    -- Tính % tiến độ
    v_progress := LEAST(100, FLOOR((v_scheduled_count::numeric / r.target_posts::numeric) * 100));
    v_status := CASE WHEN v_scheduled_count >= r.target_posts THEN 'completed' ELSE 'in_progress' END;
    v_source_key := 'fb_fanpage_weekly:' || r.page_id || ':' || to_char(v_current_week_start, 'YYYY-MM-DD');

    v_title := '📣 Đăng bài & Lên lịch Fanpage (Tuần tới ' || to_char(v_next_week_start, 'DD/MM') || ' - ' || to_char(v_next_week_end, 'DD/MM') || '): ' || r.page_name;
    v_desc := 'Chỉ tiêu: Lên lịch ' || r.target_posts || ' bài/tuần cho tuần tới (' || to_char(v_next_week_start, 'DD/MM') || ' - ' || to_char(v_next_week_end, 'DD/MM') || '). Hiện đã lên lịch ' || v_scheduled_count || '/' || r.target_posts || ' bài (' || v_progress || '%).';

    -- Upsert vào bảng daily_tasks
    INSERT INTO public.daily_tasks (
      title,
      description,
      task_type,
      source_type,
      source_key,
      action_url,
      verification_mode,
      created_by,
      due_at,
      metadata
    )
    VALUES (
      v_title,
      v_desc,
      'facebook_posting',
      'facebook_fanpage',
      v_source_key,
      'facebook_posting.html',
      'facebook_schedule',
      r.assigned_staff_id,
      v_due_at,
      jsonb_build_object(
        'page_id', r.page_id,
        'page_name', r.page_name,
        'target_posts', r.target_posts,
        'scheduled_count', v_scheduled_count,
        'progress_percent', v_progress,
        'week_start', to_char(v_current_week_start, 'YYYY-MM-DD'),
        'week_end', to_char(v_current_week_end, 'YYYY-MM-DD'),
        'target_week_start', to_char(v_next_week_start, 'YYYY-MM-DD'),
        'target_week_end', to_char(v_next_week_end, 'YYYY-MM-DD')
      )
    )
    ON CONFLICT (source_key) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      due_at = EXCLUDED.due_at,
      metadata = EXCLUDED.metadata,
      updated_at = now()
    RETURNING id INTO v_task_id;

    -- Upsert phân công công việc cho nhân viên
    INSERT INTO public.task_assignments (task_id, user_id, assigned_by, status)
    VALUES (v_task_id, r.assigned_staff_id, r.assigned_staff_id, v_status)
    ON CONFLICT (task_id, user_id) DO UPDATE SET
      status = EXCLUDED.status,
      updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Trigger tự động đồng bộ khi bài đăng thay đổi
CREATE OR REPLACE FUNCTION public.trg_sync_facebook_fanpage_tasks_on_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_facebook_fanpage_weekly_tasks(COALESCE(NEW.scheduled_date, OLD.scheduled_date, CURRENT_DATE));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_facebook_posts_sync_fanpage_tasks ON public.facebook_scheduled_posts;
CREATE TRIGGER trg_facebook_posts_sync_fanpage_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.facebook_scheduled_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_facebook_fanpage_tasks_on_post();

SELECT public.sync_facebook_fanpage_weekly_tasks();
