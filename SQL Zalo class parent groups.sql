BEGIN;
DO $$DECLARE r record;BEGIN
 FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='public.conversations'::regclass AND contype='c' AND pg_get_constraintdef(oid)=$c$CHECK ((kind = 'direct'::text))$c$ LOOP
  EXECUTE format('ALTER TABLE public.conversations DROP CONSTRAINT %I',r.conname);
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.conversations'::regclass AND conname='conversations_zalo_kind_check') THEN
  ALTER TABLE public.conversations ADD CONSTRAINT conversations_zalo_kind_check CHECK(kind IN('direct','group'));
 END IF;
END;$$;
CREATE TABLE IF NOT EXISTS public.zalo_class_groups(
 class_id uuid PRIMARY KEY REFERENCES public.classes(id),conversation_id uuid NOT NULL UNIQUE REFERENCES public.conversations(id),
 group_uid text UNIQUE,group_name text NOT NULL,avatar text,status text NOT NULL DEFAULT 'pending',
 member_report jsonb NOT NULL DEFAULT '[]',error_message text,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.zalo_class_group_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id uuid NOT NULL REFERENCES public.zalo_class_groups(class_id),
 kind text NOT NULL CHECK(kind IN('setup','send')),requested_by uuid NOT NULL REFERENCES public.users(id),
 request_key uuid NOT NULL UNIQUE,message_id uuid REFERENCES public.messages(id),content text,
 status text NOT NULL DEFAULT 'pending',token uuid,locked_until timestamptz,error_message text,result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS zalo_class_group_pending ON public.zalo_class_group_jobs(status,created_at);
CREATE TABLE IF NOT EXISTS public.zalo_class_group_control(id integer PRIMARY KEY CHECK(id=1),create_blocked_until timestamptz,last_error text);
INSERT INTO public.zalo_class_group_control(id) VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE public.zalo_class_group_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zalo_class_group_control FROM PUBLIC,anon,authenticated;
ALTER TABLE public.zalo_class_group_jobs ADD COLUMN IF NOT EXISTS member_snapshot jsonb;
CREATE TABLE IF NOT EXISTS public.zalo_class_group_events(
 external_id text PRIMARY KEY,class_id uuid NOT NULL REFERENCES public.zalo_class_groups(class_id),
 message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
 actor_uid text,sender_name text,is_self boolean NOT NULL,metadata jsonb NOT NULL DEFAULT '{}',remote_url text);
CREATE TABLE IF NOT EXISTS public.zalo_class_group_recalls(class_id uuid REFERENCES public.zalo_class_groups(class_id),external_id text PRIMARY KEY);
ALTER TABLE public.zalo_class_group_recalls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zalo_class_group_recalls FROM PUBLIC,anon,authenticated;
ALTER TABLE public.zalo_class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_class_group_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_class_group_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zalo_class_groups,public.zalo_class_group_jobs,public.zalo_class_group_events FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.can_access_zalo_class_group(p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.is_admin_actor() OR EXISTS(
  SELECT 1 FROM public.class_teachers ct WHERE ct.class_id=p_class AND ct.teacher_id=auth.uid()));
$$;
GRANT SELECT ON public.zalo_class_groups TO authenticated;
DROP POLICY IF EXISTS zalo_class_groups_scoped_read ON public.zalo_class_groups;
CREATE POLICY zalo_class_groups_scoped_read ON public.zalo_class_groups FOR SELECT TO authenticated USING(public.can_access_zalo_class_group(class_id));
CREATE OR REPLACE FUNCTION public.is_zalo_class_conversation(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM public.zalo_class_groups WHERE conversation_id=p_id)$$;
CREATE OR REPLACE FUNCTION public.zalo_class_conversation_access(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.zalo_class_groups WHERE conversation_id=p_id)
  OR EXISTS(SELECT 1 FROM public.zalo_class_groups WHERE conversation_id=p_id AND public.can_access_zalo_class_group(class_id));
$$;
CREATE OR REPLACE FUNCTION public.zalo_class_parent_members(p_class uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'name',u.full_name,'uid',l.zalo_uid) ORDER BY u.id),'[]')
 FROM public.users u LEFT JOIN public.zalo_verified_links l ON l.audience_user_id=u.id AND l.enabled
 WHERE u.role::text='parent' AND EXISTS(SELECT 1 FROM public.parent_students ps JOIN public.class_students cs ON cs.student_id=ps.student_id
  WHERE ps.parent_id=u.id AND ps.revoked_at IS NULL AND cs.class_id=p_class
   AND (cs.joined_at IS NULL OR cs.joined_at<=now()) AND (cs.left_at IS NULL OR cs.left_at>now()));
