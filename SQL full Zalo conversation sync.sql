BEGIN;
CREATE TABLE IF NOT EXISTS public.zalo_external_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), zalo_uid text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '', avatar text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.zalo_message_mirrors (
  external_id text PRIMARY KEY, zalo_uid text NOT NULL REFERENCES public.zalo_external_threads(zalo_uid),
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  content text NOT NULL, is_self boolean NOT NULL, sent_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS zalo_mirror_thread_time ON public.zalo_message_mirrors(zalo_uid,sent_at,external_id);
CREATE TABLE IF NOT EXISTS public.zalo_media_references (
  external_id text PRIMARY KEY REFERENCES public.zalo_message_mirrors(external_id),
  remote_url text, kind text NOT NULL, filename text
);
CREATE TABLE IF NOT EXISTS public.zalo_message_updates (
  event_id text NOT NULL,target_id text NOT NULL,kind text NOT NULL,actor text NOT NULL,
  icon text,occurred_at timestamptz NOT NULL, PRIMARY KEY(event_id,target_id)
);
CREATE INDEX IF NOT EXISTS zalo_update_target ON public.zalo_message_updates(target_id,occurred_at);
CREATE TABLE IF NOT EXISTS public.zalo_external_replies (
  id uuid PRIMARY KEY,thread_id uuid NOT NULL REFERENCES public.zalo_external_threads(id),
  content text NOT NULL,created_by uuid NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'processing',external_id text,error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zalo_external_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_message_mirrors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_media_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_message_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_external_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zalo_external_threads,public.zalo_message_mirrors,public.zalo_media_references,public.zalo_message_updates,public.zalo_external_replies FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.zalo_external_threads,public.zalo_message_mirrors,public.zalo_media_references,public.zalo_message_updates,public.zalo_external_replies TO authenticated;
DROP POLICY IF EXISTS zalo_threads_admin ON public.zalo_external_threads;
DROP POLICY IF EXISTS zalo_mirrors_scoped ON public.zalo_message_mirrors;
DROP POLICY IF EXISTS zalo_media_scoped ON public.zalo_media_references;
DROP POLICY IF EXISTS zalo_updates_scoped ON public.zalo_message_updates;
DROP POLICY IF EXISTS zalo_replies_admin ON public.zalo_external_replies;
CREATE POLICY zalo_threads_admin ON public.zalo_external_threads FOR SELECT TO authenticated USING(public.is_admin_actor());
CREATE POLICY zalo_mirrors_scoped ON public.zalo_message_mirrors FOR SELECT TO authenticated
  USING(public.is_admin_actor() OR message_id IN(SELECT id FROM public.messages));
CREATE POLICY zalo_media_scoped ON public.zalo_media_references FOR SELECT TO authenticated
  USING(external_id IN(SELECT external_id FROM public.zalo_message_mirrors));
CREATE POLICY zalo_updates_scoped ON public.zalo_message_updates FOR SELECT TO authenticated
  USING(target_id IN(SELECT external_id FROM public.zalo_message_mirrors));
CREATE POLICY zalo_replies_admin ON public.zalo_external_replies FOR SELECT TO authenticated USING(public.is_admin_actor());

DO $$ BEGIN
  IF to_regprocedure('public.sync_mindup_zalo_message_text_v1(text,text,text,text,boolean,timestamptz,boolean)') IS NULL THEN
    ALTER FUNCTION public.sync_mindup_zalo_message(text,text,text,text,boolean,timestamptz,boolean) RENAME TO sync_mindup_zalo_message_text_v1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_mindup_zalo_message(
  p_external_id text,p_zalo_uid text,p_content text,p_display_name text DEFAULT NULL,
  p_is_self boolean DEFAULT false,p_sent_at timestamptz DEFAULT NULL,p_is_history boolean DEFAULT false
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE env jsonb; meta jsonb:='{}'; body text:=p_content; result text; mid uuid; target text; event_kind text;
  stamp timestamptz:=coalesce(p_sent_at,now()); reply public.zalo_external_replies;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF nullif(p_external_id,'') IS NULL OR length(p_external_id)>220 OR nullif(p_zalo_uid,'') IS NULL
    OR length(p_zalo_uid)>100 OR split_part(p_external_id,':',1)<>p_zalo_uid
    OR p_content IS NULL OR length(p_content)>10000 OR p_is_self IS NULL THEN RAISE EXCEPTION 'Invalid synchronized message'; END IF;
  IF stamp>now()+interval '5 minutes' THEN stamp:=now(); END IF;
  IF left(p_content,length('__ZALO_SYNC_V2__'))='__ZALO_SYNC_V2__' THEN
    env:=substring(p_content FROM length('__ZALO_SYNC_V2__')+1)::jsonb;
    IF env->>'version' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Invalid sync version'; END IF;
    event_kind:=env->>'event';
    IF event_kind='reply_result' THEN
      SELECT * INTO reply FROM public.zalo_external_replies WHERE id=(env->>'reply_id')::uuid FOR UPDATE;
      IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.zalo_external_threads WHERE id=reply.thread_id AND zalo_uid=p_zalo_uid)
        THEN RAISE EXCEPTION 'Invalid reply result'; END IF;
      IF reply.status='sent' THEN RETURN 'duplicate'; END IF;
      UPDATE public.zalo_external_replies SET status=CASE WHEN env->>'status'='sent' THEN 'sent' ELSE 'uncertain' END,
        external_id=env->>'external_id',error_message=left(env->>'error',500),updated_at=now() WHERE id=reply.id;
      IF env->>'status'='sent' THEN
        RETURN public.sync_mindup_zalo_message(env->>'external_id',p_zalo_uid,
          '__ZALO_SYNC_V2__'||jsonb_build_object('version',2,'event','message','text',reply.content,'metadata','{}'::jsonb)::text,p_display_name,true,stamp,false);
      END IF;
      RETURN 'received';
    ELSIF event_kind IN('undo','reaction','seen','delivered') THEN
      FOR target IN SELECT p_zalo_uid||':'||value FROM jsonb_array_elements_text(env->'targets') LOOP
        INSERT INTO public.zalo_message_updates(event_id,target_id,kind,actor,icon,occurred_at)
          VALUES(p_external_id,target,event_kind,left(coalesce(env->>'actor','peer'),100),left(env->>'icon',50),stamp) ON CONFLICT DO NOTHING;
        IF event_kind='undo' THEN
          UPDATE public.messages SET content='[Tin nhắn đã thu hồi]' WHERE external_message_id=target AND transport='zalo';
          UPDATE public.zalo_message_mirrors SET content='[Tin nhắn đã thu hồi]',metadata='{}' WHERE external_id=target;
          UPDATE public.zalo_media_references SET remote_url=NULL WHERE external_id=target;
        END IF;
      END LOOP;
      RETURN 'received';
    ELSIF event_kind IS DISTINCT FROM 'message' THEN RAISE EXCEPTION 'Invalid sync event'; END IF;
    body:=env->>'text'; meta:=coalesce(env->'metadata','{}');
  END IF;
  IF nullif(trim(body),'') IS NULL OR length(body)>10000 THEN RAISE EXCEPTION 'Empty message'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_external_id,0));
  INSERT INTO public.zalo_external_threads(zalo_uid,display_name,avatar) VALUES(p_zalo_uid,left(coalesce(p_display_name,''),200),meta->>'avatar')
    ON CONFLICT(zalo_uid) DO UPDATE SET display_name=coalesce(nullif(excluded.display_name,''),zalo_external_threads.display_name),
      avatar=coalesce(excluded.avatar,zalo_external_threads.avatar),updated_at=now();
  IF EXISTS(SELECT 1 FROM public.zalo_message_updates WHERE target_id=p_external_id AND kind='undo') THEN body:='[Tin nhắn đã thu hồi]'; meta:='{}'; env:=NULL; END IF;
  -- Media echoes have no reliable original caption. Do not race a sender ACK
  -- or match an outgoing image to a web message by its placeholder text.
  IF p_is_self AND meta->>'kind' IN('image','video','audio','file') AND (
    EXISTS(SELECT 1 FROM public.zalo_outbox o WHERE o.zalo_uid=p_zalo_uid AND o.status='processing')
    OR EXISTS(SELECT 1 FROM public.automatic_tuition_reminders a WHERE a.dispatch_uid=p_zalo_uid AND a.status='processing')
    OR EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries d JOIN public.zalo_parent_contacts c ON c.parent_id=d.parent_id WHERE c.zalo_uid=p_zalo_uid AND d.status='processing')
    OR EXISTS(SELECT 1 FROM public.zalo_tuition_receipts r JOIN public.zalo_parent_contacts c ON c.parent_id=r.parent_id WHERE c.zalo_uid=p_zalo_uid AND r.status='processing')
  ) THEN RETURN 'deferred'; END IF;
  IF EXISTS(SELECT 1 FROM public.zalo_verified_links WHERE zalo_uid=p_zalo_uid AND enabled) THEN
    result:=public.sync_mindup_zalo_message_text_v1(p_external_id,p_zalo_uid,body,p_display_name,p_is_self,stamp,p_is_history);
    IF result='deferred' THEN RETURN result; END IF;
    SELECT id INTO mid FROM public.messages WHERE external_message_id=p_external_id;
  ELSE
    INSERT INTO public.zalo_unmatched_inbox(external_id,zalo_uid,display_name,content)
      VALUES(p_external_id,p_zalo_uid,left(p_display_name,200),'') ON CONFLICT(external_id) DO NOTHING;
    result:=CASE WHEN p_is_history THEN 'history_imported' ELSE 'received' END;
  END IF;
  INSERT INTO public.zalo_message_mirrors(external_id,zalo_uid,message_id,content,is_self,sent_at,metadata)
    VALUES(p_external_id,p_zalo_uid,mid,body,p_is_self,stamp,meta)
    ON CONFLICT(external_id) DO UPDATE SET message_id=coalesce(excluded.message_id,zalo_message_mirrors.message_id),
      metadata=CASE WHEN excluded.metadata='{}'::jsonb THEN zalo_message_mirrors.metadata ELSE excluded.metadata END;
  IF env->'media'->>'url' IS NOT NULL THEN
    INSERT INTO public.zalo_media_references(external_id,remote_url,kind,filename)
      VALUES(p_external_id,env->'media'->>'url',env->'media'->>'kind',left(env->'media'->>'name',180))
      ON CONFLICT(external_id) DO UPDATE SET remote_url=excluded.remote_url;
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_mindup_zalo_message(text,text,text,text,boolean,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_mindup_zalo_message(text,text,text,text,boolean,timestamptz,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_zalo_message_mirrors() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; result text; n integer:=0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  FOR r IN SELECT m.*,t.display_name FROM public.zalo_message_mirrors m JOIN public.zalo_external_threads t USING(zalo_uid)
    JOIN public.zalo_verified_links l ON l.zalo_uid=m.zalo_uid AND l.enabled WHERE m.message_id IS NULL ORDER BY m.sent_at LIMIT 200 LOOP
    result:=public.sync_mindup_zalo_message_text_v1(r.external_id,r.zalo_uid,r.content,r.display_name,r.is_self,r.sent_at,true);
    IF result<>'deferred' THEN UPDATE public.zalo_message_mirrors SET message_id=(SELECT id FROM public.messages WHERE external_message_id=r.external_id) WHERE external_id=r.external_id; n:=n+1; END IF;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_zalo_message_mirrors() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_zalo_message_mirrors() TO service_role;
DO $$ BEGIN
  IF to_regprocedure('public.get_mindup_zalo_sync_state_v1()') IS NULL THEN
    ALTER FUNCTION public.get_mindup_zalo_sync_state() RENAME TO get_mindup_zalo_sync_state_v1;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_mindup_zalo_sync_state() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  PERFORM public.reconcile_zalo_message_mirrors();
  RETURN public.get_mindup_zalo_sync_state_v1();
END;
$$;
REVOKE ALL ON FUNCTION public.get_mindup_zalo_sync_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_mindup_zalo_sync_state() TO service_role;

CREATE OR REPLACE FUNCTION public.list_zalo_external_inbox() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin_actor() THEN RETURN '[]'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY last_at DESC) FROM (
    SELECT t.id,t.display_name,t.avatar,last.content AS last_content,last.sent_at AS last_at,
      (SELECT max(sent_at) FROM public.zalo_message_mirrors WHERE zalo_uid=t.zalo_uid AND NOT is_self) AS last_parent_at,
      coalesce((SELECT max(sent_at) FROM public.zalo_message_mirrors WHERE zalo_uid=t.zalo_uid AND NOT is_self),'-infinity'::timestamptz)>
      coalesce((SELECT max(sent_at) FROM public.zalo_message_mirrors WHERE zalo_uid=t.zalo_uid AND is_self),'-infinity'::timestamptz) AS waiting_reply
    FROM public.zalo_external_threads t CROSS JOIN LATERAL(SELECT content,sent_at FROM public.zalo_message_mirrors WHERE zalo_uid=t.zalo_uid ORDER BY sent_at DESC,external_id DESC LIMIT 1) last
    WHERE NOT EXISTS(SELECT 1 FROM public.zalo_verified_links WHERE zalo_uid=t.zalo_uid AND enabled)
  )x),'[]');
