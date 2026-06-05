-- Allow admins to delete old operation logs.

DROP POLICY IF EXISTS admin_action_logs_delete_policy ON public.admin_action_logs;

CREATE POLICY admin_action_logs_delete_policy ON public.admin_action_logs
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
  )
);

