BEGIN;
-- This notice is initiated only by an administrator, never by a calendar.
UPDATE public.tuition_overdue_settings SET activated=false WHERE id=1;
UPDATE public.message_templates SET is_enabled=false WHERE id='tuition_overdue_notice';
UPDATE public.zalo_outbox o SET status='cancelled',error_message='Đã chuyển thông báo quá hạn sang gửi thủ công',updated_at=now()
 FROM public.tuition_overdue_notices n WHERE n.outbox_id=o.id AND o.status='pending';

CREATE TABLE IF NOT EXISTS public.tuition_overdue_manual_batches(
 id uuid PRIMARY KEY,created_by uuid NOT NULL REFERENCES public.users(id),month date NOT NULL,
 template text NOT NULL,parent_ids uuid[] NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.tuition_overdue_manual_recipients(
 batch_id uuid NOT NULL REFERENCES public.tuition_overdue_manual_batches(id),parent_id uuid NOT NULL REFERENCES public.users(id),
 outbox_id uuid UNIQUE REFERENCES public.zalo_outbox(id),error_message text,PRIMARY KEY(batch_id,parent_id));
CREATE INDEX IF NOT EXISTS overdue_manual_parent ON public.tuition_overdue_manual_recipients(parent_id,batch_id);
ALTER TABLE public.tuition_overdue_manual_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuition_overdue_manual_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tuition_overdue_manual_batches,public.tuition_overdue_manual_recipients FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_overdue_tuition_template(p_content text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_admin_actor() OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Không có quyền quản lý học phí'; END IF;
 PERFORM public.render_overdue_tuition_notice(p_content,'{}',date '2026-10-01',date '2026-10-19');
 UPDATE public.message_templates SET content=p_content,is_enabled=false,updated_at=now() WHERE id='tuition_overdue_notice';
END;$$;

-- Retire the old activation RPC, including already-open older browser tabs.
CREATE OR REPLACE FUNCTION public.set_overdue_tuition_settings(p_content text,p_enabled boolean,p_send_day integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_enabled IS DISTINCT FROM false THEN RAISE EXCEPTION 'Thông báo này chỉ gửi thủ công bằng nút Gửi'; END IF;
 PERFORM public.save_overdue_tuition_template(p_content);
END;$$;

CREATE OR REPLACE FUNCTION public.preview_overdue_tuition_notices(p_template text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;m date:=date_trunc('month',today)::date;v_content text;targets jsonb;
BEGIN
 IF NOT public.is_admin_actor() OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Không có quyền xem công nợ'; END IF;
 v_content:=coalesce(p_template,(SELECT content FROM public.message_templates WHERE id='tuition_overdue_notice'));
 PERFORM public.render_overdue_tuition_notice(v_content,'{}',m,greatest(today,m+15));
 WITH candidates AS MATERIALIZED (
  SELECT public.overdue_tuition_target(u.id,m) target FROM public.users u WHERE u.role::text='parent'
 ), rows AS (
  SELECT target,
   EXISTS(SELECT 1 FROM public.tuition_overdue_manual_recipients r JOIN public.tuition_overdue_manual_batches b ON b.id=r.batch_id
    JOIN public.zalo_outbox o ON o.id=r.outbox_id WHERE r.parent_id=(target->>'parent_id')::uuid AND b.month=m AND o.status IN('pending','processing','uncertain')) blocked,
   (SELECT max(coalesce(o.sent_at,o.created_at)) FROM public.tuition_overdue_manual_recipients r JOIN public.tuition_overdue_manual_batches b ON b.id=r.batch_id
    JOIN public.zalo_outbox o ON o.id=r.outbox_id WHERE r.parent_id=(target->>'parent_id')::uuid AND b.month=m AND o.status='sent') last_sent_at
  FROM candidates WHERE target IS NOT NULL
 ) SELECT coalesce(jsonb_agg(target||jsonb_build_object(
  'content',public.render_overdue_tuition_notice(v_content,target,m,greatest(today,m+15)),
  'can_send',today>m+14 AND (target->>'linked')::boolean AND NOT blocked,
  'blocked',blocked,'last_sent_at',last_sent_at) ORDER BY target->>'parent_name'),'[]') INTO targets FROM rows;
 RETURN jsonb_build_object('month',m,'today',today,'overdue',today>m+14,'manual',true,'recipients',targets);
END;$$;

CREATE OR REPLACE FUNCTION public.queue_overdue_tuition_manual(p_request uuid,p_template text,p_parent_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;m date:=date_trunc('month',today)::date;
 existing public.tuition_overdue_manual_batches;parent uuid;target jsonb;uid text;cid uuid;mid uuid;job uuid;v_content text;
BEGIN
 IF NOT public.is_admin_actor() OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Không có quyền gửi thông báo học phí'; END IF;
 IF p_request IS NULL OR p_parent_ids IS NULL OR cardinality(p_parent_ids) NOT BETWEEN 1 AND 1000 OR array_position(p_parent_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Chọn phụ huynh để gửi'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('manual-overdue-send',0));
 SELECT * INTO existing FROM public.tuition_overdue_manual_batches WHERE id=p_request;
 IF FOUND THEN
  IF existing.created_by<>auth.uid() OR existing.template IS DISTINCT FROM p_template OR existing.parent_ids IS DISTINCT FROM p_parent_ids THEN RAISE EXCEPTION 'Mã đợt gửi đã được sử dụng'; END IF;
 ELSE
  PERFORM public.render_overdue_tuition_notice(p_template,'{}',m,today);
  IF NOT EXISTS(SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 AND NOT paused)
   OR NOT EXISTS(SELECT 1 FROM public.zalo_automation_state WHERE id=1 AND NOT paused) THEN RAISE EXCEPTION 'Hàng gửi Zalo đang tạm dừng'; END IF;
  INSERT INTO public.tuition_overdue_manual_batches(id,created_by,month,template,parent_ids) VALUES(p_request,auth.uid(),m,p_template,p_parent_ids);
  FOREACH parent IN ARRAY p_parent_ids LOOP
   INSERT INTO public.tuition_overdue_manual_recipients(batch_id,parent_id) VALUES(p_request,parent) ON CONFLICT DO NOTHING;
   IF NOT FOUND THEN CONTINUE; END IF;
   BEGIN
    IF EXISTS(SELECT 1 FROM public.tuition_overdue_manual_recipients r JOIN public.tuition_overdue_manual_batches b ON b.id=r.batch_id
      JOIN public.zalo_outbox o ON o.id=r.outbox_id WHERE r.parent_id=parent AND b.month=m AND o.status IN('pending','processing','uncertain')) THEN
     RAISE EXCEPTION 'Đang chờ gửi hoặc chưa xác nhận; không gửi trùng';
    END IF;
    target:=public.overdue_tuition_target(parent,m);
    IF target IS NULL THEN RAISE EXCEPTION 'Đã thanh toán đủ hoặc không còn công nợ tháng này'; END IF;
    SELECT l.zalo_uid INTO uid FROM public.zalo_verified_links l WHERE l.audience_user_id=parent AND l.enabled;
    IF uid IS NULL THEN RAISE EXCEPTION 'Chưa liên kết Zalo'; END IF;
    v_content:=public.render_overdue_tuition_notice(p_template,target,m,today);
    cid:=public.ensure_mindup_official_audience_conversation(parent);
    INSERT INTO public.messages(conversation_id,sender_id,real_sender_id,content,transport,zalo_dispatch_source)
     VALUES(cid,'00000000-0000-0000-0000-000000000001',auth.uid(),v_content,'web','tuition_overdue_manual') RETURNING id INTO mid;
    INSERT INTO public.zalo_outbox(message_id,conversation_id,audience_user_id,zalo_uid,content,dispatch_priority)
     VALUES(mid,cid,parent,uid,v_content,1) RETURNING id INTO job;
    UPDATE public.tuition_overdue_manual_recipients SET outbox_id=job WHERE batch_id=p_request AND parent_id=parent;
   EXCEPTION WHEN OTHERS THEN
    UPDATE public.tuition_overdue_manual_recipients SET error_message=left(SQLERRM,500) WHERE batch_id=p_request AND parent_id=parent;
   END;
  END LOOP;
 END IF;
 RETURN jsonb_build_object('id',p_request,
  'queued',(SELECT count(*) FROM public.tuition_overdue_manual_recipients WHERE batch_id=p_request AND outbox_id IS NOT NULL),
  'skipped',(SELECT count(*) FROM public.tuition_overdue_manual_recipients WHERE batch_id=p_request AND outbox_id IS NULL));
END;$$;

CREATE OR REPLACE FUNCTION public.overdue_tuition_job_valid(p_job uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE item record;target jsonb;today date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
 IF EXISTS(SELECT 1 FROM public.tuition_overdue_notices WHERE outbox_id=p_job) THEN RETURN false; END IF;
 SELECT r.parent_id,b.month,b.template,b.created_at INTO item FROM public.tuition_overdue_manual_recipients r
  JOIN public.tuition_overdue_manual_batches b ON b.id=r.batch_id WHERE r.outbox_id=p_job;
 IF NOT FOUND THEN RETURN true; END IF;
 IF item.month<>date_trunc('month',today)::date OR item.created_at<now()-interval '24 hours'
  OR NOT EXISTS(SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 AND NOT paused)
  OR NOT EXISTS(SELECT 1 FROM public.zalo_automation_state WHERE id=1 AND NOT paused) THEN RETURN false; END IF;
 target:=public.overdue_tuition_target(item.parent_id,item.month);
 IF target IS NULL THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.zalo_outbox o JOIN public.zalo_verified_links l ON l.audience_user_id=item.parent_id AND l.zalo_uid=o.zalo_uid AND l.enabled
  WHERE o.id=p_job AND o.content=public.render_overdue_tuition_notice(item.template,target,item.month,today));
EXCEPTION WHEN OTHERS THEN RETURN false;
END;$$;

-- Kept on the existing scheduler/claim hook solely to validate already requested jobs.
-- No recipient discovery, insertion or automatic sending is performed here.
CREATE OR REPLACE FUNCTION public.process_overdue_tuition_notices()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE item record;target jsonb;v_content text;today date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
 FOR item IN SELECT r.parent_id,r.outbox_id,b.month,b.template,b.created_at,o.message_id,o.zalo_uid
  FROM public.tuition_overdue_manual_recipients r JOIN public.tuition_overdue_manual_batches b ON b.id=r.batch_id
  JOIN public.zalo_outbox o ON o.id=r.outbox_id WHERE o.status='pending' FOR UPDATE OF o SKIP LOCKED LOOP
  BEGIN
   target:=CASE WHEN item.month=date_trunc('month',today)::date THEN public.overdue_tuition_target(item.parent_id,item.month) END;
   IF target IS NULL OR item.created_at<now()-interval '24 hours'
    OR NOT EXISTS(SELECT 1 FROM public.zalo_verified_links l WHERE l.audience_user_id=item.parent_id AND l.enabled AND l.zalo_uid=item.zalo_uid) THEN
    UPDATE public.zalo_outbox SET status='cancelled',error_message='Đã thanh toán, hết hạn hoặc thay đổi liên kết',updated_at=now() WHERE id=item.outbox_id;
   ELSE
    v_content:=public.render_overdue_tuition_notice(item.template,target,item.month,today);
    UPDATE public.zalo_outbox SET content=v_content,automation_paused=false,updated_at=now() WHERE id=item.outbox_id;
    UPDATE public.messages SET content=v_content WHERE id=item.message_id AND messages.content IS DISTINCT FROM v_content;
   END IF;
  EXCEPTION WHEN OTHERS THEN UPDATE public.zalo_outbox SET status='failed',error_message=left(SQLERRM,500),updated_at=now() WHERE id=item.outbox_id; END;
 END LOOP;
 RETURN 0;
END;$$;

-- Include manual overdue deliveries in the existing system history.
DO $history$
DECLARE source text;
BEGIN
 source:=pg_get_functiondef('public.message_automation_systems()'::regprocedure);
 IF position('''tuition_overdue_manual''' IN source)=0 AND position('''tuition'',''receipt'',''greeting''' IN source)>0 THEN
  EXECUTE replace(source,'''tuition'',''receipt'',''greeting''','''tuition'',''receipt'',''greeting'',''tuition_overdue_manual''');
 END IF;
END;$history$;
REVOKE ALL ON FUNCTION public.save_overdue_tuition_template(text),public.queue_overdue_tuition_manual(uuid,text,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_overdue_tuition_template(text),public.queue_overdue_tuition_manual(uuid,text,uuid[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
