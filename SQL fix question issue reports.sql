-- Run this once in Supabase SQL Editor.
-- Fixes question issue reporting for every signed-in system user.

ALTER TABLE public.question_issue_reports
DROP CONSTRAINT IF EXISTS question_issue_reports_source_mode_check;

ALTER TABLE public.question_issue_reports
ADD CONSTRAINT question_issue_reports_source_mode_check
CHECK (source_mode IN (
  'live_exam',
  'class_exam',
  'review',
  'other',
  'course_review',
  'course_teacher_review',
  'class_review',
  'class_teacher_review',
  'public_review',
  'public_teacher_review'
));

DROP POLICY IF EXISTS question_issue_reports_student_insert
  ON public.question_issue_reports;

DROP POLICY IF EXISTS question_issue_reports_authenticated_insert
  ON public.question_issue_reports;

CREATE POLICY question_issue_reports_authenticated_insert
  ON public.question_issue_reports
  FOR INSERT
  WITH CHECK (
    reporter_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
    )
  );
