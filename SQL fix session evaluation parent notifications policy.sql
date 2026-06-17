-- MindUp: allow class staff to notify linked parents about session evaluations.
-- Safe to run repeatedly in Supabase SQL Editor.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'friend_request', 'friend_accept', 'post_like', 'post_comment', 'post_approved',
    'post_rejected', 'message_new', 'course_created', 'course_enrolled',
    'course_request_approved', 'course_request_rejected', 'course_session_added',
    'course_session_updated', 'class_session_added', 'class_session_updated',
    'class_exam_added', 'session_evaluation', 'tuition_due', 'tuition_reminder',
    'trial_lesson_request', 'task_assigned', 'task_daily_digest',
    'task_due_reminder', 'task_overdue'
  )
);

DROP POLICY IF EXISTS notifications_insert_session_evaluation_parent_policy ON public.notifications;
CREATE POLICY notifications_insert_session_evaluation_parent_policy ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  type = 'session_evaluation'
  AND actor_id = auth.uid()
  AND CASE
    WHEN COALESCE(meta->>'student_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND COALESCE(meta->>'class_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role::text = 'admin'
      )
      OR EXISTS (
        SELECT 1
        FROM public.parent_students ps
        JOIN public.class_teachers ct
          ON ct.class_id = (notifications.meta->>'class_id')::uuid
         AND ct.teacher_id = auth.uid()
        WHERE ps.parent_id = notifications.user_id
          AND ps.student_id = (notifications.meta->>'student_id')::uuid
          AND ps.revoked_at IS NULL
      )
    )
    ELSE false
  END
);