END;
$$;
CREATE OR REPLACE FUNCTION public.list_zalo_contact_profiles()
RETURNS TABLE(parent_id uuid,display_name text,avatar text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN('admin','teacher')) THEN RETURN; END IF;
  RETURN QUERY SELECT l.audience_user_id,t.display_name,t.avatar FROM public.zalo_verified_links l JOIN public.zalo_external_threads t USING(zalo_uid)
    WHERE l.enabled AND l.audience_user_id IN(SELECT i.parent_id FROM public.list_mindup_parent_inbox() i);
END;
$$;
REVOKE ALL ON FUNCTION public.list_zalo_contact_profiles() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_zalo_contact_profiles() TO authenticated;
DROP FUNCTION IF EXISTS public.list_zalo_external_messages(uuid,timestamptz);
CREATE OR REPLACE FUNCTION public.list_zalo_external_messages(p_thread uuid,p_before timestamptz DEFAULT NULL,p_before_id text DEFAULT NULL)
RETURNS SETOF public.zalo_message_mirrors LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin_actor() THEN RAISE EXCEPTION 'Admin required'; END IF;
  RETURN QUERY SELECT m.* FROM public.zalo_message_mirrors m JOIN public.zalo_external_threads t USING(zalo_uid)
    WHERE t.id=p_thread AND (p_before IS NULL OR m.sent_at<p_before OR (m.sent_at=p_before AND p_before_id IS NOT NULL AND m.external_id<p_before_id))
    ORDER BY m.sent_at DESC,m.external_id DESC LIMIT 100;
