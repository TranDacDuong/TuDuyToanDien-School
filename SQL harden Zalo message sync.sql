-- Apply after SQL complete Zalo web messaging.sql and SQL Zalo message history sync.sql.
-- No guessed links, historical message deletion, or real message sends.
BEGIN;

-- Imported Zalo messages own their notification logic. Web messages keep the old trigger.
DROP TRIGGER IF EXISTS trg_mindup_bot_message_notifications ON public.messages;
CREATE TRIGGER trg_mindup_bot_message_notifications
  AFTER INSERT ON public.messages
  FOR EACH ROW WHEN (NEW.transport IS DISTINCT FROM 'zalo')
  EXECUTE FUNCTION public.handle_mindup_bot_message_notifications();

CREATE OR REPLACE FUNCTION public.finish_mindup_zalo_message_v2(
  p_job_id uuid, p_status text, p_error text DEFAULT NULL, p_external_id text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job public.zalo_outbox;
  v_echo public.messages;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'uncertain') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  SELECT * INTO v_job FROM public.zalo_outbox WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Outbox job not found'; END IF;
  IF v_job.status NOT IN ('processing', 'uncertain', 'sent') THEN
    RAISE EXCEPTION 'Outbox job was not claimed';
  END IF;
  IF v_job.status = 'sent' AND p_status <> 'sent' THEN RETURN; END IF;
  IF p_status = 'sent' THEN
    IF nullif(trim(p_external_id), '') IS NULL OR length(p_external_id) > 220
      OR split_part(p_external_id, ':', 1) <> v_job.zalo_uid
      OR nullif(split_part(p_external_id, ':', 2), '') IS NULL THEN
      RAISE EXCEPTION 'Invalid outgoing Zalo message id';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_external_id, 0));
    IF EXISTS (SELECT 1 FROM public.messages WHERE id = v_job.message_id
      AND external_message_id IS NOT NULL AND external_message_id <> p_external_id) THEN
      RAISE EXCEPTION 'Outgoing message already has another Zalo id';
    END IF;
    SELECT * INTO v_echo FROM public.messages
      WHERE external_message_id = p_external_id AND id <> v_job.message_id;
    IF FOUND THEN
      IF v_echo.conversation_id <> v_job.conversation_id
        OR v_echo.sender_id <> '00000000-0000-0000-0000-000000000001'::uuid
        OR v_echo.transport <> 'zalo' OR v_echo.real_sender_id IS NOT NULL
        OR v_echo.context_student_id IS NOT NULL OR v_echo.content <> v_job.content THEN
        RAISE EXCEPTION 'Outgoing message id conflicts with another message';
      END IF;
      -- The original web row retains its author, child scope, id, and outbox references.
      DELETE FROM public.messages WHERE id = v_echo.id;
    END IF;
    UPDATE public.messages SET external_message_id = p_external_id WHERE id = v_job.message_id;
  END IF;
  UPDATE public.zalo_outbox SET status = p_status, error_message = left(p_error, 500),
    sent_at = CASE WHEN p_status = 'sent' THEN COALESCE(sent_at, now()) ELSE sent_at END,
    locked_until = NULL, updated_at = now()
  WHERE id = p_job_id;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_mindup_zalo_message_v2(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_mindup_zalo_message_v2(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_mindup_zalo_message(
  p_external_id text, p_zalo_uid text, p_content text, p_display_name text DEFAULT NULL,
  p_is_self boolean DEFAULT false, p_sent_at timestamptz DEFAULT NULL,
  p_is_history boolean DEFAULT false
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF nullif(trim(COALESCE(p_external_id, '')), '') IS NULL OR length(p_external_id) > 220
    OR nullif(trim(COALESCE(p_zalo_uid, '')), '') IS NULL OR length(p_zalo_uid) > 100
    OR nullif(trim(COALESCE(p_content, '')), '') IS NULL OR length(p_content) > 10000
    OR p_is_self IS NULL OR p_is_history IS NULL THEN
    RAISE EXCEPTION 'Invalid Zalo message';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_external_id, 0));
  IF EXISTS (SELECT 1 FROM public.messages WHERE external_message_id = p_external_id) THEN
    RETURN 'duplicate';
  END IF;

  SELECT audience_user_id INTO v_parent_id FROM public.zalo_verified_links
    WHERE zalo_uid = p_zalo_uid AND enabled;
  IF v_parent_id IS NULL THEN
    IF p_is_history THEN RETURN 'ignored_unlinked'; END IF;
    INSERT INTO public.zalo_unmatched_inbox (external_id, zalo_uid, display_name, content)
      VALUES (p_external_id, p_zalo_uid, left(p_display_name, 200), '')
      ON CONFLICT (external_id) DO NOTHING;
    RETURN 'unmatched';
  END IF;

  -- An echo may arrive before sendMessage returns. Defer, never identify by text alone.
  IF p_is_self AND EXISTS (
    SELECT 1 FROM public.zalo_outbox o JOIN public.messages m ON m.id = o.message_id
    WHERE o.zalo_uid = p_zalo_uid AND o.content = p_content
      AND o.status IN ('processing', 'uncertain') AND m.external_message_id IS NULL
  ) THEN RETURN 'deferred'; END IF;

  v_conversation_id := public.ensure_mindup_official_audience_conversation(v_parent_id);
  INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id,
    transport, external_message_id, created_at)
  VALUES (v_conversation_id,
    CASE WHEN p_is_self THEN '00000000-0000-0000-0000-000000000001'::uuid ELSE v_parent_id END,
    p_content, NULL, 'zalo', p_external_id,
    CASE WHEN p_sent_at IS NULL OR p_sent_at > now() + interval '5 minutes' THEN now() ELSE p_sent_at END)
  ON CONFLICT DO NOTHING RETURNING id INTO v_message_id;
  IF v_message_id IS NULL THEN RETURN 'duplicate'; END IF;
  DELETE FROM public.zalo_unmatched_inbox WHERE external_id = p_external_id;

  IF NOT p_is_self AND NOT p_is_history THEN
    INSERT INTO public.notifications (user_id, actor_id, type, ref_id, target_url, message)
    SELECT DISTINCT staff.id, v_parent_id, 'message_new', v_conversation_id,
      'messages.html', 'Phụ huynh đã nhắn tin cho MindUp qua Zalo'
    FROM public.users staff
    WHERE staff.role::text = 'admin' OR (staff.role::text = 'teacher' AND EXISTS (
      SELECT 1 FROM public.parent_students ps
      JOIN public.class_students cs ON cs.student_id = ps.student_id
      JOIN public.class_teachers ct ON ct.class_id = cs.class_id
      WHERE ps.parent_id = v_parent_id AND ps.revoked_at IS NULL
        AND (cs.left_at IS NULL OR cs.left_at >= now()) AND ct.teacher_id = staff.id
    ));
  END IF;
  RETURN CASE WHEN p_is_history THEN 'history_imported' ELSE 'received' END;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_mindup_zalo_message(text, text, text, text, boolean, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_mindup_zalo_message(text, text, text, text, boolean, timestamptz, boolean) TO service_role;

-- An outgoing message typed directly in Zalo has no child scope. Only admin can
-- read such unscoped outgoing messages; shared incoming parent replies remain visible.
DROP POLICY IF EXISTS messages_mindup_official_staff_select ON public.messages;
CREATE POLICY messages_mindup_official_staff_select ON public.messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id
    AND c.kind = 'direct' AND public.is_mindup_official_direct_key(c.direct_key)
    AND public.can_access_mindup_official_direct_key(c.direct_key)
    AND (public.is_admin_actor() OR public.teacher_manages_student(messages.context_student_id)
      OR (messages.context_student_id IS NULL
        AND messages.sender_id <> '00000000-0000-0000-0000-000000000001'::uuid))
));

