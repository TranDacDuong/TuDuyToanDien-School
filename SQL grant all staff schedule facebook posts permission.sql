-- =========================================================
-- PHÂN QUYỀN HẸN LỊCH FACEBOOK CHO TẤT CẢ NHÂN VIÊN
-- Cho phép tất cả nhân viên (Admin, Trợ giảng, Giáo viên, Marketing, Kế toán, Staff...)
-- thực hiện Hẹn lịch, Xem, Thêm, Sửa, Xóa trên các bảng Facebook Posting
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
