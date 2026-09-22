-- Apply after the existing MindUp official chat and Zalo bot scripts.
-- No Zalo session or service-role credential is stored in these tables.

DROP POLICY IF EXISTS "Anon public access to queue for local bot" ON public.zalo_messages_queue;
DROP POLICY IF EXISTS "Anon public access to config for local bot" ON public.zalo_bot_config;

CREATE TABLE IF NOT EXISTS public.zalo_verified_links (
  audience_user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  zalo_uid text NOT NULL UNIQUE,
  verified_by uuid NOT NULL REFERENCES public.users(id),
  verified_at timestamptz NOT NULL DEFAULT now(),
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.zalo_unmatched_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  zalo_uid text NOT NULL,
  display_name text,
  content text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.zalo_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  audience_user_id uuid NOT NULL REFERENCES public.users(id),
  zalo_uid text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'uncertain', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zalo_outbox_claim_idx ON public.zalo_outbox (status, created_at);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS transport text NOT NULL DEFAULT 'web'
  CHECK (transport IN ('web', 'zalo'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS external_message_id text;
CREATE UNIQUE INDEX IF NOT EXISTS messages_zalo_external_id_unique
  ON public.messages (external_message_id) WHERE external_message_id IS NOT NULL;

ALTER TABLE public.zalo_verified_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_unmatched_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.zalo_verified_links, public.zalo_unmatched_inbox, public.zalo_outbox FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zalo_verified_links TO authenticated;
GRANT SELECT, UPDATE ON public.zalo_unmatched_inbox TO authenticated;
GRANT SELECT ON public.zalo_outbox TO authenticated;

CREATE POLICY zalo_links_admin ON public.zalo_verified_links TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin'));
CREATE POLICY zalo_unmatched_admin ON public.zalo_unmatched_inbox TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin'));
CREATE POLICY zalo_outbox_staff_read ON public.zalo_outbox FOR SELECT TO authenticated
  USING (public.is_mindup_staff(auth.uid())
    AND public.can_access_mindup_official_audience(audience_user_id));

-- Only the staff member who authored a MindUp message can enqueue that message.
CREATE OR REPLACE FUNCTION public.enqueue_mindup_zalo_message(p_message_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_message public.messages;
  v_audience uuid;
  v_uid text;
  v_job_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_mindup_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Staff authentication required';
  END IF;
  SELECT * INTO v_message FROM public.messages WHERE id = p_message_id;
  IF NOT FOUND OR v_message.sender_id <> '00000000-0000-0000-0000-000000000001'::uuid
    OR v_message.real_sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your MindUp message';
  END IF;
  IF left(v_message.content, 14) = '__CHAT_IMAGE__' THEN
    RAISE EXCEPTION 'Zalo image delivery is not supported yet';
  END IF;
  SELECT public.mindup_official_audience_id(c.direct_key) INTO v_audience
    FROM public.conversations c
    WHERE c.id = v_message.conversation_id
      AND public.is_mindup_official_direct_key(c.direct_key);
  IF v_audience IS NULL OR NOT public.can_access_mindup_official_audience(v_audience) THEN
    RAISE EXCEPTION 'Not an accessible MindUp conversation';
  END IF;
  SELECT zalo_uid INTO v_uid FROM public.zalo_verified_links
    WHERE audience_user_id = v_audience AND enabled;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Zalo recipient is not verified';
  END IF;
  INSERT INTO public.zalo_outbox (message_id, conversation_id, audience_user_id, zalo_uid, content)
  VALUES (v_message.id, v_message.conversation_id, v_audience, v_uid, v_message.content)
  ON CONFLICT (message_id) DO UPDATE SET updated_at = public.zalo_outbox.updated_at
  RETURNING id INTO v_job_id;
  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mindup_zalo_link_available(p_audience_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_access_mindup_official_audience(p_audience_user_id)
    AND EXISTS (SELECT 1 FROM public.zalo_verified_links
      WHERE audience_user_id = p_audience_user_id AND enabled);
$$;

CREATE OR REPLACE FUNCTION public.verify_mindup_zalo_link(p_audience_user_id uuid, p_zalo_uid text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role::text = 'admin') THEN
    RAISE EXCEPTION 'Admin required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_audience_user_id AND role::text IN ('parent', 'student')) THEN
    RAISE EXCEPTION 'Recipient must be a parent or student';
  END IF;
  IF nullif(trim(p_zalo_uid), '') IS NULL OR length(p_zalo_uid) > 100 THEN
    RAISE EXCEPTION 'Invalid Zalo UID';
  END IF;
  INSERT INTO public.zalo_verified_links (audience_user_id, zalo_uid, verified_by)
  VALUES (p_audience_user_id, p_zalo_uid, auth.uid())
  ON CONFLICT (audience_user_id) DO UPDATE SET zalo_uid = excluded.zalo_uid,
    verified_by = excluded.verified_by, verified_at = now(), enabled = true;
  UPDATE public.zalo_unmatched_inbox SET resolved_at = now()
  WHERE zalo_uid = p_zalo_uid AND resolved_at IS NULL;
END;
$$;

-- Service-role-only operations for the laptop gateway.
CREATE OR REPLACE FUNCTION public.claim_mindup_zalo_message()
RETURNS TABLE (job_id uuid, zalo_uid text, content text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  -- A crashed sender may already have delivered the message. Never auto-retry it.
  UPDATE public.zalo_outbox SET status = 'uncertain', locked_until = NULL,
    error_message = 'Connection lost while sending; verify in Zalo before retrying', updated_at = now()
  WHERE status = 'processing' AND locked_until < now();
  RETURN QUERY
  WITH next_job AS (
    SELECT o.id FROM public.zalo_outbox o
    JOIN public.zalo_verified_links l ON l.audience_user_id = o.audience_user_id
      AND l.zalo_uid = o.zalo_uid AND l.enabled
    WHERE o.status = 'pending'
    ORDER BY o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE public.zalo_outbox o SET status = 'processing', attempts = attempts + 1,
      locked_until = now() + interval '5 minutes', updated_at = now()
    FROM next_job n WHERE o.id = n.id
    RETURNING o.id, o.zalo_uid, o.content
  ) SELECT c.id, c.zalo_uid, c.content FROM claimed c;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_mindup_zalo_message(
  p_job_id uuid, p_status text, p_error text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_status NOT IN ('sent', 'failed', 'uncertain') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.zalo_outbox SET status = p_status, error_message = left(p_error, 500),
    sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
    locked_until = NULL, updated_at = now()
  WHERE id = p_job_id AND status = 'processing';
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_mindup_zalo_message(
  p_external_id text, p_zalo_uid text, p_content text, p_display_name text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_audience uuid;
  v_conversation uuid;
  v_message_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF length(p_external_id) > 200 OR length(p_zalo_uid) > 100
    OR length(p_content) > 10000 OR nullif(trim(p_content), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid Zalo message';
  END IF;
  IF EXISTS (SELECT 1 FROM public.messages WHERE external_message_id = p_external_id)
    OR EXISTS (SELECT 1 FROM public.zalo_unmatched_inbox WHERE external_id = p_external_id) THEN
    RETURN 'duplicate';
  END IF;
  SELECT audience_user_id INTO v_audience FROM public.zalo_verified_links
    WHERE zalo_uid = p_zalo_uid AND enabled;
  IF v_audience IS NULL THEN
    INSERT INTO public.zalo_unmatched_inbox (external_id, zalo_uid, display_name, content)
    VALUES (p_external_id, p_zalo_uid, left(p_display_name, 200), '')
    ON CONFLICT (external_id) DO NOTHING;
    RETURN 'unmatched';
  END IF;
  v_conversation := public.ensure_mindup_official_audience_conversation(v_audience);
  INSERT INTO public.messages (conversation_id, sender_id, content, transport, external_message_id)
  VALUES (v_conversation, v_audience, p_content, 'zalo', p_external_id)
  ON CONFLICT DO NOTHING RETURNING id INTO v_message_id;
  IF v_message_id IS NULL THEN RETURN 'duplicate'; END IF;
  -- The existing message trigger covers admins and teachers of students.
  -- Add teachers of a linked parent, who are otherwise missed by that trigger.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_audience AND role::text = 'parent') THEN
    INSERT INTO public.notifications (user_id, actor_id, type, ref_id, message)
    SELECT DISTINCT ct.teacher_id, v_audience, 'message_new', v_conversation,
      'Phụ huynh đã nhắn tin cho MindUp qua Zalo'
    FROM public.parent_students ps
    JOIN public.class_students cs ON cs.student_id = ps.student_id
    JOIN public.class_teachers ct ON ct.class_id = cs.class_id
    WHERE ps.parent_id = v_audience AND ps.revoked_at IS NULL
      AND (cs.left_at IS NULL OR cs.left_at >= now())
      AND ct.teacher_id IS NOT NULL;
  END IF;
  RETURN 'received';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mindup_zalo_message() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_mindup_zalo_message(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ingest_mindup_zalo_message(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_mindup_zalo_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mindup_zalo_link_available(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_mindup_zalo_link(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mindup_zalo_message() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_mindup_zalo_message(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_mindup_zalo_message(text, text, text, text) TO service_role;
