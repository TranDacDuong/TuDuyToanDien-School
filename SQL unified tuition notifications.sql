BEGIN;
CREATE TABLE IF NOT EXISTS public.tuition_notice_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_key text NOT NULL UNIQUE,
 batch_id uuid NOT NULL, parent_id uuid NOT NULL REFERENCES public.users(id), month date NOT NULL, student_filter uuid[],
 source text NOT NULL CHECK(source IN('automatic','manual','conversation','overdue','command')),
 payload jsonb NOT NULL, manifest jsonb, message_id uuid REFERENCES public.messages(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','sent','uncertain','cancelled')),
 scan_pass int NOT NULL DEFAULT 1 CHECK(scan_pass IN(1,2)), scan_attempts int NOT NULL DEFAULT 0 CHECK(scan_attempts BETWEEN 0 AND 2),
 scan_started boolean NOT NULL DEFAULT false, revision int NOT NULL DEFAULT 0, next_part int NOT NULL DEFAULT 0,
 part_started boolean NOT NULL DEFAULT false, acknowledgements jsonb NOT NULL DEFAULT '[]',
 token uuid, dispatch_uid text, lease_until timestamptz, paused boolean NOT NULL DEFAULT false,
 error_message text, history jsonb NOT NULL DEFAULT '[]', created_by uuid REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tuition_notice_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuition_notice_jobs ALTER COLUMN created_at SET DEFAULT clock_timestamp();
REVOKE ALL ON public.tuition_notice_jobs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.tuition_notice_jobs TO service_role;
CREATE INDEX IF NOT EXISTS tuition_notice_claim ON public.tuition_notice_jobs(status,scan_pass,created_at);

-- Internal canonical data builder. No caller-supplied amount, text, bank or QR.
CREATE OR REPLACE FUNCTION public.tuition_notice_context(p_parent uuid,p_month date,p_students uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE children jsonb; ids uuid[]; classes_ids uuid[]; bank public.zalo_bot_config; context jsonb; statement_context jsonb; from_month date;
BEGIN
 IF p_month IS NULL OR p_month<>date_trunc('month',p_month)::date OR p_month<'2000-01-01'
  OR p_month>date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN RAISE EXCEPTION 'Tháng học phí không hợp lệ'; END IF;
 SELECT coalesce(jsonb_agg(c ORDER BY c->>'student_id'),'[]') INTO children
 FROM jsonb_array_elements(public.automatic_tuition_snapshot(p_parent,p_month)) c
 WHERE p_students IS NULL OR (c->>'student_id')::uuid=ANY(p_students);
 IF jsonb_array_length(children)=0 THEN RETURN NULL; END IF;
 IF auth.role() IS DISTINCT FROM 'service_role' AND public.has_app_permission('tuition.view_all') IS DISTINCT FROM true AND EXISTS(SELECT 1 FROM jsonb_array_elements(children)c WHERE NOT public.can_view_mindup_family_student(p_parent,(c->>'student_id')::uuid)) THEN RAISE EXCEPTION 'Student scope denied'; END IF;
 SELECT array_agg((c->>'student_id')::uuid) INTO ids FROM jsonb_array_elements(children)c;
 SELECT coalesce(min((d->>'month')::date),p_month) INTO from_month FROM jsonb_array_elements(children)c CROSS JOIN LATERAL jsonb_array_elements(c->'debts')d;
 SELECT array_agg(DISTINCT class_id) INTO classes_ids FROM (
 SELECT class_id FROM public.class_students WHERE student_id=ANY(ids)
 UNION SELECT class_id FROM public.attendance WHERE student_id=ANY(ids) AND date>=from_month AND date<(p_month+interval '1 month')) scoped_classes;
 SELECT * INTO bank FROM public.zalo_bot_config WHERE id='default' AND is_active;
 IF NOT FOUND OR bank.bank_account_no IS NULL OR bank.bank_name IS NULL OR bank.bank_account_no !~ '^[0-9]{6,30}$' THEN RAISE EXCEPTION 'Chưa cấu hình ngân hàng học phí'; END IF;
 context:=jsonb_build_object(
 'classes',(SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('class_schedules',
   (SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM public.class_schedules s WHERE s.class_id=c.id))),'[]') FROM public.classes c WHERE c.id=ANY(classes_ids) AND NOT c.hidden),
 'classStudents',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM public.class_students c WHERE c.student_id=ANY(ids)),
 'chosenSchedules',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM public.class_student_schedules c WHERE c.student_id=ANY(ids)),
 'attData',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.attendance a WHERE a.student_id=ANY(ids) AND a.date>=p_month AND a.date<(p_month+interval '1 month')),
 'trialReqs',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.trial_lesson_requests t WHERE t.student_id=ANY(ids)),
 'suppSessions',(SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('students',
   (SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.supplementary_session_students t WHERE t.session_id=s.id AND t.student_id=ANY(ids)))),'[]')
   FROM public.supplementary_sessions s WHERE s.parent_class_id=ANY(classes_ids) AND s.status='completed' AND s.session_date>=p_month AND s.session_date<(p_month+interval '1 month')),
 'payments',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.tuition_payments t WHERE t.student_id=ANY(ids) AND t.month=p_month),
 'discountRules',(SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]') FROM public.tuition_discounts d WHERE d.student_id=ANY(ids)));
 -- Keep the current-month preview context stable; statements additionally need
 -- saved payment and attendance records for every month in the transfer bundle.
 statement_context:=context||jsonb_build_object(
 'classes',(SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('class_schedules',
   (SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM public.class_schedules s WHERE s.class_id=c.id))),'[]') FROM public.classes c WHERE c.id=ANY(classes_ids)),
 'attData',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.attendance a WHERE a.student_id=ANY(ids) AND a.date>=from_month AND a.date<(p_month+interval '1 month')),
 'payments',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.tuition_payments t WHERE t.student_id=ANY(ids) AND t.month>=from_month AND t.month<=p_month),
 'suppSessions',(SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('students',
   (SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.supplementary_session_students t WHERE t.session_id=s.id AND t.student_id=ANY(ids)))),'[]')
   FROM public.supplementary_sessions s WHERE s.parent_class_id=ANY(classes_ids) AND s.status='completed' AND s.session_date>=from_month AND s.session_date<(p_month+interval '1 month')));
 RETURN jsonb_build_object('version',2,'month',to_char(p_month,'YYYY-MM'),'parent_id',p_parent,
 'parentName',(SELECT full_name FROM public.users WHERE id=p_parent),'parentPhone',(SELECT regexp_replace(phone,'[^0-9]','','g') FROM public.users WHERE id=p_parent),'children',children,'billing_context',context,'statement_context',statement_context,
 'captured_at',clock_timestamp(),'bank',jsonb_build_object('code',lower(regexp_replace(bank.bank_name,'[^a-zA-Z0-9]','','g')),
 'bankName',bank.bank_name,'account',bank.bank_account_no),
 'template',coalesce((SELECT notice_template FROM public.automatic_tuition_control WHERE id=1),''));
