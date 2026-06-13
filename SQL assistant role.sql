-- ============================================
-- MindUp assistant/consultant role
-- Run in Supabase SQL Editor.
-- ============================================

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
     AND NOT EXISTS (
       SELECT 1
       FROM pg_enum
       WHERE enumtypid = role_type::oid
         AND enumlabel = 'assistant'
     ) THEN
    EXECUTE format('ALTER TYPE %s ADD VALUE IF NOT EXISTS %L', role_type, 'assistant');
  END IF;
END $$;

DROP POLICY IF EXISTS classes_public_schedule_select ON public.classes;
CREATE POLICY classes_public_schedule_select ON public.classes
FOR SELECT
USING (
  hidden = false
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_teachers_public_schedule_select ON public.class_teachers;
CREATE POLICY class_teachers_public_schedule_select ON public.class_teachers
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = class_teachers.class_id
      AND c.hidden = false
  )
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_schedules_public_schedule_select ON public.class_schedules;
CREATE POLICY class_schedules_public_schedule_select ON public.class_schedules
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = class_schedules.class_id
      AND c.hidden = false
  )
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_student_schedules_select_policy ON public.class_student_schedules;
CREATE POLICY class_student_schedules_select_policy ON public.class_student_schedules
FOR SELECT
USING (
  student_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS courses_select_policy ON public.courses;
CREATE POLICY courses_select_policy ON public.courses
FOR SELECT
USING (
  status = 'open'
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS course_enrollments_select_policy ON public.course_enrollments;
CREATE POLICY course_enrollments_select_policy ON public.course_enrollments
FOR SELECT
USING (
  student_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS trial_lesson_requests_select_policy ON public.trial_lesson_requests;
CREATE POLICY trial_lesson_requests_select_policy ON public.trial_lesson_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'assistant')
  )
  OR teacher_id = auth.uid()
);

DROP POLICY IF EXISTS trial_lesson_requests_update_policy ON public.trial_lesson_requests;
CREATE POLICY trial_lesson_requests_update_policy ON public.trial_lesson_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'assistant')
  )
  OR teacher_id = auth.uid()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'assistant')
  )
  OR teacher_id = auth.uid()
);
