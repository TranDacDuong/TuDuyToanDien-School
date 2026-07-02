-- SQL migration to grant assistant role management (ALL) permissions on class-related tables

-- 1. classes table
DROP POLICY IF EXISTS classes_staff_manage ON public.classes;
CREATE POLICY classes_staff_manage ON public.classes
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

-- 2. class_teachers table
DROP POLICY IF EXISTS class_teachers_staff_manage ON public.class_teachers;
CREATE POLICY class_teachers_staff_manage ON public.class_teachers
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

-- 3. class_schedules table
DROP POLICY IF EXISTS class_schedules_staff_manage ON public.class_schedules;
CREATE POLICY class_schedules_staff_manage ON public.class_schedules
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

-- 4. class_sessions table
DROP POLICY IF EXISTS class_sessions_insert_policy ON public.class_sessions;
CREATE POLICY class_sessions_insert_policy ON public.class_sessions
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_sessions_update_policy ON public.class_sessions;
CREATE POLICY class_sessions_update_policy ON public.class_sessions
FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS class_sessions_delete_policy ON public.class_sessions;
CREATE POLICY class_sessions_delete_policy ON public.class_sessions
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

-- 5. lessons table
DROP POLICY IF EXISTS lessons_insert_policy ON public.lessons;
CREATE POLICY lessons_insert_policy ON public.lessons
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS lessons_update_policy ON public.lessons;
CREATE POLICY lessons_update_policy ON public.lessons
FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS lessons_delete_policy ON public.lessons;
CREATE POLICY lessons_delete_policy ON public.lessons
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);
