-- ============================================
-- Fix notifications insert RLS policy
-- Run this in your Supabase SQL Editor.
-- ============================================

-- 1. Dynamically drop all existing policies on the notifications table to avoid name mismatches
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'notifications'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.notifications', pol.policyname);
    END LOOP;
END $$;

-- 2. Re-enable RLS on the table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 3. Create SELECT policy (users can read their own notifications)
CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 4. Create UPDATE policy (users can update/mark read their own notifications)
CREATE POLICY notifications_update_policy ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Create DELETE policy (users can delete their own notifications, admins can delete any)
CREATE POLICY notifications_delete_policy ON public.notifications
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role::text = 'admin'
    )
  );

-- 6. Create INSERT policy #1: Allow any authenticated user to insert if they are the actor (sender)
CREATE POLICY notifications_insert_actor_policy ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id);

-- 7. Create INSERT policy #2: Allow admins, teachers, and assistants to insert any notifications
CREATE POLICY notifications_insert_staff_policy ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'teacher', 'assistant')
    )
  );

-- 8. Create INSERT policy #3: Allow unauthenticated (anon) or authenticated inserts for trial lesson requests (which have no actor_id)
CREATE POLICY notifications_insert_trial_policy ON public.notifications
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    type = 'trial_lesson_request'
    AND actor_id IS NULL
  );