$$;
CREATE OR REPLACE FUNCTION public.queue_zalo_class_groups(p_class uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record;cid uuid;n integer:=0;
BEGIN
 IF NOT public.is_admin_actor() THEN RAISE EXCEPTION 'Chỉ admin được tạo/cập nhật nhóm lớp'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('zalo-class-groups',0));
 FOR c IN SELECT * FROM public.classes WHERE NOT coalesce(hidden,false) AND (p_class IS NULL OR id=p_class)
  AND jsonb_array_length(public.zalo_class_parent_members(id))>0 LOOP
  IF NOT EXISTS(SELECT 1 FROM public.zalo_class_groups WHERE class_id=c.id) THEN
   INSERT INTO public.conversations(kind,direct_key) VALUES('group','zalo_class_parents:'||c.id) RETURNING id INTO cid;
   INSERT INTO public.zalo_class_groups(class_id,conversation_id,group_name)
    VALUES(c.id,cid,'MindUp - PH '||left(c.class_name,75)||' ['||left(c.id::text,6)||']');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.zalo_class_group_jobs WHERE class_id=c.id AND kind='setup' AND status IN('pending','processing','uncertain','limited')) THEN
   INSERT INTO public.zalo_class_group_jobs(class_id,kind,requested_by,request_key) VALUES(c.id,'setup',auth.uid(),gen_random_uuid());
   UPDATE public.zalo_class_groups SET status='pending',error_message=NULL WHERE class_id=c.id;n:=n+1;
  END IF;
 END LOOP;
 RETURN n;
END;$$;
CREATE OR REPLACE FUNCTION public.list_zalo_class_groups()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.last_at DESC NULLS LAST,x.class_name),'[]') FROM(
  SELECT g.class_id,g.conversation_id,g.group_name,g.avatar,
   CASE WHEN g.group_uid IS NULL AND g.status IN('pending','limited') AND ctl.create_blocked_until>now() THEN 'limited' ELSE g.status END AS status,
   coalesce(g.error_message,CASE WHEN g.group_uid IS NULL AND ctl.create_blocked_until>now() THEN ctl.last_error END) AS error_message,
   CASE WHEN g.group_uid IS NULL AND g.status IN('pending','limited') AND ctl.create_blocked_until>now() THEN ctl.create_blocked_until END AS retry_after,c.class_name,
   g.group_uid IS NOT NULL AS connected,g.member_report,lm.content AS last_content,lm.created_at AS last_at,
   (SELECT count(*) FROM public.notifications n WHERE n.user_id=auth.uid() AND n.type='message_new' AND n.ref_id=g.conversation_id AND NOT n.is_read) AS unread_count,
   (SELECT coalesce(jsonb_agg(jsonb_build_object('name',m->>'name','status',coalesce((SELECT r->>'status' FROM jsonb_array_elements(g.member_report)r WHERE r->>'user_id'=m->>'user_id'),CASE WHEN m->>'uid' IS NULL THEN 'missing_link' ELSE 'pending' END))),'[]') FROM jsonb_array_elements(public.zalo_class_parent_members(g.class_id))m) AS members
  FROM public.zalo_class_groups g JOIN public.classes c ON c.id=g.class_id CROSS JOIN public.zalo_class_group_control ctl
  LEFT JOIN LATERAL(SELECT content,created_at FROM public.messages WHERE conversation_id=g.conversation_id ORDER BY created_at DESC,id DESC LIMIT 1)lm ON true
  WHERE public.can_access_zalo_class_group(g.class_id) AND NOT coalesce(c.hidden,false)
 )x;
