BEGIN;
-- Only message bodies move off cloud. Identity, ACLs, cursors and delivery ledgers stay intact.
CREATE TABLE IF NOT EXISTS public.zalo_local_storage (
 id integer PRIMARY KEY CHECK(id=1),storage_id uuid NOT NULL,last_seen_at timestamptz NOT NULL DEFAULT now(),
 compact_enabled boolean NOT NULL DEFAULT false,next_scan_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.zalo_local_archive (
 key text PRIMARY KEY,content_hash text NOT NULL,archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zalo_local_storage ADD COLUMN IF NOT EXISTS next_scan_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS public.zalo_local_reads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),requested_by uuid NOT NULL REFERENCES public.users(id),
 keys text[] NOT NULL,token uuid,result jsonb,status text NOT NULL DEFAULT 'pending',
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '90 seconds'
);
ALTER TABLE public.zalo_local_storage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_local_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_local_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zalo_local_storage,public.zalo_local_archive,public.zalo_local_reads FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.allowed_local_zalo_keys(p_keys text[]) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
 SELECT coalesce(array_agg(key),'{}') FROM (
  SELECT 'm:'||m.id::text AS key FROM public.messages m JOIN public.conversations c ON c.id=m.conversation_id
   WHERE 'm:'||m.id::text=ANY(p_keys) AND public.can_access_mindup_official_direct_key(c.direct_key)
    AND (public.is_admin_actor() OR public.mindup_official_audience_id(c.direct_key)=auth.uid()
      OR m.context_student_id IS NULL OR public.teacher_manages_student(m.context_student_id))
  UNION SELECT 'z:'||z.external_id FROM public.zalo_message_mirrors z
   WHERE 'z:'||z.external_id=ANY(p_keys) AND (public.is_admin_actor() OR EXISTS(
    SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id=m.conversation_id WHERE m.id=z.message_id
     AND public.can_access_mindup_official_direct_key(c.direct_key)
     AND (public.mindup_official_audience_id(c.direct_key)=auth.uid() OR m.context_student_id IS NULL OR public.teacher_manages_student(m.context_student_id))))
 ) x;
