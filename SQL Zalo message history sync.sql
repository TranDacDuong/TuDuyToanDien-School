-- Synchronize private Zalo text messages into the MindUp official inbox.
-- Historical messages from unlinked Zalo accounts are deliberately ignored.

CREATE OR REPLACE FUNCTION public.sync_mindup_zalo_message(
  p_external_id text,
  p_zalo_uid text,
  p_content text,
  p_display_name text DEFAULT NULL,
  p_is_self boolean DEFAULT false,
  p_sent_at timestamptz DEFAULT NULL,
  p_is_history boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_created_at timestamptz;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF nullif(trim(COALESCE(p_external_id, '')), '') IS NULL
    OR length(p_external_id) > 220
    OR nullif(trim(COALESCE(p_zalo_uid, '')), '') IS NULL
    OR length(p_zalo_uid) > 100
    OR nullif(trim(COALESCE(p_content, '')), '') IS NULL
    OR length(p_content) > 10000 THEN
    RAISE EXCEPTION 'Invalid Zalo message';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.messages WHERE external_message_id = p_external_id
  ) OR EXISTS (
    SELECT 1 FROM public.zalo_unmatched_inbox WHERE external_id = p_external_id
  ) THEN
    RETURN 'duplicate';
  END IF;

  SELECT audience_user_id INTO v_parent_id
  FROM public.zalo_verified_links
  WHERE zalo_uid = p_zalo_uid AND enabled;

  IF v_parent_id IS NULL THEN
    IF p_is_history THEN
      RETURN 'ignored_unlinked';
    END IF;
    INSERT INTO public.zalo_unmatched_inbox (
      external_id, zalo_uid, display_name, content
    ) VALUES (
      p_external_id, p_zalo_uid, left(p_display_name, 200), ''
    ) ON CONFLICT (external_id) DO NOTHING;
    RETURN 'unmatched';
  END IF;

  v_conversation_id := public.ensure_mindup_official_audience_conversation(v_parent_id);
  v_created_at := CASE
    WHEN p_sent_at IS NULL THEN now()
    WHEN p_sent_at > now() + interval '5 minutes' THEN now()
    ELSE p_sent_at
  END;

  INSERT INTO public.messages (
    conversation_id,
    sender_id,
    content,
    real_sender_id,
    transport,
    external_message_id,
    created_at
  ) VALUES (
    v_conversation_id,
    CASE WHEN p_is_self
      THEN '00000000-0000-0000-0000-000000000001'::uuid
      ELSE v_parent_id
    END,
    p_content,
    NULL,
    'zalo',
    p_external_id,
    v_created_at
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_message_id;

  IF v_message_id IS NULL THEN
    RETURN 'duplicate';
  END IF;

  IF NOT p_is_self AND NOT p_is_history THEN
    INSERT INTO public.notifications (
      user_id, actor_id, type, ref_id, target_url, message
    )
    SELECT u.id, v_parent_id, 'message_new', v_conversation_id,
      'messages.html', 'Phụ huynh đã nhắn tin cho MindUp qua Zalo'
    FROM public.users u
    WHERE u.role::text = 'admin'
    ON CONFLICT DO NOTHING;

    INSERT INTO public.notifications (
      user_id, actor_id, type, ref_id, target_url, message
    )
    SELECT DISTINCT ct.teacher_id, v_parent_id, 'message_new', v_conversation_id,
      'messages.html', 'Phụ huynh đã nhắn tin cho MindUp qua Zalo'
    FROM public.parent_students ps
    JOIN public.class_students cs ON cs.student_id = ps.student_id
    JOIN public.class_teachers ct ON ct.class_id = cs.class_id
    WHERE ps.parent_id = v_parent_id
      AND ps.revoked_at IS NULL
      AND (cs.left_at IS NULL OR cs.left_at >= now())
      AND ct.teacher_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN CASE WHEN p_is_history THEN 'history_imported' ELSE 'received' END;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_mindup_zalo_message(
  text, text, text, text, boolean, timestamptz, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_mindup_zalo_message(
  text, text, text, text, boolean, timestamptz, boolean
) TO service_role;
