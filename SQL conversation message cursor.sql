BEGIN;
CREATE OR REPLACE FUNCTION public.list_mindup_conversation_messages_v2(
  p_conversation_id uuid,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 10
) RETURNS SETOF public.messages LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=public SET jit=off AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY SELECT m.* FROM public.messages m WHERE m.conversation_id=p_conversation_id
    AND (p_before IS NULL OR m.created_at<p_before OR (p_before_id IS NOT NULL AND m.created_at=p_before AND m.id<p_before_id))
    ORDER BY m.created_at DESC,m.id DESC LIMIT greatest(1,least(coalesce(p_limit,10),50));
END;
$$;
REVOKE ALL ON FUNCTION public.list_mindup_conversation_messages_v2(uuid,timestamptz,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_mindup_conversation_messages_v2(uuid,timestamptz,uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