$$;
CREATE OR REPLACE FUNCTION public.request_local_zalo_history(p_keys text[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE allowed text[]; item uuid;
BEGIN
 IF auth.uid() IS NULL OR cardinality(p_keys) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid history request'; END IF;
 -- Recheck the official family/class scope; never trust caller-supplied IDs.
 allowed:=public.allowed_local_zalo_keys(p_keys);
 IF cardinality(allowed)<>cardinality(p_keys) THEN RAISE EXCEPTION 'Conversation access denied'; END IF;
 IF (SELECT count(*) FROM public.zalo_local_reads WHERE requested_by=auth.uid() AND expires_at>now() AND status IN('pending','processing'))>=5
  THEN RAISE EXCEPTION 'Too many history requests'; END IF;
 INSERT INTO public.zalo_local_reads(requested_by,keys) VALUES(auth.uid(),allowed) RETURNING id INTO item;
 RETURN item;
END;$$;

CREATE OR REPLACE FUNCTION public.read_local_zalo_history(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE item public.zalo_local_reads; allowed text[]; bodies jsonb;
BEGIN
 SELECT * INTO item FROM public.zalo_local_reads WHERE id=p_id AND requested_by=auth.uid() AND expires_at>now();
 IF NOT FOUND THEN RETURN jsonb_build_object('status','expired'); END IF;
 allowed:=public.allowed_local_zalo_keys(item.keys);
 IF cardinality(allowed)<>cardinality(item.keys) THEN RAISE EXCEPTION 'Conversation access denied'; END IF;
 -- Re-read the cloud body to respect recall/edits that happened after the task was requested.
 SELECT coalesce(jsonb_agg(jsonb_build_object('key',x->>'key','content',CASE
   WHEN left(source.content,20)='__MINDUP_LOCAL_V1__:' THEN x->>'content' ELSE source.content END)),'[]') INTO bodies
 FROM jsonb_array_elements(coalesce(item.result,'[]')) x JOIN LATERAL (
  SELECT m.content FROM public.messages m WHERE 'm:'||m.id::text=x->>'key'
  UNION ALL SELECT m.content FROM public.zalo_message_mirrors m WHERE 'z:'||m.external_id=x->>'key'
 ) source ON true WHERE source.content IS NOT NULL AND (x->>'missing' IS DISTINCT FROM 'true' OR left(source.content,20)<>'__MINDUP_LOCAL_V1__:');
 RETURN jsonb_build_object('status',item.status,'items',bodies);
END;$$;

CREATE OR REPLACE FUNCTION public.local_zalo_storage_cycle(p_storage_id uuid,p_receipts jsonb DEFAULT '[]',p_results jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE ctl public.zalo_local_storage; r jsonb; job public.zalo_local_reads; current_body text; exports jsonb; reads jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF p_storage_id IS NULL OR jsonb_typeof(p_receipts)<>'array' OR jsonb_array_length(p_receipts)>100
  OR jsonb_typeof(p_results)<>'array' OR jsonb_array_length(p_results)>5 THEN RAISE EXCEPTION 'Invalid local worker cycle'; END IF;
 INSERT INTO public.zalo_local_storage(id,storage_id) VALUES(1,p_storage_id) ON CONFLICT DO NOTHING;
 SELECT * INTO ctl FROM public.zalo_local_storage WHERE id=1 FOR UPDATE;
 IF ctl.storage_id<>p_storage_id THEN RAISE EXCEPTION 'Different local storage instance; refuse to overwrite history'; END IF;
 UPDATE public.zalo_local_storage SET last_seen_at=now() WHERE id=1;
 DELETE FROM public.zalo_local_reads WHERE expires_at<now();
 FOR r IN SELECT value FROM jsonb_array_elements(p_receipts) LOOP
  IF r->>'hash' !~ '^[0-9a-f]{32}$' THEN RAISE EXCEPTION 'Invalid checksum'; END IF;
  current_body:=NULL;
  IF left(r->>'key',2)='m:' THEN
   SELECT m.content INTO current_body FROM public.messages m JOIN public.conversations c ON c.id=m.conversation_id
    WHERE m.id=substring(r->>'key' FROM 3)::uuid AND public.is_mindup_official_direct_key(c.direct_key)
      AND m.created_at<now()-interval '48 hours'
      AND EXISTS(SELECT 1 FROM public.messages n WHERE n.conversation_id=m.conversation_id AND (n.created_at,n.id)>(m.created_at,m.id));
  ELSIF left(r->>'key',2)='z:' THEN
   SELECT m.content INTO current_body FROM public.zalo_message_mirrors m WHERE m.external_id=substring(r->>'key' FROM 3)
    AND m.sent_at<now()-interval '48 hours'
    AND EXISTS(SELECT 1 FROM public.zalo_message_mirrors n WHERE n.zalo_uid=m.zalo_uid AND (n.sent_at,n.external_id)>(m.sent_at,m.external_id));
  END IF;
  IF current_body IS NOT NULL AND md5(current_body)=r->>'hash' THEN
   INSERT INTO public.zalo_local_archive(key,content_hash) VALUES(r->>'key',r->>'hash')
    ON CONFLICT(key) DO UPDATE SET content_hash=excluded.content_hash,archived_at=now();
   IF ctl.compact_enabled THEN
    IF left(r->>'key',2)='m:' THEN UPDATE public.messages SET content='__MINDUP_LOCAL_V1__:'||(r->>'key') WHERE id=substring(r->>'key' FROM 3)::uuid AND md5(content)=r->>'hash';
    ELSE UPDATE public.zalo_message_mirrors SET content='__MINDUP_LOCAL_V1__:'||(r->>'key') WHERE external_id=substring(r->>'key' FROM 3) AND md5(content)=r->>'hash'; END IF;
   END IF;
  END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(p_results) LOOP
  SELECT * INTO job FROM public.zalo_local_reads WHERE id=(r->>'id')::uuid AND token=(r->>'token')::uuid AND status='processing' FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  IF jsonb_typeof(r->'items')<>'array' OR jsonb_array_length(r->'items')>100 THEN RAISE EXCEPTION 'Invalid history result'; END IF;
  UPDATE public.zalo_local_reads SET result=(SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(r->'items') x WHERE x->>'key'=ANY(job.keys)),status='ready' WHERE id=job.id;
 END LOOP;
 WITH pending AS(SELECT id FROM public.zalo_local_reads WHERE status='pending' ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED),
 claimed AS(UPDATE public.zalo_local_reads j SET status='processing',token=gen_random_uuid() FROM pending WHERE j.id=pending.id RETURNING j.id,j.token,j.keys)
 SELECT coalesce(jsonb_agg(to_jsonb(claimed)),'[]') INTO reads FROM claimed;
 IF ctl.next_scan_at<=now() THEN
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO exports FROM (
  SELECT key,content,md5(content) AS hash FROM (
   SELECT 'm:'||m.id::text AS key,m.content FROM public.messages m JOIN public.conversations c ON c.id=m.conversation_id
    WHERE public.is_mindup_official_direct_key(c.direct_key) AND m.created_at<now()-interval '48 hours'
      AND left(m.content,20)<>'__MINDUP_LOCAL_V1__:'
      AND EXISTS(SELECT 1 FROM public.messages n WHERE n.conversation_id=m.conversation_id AND (n.created_at,n.id)>(m.created_at,m.id))
   UNION ALL SELECT 'z:'||m.external_id,m.content FROM public.zalo_message_mirrors m
    WHERE m.sent_at<now()-interval '48 hours' AND left(m.content,20)<>'__MINDUP_LOCAL_V1__:'
      AND EXISTS(SELECT 1 FROM public.zalo_message_mirrors n WHERE n.zalo_uid=m.zalo_uid AND (n.sent_at,n.external_id)>(m.sent_at,m.external_id))
  ) source WHERE ctl.compact_enabled OR NOT EXISTS(SELECT 1 FROM public.zalo_local_archive a WHERE a.key=source.key AND a.content_hash=md5(source.content))
  ORDER BY key LIMIT 100
 ) x;
 UPDATE public.zalo_local_storage SET next_scan_at=now()+CASE WHEN jsonb_array_length(exports)>0 THEN interval '500 milliseconds' ELSE interval '10 minutes' END WHERE id=1;
 ELSE exports:='[]'; END IF;
 RETURN jsonb_build_object('exports',exports,'reads',reads,'compactEnabled',ctl.compact_enabled);
END;$$;
REVOKE ALL ON FUNCTION public.allowed_local_zalo_keys(text[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.allowed_local_zalo_keys(text[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.request_local_zalo_history(text[]),public.read_local_zalo_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_local_zalo_history(text[]),public.read_local_zalo_history(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.local_zalo_storage_cycle(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.local_zalo_storage_cycle(uuid,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
