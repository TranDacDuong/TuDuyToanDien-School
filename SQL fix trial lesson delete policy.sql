-- Allow admins to delete trial lesson requests.
-- Run this if deleting a trial student says success but the row stays visible.

DROP POLICY IF EXISTS trial_lesson_requests_delete_policy ON public.trial_lesson_requests;

CREATE POLICY trial_lesson_requests_delete_policy ON public.trial_lesson_requests
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
  )
);
