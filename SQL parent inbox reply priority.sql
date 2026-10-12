BEGIN;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS support_reply boolean NOT NULL DEFAULT false;
UPDATE public.messages m SET support_reply = true
WHERE NOT m.support_reply AND m.transport = 'web' AND m.message_key IS NULL
  AND m.zalo_dispatch_source = 'automatic'
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = m.real_sender_id AND u.role::text IN ('admin','teacher'))
  AND EXISTS (SELECT 1 FROM public.zalo_outbox o WHERE o.message_id = m.id AND o.dispatch_purpose = 'message');
CREATE OR REPLACE FUNCTION public.send_mindup_parent_reply(p_parent_id uuid,p_student_id uuid,p_content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  -- Keep the existing authorization and Zalo enqueue logic.
  v_id := public.send_mindup_parent_message(p_parent_id,p_student_id,p_content);
  UPDATE public.messages SET support_reply = true WHERE id = v_id;
  RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.list_mindup_parent_reply_priority()
RETURNS TABLE(parent_id uuid,last_parent_at timestamptz,last_reply_at timestamptz,waiting_reply boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT inbox.parent_id, activity.incoming_at, activity.reply_at,
    activity.incoming_at IS NOT NULL AND (activity.reply_at IS NULL OR activity.incoming_at > activity.reply_at)
  FROM public.list_mindup_parent_inbox() inbox
  LEFT JOIN LATERAL (
    SELECT max(m.created_at) FILTER (WHERE m.sender_id = inbox.parent_id) AS incoming_at,
      max(m.created_at) FILTER (WHERE (m.support_reply AND EXISTS (
        SELECT 1 FROM public.users u WHERE u.id = m.real_sender_id AND u.role::text IN ('admin','teacher')
      )) OR (
        m.transport = 'zalo' AND m.sender_id = '00000000-0000-0000-0000-000000000001'::uuid
        AND m.real_sender_id IS NULL AND m.message_key IS NULL
        AND m.zalo_dispatch_source = 'automatic'
        AND NOT EXISTS (SELECT 1 FROM public.zalo_outbox o WHERE o.message_id = m.id)
      )) AS reply_at
    FROM public.messages m
    WHERE m.conversation_id = inbox.conversation_id
      AND (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin')
        OR m.context_student_id IS NULL OR public.teacher_manages_student(m.context_student_id))
  ) activity ON true;
$$;
REVOKE ALL ON FUNCTION public.send_mindup_parent_reply(uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_mindup_parent_reply_priority() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.send_mindup_parent_reply(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_mindup_parent_reply_priority() TO authenticated;
COMMIT;
