-- MindUp official support channel.
-- Student/parent can still chat directly with other students/parents.
-- Any chat from student/parent to center staff is routed to the official MindUp bot conversation.
-- All center staff can view and reply in those bot conversations as MindUp.

CREATE OR REPLACE FUNCTION public.is_mindup_staff(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.role::text IN ('admin', 'teacher', 'assistant', 'marketing')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_mindup_official_direct_key(p_direct_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_direct_key, '') LIKE '%00000000-0000-0000-0000-000000000001%';
$$;

DROP POLICY IF EXISTS conversations_mindup_official_staff_select ON public.conversations;
CREATE POLICY conversations_mindup_official_staff_select ON public.conversations
FOR SELECT TO authenticated
USING (
  kind = 'direct'
  AND public.is_mindup_official_direct_key(direct_key)
  AND (
    public.is_mindup_staff(auth.uid())
    OR direct_key LIKE '%' || auth.uid()::text || '%'
  )
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
      AND public.is_mindup_official_direct_key(c.direct_key)
      AND (
        public.is_mindup_staff(auth.uid())
        OR c.direct_key LIKE '%' || auth.uid()::text || '%'
      )
  )
);

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_real_sender_id IS NOT NULL AND NOT public.is_mindup_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only MindUp staff can send as MindUp';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND public.is_mindup_official_direct_key(c.direct_key)
  ) THEN
    RAISE EXCEPTION 'Official MindUp conversation not found';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id)
  VALUES (
    p_conversation_id,
    '00000000-0000-0000-0000-000000000001',
    p_content,
    COALESCE(p_real_sender_id, auth.uid())
  )
  RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
END;
$$;

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

  IF auth.uid() <> p_user_id AND NOT public.is_mindup_staff(auth.uid()) THEN
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

REVOKE ALL ON FUNCTION public.is_mindup_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_mindup_official_direct_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_bot_message(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_bot_conversation(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_mindup_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_mindup_official_direct_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_bot_message(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_bot_conversation(uuid) TO authenticated, service_role;