END; $$;
REVOKE ALL ON FUNCTION public.tuition_notice_context(uuid,date,uuid[]) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_tuition_notice_internal(p_parent uuid,p_month date,p_students uuid[],p_source text,p_key text,p_batch uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE data jsonb; job uuid; child jsonb; previous public.tuition_notice_jobs;
BEGIN
 IF p_key IS NULL OR length(p_key)>250 OR p_batch IS NULL THEN RAISE EXCEPTION 'Invalid tuition request'; END IF;
 PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
 SELECT * INTO previous FROM public.tuition_notice_jobs WHERE request_key=p_key;
 IF FOUND THEN
  IF previous.parent_id IS DISTINCT FROM p_parent OR previous.month IS DISTINCT FROM p_month OR previous.source IS DISTINCT FROM p_source OR previous.student_filter IS DISTINCT FROM p_students THEN RAISE EXCEPTION 'Mã yêu cầu đã dùng cho nội dung khác'; END IF;
  RETURN previous.id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.tuition_notice_jobs WHERE parent_id=p_parent AND month=p_month AND (status IN('queued','processing') OR (status='uncertain' AND scan_pass=1))) THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.tuition_payments t WHERE t.month<=p_month AND EXISTS(
  SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=p_parent AND ps.student_id=t.student_id AND ps.revoked_at IS NULL) ORDER BY t.student_id,t.month FOR SHARE;
 data:=public.tuition_notice_context(p_parent,p_month,p_students);
 IF data IS NULL THEN RETURN NULL; END IF;
 FOR child IN SELECT value FROM jsonb_array_elements(data->'children') LOOP
  IF child ? 'debts' THEN PERFORM public.register_tuition_bundle((child->>'student_id')::uuid,child->'debts'); END IF;
 END LOOP;
 INSERT INTO public.tuition_notice_jobs(request_key,batch_id,parent_id,month,student_filter,source,payload,created_by)
 VALUES(p_key,p_batch,p_parent,p_month,p_students,p_source,data,auth.uid()) RETURNING id INTO job;
 RETURN job;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_tuition_notice_internal(uuid,date,uuid[],text,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.queue_tuition_notification(p_parent uuid,p_month date,p_students uuid[] DEFAULT NULL,p_request uuid DEFAULT gen_random_uuid(),p_source text DEFAULT 'conversation')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job uuid;
BEGIN
 IF auth.uid() IS NULL OR public.has_app_permission('tuition.zalo_queue.manage') IS DISTINCT FROM true OR (public.can_access_mindup_official_audience(p_parent) IS DISTINCT FROM true AND public.has_app_permission('tuition.view_all') IS DISTINCT FROM true)
  THEN RAISE EXCEPTION 'Không có quyền gửi học phí cho phụ huynh này'; END IF;
 IF p_source NOT IN('conversation','manual','command') OR p_request IS NULL THEN RAISE EXCEPTION 'Invalid tuition source'; END IF;
 job:=public.enqueue_tuition_notice_internal(p_parent,p_month,p_students,p_source,p_source||':'||p_request,p_request);
 IF job IS NULL THEN RETURN jsonb_build_object('queued',0,'reason','Đã thanh toán đủ hoặc đã có lượt đang xử lý'); END IF;
 RETURN jsonb_build_object('queued',1,'id',job);
END; $$;
REVOKE ALL ON FUNCTION public.queue_tuition_notification(uuid,date,uuid[],uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.queue_tuition_notification(uuid,date,uuid[],uuid,text) TO authenticated;

-- Existing button API becomes an adapter: one parent, one job, one common builder.
CREATE OR REPLACE FUNCTION public.queue_grouped_tuition(p_month date,p_items jsonb,p_replace boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE entry record; job uuid; n int:=0; cancelled int:=0; changed int;
BEGIN
 IF auth.uid() IS NULL OR public.has_app_permission('tuition.zalo_queue.manage') IS DISTINCT FROM true THEN RAISE EXCEPTION 'Tuition permission required'; END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Invalid batch'; END IF;
 FOR entry IN SELECT (i->>'parent_id')::uuid parent,(i->>'batch_id')::uuid batch,array_agg(DISTINCT (i->>'student_id')::uuid) students FROM jsonb_array_elements(p_items) WITH ORDINALITY entries(i,ord) GROUP BY 1,2 ORDER BY min(ord) LOOP
  IF (public.can_access_mindup_official_audience(entry.parent) IS DISTINCT FROM true AND public.has_app_permission('tuition.view_all') IS DISTINCT FROM true) THEN RAISE EXCEPTION 'Parent access denied'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(entry.students)s WHERE NOT EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=entry.parent AND ps.student_id=s AND ps.revoked_at IS NULL)) THEN RAISE EXCEPTION 'Invalid parent link'; END IF;
  IF p_replace THEN
   UPDATE public.tuition_notice_jobs SET status='cancelled',updated_at=now(),error_message='Được thay bằng yêu cầu mới' WHERE parent_id=entry.parent AND month=p_month AND status='queued';
   GET DIAGNOSTICS changed=ROW_COUNT;cancelled:=cancelled+changed;
   UPDATE public.zalo_tuition_deliveries SET status='cancelled',updated_at=now() WHERE parent_id=entry.parent AND month=p_month AND status IN('queued','not_found','not_friend','invited','greeted');
  END IF;
  job:=public.enqueue_tuition_notice_internal(entry.parent,p_month,entry.students,'manual','manual:'||entry.batch||':'||entry.parent,entry.batch);
  IF job IS NOT NULL THEN n:=n+cardinality(entry.students); END IF;
 END LOOP;
 RETURN jsonb_build_object('queued',n,'cancelled',cancelled,'processing',0);
END; $$;

CREATE OR REPLACE FUNCTION public.enqueue_automatic_tuition_reminder(p_parent uuid,p_month date,p_slot int,p_due date,p_today date,p_phone text,p_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE batch uuid; job uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF p_today IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date OR p_month IS DISTINCT FROM date_trunc('month',p_today)::date OR p_slot IS NULL OR p_slot NOT IN(5,10,15) OR p_due IS NULL OR p_due>p_today OR p_due<p_month+(p_slot-1) OR p_due>p_month+(p_slot+1) THEN RAISE EXCEPTION 'Invalid schedule'; END IF;
 IF EXISTS(SELECT 1 FROM public.automatic_tuition_control WHERE id=1 AND paused) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.automatic_tuition_reminders WHERE parent_id=p_parent AND month=p_month AND slot=p_slot) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.tuition_notice_jobs WHERE request_key='automatic:'||p_parent||':'||p_month||':'||p_slot) THEN RETURN false; END IF;
 batch:=md5('automatic:'||p_month||':'||p_slot)::uuid;
 job:=public.enqueue_tuition_notice_internal(p_parent,p_month,NULL,'automatic','automatic:'||p_parent||':'||p_month||':'||p_slot,batch);
 IF job IS NOT NULL THEN UPDATE public.tuition_notice_jobs SET payload=payload||jsonb_build_object('automatic_slot',p_slot,'due_date',p_due) WHERE id=job; END IF;
 RETURN job IS NOT NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_tuition_notification_v1(p_allowed boolean,p_slot int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m date:=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF p_slot IS NULL OR p_slot NOT IN(0,5,10,15) THEN RAISE EXCEPTION 'Invalid schedule slot'; END IF;
 PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
 UPDATE public.tuition_notice_jobs SET status='cancelled',error_message='Đợt nhắc tự động đã hết hạn',updated_at=now()
 WHERE (status='queued' OR (status='uncertain' AND scan_pass=1)) AND
  ((source='automatic' AND (month<>m OR coalesce((payload->>'automatic_slot')::int,0)<p_slot)) OR (request_key LIKE 'overdue-auto:%' AND month<>m));
 RETURN public.claim_tuition_notification(p_allowed);
END; $$;

CREATE OR REPLACE FUNCTION public.claim_tuition_notification(p_allowed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job public.tuition_notice_jobs; contact public.zalo_parent_contacts; current_data jsonb; reason text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 AND NOT paused) OR NOT EXISTS(SELECT 1 FROM public.zalo_automation_state WHERE id=1 AND NOT paused) THEN RETURN NULL; END IF;
 UPDATE public.tuition_notice_jobs SET status='uncertain',lease_until=NULL,error_message='Interrupted dispatcher; kết quả gửi chưa xác nhận',updated_at=now() WHERE status='processing' AND lease_until<=now();
 IF EXISTS(SELECT 1 FROM public.tuition_notice_jobs WHERE status='processing') OR EXISTS(SELECT 1 FROM public.automatic_tuition_reminders WHERE status='processing' AND lease_until>now()) OR EXISTS(SELECT 1 FROM public.zalo_outbox WHERE status='processing' AND locked_until>now()) OR EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE status='processing' AND lease_until>now()) OR EXISTS(SELECT 1 FROM public.zalo_tuition_receipts WHERE status='processing' AND lease_until>now()) THEN RETURN NULL; END IF;
 IF (SELECT next_automatic_scan_at>clock_timestamp() FROM public.mindup_zalo_dispatch_control WHERE id=1) THEN RETURN NULL; END IF;
 UPDATE public.tuition_notice_jobs j SET status='queued',scan_pass=2,scan_started=false,revision=revision+1,token=NULL,part_started=false,
  history=history||jsonb_build_array(jsonb_build_object('error',error_message,'at',now(),'kind','second_sweep')),updated_at=now()
 WHERE j.status='uncertain' AND j.scan_pass=1 AND j.scan_attempts<2 AND NOT j.paused
  AND NOT EXISTS(SELECT 1 FROM public.tuition_notice_jobs pending WHERE pending.batch_id=j.batch_id AND pending.status IN('queued','processing'));
 SELECT * INTO job FROM public.tuition_notice_jobs j WHERE status='queued' AND NOT paused AND
  ((source<>'automatic' AND request_key NOT LIKE 'overdue-auto:%') OR (p_allowed AND NOT EXISTS(SELECT 1 FROM public.automatic_tuition_control WHERE id=1 AND paused)
    AND EXISTS(SELECT 1 FROM public.message_templates t WHERE t.id=CASE WHEN source='automatic' THEN 'tuition_reminder' ELSE 'tuition_overdue_notice' END AND t.is_enabled)))
  ORDER BY scan_pass,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.mindup_zalo_dispatch_control SET next_automatic_scan_at=clock_timestamp()+interval '10 seconds' WHERE id=1;
 BEGIN
  current_data:=public.tuition_notice_context(job.parent_id,job.month,ARRAY(SELECT (c->>'student_id')::uuid FROM jsonb_array_elements(job.payload->'children')c));
 EXCEPTION WHEN OTHERS THEN
  UPDATE public.tuition_notice_jobs SET status='uncertain',scan_attempts=scan_attempts+CASE WHEN scan_started THEN 0 ELSE 1 END,scan_started=true,error_message=left(SQLERRM,500),updated_at=now() WHERE id=job.id;
  RETURN NULL;
 END;
 IF current_data IS NULL OR current_data->'children' IS DISTINCT FROM job.payload->'children' OR current_data->'bank' IS DISTINCT FROM job.payload->'bank' OR current_data->>'parentPhone' IS DISTINCT FROM job.payload->>'parentPhone' THEN
  UPDATE public.tuition_notice_jobs SET status='cancelled',error_message='Công nợ, liên kết hoặc ngân hàng thay đổi; cần tạo thông báo mới',updated_at=now() WHERE id=job.id; RETURN NULL;
 END IF;
 SELECT * INTO contact FROM public.zalo_parent_contacts WHERE parent_id=job.parent_id;
 IF contact.zalo_uid IS NULL THEN reason:='Chưa tìm thấy hoặc chưa liên kết Zalo phụ huynh';
 ELSIF contact.status IS DISTINCT FROM 'friend' AND contact.greeting_sent_at IS NULL THEN reason:=coalesce(nullif(contact.last_error,''),'Phụ huynh chưa kết bạn hoặc chưa cho phép nhận tin');
 ELSIF NOT EXISTS(SELECT 1 FROM public.users p JOIN public.zalo_verified_links l ON l.audience_user_id=p.id AND l.enabled WHERE p.id=job.parent_id AND contact.phone=regexp_replace(p.phone,'[^0-9]','','g') AND l.zalo_uid=contact.zalo_uid) THEN reason:='Liên kết Zalo chưa được xác minh hoặc SĐT thay đổi';
 ELSIF job.next_part>0 AND job.dispatch_uid IS DISTINCT FROM contact.zalo_uid THEN reason:='Tài khoản Zalo thay đổi sau khi gửi một phần'; END IF;
 IF reason IS NOT NULL THEN
  UPDATE public.tuition_notice_jobs SET status='uncertain',scan_attempts=scan_attempts+CASE WHEN scan_started THEN 0 ELSE 1 END,scan_started=true,error_message=reason,updated_at=now() WHERE id=job.id; RETURN NULL;
 END IF;
 UPDATE public.tuition_notice_jobs SET status='processing',token=gen_random_uuid(),dispatch_uid=contact.zalo_uid,lease_until=now()+interval '5 minutes',
  scan_attempts=scan_attempts+CASE WHEN scan_started THEN 0 ELSE 1 END,scan_started=true,error_message=NULL,updated_at=now() WHERE id=job.id RETURNING * INTO job;
 RETURN to_jsonb(job);
