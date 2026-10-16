BEGIN;
-- Short chat queries spend more time compiling complex RLS plans than reading
-- rows. Keep caller permissions and RLS intact; disable JIT only for these RPCs.
CREATE OR REPLACE FUNCTION public.list_mindup_conversation_messages(
  p_conversation_id uuid, p_before timestamptz DEFAULT NULL, p_limit integer DEFAULT 10
) RETURNS SETOF public.messages
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public SET jit = off AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY SELECT m.* FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND (p_before IS NULL OR m.created_at < p_before)
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT greatest(1, least(coalesce(p_limit,10),50));
END;
$$;
REVOKE ALL ON FUNCTION public.list_mindup_conversation_messages(uuid,timestamptz,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_mindup_conversation_messages(uuid,timestamptz,integer) TO authenticated;

DO $$ DECLARE fn regprocedure;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (
      'list_mindup_parent_inbox','list_mindup_parent_reply_priority',
      'list_mindup_parent_zalo_aliases','list_zalo_contact_profiles',
      'list_zalo_external_inbox','list_zalo_external_messages','zalo_message_states',
      'list_mindup_zalo_message_deliveries','mindup_zalo_link_available',
      'ensure_bot_conversation','list_my_learning_conversations',
      'list_my_mindup_teacher_conversations'
    )
  LOOP EXECUTE format('ALTER FUNCTION %s SET jit = off', fn); END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
