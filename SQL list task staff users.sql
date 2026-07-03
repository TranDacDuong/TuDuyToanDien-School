CREATE OR REPLACE FUNCTION public.list_task_staff_users()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.full_name, u.email, u.role::text
  FROM public.users u
  WHERE u.role::text IN ('admin', 'teacher', 'assistant', 'marketing')
    AND public.is_admin(auth.uid())
  ORDER BY COALESCE(NULLIF(u.full_name, ''), u.email, u.id::text);
$$;

REVOKE ALL ON FUNCTION public.list_task_staff_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_task_staff_users() TO authenticated;