$$;
CREATE OR REPLACE FUNCTION public.class_group_worker_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('class_id',class_id,'group_uid',group_uid)),'[]') FROM public.zalo_class_groups WHERE group_uid IS NOT NULL);
END;$$;
CREATE OR REPLACE FUNCTION public.claim_zalo_class_group_job()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE j public.zalo_class_group_jobs;g public.zalo_class_groups;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('zalo-class-group-worker',0));
 UPDATE public.zalo_class_group_jobs SET status='uncertain',error_message='Bot bị gián đoạn; cần kiểm tra Zalo trước khi chạy lại',updated_at=now() WHERE status='processing' AND locked_until<now();
 IF EXISTS(SELECT 1 FROM public.zalo_class_group_jobs WHERE status='processing') THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 AND NOT paused)
  OR NOT EXISTS(SELECT 1 FROM public.zalo_automation_state WHERE id=1 AND NOT paused) THEN RETURN NULL; END IF;
 SELECT jobs.* INTO j FROM public.zalo_class_group_jobs jobs JOIN public.zalo_class_groups groups ON groups.class_id=jobs.class_id
 WHERE jobs.status IN('pending','limited') AND (jobs.kind<>'setup' OR groups.group_uid IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM public.zalo_class_group_control WHERE create_blocked_until>now()))
 ORDER BY jobs.created_at,jobs.id LIMIT 1 FOR UPDATE OF jobs SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO g FROM public.zalo_class_groups WHERE class_id=j.class_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.classes WHERE id=j.class_id AND NOT coalesce(hidden,false))
  OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=j.requested_by AND (role::text='admin' OR (j.kind='send' AND EXISTS(SELECT 1 FROM public.class_teachers WHERE class_id=j.class_id AND teacher_id=j.requested_by)))) THEN
  UPDATE public.zalo_class_group_jobs SET status='cancelled',error_message='Lớp hoặc quyền người gửi đã thay đổi' WHERE id=j.id;RETURN NULL;
 END IF;
 UPDATE public.zalo_class_group_jobs SET status='processing',token=gen_random_uuid(),locked_until=now()+interval '5 minutes',member_snapshot=public.zalo_class_parent_members(j.class_id),updated_at=now() WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j)||jsonb_build_object('group_uid',g.group_uid,'group_name',g.group_name,'members',public.zalo_class_parent_members(j.class_id));
END;$$;
CREATE OR REPLACE FUNCTION public.validate_zalo_class_group_job(p_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 RETURN EXISTS(SELECT 1 FROM public.zalo_class_group_jobs j JOIN public.classes c ON c.id=j.class_id JOIN public.users u ON u.id=j.requested_by
  WHERE j.id=p_id AND j.token=p_token AND j.status='processing' AND j.locked_until>now() AND NOT coalesce(c.hidden,false)
   AND (u.role::text='admin' OR (j.kind='send' AND EXISTS(SELECT 1 FROM public.class_teachers WHERE class_id=j.class_id AND teacher_id=u.id)))
   AND (j.kind='send' OR j.member_snapshot=public.zalo_class_parent_members(j.class_id)))
  AND EXISTS(SELECT 1 FROM public.zalo_automation_state WHERE id=1 AND NOT paused) AND EXISTS(SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 AND NOT paused);
END;$$;
CREATE OR REPLACE FUNCTION public.finish_zalo_class_group_job(p_id uuid,p_token uuid,p_status text,p_result jsonb,p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.zalo_class_group_jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF p_status NOT IN('sent','failed','uncertain','limited') OR length(p_result::text)>100000 THEN RAISE EXCEPTION 'Invalid result'; END IF;
 SELECT * INTO j FROM public.zalo_class_group_jobs WHERE id=p_id AND token=p_token FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid task lease'; END IF;
 IF j.status='sent' OR (j.status='limited' AND p_status='limited') THEN RETURN; END IF;
 IF j.status NOT IN('processing','uncertain') THEN RAISE EXCEPTION 'Task not claimed'; END IF;
 IF p_status='limited' THEN
  IF j.kind<>'setup' OR EXISTS(SELECT 1 FROM public.zalo_class_groups WHERE class_id=j.class_id AND group_uid IS NOT NULL) THEN RAISE EXCEPTION 'Invalid creation quota result'; END IF;
  UPDATE public.zalo_class_group_control SET create_blocked_until=now()+interval '24 hours',last_error=left(p_error,500) WHERE id=1;
 END IF;
 IF j.kind='setup' AND p_status='sent' THEN
  IF coalesce(p_result->>'group_uid','') !~ '^[0-9]{1,100}$' OR jsonb_typeof(p_result->'members')<>'array' THEN RAISE EXCEPTION 'Invalid group result'; END IF;
  UPDATE public.zalo_class_groups SET group_uid=p_result->>'group_uid',avatar=p_result->>'avatar',member_report=p_result->'members',
   status=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(p_result->'members')m WHERE m->>'status'<>'joined') THEN 'partial' ELSE 'ready' END,error_message=NULL,updated_at=now() WHERE class_id=j.class_id;
 ELSIF j.kind='setup' THEN
  UPDATE public.zalo_class_groups SET status=p_status,error_message=left(p_error,500),updated_at=now() WHERE class_id=j.class_id;
 END IF;
 IF j.kind='send' AND p_status='sent' THEN
  IF coalesce(p_result->>'external_id','') NOT LIKE (SELECT group_uid||':%' FROM public.zalo_class_groups WHERE class_id=j.class_id) THEN RAISE EXCEPTION 'Invalid message acknowledgement'; END IF;
  UPDATE public.messages SET external_message_id=p_result->>'external_id' WHERE id=j.message_id;
 END IF;
 UPDATE public.zalo_class_group_jobs SET status=p_status,result=p_result,error_message=left(p_error,500),locked_until=NULL,updated_at=now() WHERE id=j.id;
END;$$;
-- Preserve explicitly requested work when a bot version previously recorded the daily quota as a failure.
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM public.zalo_class_group_jobs WHERE kind='setup' AND status='failed' AND error_message LIKE '%đạt giới hạn tạo nhóm%') THEN
  UPDATE public.zalo_class_group_control SET create_blocked_until=greatest(create_blocked_until,now()+interval '24 hours'),last_error='Bạn đã đạt giới hạn tạo nhóm trong ngày.' WHERE id=1;
  UPDATE public.zalo_class_group_jobs SET status='limited' WHERE kind='setup' AND status='failed' AND error_message LIKE '%đạt giới hạn tạo nhóm%';
  UPDATE public.zalo_class_groups SET status='limited' WHERE group_uid IS NULL AND class_id IN(SELECT class_id FROM public.zalo_class_group_jobs WHERE status='limited');
 END IF;
