-- Unify all 1-1 MindUp conversations into the official support channel.
-- Result:
-- - Student/parent <-> staff messages use ONE conversation per student/parent:
--   direct_key = sorted(MINDUP_BOT_ID, audience_user_id)
-- - Learning notices and "message teacher" notices are written into that same conversation.
-- - Old mindup_student:* and mindup_teacher:* conversations are no longer listed by the app.

CREATE OR REPLACE FUNCTION public.ensure_mindup_official_audience_conversation(p_audience_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
  v_direct_key text;
BEGIN
  IF p_audience_user_id IS NULL THEN
    RAISE EXCEPTION 'audience_user_id is required';
  END IF;

  v_direct_key := (
    SELECT string_agg(id::text, '_' ORDER BY id::text)
    FROM (
      VALUES
        ('00000000-0000-0000-0000-000000000001'::uuid),
        (p_audience_user_id)
    ) AS t(id)
  );

  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE direct_key = v_direct_key
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (kind, direct_key)
    VALUES ('direct', v_direct_key)
    RETURNING id INTO v_conv_id;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conv_id, p_audience_user_id)
  ON CONFLICT DO NOTHING;

  RETURN v_conv_id;
END;
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

  RETURN public.ensure_mindup_official_audience_conversation(v_audience);
END;
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
    v_conv_id := public.ensure_mindup_official_audience_conversation(v_audience);

    INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id)
    VALUES (
      v_conv_id,
      '00000000-0000-0000-0000-000000000001',
      p_content,
      v_real_sender
    );

    IF v_audience <> v_actor THEN
      INSERT INTO public.notifications (user_id, actor_id, type, ref_id, target_url, message, meta)
      VALUES (
        v_audience,
        '00000000-0000-0000-0000-000000000001',
        'message_new',
        v_conv_id,
        'messages.html',
        left(p_content, 240),
        jsonb_build_object(
          'student_id', p_student_id,
          'conversation_id', v_conv_id,
          'official_mindup', true,
          'learning_thread', true
        )
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
  v_actor uuid := auth.uid();
  v_conv_id uuid;
  v_msg_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_student_id IS NULL OR p_audience_user_id IS NULL OR NULLIF(trim(COALESCE(p_content, '')), '') IS NULL THEN
    RAISE EXCEPTION 'student_id, audience_user_id and content are required';
  END IF;
  IF NOT public.can_access_learning_thread(p_student_id, p_audience_user_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  v_conv_id := public.ensure_mindup_official_audience_conversation(p_audience_user_id);

  INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id)
  VALUES (
    v_conv_id,
    '00000000-0000-0000-0000-000000000001',
    p_content,
    COALESCE(p_real_sender_id, v_actor)
  )
  RETURNING id INTO v_msg_id;

  IF p_audience_user_id <> v_actor THEN
    INSERT INTO public.notifications (user_id, actor_id, type, ref_id, target_url, message, meta)
    VALUES (
      p_audience_user_id,
      '00000000-0000-0000-0000-000000000001',
      'message_new',
      v_conv_id,
      'messages.html',
      left(p_content, 240),
      jsonb_build_object(
        'student_id', p_student_id,
        'conversation_id', v_conv_id,
        'official_mindup', true,
        'learning_thread', true
      )
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
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    NULL::text,
    NULL::uuid,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::timestamptz
  WHERE false;
$$;

CREATE OR REPLACE FUNCTION public.materialize_my_learning_conversations()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 0;
$$;

CREATE OR REPLACE FUNCTION public.ensure_mindup_teacher_conversation(
  p_teacher_id uuid,
  p_audience_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audience uuid := COALESCE(p_audience_user_id, auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF v_audience IS NULL THEN
    RAISE EXCEPTION 'audience_user_id is required';
  END IF;

  RETURN public.ensure_mindup_official_audience_conversation(v_audience);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_mindup_teacher_conversations()
RETURNS TABLE (
  conversation_id uuid,
  teacher_id uuid,
  teacher_name text,
  teacher_avatar_url text,
  audience_user_id uuid,
  audience_name text,
  audience_role text,
  audience_label text,
  thread_title text,
  last_content text,
  last_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    NULL::text,
    NULL::uuid,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::timestamptz
  WHERE false;
$$;

CREATE OR REPLACE FUNCTION public.send_mindup_teacher_message(
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
  v_actor uuid := auth.uid();
  v_audience uuid;
  v_official_conv_id uuid;
  v_msg_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_conversation_id IS NULL OR NULLIF(trim(COALESCE(p_content, '')), '') IS NULL THEN
    RAISE EXCEPTION 'conversation_id and content are required';
  END IF;

  SELECT
    CASE
      WHEN public.is_mindup_official_direct_key(c.direct_key) THEN (
        SELECT part::uuid
        FROM unnest(string_to_array(c.direct_key, '_')) AS part
        WHERE part <> '00000000-0000-0000-0000-000000000001'
        LIMIT 1
      )
      ELSE c.mindup_audience_user_id
    END
  INTO v_audience
  FROM public.conversations c
  WHERE c.id = p_conversation_id
  LIMIT 1;

  v_audience := COALESCE(v_audience, v_actor);
  v_official_conv_id := public.ensure_mindup_official_audience_conversation(v_audience);

  IF public.is_mindup_staff(v_actor) THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id)
    VALUES (
      v_official_conv_id,
      '00000000-0000-0000-0000-000000000001',
      p_content,
      COALESCE(p_real_sender_id, v_actor)
    )
    RETURNING id INTO v_msg_id;
  ELSE
    INSERT INTO public.messages (conversation_id, sender_id, content)
    VALUES (v_official_conv_id, v_actor, p_content)
    RETURNING id INTO v_msg_id;
  END IF;

  RETURN v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_mindup_official_audience_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_mindup_official_audience_conversation(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ensure_student_learning_conversation(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_student_learning_message(uuid, text, uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_student_learning_message_to_audience(uuid, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_student_learning_conversations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.materialize_my_learning_conversations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_mindup_teacher_conversation(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_mindup_teacher_conversations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_mindup_teacher_message(uuid, text, uuid) TO authenticated, service_role;
