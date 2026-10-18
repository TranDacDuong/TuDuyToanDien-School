BEGIN;
INSERT INTO public.app_permissions(permission_key,section,label,description,sort_order) VALUES
 ('messages.automation.manage','Tin nhắn','Quản lý tin tự động','Tạo và quản lý tin theo lịch trong phạm vi phụ trách.',610),
 ('messages.automation.all','Tin nhắn','Gửi tự động toàn trung tâm','Chọn người nhận ngoài các lớp được phân công.',611)
ON CONFLICT(permission_key) DO NOTHING;
INSERT INTO public.role_permission_defaults(role_name,permission_key,allowed)
 VALUES('teacher','messages.automation.manage',true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.message_campaigns (
 id uuid PRIMARY KEY,created_by uuid NOT NULL REFERENCES public.users(id),name text NOT NULL,
 template text NOT NULL,send_at timestamptz NOT NULL,recurrence text NOT NULL CHECK(recurrence IN('once','yearly')),
 window_hours integer NOT NULL DEFAULT 24 CHECK(window_hours BETWEEN 1 AND 168),
 class_ids uuid[] NOT NULL DEFAULT '{}',parent_ids uuid[] NOT NULL DEFAULT '{}',excluded_ids uuid[] NOT NULL DEFAULT '{}',
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','scheduled','paused','cancelled','finished')),
 next_run_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.message_campaign_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid NOT NULL REFERENCES public.message_campaigns(id),
 scheduled_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,state text NOT NULL DEFAULT 'queued',
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(campaign_id,scheduled_at)
);
CREATE TABLE IF NOT EXISTS public.message_campaign_recipients (
 run_id uuid NOT NULL REFERENCES public.message_campaign_runs(id),parent_id uuid NOT NULL REFERENCES public.users(id),
 student_ids uuid[] NOT NULL,content text NOT NULL,outbox_id uuid UNIQUE REFERENCES public.zalo_outbox(id),
 error_message text,PRIMARY KEY(run_id,parent_id)
);
CREATE INDEX IF NOT EXISTS message_campaign_due ON public.message_campaigns(next_run_at) WHERE state='scheduled';
ALTER TABLE public.zalo_outbox ADD COLUMN IF NOT EXISTS automation_paused boolean NOT NULL DEFAULT false;
ALTER TABLE public.message_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_campaign_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_campaign_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_campaigns,public.message_campaign_runs,public.message_campaign_recipients FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_message_campaigns(p_actor uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
 SELECT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_actor
  AND u.role::text IN('admin','teacher','assistant','marketing','accountant','staff')
  AND public.has_app_permission('messages.automation.manage',p_actor));
$$;

CREATE OR REPLACE FUNCTION public.message_campaign_targets(p_actor uuid,p_classes uuid[],p_parents uuid[],p_excluded uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
 WITH allowed AS (
 SELECT DISTINCT p.id AS parent_id,p.full_name AS parent_name,s.id AS student_id,s.full_name AS student_name,c.id AS class_id,c.class_name
 FROM public.parent_students ps JOIN public.users p ON p.id=ps.parent_id AND p.role::text='parent'
 JOIN public.users s ON s.id=ps.student_id AND s.role::text='student'
 JOIN public.class_students cs ON cs.student_id=s.id JOIN public.classes c ON c.id=cs.class_id
 WHERE public.can_manage_message_campaigns(p_actor) AND ps.revoked_at IS NULL AND NOT coalesce(c.hidden,false)
 AND (cs.joined_at IS NULL OR cs.joined_at::date<=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
 AND (cs.left_at IS NULL OR cs.left_at::date>=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
 AND (public.has_app_permission('messages.automation.all',p_actor) OR EXISTS(SELECT 1 FROM public.class_teachers ct WHERE ct.class_id=c.id AND ct.teacher_id=p_actor))
 AND (cardinality(p_classes)=0 OR c.id=ANY(p_classes))
 AND (cardinality(p_parents)=0 OR p.id=ANY(p_parents)) AND NOT p.id=ANY(p_excluded)
 ), grouped AS (
 SELECT parent_id,parent_name,array_agg(DISTINCT student_id) AS student_ids,
 string_agg(DISTINCT student_name,' và ' ORDER BY student_name) AS students,
 string_agg(DISTINCT class_name,', ' ORDER BY class_name) AS classes
 FROM allowed GROUP BY parent_id,parent_name)
 SELECT coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('linked',EXISTS(SELECT 1 FROM public.zalo_verified_links l WHERE l.audience_user_id=g.parent_id AND l.enabled)) ORDER BY g.parent_name),'[]'::jsonb) FROM grouped g;
$$;

CREATE OR REPLACE FUNCTION public.render_message_campaign(p_template text,p_recipient jsonb,p_date timestamptz)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE result text:=p_template; token text;
BEGIN
 IF length(trim(coalesce(p_template,''))) NOT BETWEEN 1 AND 4000 OR p_template ~ '__(ACTION|CHART|EVALUATION|CHAT_IMAGE|ZALO_SYNC)' THEN RAISE EXCEPTION 'Nội dung không hợp lệ'; END IF;
 FOR token IN SELECT (regexp_matches(p_template,'\[([^\[\]]+)\]','g'))[1] LOOP
  IF NOT token=ANY(ARRAY['Ten_hoc_sinh','Ten_phu_huynh','Ten_lop','Ngay_gui','Ten_trung_tam']) THEN RAISE EXCEPTION 'Biến không hỗ trợ: %',token; END IF;
 END LOOP;
 result:=replace(result,'[Ten_hoc_sinh]',coalesce(p_recipient->>'students',''));
 result:=replace(result,'[Ten_phu_huynh]',coalesce(p_recipient->>'parent_name',''));
 result:=replace(result,'[Ten_lop]',coalesce(p_recipient->>'classes',''));
 result:=replace(result,'[Ngay_gui]',to_char(p_date AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY'));
 result:=replace(result,'[Ten_trung_tam]','Trung tâm MindUp');
 IF length(result)>5000 THEN RAISE EXCEPTION 'Nội dung sau khi điền biến quá dài'; END IF;
 RETURN result;
END;$$;

CREATE OR REPLACE FUNCTION public.preview_message_campaign(p_template text,p_send_at timestamptz,p_class_ids uuid[] DEFAULT '{}',p_parent_ids uuid[] DEFAULT '{}',p_excluded_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE targets jsonb; result jsonb;
BEGIN
 IF NOT public.can_manage_message_campaigns() THEN RAISE EXCEPTION 'Không có quyền quản lý tin tự động'; END IF;
 IF p_send_at IS NULL OR p_class_ids IS NULL OR p_parent_ids IS NULL OR p_excluded_ids IS NULL THEN RAISE EXCEPTION 'Thiếu thời gian hoặc người nhận'; END IF;
 targets:=public.message_campaign_targets(auth.uid(),p_class_ids,p_parent_ids,p_excluded_ids);
 IF jsonb_array_length(targets)>1000 THEN RAISE EXCEPTION 'Tối đa 1000 phụ huynh mỗi đợt'; END IF;
 -- Validate even an empty audience, so a draft cannot store an unsafe template.
 PERFORM public.render_message_campaign(p_template,'{}',p_send_at);
 SELECT coalesce(jsonb_agg(value||jsonb_build_object('content',public.render_message_campaign(p_template,value,p_send_at))),'[]'::jsonb) INTO result FROM jsonb_array_elements(targets);
 RETURN result;
END;$$;

CREATE OR REPLACE FUNCTION public.save_message_campaign(p_id uuid,p_name text,p_template text,p_send_at timestamptz,p_recurrence text,p_window_hours integer,p_class_ids uuid[] DEFAULT '{}',p_parent_ids uuid[] DEFAULT '{}',p_excluded_ids uuid[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE existing public.message_campaigns; targets jsonb;
BEGIN
 IF NOT public.can_manage_message_campaigns() THEN RAISE EXCEPTION 'Không có quyền quản lý tin tự động'; END IF;
 IF p_id IS NULL OR length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 150 OR p_recurrence NOT IN('once','yearly') OR p_window_hours NOT BETWEEN 1 AND 168
 OR p_send_at IS NULL OR p_send_at>now()+interval '5 years' THEN RAISE EXCEPTION 'Thông tin lịch gửi không hợp lệ'; END IF;
 targets:=public.preview_message_campaign(p_template,p_send_at,p_class_ids,p_parent_ids,p_excluded_ids);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO existing FROM public.message_campaigns WHERE id=p_id FOR UPDATE;
 IF FOUND AND (existing.created_by<>auth.uid() AND NOT public.is_admin_actor()) THEN RAISE EXCEPTION 'Không có quyền sửa tin này'; END IF;
 IF FOUND AND existing.state<>'draft' THEN RAISE EXCEPTION 'Chỉ sửa được bản nháp; hãy tạo bản sao'; END IF;
 INSERT INTO public.message_campaigns(id,created_by,name,template,send_at,recurrence,window_hours,class_ids,parent_ids,excluded_ids)
 VALUES(p_id,auth.uid(),trim(p_name),p_template,p_send_at,p_recurrence,p_window_hours,p_class_ids,p_parent_ids,p_excluded_ids)
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,template=excluded.template,send_at=excluded.send_at,recurrence=excluded.recurrence,
 window_hours=excluded.window_hours,class_ids=excluded.class_ids,parent_ids=excluded.parent_ids,excluded_ids=excluded.excluded_ids,updated_at=now();
 RETURN p_id;
END;$$;

CREATE OR REPLACE FUNCTION public.message_campaign_recipient_valid(p_campaign uuid,p_parent uuid,p_students uuid[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
 SELECT EXISTS(SELECT 1 FROM public.message_campaigns c WHERE c.id=p_campaign AND public.can_manage_message_campaigns(c.created_by)
 AND cardinality(p_students)>0 AND NOT p_parent=ANY(c.excluded_ids)
 AND NOT EXISTS(SELECT 1 FROM unnest(p_students) sid WHERE NOT EXISTS(
 SELECT 1 FROM public.parent_students ps JOIN public.class_students cs ON cs.student_id=ps.student_id JOIN public.classes cl ON cl.id=cs.class_id
 WHERE ps.parent_id=p_parent AND ps.student_id=sid AND ps.revoked_at IS NULL AND NOT coalesce(cl.hidden,false)
 AND (cs.joined_at IS NULL OR cs.joined_at::date<=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
 AND (cs.left_at IS NULL OR cs.left_at::date>=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
 AND (cardinality(c.class_ids)=0 OR cs.class_id=ANY(c.class_ids))
 AND (public.has_app_permission('messages.automation.all',c.created_by) OR EXISTS(SELECT 1 FROM public.class_teachers ct WHERE ct.class_id=cs.class_id AND ct.teacher_id=c.created_by)))));
$$;

CREATE OR REPLACE FUNCTION public.enqueue_message_campaign_recipient(p_run uuid,p_parent uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE r public.message_campaign_recipients; run public.message_campaign_runs; c public.message_campaigns;
 uid text; cid uuid; mid uuid; job uuid;
BEGIN
 SELECT * INTO r FROM public.message_campaign_recipients WHERE run_id=p_run AND parent_id=p_parent FOR UPDATE;
 IF NOT FOUND OR r.outbox_id IS NOT NULL THEN RETURN; END IF;
 IF trim(r.content)='' THEN RAISE EXCEPTION 'Không tạo được nội dung cho người nhận'; END IF;
 SELECT * INTO run FROM public.message_campaign_runs WHERE id=p_run;
 SELECT * INTO c FROM public.message_campaigns WHERE id=run.campaign_id;
 IF c.state<>'scheduled' OR run.expires_at<=now() OR NOT public.message_campaign_recipient_valid(c.id,p_parent,r.student_ids) THEN
  UPDATE public.message_campaign_recipients SET error_message='Hết hạn hoặc người nhận ngoài phạm vi hiện tại' WHERE run_id=p_run AND parent_id=p_parent;RETURN;
 END IF;
 SELECT zalo_uid INTO uid FROM public.zalo_verified_links WHERE audience_user_id=p_parent AND enabled;
 IF uid IS NULL THEN UPDATE public.message_campaign_recipients SET error_message='Chưa liên kết Zalo' WHERE run_id=p_run AND parent_id=p_parent;RETURN;END IF;
 cid:=public.ensure_mindup_official_audience_conversation(p_parent);
 INSERT INTO public.messages(conversation_id,sender_id,real_sender_id,content,transport,zalo_dispatch_source,context_student_id)
 VALUES(cid,'00000000-0000-0000-0000-000000000001',c.created_by,r.content,'web','campaign',CASE WHEN cardinality(r.student_ids)=1 THEN r.student_ids[1] END) RETURNING id INTO mid;
 INSERT INTO public.zalo_outbox(message_id,conversation_id,audience_user_id,zalo_uid,content,dispatch_priority)
 VALUES(mid,cid,p_parent,uid,r.content,1) RETURNING id INTO job;
 UPDATE public.message_campaign_recipients SET outbox_id=job,error_message=NULL WHERE run_id=p_run AND parent_id=p_parent;
END;$$;

CREATE OR REPLACE FUNCTION public.process_message_campaigns()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE v_campaign public.message_campaigns; v_run_id uuid; target jsonb; targets jsonb; students uuid[]; next_date timestamptz; processed integer:=0;
BEGIN
 -- The job and claim hook serialize materialization across concurrent workers.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('message-campaign-scheduler',0)) THEN RETURN 0; END IF;
 UPDATE public.zalo_outbox o SET status='cancelled',error_message='Tin tự động hết hạn, bị hủy hoặc thay đổi phạm vi',updated_at=now()
 FROM public.message_campaign_recipients r JOIN public.message_campaign_runs run ON run.id=r.run_id JOIN public.message_campaigns c ON c.id=run.campaign_id
 WHERE o.id=r.outbox_id AND o.status='pending' AND (run.expires_at<=now() OR c.state='cancelled' OR NOT public.message_campaign_recipient_valid(c.id,r.parent_id,r.student_ids));
 FOR v_campaign IN SELECT * FROM public.message_campaigns WHERE state='scheduled' AND next_run_at<=now() ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 10 LOOP
  INSERT INTO public.message_campaign_runs(campaign_id,scheduled_at,expires_at,state)
  VALUES(v_campaign.id,v_campaign.next_run_at,v_campaign.next_run_at+make_interval(hours=>v_campaign.window_hours),CASE WHEN v_campaign.next_run_at+make_interval(hours=>v_campaign.window_hours)<=now() THEN 'expired' ELSE 'queued' END)
  ON CONFLICT DO NOTHING RETURNING id INTO v_run_id;
  IF v_run_id IS NOT NULL AND v_campaign.next_run_at+make_interval(hours=>v_campaign.window_hours)>now() THEN
   targets:=public.message_campaign_targets(v_campaign.created_by,v_campaign.class_ids,v_campaign.parent_ids,v_campaign.excluded_ids);
   FOR target IN SELECT value FROM jsonb_array_elements(targets) LOOP
    SELECT array_agg(value::uuid) INTO students FROM jsonb_array_elements_text(target->'student_ids');
    INSERT INTO public.message_campaign_recipients(run_id,parent_id,student_ids,content)
    VALUES(v_run_id,(target->>'parent_id')::uuid,students,'') ON CONFLICT DO NOTHING;
    BEGIN
     UPDATE public.message_campaign_recipients SET content=public.render_message_campaign(v_campaign.template,target,v_campaign.next_run_at)
      WHERE run_id=v_run_id AND parent_id=(target->>'parent_id')::uuid AND outbox_id IS NULL;
     PERFORM public.enqueue_message_campaign_recipient(v_run_id,(target->>'parent_id')::uuid);
    EXCEPTION WHEN OTHERS THEN UPDATE public.message_campaign_recipients SET error_message=left(SQLERRM,500) WHERE run_id=v_run_id AND parent_id=(target->>'parent_id')::uuid; END;
   END LOOP;
  END IF;
  next_date:=NULL;
  IF v_campaign.recurrence='yearly' THEN next_date:=((v_campaign.next_run_at AT TIME ZONE 'Asia/Ho_Chi_Minh')+interval '1 year') AT TIME ZONE 'Asia/Ho_Chi_Minh';
   WHILE next_date<=now() LOOP next_date:=((next_date AT TIME ZONE 'Asia/Ho_Chi_Minh')+interval '1 year') AT TIME ZONE 'Asia/Ho_Chi_Minh';END LOOP;
  END IF;
  UPDATE public.message_campaigns SET next_run_at=next_date,updated_at=now() WHERE id=v_campaign.id;
  processed:=processed+1;
 END LOOP;
 UPDATE public.message_campaigns c SET state='finished',updated_at=now() WHERE c.state='scheduled' AND c.next_run_at IS NULL
 AND EXISTS(SELECT 1 FROM public.message_campaign_runs run WHERE run.campaign_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM public.message_campaign_runs run JOIN public.message_campaign_recipients r ON r.run_id=run.id JOIN public.zalo_outbox o ON o.id=r.outbox_id WHERE run.campaign_id=c.id AND o.status IN('pending','processing'));
 RETURN processed;
END;$$;

CREATE OR REPLACE FUNCTION public.control_message_campaign(p_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE c public.message_campaigns; targets jsonb; v_recipient record; n integer:=0;
BEGIN
 IF NOT public.can_manage_message_campaigns() THEN RAISE EXCEPTION 'Không có quyền quản lý tin tự động'; END IF;
 SELECT * INTO c FROM public.message_campaigns WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR (c.created_by<>auth.uid() AND NOT public.is_admin_actor()) THEN RAISE EXCEPTION 'Không có quyền quản lý tin này'; END IF;
 IF p_action='publish' THEN
  IF c.state<>'draft' THEN RAISE EXCEPTION 'Tin không còn là bản nháp'; END IF;
  IF c.send_at<now()-interval '1 minute' THEN RAISE EXCEPTION 'Hãy chọn thời gian gửi trong tương lai'; END IF;
  targets:=public.preview_message_campaign(c.template,c.send_at,c.class_ids,c.parent_ids,c.excluded_ids);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(targets) x WHERE (x->>'linked')::boolean) THEN RAISE EXCEPTION 'Không có phụ huynh đã liên kết Zalo trong danh sách'; END IF;
  UPDATE public.message_campaigns SET state='scheduled',next_run_at=greatest(send_at,now()),updated_at=now() WHERE id=p_id;
 ELSIF p_action='pause' AND c.state='scheduled' THEN
  UPDATE public.message_campaigns SET state='paused',updated_at=now() WHERE id=p_id;
  UPDATE public.zalo_outbox o SET automation_paused=true FROM public.message_campaign_recipients r JOIN public.message_campaign_runs run ON run.id=r.run_id WHERE run.campaign_id=p_id AND o.id=r.outbox_id AND o.status='pending';
 ELSIF p_action='resume' AND c.state='paused' THEN
  UPDATE public.message_campaigns SET state='scheduled',updated_at=now() WHERE id=p_id;
  UPDATE public.zalo_outbox o SET automation_paused=false FROM public.message_campaign_recipients r JOIN public.message_campaign_runs run ON run.id=r.run_id WHERE run.campaign_id=p_id AND o.id=r.outbox_id AND o.status='pending';
 ELSIF p_action='cancel' AND c.state<>'cancelled' THEN
  UPDATE public.message_campaigns SET state='cancelled',updated_at=now() WHERE id=p_id;
  UPDATE public.zalo_outbox o SET status='cancelled',error_message='Đã hủy tin tự động',updated_at=now() FROM public.message_campaign_recipients r JOIN public.message_campaign_runs run ON run.id=r.run_id WHERE run.campaign_id=p_id AND o.id=r.outbox_id AND o.status='pending';
 ELSIF p_action='retry' AND c.state IN('scheduled','finished') THEN
  UPDATE public.message_campaigns SET state='scheduled' WHERE id=p_id;
  FOR v_recipient IN SELECT cr.*,run.id AS rid FROM public.message_campaign_recipients cr JOIN public.message_campaign_runs run ON run.id=cr.run_id
    LEFT JOIN public.zalo_outbox o ON o.id=cr.outbox_id WHERE run.campaign_id=p_id AND run.expires_at>now()
    AND (cr.outbox_id IS NULL OR o.status='failed') FOR UPDATE OF cr LOOP
   BEGIN
    IF public.message_campaign_recipient_valid(p_id,v_recipient.parent_id,v_recipient.student_ids) THEN
     IF v_recipient.outbox_id IS NULL THEN PERFORM public.enqueue_message_campaign_recipient(v_recipient.rid,v_recipient.parent_id);
     ELSE UPDATE public.zalo_outbox o SET status='pending',error_message=NULL,locked_until=NULL,automation_paused=false,updated_at=now()
       WHERE o.id=v_recipient.outbox_id AND o.status='failed' AND EXISTS(SELECT 1 FROM public.zalo_verified_links l WHERE l.audience_user_id=v_recipient.parent_id AND l.enabled AND l.zalo_uid=o.zalo_uid); END IF;
     IF EXISTS(SELECT 1 FROM public.message_campaign_recipients cr JOIN public.zalo_outbox o ON o.id=cr.outbox_id
       WHERE cr.run_id=v_recipient.rid AND cr.parent_id=v_recipient.parent_id AND o.status='pending') THEN n:=n+1; END IF;
    END IF;
   EXCEPTION WHEN OTHERS THEN UPDATE public.message_campaign_recipients SET error_message=left(SQLERRM,500)
    WHERE run_id=v_recipient.rid AND parent_id=v_recipient.parent_id;
   END;
  END LOOP;
 ELSE RAISE EXCEPTION 'Thao tác không phù hợp trạng thái hiện tại'; END IF;
 RETURN jsonb_build_object('success',true,'retried',n);
END;$$;

CREATE OR REPLACE FUNCTION public.message_automation_console()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE campaigns jsonb; classes jsonb;
BEGIN
 IF NOT public.can_manage_message_campaigns() THEN RAISE EXCEPTION 'Không có quyền quản lý tin tự động'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO campaigns FROM (
 SELECT c.*,u.full_name AS author,
 (SELECT count(*) FROM public.message_campaign_recipients r JOIN public.message_campaign_runs run ON run.id=r.run_id WHERE run.campaign_id=c.id) AS total,
 (SELECT count(*) FROM public.message_campaign_recipients r JOIN public.message_campaign_runs run ON run.id=r.run_id JOIN public.zalo_outbox o ON o.id=r.outbox_id WHERE run.campaign_id=c.id AND o.status='sent') AS sent,
 (SELECT count(*) FROM public.message_campaign_recipients r JOIN public.message_campaign_runs run ON run.id=r.run_id JOIN public.zalo_outbox o ON o.id=r.outbox_id WHERE run.campaign_id=c.id AND o.status='processing') AS processing,
 (SELECT count(*) FROM public.message_campaign_recipients r JOIN public.message_campaign_runs run ON run.id=r.run_id JOIN public.zalo_outbox o ON o.id=r.outbox_id WHERE run.campaign_id=c.id AND o.status='pending') AS pending,
 (SELECT count(*) FROM public.message_campaign_recipients r JOIN public.message_campaign_runs run ON run.id=r.run_id LEFT JOIN public.zalo_outbox o ON o.id=r.outbox_id WHERE run.campaign_id=c.id AND (o.status IN('failed','uncertain') OR r.outbox_id IS NULL)) AS failed
 FROM public.message_campaigns c JOIN public.users u ON u.id=c.created_by WHERE c.created_by=auth.uid() OR public.is_admin_actor() ORDER BY c.created_at DESC LIMIT 100)x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.class_name) ORDER BY c.class_name),'[]'::jsonb) INTO classes
 FROM public.classes c WHERE NOT coalesce(c.hidden,false) AND (public.has_app_permission('messages.automation.all') OR EXISTS(SELECT 1 FROM public.class_teachers ct WHERE ct.class_id=c.id AND ct.teacher_id=auth.uid()));
 RETURN jsonb_build_object('campaigns',campaigns,'classes',classes,'all_scope',public.has_app_permission('messages.automation.all'),'system_admin',public.is_admin_actor());
END;$$;

CREATE OR REPLACE FUNCTION public.message_campaign_details(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.can_manage_message_campaigns() OR NOT EXISTS(SELECT 1 FROM public.message_campaigns c WHERE c.id=p_id AND (c.created_by=auth.uid() OR public.is_admin_actor())) THEN RAISE EXCEPTION 'Không có quyền xem tin này'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('parent',u.full_name,'content',r.content,'scheduled_at',run.scheduled_at,
 'expires_at',run.expires_at,'status',coalesce(o.status,'skipped'),'error',coalesce(o.error_message,r.error_message),'sent_at',o.sent_at)
 ORDER BY run.scheduled_at DESC,u.full_name),'[]'::jsonb) INTO result FROM public.message_campaign_runs run
 JOIN public.message_campaign_recipients r ON r.run_id=run.id JOIN public.users u ON u.id=r.parent_id LEFT JOIN public.zalo_outbox o ON o.id=r.outbox_id
 WHERE run.campaign_id=p_id AND (public.is_admin_actor() OR public.message_campaign_recipient_valid(p_id,r.parent_id,r.student_ids));
 RETURN jsonb_build_object('recipients',result,'runs',(SELECT coalesce(jsonb_agg(to_jsonb(run) ORDER BY run.scheduled_at DESC),'[]'::jsonb) FROM public.message_campaign_runs run WHERE run.campaign_id=p_id));
END;$$;

DO $hook$
DECLARE source text;
BEGIN
 source:=pg_get_functiondef('public.claim_mindup_zalo_message()'::regprocedure);
 IF position('process_message_campaigns' IN source)=0 THEN
  IF position('WHERE o.status=''pending'' ORDER BY' IN source)=0 THEN RAISE EXCEPTION 'Unexpected Zalo claim definition'; END IF;
  source:=replace(source,'WHERE o.status=''pending'' ORDER BY','WHERE o.status=''pending'' AND NOT o.automation_paused ORDER BY');
  source:=replace(source,'BEGIN',E'BEGIN\n PERFORM public.process_message_campaigns();');
  EXECUTE source;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='mindup-message-campaigns') THEN
   PERFORM cron.schedule('mindup-message-campaigns','* * * * *','SELECT public.process_message_campaigns();');
  END IF;
 END IF;
END;$hook$;

REVOKE ALL ON FUNCTION public.can_manage_message_campaigns(uuid),public.message_campaign_targets(uuid,uuid[],uuid[],uuid[]),public.render_message_campaign(text,jsonb,timestamptz),public.message_campaign_recipient_valid(uuid,uuid,uuid[]),public.enqueue_message_campaign_recipient(uuid,uuid),public.process_message_campaigns() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_message_campaigns(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_message_campaigns() TO service_role;
REVOKE ALL ON FUNCTION public.preview_message_campaign(text,timestamptz,uuid[],uuid[],uuid[]),public.save_message_campaign(uuid,text,text,timestamptz,text,integer,uuid[],uuid[],uuid[]),public.control_message_campaign(uuid,text),public.message_automation_console(),public.message_campaign_details(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_message_campaign(text,timestamptz,uuid[],uuid[],uuid[]),public.save_message_campaign(uuid,text,text,timestamptz,text,integer,uuid[],uuid[],uuid[]),public.control_message_campaign(uuid,text),public.message_automation_console(),public.message_campaign_details(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
