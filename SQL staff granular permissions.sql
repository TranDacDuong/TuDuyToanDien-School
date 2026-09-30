-- MindUp granular permissions
-- Run once in the Supabase SQL Editor. The script is idempotent.

CREATE TABLE IF NOT EXISTS public.app_permissions (
  permission_key text PRIMARY KEY,
  section text NOT NULL,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permission_defaults (
  role_name text NOT NULL,
  permission_key text NOT NULL REFERENCES public.app_permissions(permission_key) ON DELETE CASCADE,
  allowed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (role_name, permission_key)
);

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.app_permissions(permission_key) ON DELETE CASCADE,
  allowed boolean NOT NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS user_permission_overrides_user_idx
  ON public.user_permission_overrides(user_id);

INSERT INTO public.app_permissions(permission_key, section, label, description, sort_order) VALUES
  ('page.ops_center', 'Trang trong menu', 'Bảng điều hành', 'Xem bảng điều hành tổng quan của trung tâm.', 10),
  ('page.home', 'Trang trong menu', 'Trang chủ', 'Mở trang chủ.', 20),
  ('page.courses', 'Trang trong menu', 'Khóa học', 'Xem danh sách và nội dung khóa học.', 30),
  ('page.classes', 'Trang trong menu', 'Lớp học', 'Xem lớp học và các buổi học.', 40),
  ('page.tasks', 'Trang trong menu', 'Công việc', 'Xem công việc được giao.', 50),
  ('page.teacher_schedule', 'Trang trong menu', 'Giáo viên và thời khóa biểu', 'Xem giáo viên và lịch giảng dạy.', 60),
  ('page.personal_schedule', 'Trang trong menu', 'Lịch học cá nhân', 'Xem lịch học của bản thân hoặc con.', 70),
  ('page.public_exam', 'Trang trong menu', 'Đề thi', 'Xem khu vực đề thi công khai.', 80),
  ('page.game', 'Trang trong menu', 'Game', 'Mở khu vực trò chơi học tập.', 90),
  ('page.tuition', 'Trang trong menu', 'Học phí', 'Xem trang học phí.', 100),
  ('page.income', 'Trang trong menu', 'Thu nhập và thu chi', 'Xem trang thu nhập và sổ thu chi.', 110),
  ('page.resources', 'Trang trong menu', 'Tài liệu tham khảo', 'Xem tài liệu tham khảo.', 120),
  ('page.question_bank', 'Trang trong menu', 'Ngân hàng câu hỏi', 'Mở ngân hàng câu hỏi.', 130),
  ('page.exam_editor', 'Trang trong menu', 'Soạn đề kiểm tra', 'Mở công cụ soạn và quản lý đề.', 140),
  ('page.trial_requests', 'Trang trong menu', 'Đăng ký học thử', 'Xem và xử lý đăng ký học thử.', 150),
  ('page.push_debug', 'Trang trong menu', 'Kiểm tra thông báo', 'Mở công cụ kiểm tra thông báo.', 160),
  ('page.system', 'Trang trong menu', 'Hệ thống', 'Mở trang quản trị hệ thống.', 170),
  ('page.facebook', 'Trang trong menu', 'Đăng bài Facebook', 'Mở lịch và công cụ đăng bài Facebook.', 180),
  ('courses.manage', 'Thao tác trong trang', 'Quản lý khóa học', 'Tạo, sửa và xóa khóa học.', 210),
  ('classes.manage', 'Thao tác trong trang', 'Quản lý lớp học', 'Tạo, sửa và xóa lớp học.', 215),
  ('class.sessions.manage', 'Thao tác trong trang', 'Quản lý buổi học', 'Tạo, sửa và xóa buổi học.', 220),
  ('class.attendance', 'Thao tác trong trang', 'Điểm danh', 'Điểm danh học sinh trong lớp.', 230),
  ('tasks.manage', 'Thao tác trong trang', 'Quản lý công việc', 'Tạo, giao và cập nhật công việc.', 240),
  ('question.manage', 'Thao tác trong trang', 'Quản lý câu hỏi', 'Tạo, sửa và xóa câu hỏi.', 250),
  ('exam.manage', 'Thao tác trong trang', 'Quản lý đề kiểm tra', 'Tạo, sửa và xóa đề kiểm tra.', 260),
  ('trial.manage', 'Thao tác trong trang', 'Quản lý học thử', 'Xử lý học sinh đăng ký học thử.', 270),
  ('tuition.manage', 'Thao tác trong trang', 'Quản lý học phí', 'Thu tiền, hoàn tiền và gửi nhắc học phí.', 280),
  ('income.manage', 'Thao tác trong trang', 'Quản lý thu chi', 'Thêm mô tả và xử lý sổ thu chi.', 290),
  ('facebook.manage', 'Thao tác trong trang', 'Quản lý bài Facebook', 'Tạo, sửa, hẹn lịch và đăng bài.', 300),
  ('system.permissions.manage', 'Quản trị', 'Phân quyền nhân viên', 'Thay đổi quyền của từng nhân viên.', 400)
ON CONFLICT (permission_key) DO UPDATE SET
  section = EXCLUDED.section,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- Re-seed defaults so this file remains the single source of truth.
DELETE FROM public.role_permission_defaults;

INSERT INTO public.role_permission_defaults(role_name, permission_key, allowed)
SELECT role_name, permission_key, true
FROM (VALUES
  ('admin', 'page.ops_center'), ('admin', 'page.home'), ('admin', 'page.courses'),
  ('admin', 'page.classes'), ('admin', 'page.tasks'), ('admin', 'page.teacher_schedule'),
  ('admin', 'page.public_exam'), ('admin', 'page.game'), ('admin', 'page.tuition'),
  ('admin', 'page.income'), ('admin', 'page.resources'), ('admin', 'page.question_bank'),
  ('admin', 'page.exam_editor'), ('admin', 'page.trial_requests'), ('admin', 'page.push_debug'),
  ('admin', 'page.system'), ('admin', 'page.facebook'), ('admin', 'courses.manage'), ('admin', 'classes.manage'),
  ('admin', 'class.sessions.manage'), ('admin', 'class.attendance'), ('admin', 'tasks.manage'),
  ('admin', 'question.manage'), ('admin', 'exam.manage'), ('admin', 'trial.manage'),
  ('admin', 'tuition.manage'), ('admin', 'income.manage'), ('admin', 'facebook.manage'),
  ('admin', 'system.permissions.manage'),

  ('teacher', 'page.home'), ('teacher', 'page.courses'), ('teacher', 'page.classes'),
  ('teacher', 'page.tasks'), ('teacher', 'page.teacher_schedule'), ('teacher', 'page.public_exam'),
  ('teacher', 'page.game'), ('teacher', 'page.income'), ('teacher', 'page.resources'),
  ('teacher', 'page.question_bank'), ('teacher', 'page.exam_editor'),
  ('teacher', 'page.trial_requests'), ('teacher', 'page.facebook'),
  ('teacher', 'classes.manage'), ('teacher', 'class.sessions.manage'), ('teacher', 'class.attendance'),
  ('teacher', 'tasks.manage'), ('teacher', 'question.manage'), ('teacher', 'exam.manage'),
  ('teacher', 'trial.manage'), ('teacher', 'income.manage'), ('teacher', 'facebook.manage'),

  ('assistant', 'page.home'), ('assistant', 'page.courses'), ('assistant', 'page.classes'),
  ('assistant', 'page.tasks'), ('assistant', 'page.teacher_schedule'), ('assistant', 'page.resources'),
  ('assistant', 'page.question_bank'), ('assistant', 'page.exam_editor'),
  ('assistant', 'page.trial_requests'), ('assistant', 'page.facebook'),
  ('assistant', 'class.sessions.manage'), ('assistant', 'class.attendance'),
  ('assistant', 'tasks.manage'), ('assistant', 'question.manage'), ('assistant', 'exam.manage'),
  ('assistant', 'trial.manage'), ('assistant', 'facebook.manage'),

  ('student', 'page.home'), ('student', 'page.courses'), ('student', 'page.classes'),
  ('student', 'page.personal_schedule'), ('student', 'page.public_exam'), ('student', 'page.game'),
  ('student', 'page.tuition'), ('student', 'page.resources'),

  ('parent', 'page.home'), ('parent', 'page.courses'), ('parent', 'page.classes'),
  ('parent', 'page.teacher_schedule'), ('parent', 'page.personal_schedule'),
  ('parent', 'page.public_exam'), ('parent', 'page.tuition'), ('parent', 'page.resources')
) AS defaults(role_name, permission_key);

CREATE OR REPLACE FUNCTION public.mindup_is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id AND u.role::text = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_app_permission(
  p_permission_key text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN public.mindup_is_admin(p_user_id) THEN true
    ELSE COALESCE(
      (SELECT o.allowed
       FROM public.user_permission_overrides o
       WHERE o.user_id = p_user_id AND o.permission_key = p_permission_key),
      (SELECT d.allowed
       FROM public.role_permission_defaults d
       JOIN public.users u ON u.id = p_user_id
       WHERE d.role_name = u.role::text AND d.permission_key = p_permission_key),
      false
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(p.permission_key, public.has_app_permission(p.permission_key)), '{}'::jsonb)
  FROM public.app_permissions p;
$$;

-- Restrictive write policies make permission revocation effective at the database layer.
-- Existing ownership/assignment policies still apply; these checks are an additional gate.
DO $$
DECLARE
  item record;
  policy_base text;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('courses', 'courses.manage'),
      ('course_managers', 'courses.manage'),
      ('course_sessions', 'courses.manage'),
      ('classes', 'classes.manage'),
      ('class_sessions', 'class.sessions.manage'),
      ('attendance', 'class.attendance'),
      ('question_bank', 'question.manage'),
      ('exams', 'exam.manage'),
      ('tuition_payments', 'tuition.manage')
    ) AS rules(table_name, permission_key)
  LOOP
    IF to_regclass('public.' || item.table_name) IS NULL THEN
      CONTINUE;
    END IF;
    policy_base := 'app_permission_' || item.table_name;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_base || '_insert', item.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_base || '_update', item.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_base || '_delete', item.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_app_permission(%L))',
      policy_base || '_insert', item.table_name, item.permission_key
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_app_permission(%L)) WITH CHECK (public.has_app_permission(%L))',
      policy_base || '_update', item.table_name, item.permission_key, item.permission_key
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_app_permission(%L))',
      policy_base || '_delete', item.table_name, item.permission_key
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_get_permission_management()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.mindup_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT jsonb_build_object(
    'catalog', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.sort_order, p.permission_key)
      FROM public.app_permissions p
    ), '[]'::jsonb),
    'role_defaults', COALESCE((
      SELECT jsonb_object_agg(role_name, permissions)
      FROM (
        SELECT role_name, jsonb_object_agg(permission_key, allowed) AS permissions
        FROM public.role_permission_defaults
        GROUP BY role_name
      ) role_rows
    ), '{}'::jsonb),
    'users', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'full_name', u.full_name,
          'email', u.email,
          'role', u.role::text,
          'overrides', COALESCE((
            SELECT jsonb_object_agg(o.permission_key, o.allowed)
            FROM public.user_permission_overrides o
            WHERE o.user_id = u.id
          ), '{}'::jsonb)
        ) ORDER BY u.full_name NULLS LAST, u.email
      )
      FROM public.users u
      WHERE u.role::text IN ('admin', 'teacher', 'assistant', 'marketing', 'accountant')
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_permission(
  p_user_id uuid,
  p_permission_key text,
  p_allowed boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.mindup_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_permissions WHERE permission_key = p_permission_key) THEN
    RAISE EXCEPTION 'Unknown permission: %', p_permission_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF p_allowed IS NULL THEN
    DELETE FROM public.user_permission_overrides
    WHERE user_id = p_user_id AND permission_key = p_permission_key;
  ELSE
    INSERT INTO public.user_permission_overrides(user_id, permission_key, allowed, updated_by, updated_at)
    VALUES (p_user_id, p_permission_key, p_allowed, auth.uid(), now())
    ON CONFLICT (user_id, permission_key) DO UPDATE SET
      allowed = EXCLUDED.allowed,
      updated_by = EXCLUDED.updated_by,
      updated_at = now();
  END IF;
END;
$$;

ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permission_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_permissions_authenticated_read ON public.app_permissions;
CREATE POLICY app_permissions_authenticated_read ON public.app_permissions
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS role_permission_defaults_authenticated_read ON public.role_permission_defaults;
CREATE POLICY role_permission_defaults_authenticated_read ON public.role_permission_defaults
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS user_permission_overrides_own_read ON public.user_permission_overrides;
CREATE POLICY user_permission_overrides_own_read ON public.user_permission_overrides
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.mindup_is_admin(auth.uid()));

DROP POLICY IF EXISTS user_permission_overrides_admin_manage ON public.user_permission_overrides;
CREATE POLICY user_permission_overrides_admin_manage ON public.user_permission_overrides
FOR ALL TO authenticated
USING (public.mindup_is_admin(auth.uid()))
WITH CHECK (public.mindup_is_admin(auth.uid()));

REVOKE ALL ON FUNCTION public.mindup_is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_app_permission(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_permissions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_permission_management() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_permission(uuid, text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mindup_is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_app_permission(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_permission_management() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_permission(uuid, text, boolean) TO authenticated, service_role;

GRANT SELECT ON public.app_permissions TO authenticated;
GRANT SELECT ON public.role_permission_defaults TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;
