-- Allow teachers to use the Trial Requests page.
-- Run this if teachers get 403/permission errors on trial_lesson_requests.

DROP POLICY IF EXISTS trial_lesson_requests_select_staff_policy ON public.trial_lesson_requests;
DROP POLICY IF EXISTS trial_lesson_requests_insert_staff_policy ON public.trial_lesson_requests;
DROP POLICY IF EXISTS trial_lesson_requests_update_staff_policy ON public.trial_lesson_requests;
DROP POLICY IF EXISTS trial_lesson_requests_delete_policy ON public.trial_lesson_requests;

CREATE POLICY trial_lesson_requests_select_staff_policy ON public.trial_lesson_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'teacher')
  )
);

CREATE POLICY trial_lesson_requests_insert_staff_policy ON public.trial_lesson_requests
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'teacher')
  )
);

CREATE POLICY trial_lesson_requests_update_staff_policy ON public.trial_lesson_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'teacher')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'teacher')
  )
);

CREATE POLICY trial_lesson_requests_delete_policy ON public.trial_lesson_requests
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'teacher')
  )
);

