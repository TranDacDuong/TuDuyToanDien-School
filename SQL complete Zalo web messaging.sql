-- Complete MindUp messaging model.
-- Supported interactive flows:
--   1. student <-> student on the web;
--   2. admin <-> parent through the official MindUp inbox and Zalo;
--   3. teacher <-> parent only for students in classes managed by that teacher.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS context_student_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS messages_context_student_idx
  ON public.messages (context_student_id, created_at DESC)
  WHERE context_student_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_admin_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_manages_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    JOIN public.class_students cs ON cs.class_id = ct.class_id
    WHERE ct.teacher_id = auth.uid()
      AND cs.student_id = p_student_id
      AND (cs.left_at IS NULL OR cs.left_at >= now())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_message_parent_for_student(
  p_parent_id uuid,
  p_student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_parent_id IS NOT NULL
    AND p_student_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.parent_students ps
      JOIN public.users parent_user ON parent_user.id = ps.parent_id
      JOIN public.users student_user ON student_user.id = ps.student_id
      WHERE ps.parent_id = p_parent_id
        AND ps.student_id = p_student_id
        AND ps.revoked_at IS NULL
        AND parent_user.role::text = 'parent'
        AND student_user.role::text = 'student'
    )
    AND (
      public.is_admin_actor()
      OR public.teacher_manages_student(p_student_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.ensure_student_direct_conversation(p_other_student_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
  v_direct_key text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_other_student_id IS NULL OR p_other_student_id = auth.uid() THEN
    RAISE EXCEPTION 'A different student is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role::text = 'student')
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_other_student_id AND role::text = 'student') THEN
    RAISE EXCEPTION 'Student conversations are only available between students';
  END IF;

  SELECT string_agg(id::text, '_' ORDER BY id::text) INTO v_direct_key
  FROM (VALUES (auth.uid()), (p_other_student_id)) AS participants(id);

  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE kind = 'direct' AND direct_key = v_direct_key
  LIMIT 1;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (kind, direct_key)
    VALUES ('direct', v_direct_key)
    RETURNING id INTO v_conversation_id;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conversation_id, auth.uid()), (v_conversation_id, p_other_student_id)
  ON CONFLICT DO NOTHING;

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_student_direct_key(p_direct_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH participant_ids AS (
    SELECT part::uuid AS id
    FROM unnest(string_to_array(COALESCE(p_direct_key, ''), '_')) part
    WHERE part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  SELECT COUNT(*) = 2
    AND bool_and(EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = participant_ids.id AND u.role::text = 'student'
    ))
    AND bool_or(participant_ids.id = auth.uid())
  FROM participant_ids;
$$;

CREATE OR REPLACE FUNCTION public.send_student_direct_message(
  p_other_student_id uuid,
  p_content text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
  v_message_id uuid;
BEGIN
  IF nullif(trim(COALESCE(p_content, '')), '') IS NULL OR length(p_content) > 10000 THEN
    RAISE EXCEPTION 'Message content is invalid';
  END IF;

  v_conversation_id := public.ensure_student_direct_conversation(p_other_student_id);
  INSERT INTO public.messages (conversation_id, sender_id, content, transport)
  VALUES (v_conversation_id, auth.uid(), p_content, 'web')
  RETURNING id INTO v_message_id;

  INSERT INTO public.notifications (user_id, actor_id, type, ref_id, target_url, message)
  VALUES (p_other_student_id, auth.uid(), 'message_new', v_conversation_id,
    'messages.html', 'Bạn có tin nhắn mới')
  ON CONFLICT DO NOTHING;

  RETURN v_message_id;
END;
$$;

-- Replace the permissive legacy insert policies. Official MindUp messages use
-- SECURITY DEFINER functions; ordinary inserts are reserved for student chat.
DROP POLICY IF EXISTS conversations_insert_policy ON public.conversations;
CREATE POLICY conversations_insert_policy ON public.conversations
FOR INSERT TO authenticated
WITH CHECK (
  kind = 'direct'
  AND direct_key IS NOT NULL
  AND public.can_access_student_direct_key(direct_key)
);

DROP POLICY IF EXISTS messages_insert_policy ON public.messages;
CREATE POLICY messages_insert_policy ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.kind = 'direct'
      AND public.can_access_student_direct_key(c.direct_key)
  )
);

CREATE OR REPLACE FUNCTION public.list_mindup_parent_inbox()
RETURNS TABLE (
  parent_id uuid,
  parent_name text,
  parent_avatar_url text,
  conversation_id uuid,
  children jsonb,
  zalo_linked boolean,
  last_content text,
  last_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT role::text AS role FROM public.users WHERE id = auth.uid()
  ), accessible_links AS (
    SELECT DISTINCT ps.parent_id, ps.student_id
    FROM public.parent_students ps
    JOIN public.users parent_user ON parent_user.id = ps.parent_id AND parent_user.role::text = 'parent'
    JOIN public.users student_user ON student_user.id = ps.student_id AND student_user.role::text = 'student'
    CROSS JOIN me
    WHERE ps.revoked_at IS NULL
      AND (
        me.role = 'admin'
        OR (me.role = 'teacher' AND public.teacher_manages_student(ps.student_id))
      )
  ), grouped AS (
    SELECT
      al.parent_id,
      jsonb_agg(
        jsonb_build_object(
          'id', student_user.id,
          'name', COALESCE(student_user.full_name, student_user.email, 'Học sinh')
        ) ORDER BY COALESCE(student_user.full_name, student_user.email, '')
      ) AS children
    FROM accessible_links al
    JOIN public.users student_user ON student_user.id = al.student_id
    GROUP BY al.parent_id
  ), conversations_for_parent AS (
    SELECT c.id, public.mindup_official_audience_id(c.direct_key) AS parent_id
    FROM public.conversations c
    WHERE c.kind = 'direct' AND public.is_mindup_official_direct_key(c.direct_key)
  )
  SELECT
    parent_user.id,
    COALESCE(parent_user.full_name, parent_user.email, 'Phụ huynh'),
    parent_user.avatar_url,
    cp.id,
    grouped.children,
    EXISTS (
      SELECT 1 FROM public.zalo_verified_links zl
      WHERE zl.audience_user_id = parent_user.id AND zl.enabled
    ),
    last_message.content,
    last_message.created_at
  FROM grouped
  JOIN public.users parent_user ON parent_user.id = grouped.parent_id
  LEFT JOIN conversations_for_parent cp ON cp.parent_id = parent_user.id
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at
    FROM public.messages m
    WHERE m.conversation_id = cp.id
      AND (
        (SELECT role FROM me) = 'admin'
        OR m.context_student_id IS NULL
        OR public.teacher_manages_student(m.context_student_id)
      )
    ORDER BY m.created_at DESC
    LIMIT 1
  ) last_message ON true
  ORDER BY last_message.created_at DESC NULLS LAST,
    COALESCE(parent_user.full_name, parent_user.email, '');
