-- Cập nhật tin nhắn học tập theo khóa ổn định, tránh gửi trùng khi nhập/sửa điểm.
-- Dán toàn bộ file này vào Supabase SQL Editor.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_key text;

CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_message_key_unique
  ON public.messages (conversation_id, message_key)
  WHERE message_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.upsert_student_learning_message(
  p_student_id uuid,
  p_content text,
  p_message_key text,
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
  v_msg_id uuid;
  v_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_student_id IS NULL
    OR NULLIF(trim(COALESCE(p_content, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_message_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'student_id, content and message_key are required';
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

    INSERT INTO public.messages (
      conversation_id,
      sender_id,
      content,
      real_sender_id,
      message_key,
      created_at
    )
    VALUES (
      v_conv_id,
      '00000000-0000-0000-0000-000000000001',
      p_content,
      v_real_sender,
      p_message_key,
      now()
    )
    ON CONFLICT (conversation_id, message_key) WHERE message_key IS NOT NULL
    DO UPDATE SET
      content = EXCLUDED.content,
      real_sender_id = EXCLUDED.real_sender_id,
      created_at = now()
    RETURNING id INTO v_msg_id;

    IF v_audience <> v_actor THEN
      DELETE FROM public.notifications
      WHERE user_id = v_audience
        AND type = 'message_new'
        AND meta->>'message_key' = p_message_key
        AND meta->>'conversation_id' = v_conv_id::text;

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
          'learning_thread', true,
          'message_key', p_message_key,
          'message_id', v_msg_id
        )
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_student_learning_message(uuid, text, text, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_student_learning_message(uuid, text, text, uuid, uuid[]) TO authenticated, service_role;
