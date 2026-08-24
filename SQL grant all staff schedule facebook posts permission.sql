-- =========================================================
-- PHÂN QUYỀN HẸN LỊCH VÀ QUẢN LÝ BÀI ĐĂNG FACEBOOK CHO TẤT CẢ NHÂN VIÊN
-- Cho phép tất cả nhân viên (Admin, Trợ giảng, Giáo viên, Marketing, Kế toán, Staff...)
-- thực hiện Hẹn lịch, Xác nhận, Xem, Thêm, Sửa, Xóa trên các bảng Facebook Posting
-- =========================================================

-- 1. Bảng facebook_pages
DROP POLICY IF EXISTS facebook_pages_select_staff ON public.facebook_pages;
CREATE POLICY facebook_pages_select_staff ON public.facebook_pages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text NOT IN ('student', 'parent')
  )
);

DROP POLICY IF EXISTS facebook_pages_admin_all ON public.facebook_pages;
DROP POLICY IF EXISTS facebook_pages_write_staff ON public.facebook_pages;
CREATE POLICY facebook_pages_write_staff ON public.facebook_pages
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text NOT IN ('student', 'parent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text NOT IN ('student', 'parent')
  )
);

-- 2. Bảng facebook_post_types
DROP POLICY IF EXISTS facebook_post_types_select_staff ON public.facebook_post_types;
CREATE POLICY facebook_post_types_select_staff ON public.facebook_post_types
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text NOT IN ('student', 'parent')
  )
);

DROP POLICY IF EXISTS facebook_post_types_staff_write ON public.facebook_post_types;
DROP POLICY IF EXISTS facebook_post_types_write_staff ON public.facebook_post_types;
CREATE POLICY facebook_post_types_write_staff ON public.facebook_post_types
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text NOT IN ('student', 'parent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text NOT IN ('student', 'parent')
  )
);

-- 3. Bảng facebook_post_schedule_templates
DROP POLICY IF EXISTS facebook_templates_select_staff ON public.facebook_post_schedule_templates;
CREATE POLICY facebook_templates_select_staff ON public.facebook_post_schedule_templates
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text NOT IN ('student', 'parent')
  )
);

DROP POLICY IF EXISTS facebook_templates_staff_write ON public.facebook_post_schedule_templates;
DROP POLICY IF EXISTS facebook_templates_write_staff ON public.facebook_post_schedule_templates;
CREATE POLICY facebook_templates_write_staff ON public.facebook_post_schedule_templates
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text NOT IN ('student', 'parent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text NOT IN ('student', 'parent')
  )
);

-- 4. Bảng facebook_scheduled_posts (Lên lịch, Hẹn lịch bài đăng)
DROP POLICY IF EXISTS facebook_posts_select_staff ON public.facebook_scheduled_posts;
CREATE POLICY facebook_posts_select_staff ON public.facebook_scheduled_posts
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text NOT IN ('student', 'parent')
  )
);

DROP POLICY IF EXISTS facebook_posts_staff_write ON public.facebook_scheduled_posts;
DROP POLICY IF EXISTS facebook_posts_write_staff ON public.facebook_scheduled_posts;
CREATE POLICY facebook_posts_staff_write ON public.facebook_scheduled_posts
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text NOT IN ('student', 'parent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text NOT IN ('student', 'parent')
  )
);

-- 5. Cập nhật hàm approve_facebook_scheduled_post mở quyền cho tất cả Nhân viên
CREATE OR REPLACE FUNCTION public.approve_facebook_scheduled_post(p_post_id uuid)
RETURNS public.facebook_scheduled_posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post public.facebook_scheduled_posts;
  v_role text;
  v_allowed boolean;
BEGIN
  SELECT role::text INTO v_role
  FROM public.users
  WHERE id = auth.uid();

  SELECT p.* INTO v_post
  FROM public.facebook_scheduled_posts p
  WHERE p.id = p_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bài đăng Facebook.';
  END IF;

  v_allowed := v_role NOT IN ('student', 'parent')
    OR EXISTS (
      SELECT 1
      FROM public.task_assignments a
      WHERE a.task_id = v_post.task_id
        AND a.user_id = auth.uid()
    );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Bạn chưa có quyền xác nhận bài đăng này.';
  END IF;

  UPDATE public.facebook_scheduled_posts
  SET approval_status = 'approved',
      content_status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_post_id
  RETURNING * INTO v_post;

  IF v_post.task_id IS NOT NULL THEN
    UPDATE public.task_assignments
    SET status = 'completed',
        completed_at = COALESCE(completed_at, now())
    WHERE task_id = v_post.task_id
      AND (user_id = auth.uid() OR v_role NOT IN ('student', 'parent'));
  END IF;

  RETURN v_post;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_facebook_scheduled_post(uuid) TO authenticated, service_role;
