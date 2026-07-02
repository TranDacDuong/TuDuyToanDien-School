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

DROP POLICY IF EXISTS class_student_schedules_staff_manage ON public.class_student_schedules;
CREATE POLICY class_student_schedules_staff_manage ON public.class_student_schedules
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_sessions_insert_policy ON public.class_sessions;
CREATE POLICY class_sessions_insert_policy ON public.class_sessions
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_sessions_update_policy ON public.class_sessions;
CREATE POLICY class_sessions_update_policy ON public.class_sessions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_sessions_delete_policy ON public.class_sessions;
CREATE POLICY class_sessions_delete_policy ON public.class_sessions
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS lessons_insert_policy ON public.lessons;
CREATE POLICY lessons_insert_policy ON public.lessons
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS lessons_update_policy ON public.lessons;
CREATE POLICY lessons_update_policy ON public.lessons
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS lessons_delete_policy ON public.lessons;
CREATE POLICY lessons_delete_policy ON public.lessons
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_session_scores_select_policy ON public.class_session_scores;
CREATE POLICY class_session_scores_select_policy ON public.class_session_scores
FOR SELECT
USING (
  student_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.parent_id = auth.uid()
      AND ps.student_id = class_session_scores.student_id
      AND ps.revoked_at IS NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_session_scores_insert_policy ON public.class_session_scores;
CREATE POLICY class_session_scores_insert_policy ON public.class_session_scores
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_session_scores_update_policy ON public.class_session_scores;
CREATE POLICY class_session_scores_update_policy ON public.class_session_scores
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_session_scores_delete_policy ON public.class_session_scores;
CREATE POLICY class_session_scores_delete_policy ON public.class_session_scores
FOR DELETE
USING (
  EXISTS (
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