$$;

CREATE OR REPLACE FUNCTION public.send_mindup_parent_message(
  p_parent_id uuid,
  p_student_id uuid,
  p_content text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
  v_message_id uuid;
  v_zalo_uid text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF nullif(trim(COALESCE(p_content, '')), '') IS NULL OR length(p_content) > 10000 THEN
    RAISE EXCEPTION 'Message content is invalid';
  END IF;
  IF NOT public.can_message_parent_for_student(p_parent_id, p_student_id) THEN
    RAISE EXCEPTION 'You cannot message this parent for the selected student';
  END IF;
  IF left(p_content, 14) = '__CHAT_IMAGE__' THEN
    RAISE EXCEPTION 'Zalo image delivery is not supported yet';
  END IF;

  v_conversation_id := public.ensure_mindup_official_audience_conversation(p_parent_id);
  INSERT INTO public.messages (
    conversation_id, sender_id, content, real_sender_id, transport, context_student_id
  ) VALUES (
    v_conversation_id,
    '00000000-0000-0000-0000-000000000001',
    p_content,
    auth.uid(),
    'web',
    p_student_id
  ) RETURNING id INTO v_message_id;

  SELECT zalo_uid INTO v_zalo_uid
  FROM public.zalo_verified_links
  WHERE audience_user_id = p_parent_id AND enabled;

  IF v_zalo_uid IS NOT NULL THEN
    INSERT INTO public.zalo_outbox (
      message_id, conversation_id, audience_user_id, zalo_uid, content
    ) VALUES (
      v_message_id, v_conversation_id, p_parent_id, v_zalo_uid, p_content
    ) ON CONFLICT (message_id) DO NOTHING;
  END IF;

  RETURN v_message_id;
END;
$$;

-- Teachers may read a family thread only in the context of students they manage.
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
      AND public.can_access_mindup_official_direct_key(c.direct_key)
      AND (
        public.is_admin_actor()
        OR messages.context_student_id IS NULL
        OR public.teacher_manages_student(messages.context_student_id)
      )
  )
);

REVOKE ALL ON FUNCTION public.is_admin_actor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_manages_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_message_parent_for_student(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_student_direct_conversation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_student_direct_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_student_direct_message(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_mindup_parent_inbox() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_mindup_parent_message(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin_actor() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.teacher_manages_student(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_message_parent_for_student(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_student_direct_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_student_direct_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_student_direct_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_mindup_parent_inbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_mindup_parent_message(uuid, uuid, text) TO authenticated;
