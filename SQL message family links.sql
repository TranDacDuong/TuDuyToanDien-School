-- RPC for Messages: load linked parent/student rows for official MindUp chats.
-- This avoids the frontend depending on direct parent_students SELECT policies.

DROP FUNCTION IF EXISTS public.list_message_family_links(uuid[]);

CREATE OR REPLACE FUNCTION public.list_message_family_links(p_user_ids uuid[])
RETURNS TABLE (
  parent_id uuid,
  student_id uuid,
  student_name text,
  student_birth_year text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id, role::text AS role
    FROM public.users
    WHERE id = auth.uid()
  ),
  requested AS (
    SELECT DISTINCT unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS user_id
  ),
  raw_links AS (
    SELECT ps.parent_id, ps.student_id
    FROM public.parent_students ps
    JOIN requested r
      ON r.user_id = ps.parent_id
      OR r.user_id = ps.student_id
    WHERE ps.revoked_at IS NULL
  )
  SELECT DISTINCT
    rl.parent_id,
    rl.student_id,
    s.full_name AS student_name,
    s.birth_year::text AS student_birth_year
  FROM raw_links rl
  LEFT JOIN public.users s ON s.id = rl.student_id
  CROSS JOIN me
  WHERE
    me.role IN ('admin', 'assistant', 'marketing', 'accountant', 'staff')
    OR rl.parent_id = me.id
    OR rl.student_id = me.id
    OR (
      me.role = 'teacher'
      AND EXISTS (
        SELECT 1
        FROM public.class_students cs
        JOIN public.class_teachers ct ON ct.class_id = cs.class_id
        WHERE cs.student_id = rl.student_id
          AND ct.teacher_id = me.id
          AND (cs.left_at IS NULL OR cs.left_at >= CURRENT_DATE)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.list_message_family_links(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_message_family_links(uuid[]) TO authenticated, service_role;
