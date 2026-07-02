-- SQL migration to grant assistant role access to class_students and attendance tables

-- 1. Policies for public.class_students
-- Allow staff (admin, teacher, assistant) to SELECT from class_students
DROP POLICY IF EXISTS class_students_staff_select ON public.class_students;
CREATE POLICY class_students_staff_select ON public.class_students
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

-- Allow staff (admin, teacher, assistant) to manage (INSERT, UPDATE, DELETE) class_students
DROP POLICY IF EXISTS class_students_staff_manage ON public.class_students;
CREATE POLICY class_students_staff_manage ON public.class_students
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);


-- 2. Policies for public.attendance
-- Allow staff (admin, teacher, assistant) to SELECT from attendance
DROP POLICY IF EXISTS attendance_staff_select ON public.attendance;
CREATE POLICY attendance_staff_select ON public.attendance
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

-- Allow staff (admin, teacher, assistant) to manage (INSERT, UPDATE, DELETE) attendance
DROP POLICY IF EXISTS attendance_staff_manage ON public.attendance;
CREATE POLICY attendance_staff_manage ON public.attendance
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);