END;
$$;
CREATE OR REPLACE FUNCTION public.zalo_message_states(p_ids text[]) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT coalesce(jsonb_object_agg(m.external_id,jsonb_build_object('metadata',m.metadata,
    'revoked',EXISTS(SELECT 1 FROM public.zalo_message_updates WHERE target_id=m.external_id AND kind='undo'),
    'seen',EXISTS(SELECT 1 FROM public.zalo_message_updates WHERE target_id=m.external_id AND kind='seen'),
    'delivered',EXISTS(SELECT 1 FROM public.zalo_message_updates WHERE target_id=m.external_id AND kind IN('seen','delivered')),
    'reactions',(SELECT coalesce(jsonb_agg(x.icon),'[]') FROM (SELECT DISTINCT ON(actor) icon FROM public.zalo_message_updates WHERE target_id=m.external_id AND kind='reaction' ORDER BY actor,occurred_at DESC,event_id DESC)x WHERE coalesce(x.icon,'')<>'')
  )),'{}') FROM public.zalo_message_mirrors m WHERE m.external_id=ANY(p_ids);
$$;
CREATE OR REPLACE FUNCTION public.resolve_zalo_media(p_external_id text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT jsonb_build_object('url',r.remote_url,'kind',r.kind,'name',r.filename) FROM public.zalo_media_references r
    WHERE r.external_id=p_external_id AND r.remote_url IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.zalo_message_updates WHERE target_id=r.external_id AND kind='undo');
