-- Fix the class_students <-> parent_students RLS recursion.
-- Run as the database owner in Supabase SQL Editor.

DROP POLICY IF EXISTS class_students_parent_select ON public.class_students;
DROP POLICY IF EXISTS parent_students_class_staff_select ON public.parent_students;
DROP FUNCTION IF EXISTS public.is_parent_of_student(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_class_staff_for_student(uuid, uuid);

CREATE FUNCTION public.is_parent_of_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parent_students ps
    WHERE ps.parent_id = auth.uid()
      AND ps.student_id = p_student_id
      AND ps.revoked_at IS NULL
  );
$$;

CREATE FUNCTION public.is_class_staff_for_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_students cs
    JOIN public.class_teachers ct ON ct.class_id = cs.class_id
    WHERE cs.student_id = p_student_id
      AND ct.teacher_id = auth.uid()
      AND (cs.left_at IS NULL OR cs.left_at >= now())
  );
$$;

REVOKE ALL ON FUNCTION public.is_parent_of_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_class_staff_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_parent_of_student(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_class_staff_for_student(uuid) TO authenticated, service_role;

CREATE POLICY class_students_parent_select ON public.class_students
FOR SELECT TO authenticated
USING (public.is_parent_of_student(class_students.student_id));

CREATE POLICY parent_students_class_staff_select ON public.parent_students
FOR SELECT TO authenticated
USING (public.is_class_staff_for_student(parent_students.student_id));