END;$$;
CREATE OR REPLACE FUNCTION public.send_zalo_class_group_message(p_class uuid,p_request uuid,p_content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.zalo_class_groups;mid uuid;
BEGIN
 IF NOT public.can_access_zalo_class_group(p_class) THEN RAISE EXCEPTION 'Không có quyền gửi vào nhóm lớp'; END IF;
 IF p_request IS NULL OR nullif(trim(p_content),'') IS NULL OR length(p_content)>5000 OR p_content ~ '__[A-Z_]+__' THEN RAISE EXCEPTION 'Nội dung không hợp lệ'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT message_id INTO mid FROM public.zalo_class_group_jobs WHERE request_key=p_request AND requested_by=auth.uid() AND class_id=p_class AND content=p_content;
 IF FOUND THEN RETURN mid; END IF;
 SELECT * INTO g FROM public.zalo_class_groups WHERE class_id=p_class AND group_uid IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Nhóm Zalo chưa được tạo hoặc chưa liên kết'; END IF;
 INSERT INTO public.messages(conversation_id,sender_id,real_sender_id,content,transport) VALUES(g.conversation_id,'00000000-0000-0000-0000-000000000001',auth.uid(),p_content,'web') RETURNING id INTO mid;
 INSERT INTO public.zalo_class_group_jobs(class_id,kind,requested_by,request_key,message_id,content) VALUES(p_class,'send',auth.uid(),p_request,mid,p_content);
 RETURN mid;
END;$$;
CREATE OR REPLACE FUNCTION public.list_zalo_class_group_messages(p_class uuid,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$BEGIN
 IF NOT public.can_access_zalo_class_group(p_class) THEN RAISE EXCEPTION 'Không có quyền đọc nhóm lớp'; END IF;
 RETURN(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]') FROM(
  SELECT m.*,coalesce(e.sender_name,u.full_name,'Trung tâm MindUp') AS group_sender_name,coalesce(e.is_self,true) AS group_is_self,e.metadata,
   j.status AS group_send_status,j.error_message AS group_send_error
  FROM public.messages m JOIN public.zalo_class_groups g ON g.conversation_id=m.conversation_id
  LEFT JOIN public.zalo_class_group_events e ON e.message_id=m.id LEFT JOIN public.users u ON u.id=m.real_sender_id
  LEFT JOIN public.zalo_class_group_jobs j ON j.message_id=m.id
  WHERE g.class_id=p_class AND (p_before IS NULL OR (m.created_at,m.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  ORDER BY m.created_at DESC,m.id DESC LIMIT 40)x);
END;$$;
CREATE OR REPLACE FUNCTION public.sync_zalo_class_group_event(p_event jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE g public.zalo_class_groups;e jsonb;mid uuid;stamp timestamptz;target text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 SELECT * INTO g FROM public.zalo_class_groups WHERE group_uid=p_event->>'zaloUid';IF NOT FOUND THEN RETURN 'ignored_group'; END IF;
 IF length(p_event::text)>16000 OR coalesce(p_event->>'externalId','') NOT LIKE g.group_uid||':%' THEN RAISE EXCEPTION 'Invalid group event'; END IF;
 e:=substring(p_event->>'content' FROM 17)::jsonb;
 IF e->>'version'<>'2' THEN RAISE EXCEPTION 'Invalid group envelope'; END IF;
 IF e->>'event'='undo' THEN
  FOR target IN SELECT jsonb_array_elements_text(e->'targets') LOOP
   INSERT INTO public.zalo_class_group_recalls VALUES(g.class_id,g.group_uid||':'||target) ON CONFLICT DO NOTHING;
   UPDATE public.messages SET content='[Tin nhắn đã thu hồi]' WHERE id IN(SELECT message_id FROM public.zalo_class_group_events WHERE class_id=g.class_id AND external_id=g.group_uid||':'||target);
   UPDATE public.zalo_class_group_events SET metadata='{}',remote_url=NULL WHERE class_id=g.class_id AND external_id=g.group_uid||':'||target;
  END LOOP;RETURN 'recalled';
 END IF;
 IF e->>'event'<>'message' THEN RETURN 'ignored_update'; END IF;
 IF EXISTS(SELECT 1 FROM public.zalo_class_group_recalls WHERE external_id=p_event->>'externalId') THEN e:=jsonb_set(jsonb_set(e,'{text}','"[Tin nhắn đã thu hồi]"'),'{metadata}','{}')-'media'; END IF;
 IF nullif(trim(e->>'text'),'') IS NULL OR length(e->>'text')>10000 THEN RAISE EXCEPTION 'Empty group message'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_event->>'externalId',0));
 IF EXISTS(SELECT 1 FROM public.messages WHERE external_message_id=p_event->>'externalId') THEN RETURN 'duplicate'; END IF;
 IF (p_event->>'isSelf')::boolean AND EXISTS(SELECT 1 FROM public.zalo_class_group_jobs WHERE class_id=g.class_id AND kind='send' AND status IN('processing','uncertain') AND content=e->>'text') THEN RETURN 'deferred'; END IF;
 stamp:=least(coalesce((p_event->>'sentAt')::timestamptz,now()),now());
 INSERT INTO public.messages(conversation_id,sender_id,content,transport,external_message_id,created_at)
 VALUES(g.conversation_id,'00000000-0000-0000-0000-000000000001',e->>'text','zalo',p_event->>'externalId',stamp) RETURNING id INTO mid;
 INSERT INTO public.zalo_class_group_events VALUES(p_event->>'externalId',g.class_id,mid,p_event->>'actorUid',left(p_event->>'displayName',200),(p_event->>'isSelf')::boolean,coalesce(e->'metadata','{}'),e->'media'->>'url');
 IF NOT (p_event->>'isSelf')::boolean AND NOT coalesce((p_event->>'isHistory')::boolean,false) THEN
  INSERT INTO public.notifications(user_id,actor_id,type,ref_id,target_url,message)
  SELECT u.id,'00000000-0000-0000-0000-000000000001','message_new',g.conversation_id,'messages.html',left(e->>'text',240) FROM public.users u
   WHERE u.role::text='admin' OR EXISTS(SELECT 1 FROM public.class_teachers ct WHERE ct.class_id=g.class_id AND ct.teacher_id=u.id);
 END IF;
 RETURN 'received';
END;$$;
DROP POLICY IF EXISTS messages_zalo_class_select ON public.messages;
CREATE POLICY messages_zalo_class_select ON public.messages FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.zalo_class_groups g WHERE g.conversation_id=messages.conversation_id AND public.can_access_zalo_class_group(g.class_id)));
-- Group rows are read/sent through scoped RPCs, not arbitrary client INSERTs.
DROP POLICY IF EXISTS messages_zalo_class_insert_guard ON public.messages;
CREATE POLICY messages_zalo_class_insert_guard ON public.messages AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(NOT public.is_zalo_class_conversation(conversation_id));
DROP POLICY IF EXISTS messages_zalo_class_read_guard ON public.messages;
CREATE POLICY messages_zalo_class_read_guard ON public.messages AS RESTRICTIVE FOR SELECT TO authenticated USING(public.zalo_class_conversation_access(conversation_id));
GRANT SELECT ON public.zalo_class_group_events TO authenticated;
DROP POLICY IF EXISTS zalo_class_events_scoped_read ON public.zalo_class_group_events;
CREATE POLICY zalo_class_events_scoped_read ON public.zalo_class_group_events FOR SELECT TO authenticated USING(public.can_access_zalo_class_group(class_id));
DO $$BEGIN
 IF to_regprocedure('public.resolve_zalo_media_before_class_groups(text)') IS NULL AND to_regprocedure('public.resolve_zalo_media(text)') IS NOT NULL THEN
  ALTER FUNCTION public.resolve_zalo_media(text) RENAME TO resolve_zalo_media_before_class_groups;
 END IF;
