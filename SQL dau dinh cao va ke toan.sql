-- Chạy toàn bộ file này trong Supabase SQL Editor.
-- 1) Thêm ảnh cho Vượt chướng ngại vật.
-- 2) Thêm vai trò Kế toán và quyền đọc/đối soát học phí.
-- 3) Sửa các tài khoản đã có liên kết phụ huynh nhưng role còn là student.

ALTER TABLE public.game_round_challenges
ADD COLUMN IF NOT EXISTS keyword_image_url text;

DO $$
DECLARE
  role_type regtype;
BEGIN
  SELECT atttypid::regtype INTO role_type
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'role'
    AND NOT attisdropped;

  IF role_type IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_type WHERE oid = role_type::oid AND typtype = 'e')
     AND NOT EXISTS (
       SELECT 1 FROM pg_enum
       WHERE enumtypid = role_type::oid AND enumlabel = 'accountant'
     ) THEN
    EXECUTE format('ALTER TYPE %s ADD VALUE IF NOT EXISTS %L', role_type, 'accountant');
  END IF;
END $$;

-- Dùng role::text trong policy để tương thích với cả enum và text.
CREATE OR REPLACE FUNCTION public.is_accountant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text = 'accountant'
  );
$$;

REVOKE ALL ON FUNCTION public.is_accountant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_accountant() TO authenticated, service_role;

-- Kế toán được xem dữ liệu nền phục vụ đối soát, không được sửa cấu trúc lớp/khóa học.
DROP POLICY IF EXISTS accountant_users_select ON public.users;
CREATE POLICY accountant_users_select ON public.users
FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS accountant_classes_select ON public.classes;
CREATE POLICY accountant_classes_select ON public.classes
FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS accountant_class_teachers_select ON public.class_teachers;
CREATE POLICY accountant_class_teachers_select ON public.class_teachers
FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS accountant_class_schedules_select ON public.class_schedules;
CREATE POLICY accountant_class_schedules_select ON public.class_schedules
FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS accountant_class_students_select ON public.class_students;
CREATE POLICY accountant_class_students_select ON public.class_students
FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS accountant_class_student_schedules_select ON public.class_student_schedules;
CREATE POLICY accountant_class_student_schedules_select ON public.class_student_schedules
FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS accountant_attendance_select ON public.attendance;
CREATE POLICY accountant_attendance_select ON public.attendance
FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS accountant_courses_select ON public.courses;
CREATE POLICY accountant_courses_select ON public.courses
FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS accountant_course_managers_select ON public.course_managers;
CREATE POLICY accountant_course_managers_select ON public.course_managers
FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS accountant_course_sessions_select ON public.course_sessions;
CREATE POLICY accountant_course_sessions_select ON public.course_sessions
FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS accountant_lessons_select ON public.lessons;
CREATE POLICY accountant_lessons_select ON public.lessons
FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS accountant_course_enrollments_select ON public.course_enrollments;
CREATE POLICY accountant_course_enrollments_select ON public.course_enrollments
FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS accountant_course_requests_select ON public.course_registration_requests;
CREATE POLICY accountant_course_requests_select ON public.course_registration_requests
FOR SELECT TO authenticated USING (public.is_accountant());

-- Kế toán có toàn quyền nghiệp vụ trên các bản ghi thanh toán học phí.
DROP POLICY IF EXISTS accountant_tuition_payments_manage ON public.tuition_payments;
CREATE POLICY accountant_tuition_payments_manage ON public.tuition_payments
FOR ALL TO authenticated
USING (public.is_accountant())
WITH CHECK (public.is_accountant());

-- Cho phép Kế toán tạo thông báo nhắc học phí; quyền đọc/cập nhật thông báo
-- của người nhận vẫn do các policy notifications hiện tại kiểm soát.
DROP POLICY IF EXISTS notifications_insert_accountant_policy ON public.notifications;
CREATE POLICY notifications_insert_accountant_policy ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (public.is_accountant());

-- Dữ liệu cũ: tài khoản đứng ở phía parent_id phải mang đúng role phụ huynh.
UPDATE public.users u
SET role = 'parent'
WHERE u.role::text = 'student'
  AND EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.parent_id = u.id AND ps.revoked_at IS NULL
  );

