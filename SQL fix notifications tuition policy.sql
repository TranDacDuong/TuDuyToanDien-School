-- ============================================
-- Fix notifications insert RLS policy
-- Run this in your Supabase SQL Editor.
-- ============================================

-- 1. Restore the standard insert policy (allow users to insert notifications where they are the actor)
DROP POLICY IF EXISTS notifications_insert_policy ON public.notifications;
CREATE POLICY notifications_insert_policy ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = actor_id
  OR (
    type = 'trial_lesson_request'
    AND actor_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = notifications.user_id AND u.role IN ('admin', 'teacher')
    )
  )
);

-- 2. Add an explicit admin insert policy to allow admins to insert any notifications
DROP POLICY IF EXISTS notifications_admin_insert_policy ON public.notifications;
CREATE POLICY notifications_admin_insert_policy ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text = 'admin'
  )
);
