-- Restrict official MindUp 1-1 channels for teachers.
-- Admin/assistant/marketing can operate all official channels.
-- Teachers can only see/reply to official channels of students they teach,
-- or parents linked to students they teach.
-- Students/parents only see their own official channel.

CREATE OR REPLACE FUNCTION public.mindup_official_audience_id(p_direct_key text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT part::uuid
  FROM unnest(string_to_array(COALESCE(p_direct_key, ''), '_')) AS part
  WHERE part <> '00000000-0000-0000-0000-000000000001'
    AND part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_access_mindup_official_audience(p_audience_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT u.id, u.role::text AS role
    FROM public.users u
    WHERE u.id = auth.uid()
  ),
  audience AS (
    SELECT u.id, u.role::text AS role
    FROM public.users u
    WHERE u.id = p_audience_user_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM me, audience au
    WHERE
      -- The real audience can always open their own official channel.
      me.id = au.id

      -- Center operators can view the official inbox broadly.
      OR me.role IN ('admin', 'assistant', 'marketing')

      -- Teachers can view students they currently teach.
      OR (
        me.role = 'teacher'
        AND au.role = 'student'
        AND public.is_class_staff_for_student(au.id)
      )

      -- Teachers can view parents of students they currently teach.
      OR (
        me.role = 'teacher'
        AND au.role = 'parent'
        AND EXISTS (
          SELECT 1
          FROM public.parent_students ps
          WHERE ps.parent_id = au.id
            AND ps.revoked_at IS NULL
            AND public.is_class_staff_for_student(ps.student_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_mindup_official_direct_key(p_direct_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_mindup_official_direct_key(p_direct_key)
     AND public.can_access_mindup_official_audience(public.mindup_official_audience_id(p_direct_key));
$$;

DROP POLICY IF EXISTS conversations_mindup_official_staff_select ON public.conversations;
CREATE POLICY conversations_mindup_official_staff_select ON public.conversations
FOR SELECT TO authenticated
USING (
  kind = 'direct'
  AND public.can_access_mindup_official_direct_key(direct_key)
);

DROP POLICY IF EXISTS messages_mindup_official_staff_select ON public.messages;
CREATE POLICY messages_mindup_official_staff_select ON public.messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.kind = 'direct'
      AND public.can_access_mindup_official_direct_key(c.direct_key)
  )
);

CREATE OR REPLACE FUNCTION public.ensure_bot_conversation(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
  v_direct_key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  IF auth.uid() <> p_user_id AND NOT public.can_access_mindup_official_audience(p_user_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  v_direct_key := (
    SELECT string_agg(id::text, '_' ORDER BY id::text)
    FROM (VALUES ('00000000-0000-0000-0000-000000000001'::uuid), (p_user_id)) AS t(id)
  );

  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE direct_key = v_direct_key;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (kind, direct_key)
    VALUES ('direct', v_direct_key)
    RETURNING id INTO v_conv_id;
  END IF;

  RETURN v_conv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_bot_message(
  p_conversation_id uuid,
  p_content text,
  p_real_sender_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg_id uuid;
  v_direct_key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT c.direct_key INTO v_direct_key
  FROM public.conversations c
  WHERE c.id = p_conversation_id
    AND c.kind = 'direct'
    AND public.is_mindup_official_direct_key(c.direct_key)
  LIMIT 1;

  IF v_direct_key IS NULL THEN
    RAISE EXCEPTION 'Official MindUp conversation not found';
  END IF;

  IF NOT public.can_access_mindup_official_direct_key(v_direct_key) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_real_sender_id IS NOT NULL AND NOT public.is_mindup_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only MindUp staff can send as MindUp';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id)
  VALUES (
    p_conversation_id,
    CASE
      WHEN public.is_mindup_staff(auth.uid()) THEN '00000000-0000-0000-0000-000000000001'::uuid
      ELSE auth.uid()
    END,
    p_content,
    CASE
      WHEN public.is_mindup_staff(auth.uid()) THEN COALESCE(p_real_sender_id, auth.uid())
      ELSE NULL
    END
  )
  RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mindup_official_audience_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_mindup_official_audience(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_mindup_official_direct_key(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mindup_official_audience_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_mindup_official_audience(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_mindup_official_direct_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_bot_conversation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_bot_message(uuid, text, uuid) TO authenticated, service_role;
