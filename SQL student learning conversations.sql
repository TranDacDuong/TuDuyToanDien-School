-- Student-centered learning conversations.
-- One MindUp thread per student + audience user (student or each linked parent).

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS audience_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_learning_thread boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_learning_unique
  ON public.conversations (student_id, audience_user_id)
  WHERE is_learning_thread = true;

CREATE INDEX IF NOT EXISTS conversations_learning_student_idx
  ON public.conversations (is_learning_thread, student_id, audience_user_id);

CREATE OR REPLACE FUNCTION public.can_access_learning_thread(p_student_id uuid, p_audience_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text = 'admin'
  )
  OR auth.uid() = p_student_id
  OR auth.uid() = p_audience_user_id
  OR EXISTS (
    SELECT 1
    FROM public.parent_students ps
    WHERE ps.parent_id = auth.uid()
      AND ps.student_id = p_student_id
      AND ps.revoked_at IS NULL
  )
  OR public.is_class_staff_for_student(p_student_id);
$$;

CREATE OR REPLACE FUNCTION public.ensure_student_learning_conversation(
  p_student_id uuid,
  p_audience_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audience uuid := COALESCE(p_audience_user_id, p_student_id);
  v_conv_id uuid;
  v_direct_key text;
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'student_id is required';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.can_access_learning_thread(p_student_id, v_audience) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  v_direct_key := 'mindup_student:' || p_student_id::text || ':audience:' || v_audience::text;

  INSERT INTO public.conversations (
    kind,
    direct_key,
    student_id,
    audience_user_id,
    is_learning_thread
  )
  VALUES (
    'direct',
    v_direct_key,
    p_student_id,
    v_audience,
    true
  )
  ON CONFLICT (student_id, audience_user_id) WHERE is_learning_thread = true
  DO UPDATE SET is_learning_thread = true
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  SELECT v_conv_id, v_audience
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = v_conv_id
      AND cm.user_id = v_audience
  );

  RETURN v_conv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_student_learning_audiences(p_student_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_student_id
  UNION
  SELECT ps.parent_id
  FROM public.parent_students ps
  WHERE ps.student_id = p_student_id
    AND ps.revoked_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.send_student_learning_message(
  p_student_id uuid,
  p_content text,
  p_real_sender_id uuid DEFAULT NULL,
  p_audience_user_ids uuid[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_real_sender uuid := COALESCE(p_real_sender_id, auth.uid());
  v_audience uuid;
  v_conv_id uuid;
  v_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_student_id IS NULL OR NULLIF(trim(COALESCE(p_content, '')), '') IS NULL THEN
    RAISE EXCEPTION 'student_id and content are required';
  END IF;
  IF NOT public.can_access_learning_thread(p_student_id, COALESCE(v_actor, p_student_id)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  FOR v_audience IN
    SELECT DISTINCT user_id
    FROM (
      SELECT unnest(p_audience_user_ids) AS user_id
      WHERE p_audience_user_ids IS NOT NULL
      UNION ALL
      SELECT user_id
      FROM public.list_student_learning_audiences(p_student_id)
      WHERE p_audience_user_ids IS NULL
    ) src
    WHERE user_id IS NOT NULL
  LOOP
    v_conv_id := public.ensure_student_learning_conversation(p_student_id, v_audience);
    INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id)
    VALUES (v_conv_id, '00000000-0000-0000-0000-000000000001', p_content, v_real_sender);
    IF v_audience <> v_actor THEN
      INSERT INTO public.notifications (user_id, actor_id, type, ref_id, target_url, message, meta)
      VALUES (
        v_audience,
        '00000000-0000-0000-0000-000000000001',
        'message_new',
        v_conv_id,
        'messages.html',
        left(p_content, 240),
        jsonb_build_object('student_id', p_student_id, 'conversation_id', v_conv_id, 'learning_thread', true)
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_student_learning_message_to_audience(
  p_student_id uuid,
  p_audience_user_id uuid,
  p_content text,
  p_real_sender_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
  v_msg_id uuid;
BEGIN
  v_conv_id := public.ensure_student_learning_conversation(p_student_id, p_audience_user_id);
  INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id)
  VALUES (v_conv_id, '00000000-0000-0000-0000-000000000001', p_content, COALESCE(p_real_sender_id, auth.uid()))
  RETURNING id INTO v_msg_id;
  IF p_audience_user_id <> auth.uid() THEN
    INSERT INTO public.notifications (user_id, actor_id, type, ref_id, target_url, message, meta)
    VALUES (
      p_audience_user_id,
      '00000000-0000-0000-0000-000000000001',
      'message_new',
      v_conv_id,
      'messages.html',
      left(p_content, 240),
      jsonb_build_object('student_id', p_student_id, 'conversation_id', v_conv_id, 'learning_thread', true)
    );
  END IF;
  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_student_learning_conversations()
RETURNS TABLE (
  conversation_id uuid,
  student_id uuid,
  student_name text,
  student_avatar_url text,
  audience_user_id uuid,
  audience_name text,
  audience_role text,
  last_content text,
  last_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.student_id,
    s.full_name,
    s.avatar_url,
    c.audience_user_id,
    au.full_name,
    au.role::text,
    lm.content,
    lm.created_at
  FROM public.conversations c
  JOIN public.users s ON s.id = c.student_id
  LEFT JOIN public.users au ON au.id = c.audience_user_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at
    FROM public.messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  WHERE c.is_learning_thread = true
    AND public.can_access_learning_thread(c.student_id, c.audience_user_id)
  ORDER BY lm.created_at DESC NULLS LAST, s.full_name NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.materialize_my_learning_conversations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_student_id uuid;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role::text INTO v_role
  FROM public.users
  WHERE id = auth.uid();

  IF v_role = 'student' THEN
    PERFORM public.ensure_student_learning_conversation(auth.uid(), auth.uid());
    v_count := v_count + 1;
  ELSIF v_role = 'parent' THEN
    FOR v_student_id IN
      SELECT ps.student_id
      FROM public.parent_students ps
      WHERE ps.parent_id = auth.uid()
        AND ps.revoked_at IS NULL
    LOOP
      PERFORM public.ensure_student_learning_conversation(v_student_id, auth.uid());
      v_count := v_count + 1;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

DROP POLICY IF EXISTS conversations_learning_select ON public.conversations;
CREATE POLICY conversations_learning_select ON public.conversations
FOR SELECT TO authenticated
USING (
  is_learning_thread = true
  AND public.can_access_learning_thread(student_id, audience_user_id)
);

DROP POLICY IF EXISTS messages_learning_select ON public.messages;
CREATE POLICY messages_learning_select ON public.messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.is_learning_thread = true
      AND public.can_access_learning_thread(c.student_id, c.audience_user_id)
  )
);

REVOKE ALL ON FUNCTION public.can_access_learning_thread(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_student_learning_conversation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_student_learning_audiences(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_student_learning_message(uuid, text, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_student_learning_message_to_audience(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_student_learning_conversations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.materialize_my_learning_conversations() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_access_learning_thread(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_student_learning_conversation(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_student_learning_audiences(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.send_student_learning_message(uuid, text, uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_student_learning_message_to_audience(uuid, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_student_learning_conversations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.materialize_my_learning_conversations() TO authenticated, service_role;