$$;
CREATE OR REPLACE FUNCTION public.reserve_zalo_external_reply(p_thread uuid,p_id uuid,p_content text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid text; existing public.zalo_external_replies;
BEGIN
  IF NOT public.is_admin_actor() THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF length(trim(p_content)) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Invalid content'; END IF;
  SELECT zalo_uid INTO uid FROM public.zalo_external_threads WHERE id=p_thread FOR UPDATE;
  IF uid IS NULL OR EXISTS(SELECT 1 FROM public.zalo_verified_links WHERE zalo_uid=uid AND enabled) THEN RAISE EXCEPTION 'Conversation linked or unavailable; refresh inbox'; END IF;
  SELECT * INTO existing FROM public.zalo_external_replies WHERE id=p_id;
  IF FOUND THEN RETURN jsonb_build_object('claimed',false,'status',existing.status); END IF;
  INSERT INTO public.zalo_external_replies(id,thread_id,content,created_by) VALUES(p_id,p_thread,p_content,auth.uid());
  RETURN jsonb_build_object('claimed',true,'uid',uid);
END;
$$;
REVOKE ALL ON FUNCTION public.list_zalo_external_inbox(),public.list_zalo_external_messages(uuid,timestamptz,text),public.zalo_message_states(text[]),public.resolve_zalo_media(text),public.reserve_zalo_external_reply(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_zalo_external_inbox(),public.list_zalo_external_messages(uuid,timestamptz,text),public.zalo_message_states(text[]),public.resolve_zalo_media(text),public.reserve_zalo_external_reply(uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
