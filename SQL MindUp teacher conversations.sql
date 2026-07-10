-- MindUp teacher-routed conversations.
-- A student/parent opens a teacher profile, but the visible conversation is with MindUp.
-- The target teacher receives the thread; admin/assistant can view every thread; other teachers cannot.

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS is_mindup_teacher_thread boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS mindup_teacher_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS mindup_audience_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_mindup_teacher_unique
  ON public.conversations (mindup_teacher_id, mindup_audience_user_id)
  WHERE is_mindup_teacher_thread = true;

CREATE INDEX IF NOT EXISTS conversations_mindup_teacher_lookup_idx
  ON public.conversations (is_mindup_teacher_thread, mindup_teacher_id, mindup_audience_user_id);

CREATE OR REPLACE FUNCTION public.can_access_mindup_teacher_thread(
  p_teacher_id uuid,
  p_audience_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() = p_teacher_id
  OR auth.uid() = p_audience_user_id
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'assistant')
  );
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
  v_actor uuid := auth.uid();
  v_audience uuid := COALESCE(p_audience_user_id, auth.uid());
  v_teacher_role text;
  v_actor_role text;
  v_conv_id uuid;
  v_direct_key text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_teacher_id IS NULL OR v_audience IS NULL THEN
    RAISE EXCEPTION 'teacher_id and audience_user_id are required';
  END IF;

  SELECT role::text INTO v_teacher_role
  FROM public.users
  WHERE id = p_teacher_id;

  IF COALESCE(v_teacher_role, '') <> 'teacher' THEN
    RAISE EXCEPTION 'Target user is not a teacher';
  END IF;

  SELECT role::text INTO v_actor_role
  FROM public.users
  WHERE id = v_actor;

  IF v_actor <> v_audience AND COALESCE(v_actor_role, '') NOT IN ('admin', 'assistant') AND v_actor <> p_teacher_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF NOT public.can_access_mindup_teacher_thread(p_teacher_id, v_audience) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  v_direct_key := 'mindup_teacher:' || p_teacher_id::text || ':audience:' || v_audience::text;

  INSERT INTO public.conversations (
    kind,
    direct_key,
    is_mindup_teacher_thread,
    mindup_teacher_id,
    mindup_audience_user_id
  )
  VALUES (
    'direct',
    v_direct_key,
    true,
    p_teacher_id,
    v_audience
  )
  ON CONFLICT (mindup_teacher_id, mindup_audience_user_id) WHERE is_mindup_teacher_thread = true
  DO UPDATE SET is_mindup_teacher_thread = true
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  SELECT v_conv_id, user_id
  FROM (VALUES (p_teacher_id), (v_audience)) AS member(user_id)
  WHERE user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.conversation_id = v_conv_id
        AND cm.user_id = member.user_id
    );

  RETURN v_conv_id;
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
    c.mindup_teacher_id,
    t.full_name,
    t.avatar_url,
    c.mindup_audience_user_id,
    au.full_name,
    au.role::text,
    lm.content,
    lm.created_at
  FROM public.conversations c
  JOIN public.users t ON t.id = c.mindup_teacher_id
  JOIN public.users au ON au.id = c.mindup_audience_user_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at
    FROM public.messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  WHERE c.is_mindup_teacher_thread = true
    AND public.can_access_mindup_teacher_thread(c.mindup_teacher_id, c.mindup_audience_user_id)
  ORDER BY lm.created_at DESC NULLS LAST, au.full_name NULLS LAST, t.full_name NULLS LAST;
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
  v_real_sender uuid := COALESCE(p_real_sender_id, auth.uid());
  v_actor_role text;
  v_conv record;
  v_msg_id uuid;
  v_notify_user uuid;
  v_message text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_conversation_id IS NULL OR NULLIF(trim(COALESCE(p_content, '')), '') IS NULL THEN
    RAISE EXCEPTION 'conversation_id and content are required';
  END IF;

  SELECT c.id, c.mindup_teacher_id, c.mindup_audience_user_id, t.full_name AS teacher_name, au.full_name AS audience_name
  INTO v_conv
  FROM public.conversations c
  LEFT JOIN public.users t ON t.id = c.mindup_teacher_id
  LEFT JOIN public.users au ON au.id = c.mindup_audience_user_id
  WHERE c.id = p_conversation_id
    AND c.is_mindup_teacher_thread = true;

  IF v_conv.id IS NULL THEN
    RAISE EXCEPTION 'MindUp teacher conversation not found';
  END IF;

  IF NOT public.can_access_mindup_teacher_thread(v_conv.mindup_teacher_id, v_conv.mindup_audience_user_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT role::text INTO v_actor_role
  FROM public.users
  WHERE id = v_actor;

  INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id)
  VALUES (p_conversation_id, '00000000-0000-0000-0000-000000000001', p_content, v_real_sender)
  RETURNING id INTO v_msg_id;

  IF v_actor = v_conv.mindup_audience_user_id THEN
    v_notify_user := v_conv.mindup_teacher_id;
    v_message := 'Tin nhắn MindUp mới từ ' || COALESCE(v_conv.audience_name, 'học sinh/phụ huynh');
  ELSE
    v_notify_user := v_conv.mindup_audience_user_id;
    v_message := 'MindUp - Tư Duy Toàn Diện đã phản hồi tin nhắn';
  END IF;

  IF v_notify_user IS NOT NULL AND v_notify_user <> v_actor THEN
    INSERT INTO public.notifications (user_id, actor_id, type, ref_id, target_url, message, meta)
    VALUES (
      v_notify_user,
      '00000000-0000-0000-0000-000000000001',
      'message_new',
      p_conversation_id,
      'messages.html',
      left(COALESCE(v_message || ': ', '') || p_content, 240),
      jsonb_build_object(
        'conversation_id', p_conversation_id,
        'mindup_teacher_thread', true,
        'teacher_id', v_conv.mindup_teacher_id,
        'audience_user_id', v_conv.mindup_audience_user_id
      )
    );
  END IF;

  IF COALESCE(v_actor_role, '') IN ('admin', 'assistant')
     AND v_conv.mindup_teacher_id IS NOT NULL
     AND v_conv.mindup_teacher_id <> v_actor
     AND v_conv.mindup_teacher_id <> v_notify_user THEN
    INSERT INTO public.notifications (user_id, actor_id, type, ref_id, target_url, message, meta)
    VALUES (
      v_conv.mindup_teacher_id,
      '00000000-0000-0000-0000-000000000001',
      'message_new',
      p_conversation_id,
      'messages.html',
      left('MindUp có cập nhật trong hội thoại giáo viên: ' || p_content, 240),
      jsonb_build_object(
        'conversation_id', p_conversation_id,
        'mindup_teacher_thread', true,
        'teacher_id', v_conv.mindup_teacher_id,
        'audience_user_id', v_conv.mindup_audience_user_id
      )
    );
  END IF;

  RETURN v_msg_id;
END;
$$;

DROP POLICY IF EXISTS conversations_mindup_teacher_select ON public.conversations;
CREATE POLICY conversations_mindup_teacher_select ON public.conversations
FOR SELECT TO authenticated
USING (
  is_mindup_teacher_thread = true
  AND public.can_access_mindup_teacher_thread(mindup_teacher_id, mindup_audience_user_id)
);

DROP POLICY IF EXISTS messages_mindup_teacher_select ON public.messages;
CREATE POLICY messages_mindup_teacher_select ON public.messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.is_mindup_teacher_thread = true
      AND public.can_access_mindup_teacher_thread(c.mindup_teacher_id, c.mindup_audience_user_id)
  )
);

REVOKE ALL ON FUNCTION public.can_access_mindup_teacher_thread(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_mindup_teacher_conversation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_mindup_teacher_conversations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_mindup_teacher_message(uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_access_mindup_teacher_thread(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_mindup_teacher_conversation(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_mindup_teacher_conversations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_mindup_teacher_message(uuid, text, uuid) TO authenticated, service_role;