END;$$;
CREATE OR REPLACE FUNCTION public.resolve_zalo_media(p_external_id text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT jsonb_build_object('url',remote_url,'kind',metadata->>'kind','name',metadata->'media'->>'name') FROM public.zalo_class_group_events
 WHERE external_id=p_external_id AND remote_url IS NOT NULL AND public.can_access_zalo_class_group(class_id)
 UNION ALL SELECT public.resolve_zalo_media_before_class_groups(p_external_id) WHERE NOT EXISTS(SELECT 1 FROM public.zalo_class_group_events WHERE external_id=p_external_id);
$$;
REVOKE ALL ON FUNCTION public.resolve_zalo_media(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_zalo_media(text) TO authenticated;
-- Keep group history on the same checksum-confirmed local archive as private chats.
DO $archive$DECLARE source text;BEGIN
 IF to_regprocedure('public.local_zalo_storage_cycle(uuid,jsonb,jsonb)') IS NOT NULL THEN
  source:=pg_get_functiondef('public.local_zalo_storage_cycle(uuid,jsonb,jsonb)'::regprocedure);
  IF position('zalo_class_groups' IN source)=0 THEN EXECUTE replace(source,'public.is_mindup_official_direct_key(c.direct_key)','(public.is_mindup_official_direct_key(c.direct_key) OR EXISTS(SELECT 1 FROM public.zalo_class_groups cg WHERE cg.conversation_id=c.id))');END IF;
 END IF;
 IF to_regprocedure('public.allowed_local_zalo_keys(text[])') IS NOT NULL THEN
  source:=pg_get_functiondef('public.allowed_local_zalo_keys(text[])'::regprocedure);
  IF position('zalo_class_groups' IN source)=0 THEN EXECUTE replace(source,'UNION SELECT ''z:''',$r$UNION SELECT 'm:'||m.id::text FROM public.messages m JOIN public.zalo_class_groups cg ON cg.conversation_id=m.conversation_id WHERE 'm:'||m.id::text=ANY(p_keys) AND public.can_access_zalo_class_group(cg.class_id) UNION SELECT 'z:'$r$);END IF;
 END IF;
END;$archive$;
DO $acl$DECLARE r record;BEGIN
 FOR r IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('can_access_zalo_class_group','is_zalo_class_conversation','zalo_class_conversation_access','zalo_class_parent_members','queue_zalo_class_groups','list_zalo_class_groups','class_group_worker_state','claim_zalo_class_group_job','validate_zalo_class_group_job','finish_zalo_class_group_job','send_zalo_class_group_message','list_zalo_class_group_messages','sync_zalo_class_group_event') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);
  IF r.proname IN('can_access_zalo_class_group','is_zalo_class_conversation','zalo_class_conversation_access','queue_zalo_class_groups','list_zalo_class_groups','send_zalo_class_group_message','list_zalo_class_group_messages') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.signature);END IF;
 END LOOP;
END;$acl$;
NOTIFY pgrst,'reload schema';
COMMIT;