-- Show existing contact lookups as candidates, not verified links. Admin confirms identity.
CREATE OR REPLACE FUNCTION public.list_mindup_zalo_link_candidates(p_parent_id uuid)
RETURNS TABLE (zalo_uid text, display_name text, source text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_actor() THEN RAISE EXCEPTION 'Admin required'; END IF;
  RETURN QUERY
  SELECT DISTINCT candidates.uid, candidates.label, candidates.origin
  FROM (
    SELECT pc.zalo_uid AS uid, u.full_name AS label, 'contact'::text AS origin
      FROM public.zalo_parent_contacts pc JOIN public.users u ON u.id = pc.parent_id
      WHERE pc.parent_id = p_parent_id AND pc.status = 'friend'
        AND nullif(pc.zalo_uid, '') IS NOT NULL
    UNION ALL
    SELECT z.zalo_uid, max(z.display_name), 'incoming'::text
      FROM public.zalo_unmatched_inbox z WHERE z.resolved_at IS NULL GROUP BY z.zalo_uid
  ) candidates
  WHERE NOT EXISTS (SELECT 1 FROM public.zalo_verified_links l
    WHERE l.zalo_uid = candidates.uid AND l.audience_user_id <> p_parent_id)
    AND NOT EXISTS (SELECT 1 FROM public.zalo_parent_contacts pc
      WHERE pc.zalo_uid = candidates.uid AND pc.parent_id <> p_parent_id)
  ORDER BY candidates.origin, candidates.label;
END;
$$;
REVOKE ALL ON FUNCTION public.list_mindup_zalo_link_candidates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_mindup_zalo_link_candidates(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_mindup_zalo_link(p_audience_user_id uuid, p_zalo_uid text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_actor() THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_audience_user_id AND role::text IN ('parent','student')) THEN
    RAISE EXCEPTION 'Recipient must be a parent or student';
  END IF;
  IF nullif(trim(p_zalo_uid), '') IS NULL OR length(p_zalo_uid) > 100 THEN RAISE EXCEPTION 'Invalid Zalo UID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('zalo-link:' || p_zalo_uid, 0));
  IF EXISTS (SELECT 1 FROM public.zalo_verified_links WHERE zalo_uid = p_zalo_uid AND audience_user_id <> p_audience_user_id)
    OR EXISTS (SELECT 1 FROM public.zalo_parent_contacts WHERE zalo_uid = p_zalo_uid AND parent_id <> p_audience_user_id) THEN
    RAISE EXCEPTION 'Zalo account belongs to another parent; resolve the conflict first';
  END IF;
  INSERT INTO public.zalo_verified_links (audience_user_id, zalo_uid, verified_by, verification_source)
    VALUES (p_audience_user_id, p_zalo_uid, auth.uid(), 'admin')
  ON CONFLICT (audience_user_id) DO UPDATE SET zalo_uid = excluded.zalo_uid,
    verified_by = excluded.verified_by, verified_at = now(), enabled = true, verification_source = 'admin';
  UPDATE public.zalo_unmatched_inbox SET resolved_at = now() WHERE zalo_uid = p_zalo_uid AND resolved_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_mindup_zalo_link(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_mindup_zalo_link(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_mindup_zalo_sync_state()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  RETURN (SELECT jsonb_build_object('linked', count(*) FILTER (WHERE enabled),
    'revision', md5(COALESCE(string_agg(audience_user_id::text || ':' || zalo_uid || ':' ||
      enabled::text || ':' || verified_at::text, ',' ORDER BY audience_user_id), '')))
    FROM public.zalo_verified_links);
END;
$$;
REVOKE ALL ON FUNCTION public.get_mindup_zalo_sync_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mindup_zalo_sync_state() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