END; $$;

CREATE OR REPLACE FUNCTION public.prepare_tuition_notification(p_id uuid,p_token uuid,p_manifest jsonb,p_text text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.tuition_notice_jobs; cid uuid; mid uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 SELECT * INTO j FROM public.tuition_notice_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'processing' OR j.token IS DISTINCT FROM p_token OR j.lease_until<=now() THEN RAISE EXCEPTION 'Invalid lease'; END IF;
 IF jsonb_typeof(p_manifest) IS DISTINCT FROM 'array' OR jsonb_array_length(p_manifest) NOT BETWEEN 2 AND 100 OR length(p_text) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid notice manifest'; END IF;
 IF j.manifest IS NOT NULL AND j.manifest IS DISTINCT FROM p_manifest THEN RAISE EXCEPTION 'Nội dung ảnh đã thay đổi giữa các lần gửi'; END IF;
 IF j.message_id IS NULL THEN
  cid:=public.ensure_mindup_official_audience_conversation(j.parent_id);
  INSERT INTO public.messages(conversation_id,sender_id,real_sender_id,content,transport,zalo_dispatch_source)
   VALUES(cid,'00000000-0000-0000-0000-000000000001',j.created_by,p_text,'web','tuition') RETURNING id INTO mid;
 ELSE mid:=j.message_id; END IF;
 UPDATE public.tuition_notice_jobs SET manifest=p_manifest,message_id=mid,lease_until=now()+interval '5 minutes' WHERE id=p_id;
 RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.begin_tuition_notification_part(p_id uuid,p_token uuid,p_index int,p_allowed boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.tuition_notice_jobs; current_data jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
 SELECT * INTO j FROM public.tuition_notice_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'processing' OR j.token IS DISTINCT FROM p_token OR j.lease_until<=now() OR j.next_part<>p_index OR j.part_started THEN RAISE EXCEPTION 'Invalid lease or part'; END IF;
 IF j.paused OR EXISTS(SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 AND paused) OR EXISTS(SELECT 1 FROM public.zalo_automation_state WHERE id=1 AND paused)
  OR ((j.source='automatic' OR j.request_key LIKE 'overdue-auto:%') AND (NOT p_allowed OR EXISTS(SELECT 1 FROM public.automatic_tuition_control WHERE id=1 AND paused)
    OR NOT EXISTS(SELECT 1 FROM public.message_templates t WHERE t.id=CASE WHEN j.source='automatic' THEN 'tuition_reminder' ELSE 'tuition_overdue_notice' END AND t.is_enabled))) THEN
  UPDATE public.tuition_notice_jobs SET status='queued',lease_until=NULL,updated_at=now() WHERE id=p_id; RETURN false;
 END IF;
 BEGIN
  current_data:=public.tuition_notice_context(j.parent_id,j.month,ARRAY(SELECT (c->>'student_id')::uuid FROM jsonb_array_elements(j.payload->'children')c));
 EXCEPTION WHEN OTHERS THEN
  UPDATE public.tuition_notice_jobs SET status='cancelled',lease_until=NULL,error_message=left(SQLERRM,500),updated_at=now() WHERE id=p_id;
  RETURN false;
 END;
 IF current_data IS NULL OR current_data->'children' IS DISTINCT FROM j.payload->'children' OR current_data->'bank' IS DISTINCT FROM j.payload->'bank' OR current_data->>'parentPhone' IS DISTINCT FROM j.payload->>'parentPhone'
  OR NOT EXISTS(SELECT 1 FROM public.zalo_verified_links l JOIN public.zalo_parent_contacts c ON c.parent_id=l.audience_user_id WHERE l.audience_user_id=j.parent_id AND l.enabled AND l.zalo_uid=j.dispatch_uid AND c.zalo_uid=j.dispatch_uid AND c.phone=current_data->>'parentPhone') THEN
  UPDATE public.tuition_notice_jobs SET status='cancelled',lease_until=NULL,error_message='Dữ liệu hoặc tài khoản nhận thay đổi trước khi gửi',updated_at=now() WHERE id=p_id; RETURN false;
 END IF;
 UPDATE public.tuition_notice_jobs SET part_started=true,lease_until=now()+interval '5 minutes' WHERE id=p_id; RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.finish_tuition_notification_part(p_id uuid,p_token uuid,p_index int,p_external_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.tuition_notice_jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 SELECT * INTO j FROM public.tuition_notice_jobs WHERE id=p_id FOR UPDATE;
 IF j.token=p_token AND EXISTS(SELECT 1 FROM jsonb_array_elements(j.acknowledgements)a WHERE (a->>'index')::int=p_index AND a->>'external_id'=p_external_id) THEN RETURN; END IF;
 IF j.status<>'processing' OR j.token IS DISTINCT FROM p_token OR j.lease_until<=now() OR j.next_part<>p_index OR NOT j.part_started
  OR split_part(p_external_id,':',1) IS DISTINCT FROM j.dispatch_uid OR split_part(p_external_id,':',2)!~'^[0-9]+$' THEN RAISE EXCEPTION 'Invalid acknowledgement'; END IF;
 UPDATE public.tuition_notice_jobs SET next_part=p_index+1,part_started=false,acknowledgements=acknowledgements||jsonb_build_array(jsonb_build_object('index',p_index,'external_id',p_external_id,'at',now())),
  status=CASE WHEN p_index+1=jsonb_array_length(manifest) THEN 'sent' ELSE 'processing' END,
  lease_until=CASE WHEN p_index+1=jsonb_array_length(manifest) THEN NULL ELSE now()+interval '5 minutes' END,updated_at=now() WHERE id=p_id;
 IF p_index=0 THEN UPDATE public.messages SET external_message_id=p_external_id,transport='zalo' WHERE id=j.message_id; END IF;
END; $$;

DO $echo$ DECLARE s text; target regprocedure; anchor text:='  v_conversation_id := public.ensure_mindup_official_audience_conversation(v_parent_id);'; BEGIN
 target:=coalesce(to_regprocedure('public.sync_mindup_zalo_message_text_v1(text,text,text,text,boolean,timestamptz,boolean)'),to_regprocedure('public.sync_mindup_zalo_message(text,text,text,text,boolean,timestamptz,boolean)'));
 IF target IS NULL THEN RETURN; END IF;
 s:=pg_get_functiondef(target);
 s:=replace(replace(s,E'\r\n',E'\n'),E'\r',E'\n');
 IF position('unified_tuition_echo_guard' IN s)=0 THEN
  IF position(anchor IN s)=0 THEN RAISE EXCEPTION 'Zalo text echo anchor changed'; END IF;
  s:=replace(s,anchor,$guard$
  -- unified_tuition_echo_guard: text ACK owns the authoritative message ID.
  IF p_is_self AND EXISTS(SELECT 1 FROM public.tuition_notice_jobs j JOIN public.messages m ON m.id=j.message_id
    WHERE j.dispatch_uid=p_zalo_uid AND j.status IN('processing','uncertain') AND m.content=p_content) THEN RETURN 'deferred'; END IF;
  $guard$||anchor);
  EXECUTE s;
 END IF;
END; $echo$;

CREATE OR REPLACE FUNCTION public.fail_tuition_notification(p_id uuid,p_token uuid,p_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 UPDATE public.tuition_notice_jobs SET status='uncertain',lease_until=NULL,error_message=left(p_error,500),updated_at=now() WHERE id=p_id AND token=p_token AND status='processing';
END; $$;

CREATE OR REPLACE FUNCTION public.list_tuition_notification_rows(p_month date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR public.has_app_permission('tuition.zalo_queue.manage') IS DISTINCT FROM true THEN RAISE EXCEPTION 'Tuition permission required'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',j.id,'parent_id',j.parent_id,'student_id',c->>'student_id','student_name',c->>'student_name','batch_id',j.batch_id,
 'source',j.source,'unified',true,'attempt_no',j.revision+1,'status',j.status,'month',j.month,'due_date',(j.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
 'parent_name',p.full_name,'phone',p.phone,'students',c->>'student_name','scan_pass',j.scan_pass,'scan_attempts',j.scan_attempts,
 'auto_retry_pending',j.status='uncertain' AND j.scan_pass=1,'completed_parts',j.next_part,'total_parts',coalesce(jsonb_array_length(j.manifest),1+jsonb_array_length(j.payload->'children')),
 'sent_at',CASE WHEN j.next_part>0 THEN j.updated_at END,'qr_sent_at',CASE WHEN j.status='sent' THEN j.updated_at END,
 'dispatch_paused',j.paused,'error_message',j.error_message,
 'possibly_delivered',EXISTS(SELECT 1 FROM jsonb_array_elements(j.history) h WHERE h->>'error' ~* 'no message id|missing.*message.*id|timeout|network|fetch failed|interrupted|uncertain delivery'),
 'created_at',j.created_at,'updated_at',j.updated_at) ORDER BY j.created_at DESC)
 FROM public.tuition_notice_jobs j JOIN public.users p ON p.id=j.parent_id CROSS JOIN LATERAL jsonb_array_elements(j.payload->'children')c
 WHERE j.month=p_month AND (public.can_access_mindup_official_audience(j.parent_id) OR public.has_app_permission('tuition.view_all')) AND (public.can_view_mindup_family_student(j.parent_id,(c->>'student_id')::uuid) OR public.has_app_permission('tuition.view_all'))),'[]');
END; $$;
REVOKE ALL ON FUNCTION public.list_tuition_notification_rows(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_tuition_notification_rows(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.control_tuition_notification_batch(p_batch uuid,p_action text,p_confirm boolean DEFAULT false)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
 IF auth.uid() IS NULL OR public.has_app_permission('tuition.zalo_queue.manage') IS DISTINCT FROM true OR EXISTS(SELECT 1 FROM public.tuition_notice_jobs WHERE batch_id=p_batch AND NOT public.can_access_mindup_official_audience(parent_id)) THEN RAISE EXCEPTION 'Tuition permission required'; END IF;
 PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
 IF p_action='pause' THEN UPDATE public.tuition_notice_jobs SET paused=true WHERE batch_id=p_batch AND status IN('queued','uncertain');
 ELSIF p_action='resume' THEN UPDATE public.tuition_notice_jobs SET paused=false WHERE batch_id=p_batch;
 ELSIF p_action='retry' THEN
  IF NOT p_confirm OR EXISTS(SELECT 1 FROM public.tuition_notice_jobs WHERE batch_id=p_batch AND (status IN('queued','processing') OR (status='uncertain' AND scan_pass=1))) THEN RAISE EXCEPTION 'Đợi hai lượt kết thúc và xác nhận kiểm tra Zalo trước khi gửi lại'; END IF;
  UPDATE public.tuition_notice_jobs SET status='queued',scan_pass=1,scan_attempts=0,scan_started=false,part_started=false,paused=false,revision=revision+1,token=NULL,lease_until=NULL,
   history=history||jsonb_build_array(jsonb_build_object('error',error_message,'at',now(),'by',auth.uid(),'kind','manual_retry')),error_message=NULL,updated_at=now() WHERE batch_id=p_batch AND status='uncertain';
 ELSE RAISE EXCEPTION 'Invalid action'; END IF;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.control_tuition_notification_batch(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_tuition_notification_batch(uuid,text,boolean) TO authenticated;

-- Old dispatchers cannot claim alongside a new notification in progress.
DO $$ DECLARE s text; BEGIN
 s:=pg_get_functiondef('public.claim_next_mindup_zalo_dispatch_with_automatic(integer,integer,integer,date,integer,boolean)'::regprocedure);
 IF position('unified_tuition_guard' IN s)=0 THEN
  s:=replace(s,'BEGIN','BEGIN'||E'\n -- unified_tuition_guard\n PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;\n IF EXISTS(SELECT 1 FROM public.tuition_notice_jobs WHERE status=''processing'' AND lease_until>now()) THEN RETURN NULL; END IF;');
  EXECUTE s;
 END IF;
END; $$;

-- Explicit service-only protocol; anonymous and signed-in clients cannot claim.
CREATE OR REPLACE FUNCTION public.preview_tuition_notification(p_parent uuid,p_month date,p_students uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR public.has_app_permission('tuition.zalo_queue.manage') IS DISTINCT FROM true OR (public.can_access_mindup_official_audience(p_parent) IS DISTINCT FROM true AND public.has_app_permission('tuition.view_all') IS DISTINCT FROM true) THEN RAISE EXCEPTION 'Tuition permission required'; END IF;
 IF public.has_app_permission('tuition.view_all') IS DISTINCT FROM true AND EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=p_parent AND ps.revoked_at IS NULL AND (p_students IS NULL OR ps.student_id=ANY(p_students)) AND NOT public.can_view_mindup_family_student(p_parent,ps.student_id)) THEN RAISE EXCEPTION 'Student scope denied'; END IF;
 RETURN public.tuition_notice_context(p_parent,p_month,p_students);
END; $$;
REVOKE ALL ON FUNCTION public.preview_tuition_notification(uuid,date,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_tuition_notification(uuid,date,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.tuition_command_month(p_content text)
RETURNS date LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE matches text[];
BEGIN
 IF trim(p_content)!~* '^#hocphi' THEN RETURN NULL; END IF;
 IF trim(p_content)~* '^#hocphi$' THEN RETURN date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date; END IF;
 matches:=regexp_match(trim(p_content),'^#hocphi\s+(0?[1-9]|1[0-2])/(20[0-9]{2})$','i');
 IF matches IS NULL THEN RAISE EXCEPTION 'Dùng #hocphi hoặc #hocphi 11/2026'; END IF;
 RETURN make_date(matches[2]::int,matches[1]::int,1);
END; $$;
REVOKE ALL ON FUNCTION public.tuition_command_month(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.queue_tuition_notice_zalo_command(p_uid text,p_month date,p_external_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent uuid; job uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF p_uid!~'^[0-9]{1,30}$' OR p_external_id!~'^[0-9]{1,40}$' THEN RAISE EXCEPTION 'Invalid self command'; END IF;
 SELECT audience_user_id INTO parent FROM public.zalo_verified_links WHERE zalo_uid=p_uid AND enabled;
 IF parent IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=parent AND role::text='parent') THEN RAISE EXCEPTION 'Cuộc trò chuyện chưa liên kết đúng phụ huynh'; END IF;
 job:=public.enqueue_tuition_notice_internal(parent,p_month,NULL,'command','zalo-command:'||p_uid||':'||p_external_id,md5('zalo-command:'||p_uid||':'||p_external_id)::uuid);
 RETURN jsonb_build_object('queued',CASE WHEN job IS NULL THEN 0 ELSE 1 END,'id',job,'reason',CASE WHEN job IS NULL THEN 'Đã thanh toán đủ hoặc đã có yêu cầu chờ gửi' END);
END; $$;
REVOKE ALL ON FUNCTION public.queue_tuition_notice_zalo_command(text,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_tuition_notice_zalo_command(text,date,text) TO service_role;

-- Intercept commands before the existing authenticated chat send. No raw
-- command or confirmation is published to a parent by the web transport.
DO $commands$ DECLARE name text; s text; BEGIN
 FOREACH name IN ARRAY ARRAY['public.send_mindup_parent_message(uuid,uuid,text)','public.send_mindup_parent_reply(uuid,uuid,text)'] LOOP
  IF to_regprocedure(name) IS NULL THEN CONTINUE; END IF;
  s:=pg_get_functiondef(name::regprocedure);
  IF position('tuition_command_intercept' IN s)=0 THEN
   s:=replace(s,'BEGIN',$inject$BEGIN
    -- tuition_command_intercept
    IF trim(p_content) ~* '^#hocphi' THEN
      RETURN ((public.queue_tuition_notification(p_parent_id,public.tuition_command_month(p_content),NULL,gen_random_uuid(),'command'))->>'id')::uuid;
    END IF;
   $inject$);
   EXECUTE s;
  END IF;
 END LOOP;
END; $commands$;

DO $bot_command$ DECLARE s text; BEGIN
 IF to_regprocedure('public.send_bot_message(uuid,text,uuid)') IS NULL THEN RETURN; END IF;
 s:=pg_get_functiondef('public.send_bot_message(uuid,text,uuid)'::regprocedure);
 IF position('tuition_command_intercept' IN s)=0 THEN
  s:=overlay(s placing $inject$BEGIN
   -- tuition_command_intercept
   IF trim(p_content) ~* '^#hocphi' THEN
    RETURN ((public.queue_tuition_notification((SELECT public.mindup_official_audience_id(c.direct_key) FROM public.conversations c
     WHERE c.id=p_conversation_id AND public.is_mindup_official_direct_key(c.direct_key)),public.tuition_command_month(p_content),NULL,gen_random_uuid(),'command'))->>'id')::uuid;
   END IF;
  $inject$ from position('BEGIN' IN s) for 5);
  EXECUTE s;
 END IF;
END; $bot_command$;

CREATE OR REPLACE FUNCTION public.queue_overdue_tuition_manual(p_request uuid,p_template text,p_parent_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent uuid; job uuid; n int:=0; m date:=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
 IF auth.uid() IS NULL OR public.has_app_permission('tuition.zalo_queue.manage') IS DISTINCT FROM true THEN RAISE EXCEPTION 'Tuition permission required'; END IF;
 IF p_request IS NULL OR cardinality(p_parent_ids) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid batch'; END IF;
 FOREACH parent IN ARRAY p_parent_ids LOOP
  IF (public.can_access_mindup_official_audience(parent) IS DISTINCT FROM true AND public.has_app_permission('tuition.view_all') IS DISTINCT FROM true) THEN RAISE EXCEPTION 'Parent access denied'; END IF;
  job:=public.enqueue_tuition_notice_internal(parent,m,NULL,'overdue','overdue-manual:'||p_request||':'||parent,p_request);
  IF job IS NOT NULL THEN n:=n+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('id',p_request,'queued',n,'skipped',cardinality(p_parent_ids)-n);
END; $$;

CREATE OR REPLACE FUNCTION public.preview_overdue_tuition_notices(p_template text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m date:=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
 today date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date; parent record; data jsonb; target jsonb; recipients jsonb:='[]'; blocked boolean;
BEGIN
 IF auth.uid() IS NULL OR public.has_app_permission('tuition.zalo_queue.manage') IS DISTINCT FROM true THEN RAISE EXCEPTION 'Tuition permission required'; END IF;
 FOR parent IN SELECT id FROM public.users WHERE role::text='parent' ORDER BY id LOOP
  IF NOT public.can_access_mindup_official_audience(parent.id) THEN CONTINUE; END IF;
  data:=public.tuition_notice_context(parent.id,m,NULL); IF data IS NULL THEN CONTINUE; END IF;
  target:=public.overdue_tuition_target(parent.id,m);
  blocked:=EXISTS(SELECT 1 FROM public.tuition_notice_jobs WHERE parent_id=parent.id AND month=m AND status IN('queued','processing'));
  recipients:=recipients||jsonb_build_array(target||jsonb_build_object('notification',data,'content','Dùng mẫu học phí chung, kèm ảnh điểm danh và QR',
   'blocked',blocked,'can_send',NOT blocked AND today>m+14,
   'last_sent_at',(SELECT max(updated_at) FROM public.tuition_notice_jobs WHERE parent_id=parent.id AND month=m AND status='sent')));
 END LOOP;
 RETURN jsonb_build_object('month',m,'today',today,'overdue',today>m+14,'manual',true,'recipients',recipients);
END; $$;

-- Compatibility for older cached pages; financial data is still rebuilt above.
CREATE OR REPLACE FUNCTION public.queue_zalo_tuition_deliveries(p_month text,p_items jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE items jsonb; result jsonb;
BEGIN
 SELECT jsonb_agg(i||jsonb_build_object('batch_id',coalesce(i->>'batch_id',i->>'request_key'))) INTO items FROM jsonb_array_elements(p_items)i;
 result:=public.queue_grouped_tuition((p_month||'-01')::date,items,false);
 RETURN (result->>'queued')::int;
END; $$;
REVOKE ALL ON FUNCTION public.queue_zalo_tuition_deliveries(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.queue_zalo_tuition_deliveries(text,jsonb) TO authenticated;

-- Preserve the existing overdue calendar/settings but route every newly
-- generated request to the common queue instead of rendering another template.
DO $overdue$ DECLARE s text; BEGIN
 s:=pg_get_functiondef('public.process_overdue_tuition_notices()'::regprocedure);
 IF position('FROM public.tuition_overdue_manual_recipients' IN s)>0 THEN RETURN; END IF;
 IF position('unified_tuition_overdue' IN s)=0 THEN
  IF position('INSERT INTO public.zalo_outbox(message_id,conversation_id,audience_user_id,zalo_uid,content,dispatch_priority)' IN s)=0 THEN RAISE EXCEPTION 'Unexpected overdue scheduler'; END IF;
  s:=regexp_replace(s,'v_content:=public.render_overdue_tuition_notice\(template.content,target,m,today\);\s*cid:=public.ensure_mindup_official_audience_conversation\(item.id\);[\s\S]*?UPDATE public.tuition_overdue_notices SET outbox_id=job WHERE parent_id=item.id AND month=m;',
   $route$-- unified_tuition_overdue
   job:=public.enqueue_tuition_notice_internal(item.id,m,NULL,'overdue','overdue-auto:'||item.id||':'||m,md5('overdue-auto:'||m)::uuid);$route$);
  IF position('unified_tuition_overdue' IN s)=0 THEN RAISE EXCEPTION 'Overdue routing anchor changed'; END IF;
  EXECUTE s;
 END IF;
END; $overdue$;

REVOKE ALL ON FUNCTION public.claim_tuition_notification(boolean),public.prepare_tuition_notification(uuid,uuid,jsonb,text),public.begin_tuition_notification_part(uuid,uuid,int,boolean),public.finish_tuition_notification_part(uuid,uuid,int,text),public.fail_tuition_notification(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tuition_notification(boolean),public.prepare_tuition_notification(uuid,uuid,jsonb,text),public.begin_tuition_notification_part(uuid,uuid,int,boolean),public.finish_tuition_notification_part(uuid,uuid,int,text),public.fail_tuition_notification(uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.claim_tuition_notification_v1(boolean,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tuition_notification_v1(boolean,int) TO service_role;
REVOKE ALL ON FUNCTION public.queue_grouped_tuition(date,jsonb,boolean),public.queue_overdue_tuition_manual(uuid,text,uuid[]),public.preview_overdue_tuition_notices(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.queue_grouped_tuition(date,jsonb,boolean),public.queue_overdue_tuition_manual(uuid,text,uuid[]),public.preview_overdue_tuition_notices(text) TO authenticated;
REVOKE ALL ON FUNCTION public.enqueue_automatic_tuition_reminder(uuid,date,int,date,date,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_automatic_tuition_reminder(uuid,date,int,date,date,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
