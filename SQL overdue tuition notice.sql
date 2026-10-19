BEGIN;
INSERT INTO public.message_templates(id,name,content,is_enabled) VALUES(
 'tuition_overdue_notice','Nhắc học phí quá hạn',
 'Trung tâm MindUp kính chào Quý phụ huynh [Ten_phu_huynh]!

Trung tâm xin nhắc Quý phụ huynh về học phí tháng [Thang_hoc_phi] của con [Ten_hoc_sinh]. Hạn thanh toán là ngày [Han_thanh_toan], nhưng tính đến ngày [Ngay_hien_tai], trung tâm vẫn chưa ghi nhận đủ học phí của con (đã quá hạn [So_ngay_qua_han] ngày).

Số tiền còn thiếu của tháng [Thang_hoc_phi]: [So_tien_con_thieu].

Kính mong Quý phụ huynh sắp xếp thanh toán sớm để trung tâm hoàn tất việc đối soát. Nếu gia đình đã chuyển khoản, vui lòng gửi lại thông tin giao dịch để trung tâm kiểm tra và cập nhật.

Cảm ơn Quý phụ huynh đã tin tưởng và đồng hành cùng MindUp!',false)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tuition_overdue_settings(
 id integer PRIMARY KEY CHECK(id=1),send_day integer NOT NULL DEFAULT 16 CHECK(send_day BETWEEN 16 AND 28));
ALTER TABLE public.tuition_overdue_settings ADD COLUMN IF NOT EXISTS activated boolean NOT NULL DEFAULT false;
INSERT INTO public.tuition_overdue_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.tuition_overdue_notices(
 parent_id uuid NOT NULL REFERENCES public.users(id),month date NOT NULL CHECK(extract(day FROM month)=1),
 outbox_id uuid UNIQUE REFERENCES public.zalo_outbox(id),error_message text,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(parent_id,month));
ALTER TABLE public.tuition_overdue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuition_overdue_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tuition_overdue_settings,public.tuition_overdue_notices FROM PUBLIC,anon,authenticated;

-- Reuse the saved, discounted ledger and debt snapshot. Never write tuition amounts.
CREATE OR REPLACE FUNCTION public.overdue_tuition_target(p_parent uuid,p_month date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
 WITH children AS (
 SELECT s.id,s.full_name,sum((d.value->>'remaining')::numeric) remaining
 FROM public.users s JOIN public.parent_students ps ON ps.student_id=s.id AND ps.parent_id=p_parent AND ps.revoked_at IS NULL
 CROSS JOIN LATERAL jsonb_array_elements(public.tuition_debt_snapshot(s.id,p_month)) d(value)
 WHERE s.role::text='student' AND (d.value->>'month')::date=p_month AND (d.value->>'remaining')::numeric>0
 GROUP BY s.id,s.full_name
 ) SELECT jsonb_build_object('parent_id',p.id,'parent_name',p.full_name,
  'students',string_agg(c.full_name,' và ' ORDER BY c.full_name,c.id),
  'student_ids',jsonb_agg(c.id ORDER BY c.id),'remaining',sum(c.remaining),
  'linked',EXISTS(SELECT 1 FROM public.zalo_verified_links l WHERE l.audience_user_id=p.id AND l.enabled))
 FROM public.users p CROSS JOIN children c WHERE p.id=p_parent AND p.role::text='parent' GROUP BY p.id,p.full_name;
$$;

CREATE OR REPLACE FUNCTION public.render_overdue_tuition_notice(p_template text,p_target jsonb,p_month date,p_today date)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE result text:=p_template;token text;amount text;
BEGIN
 IF p_today<=p_month+14 OR date_trunc('month',p_today)::date<>p_month OR p_month IS NULL OR p_today IS NULL THEN RAISE EXCEPTION 'Chưa quá hạn học phí tháng này'; END IF;
 IF length(trim(coalesce(result,''))) NOT BETWEEN 1 AND 4000 OR result ~ '__[A-Z_]+__' THEN RAISE EXCEPTION 'Nội dung không hợp lệ'; END IF;
 FOR token IN SELECT (regexp_matches(result,'\[([^\[\]]+)\]','g'))[1] LOOP
  IF NOT token=ANY(ARRAY['Ten_hoc_sinh','Ten_phu_huynh','Ten_trung_tam','Thang_hoc_phi','Han_thanh_toan','Ngay_hien_tai','So_ngay_qua_han','So_tien_con_thieu']) THEN RAISE EXCEPTION 'Biến không hỗ trợ: %',token; END IF;
 END LOOP;
 IF NOT (result LIKE '%[Ten_hoc_sinh]%' AND result LIKE '%[Thang_hoc_phi]%' AND result LIKE '%[Han_thanh_toan]%' AND result LIKE '%[Ngay_hien_tai]%') THEN RAISE EXCEPTION 'Cần có tên học sinh, tháng học phí, hạn thanh toán và ngày hiện tại'; END IF;
 amount:=replace(to_char(coalesce((p_target->>'remaining')::numeric,0),'FM999,999,999,999,990'),',','.')||'đ';
 result:=replace(replace(replace(replace(result,'[Thang_hoc_phi]',to_char(p_month,'MM/YYYY')),
  '[Han_thanh_toan]',to_char(p_month+14,'DD/MM/YYYY')),'[Ngay_hien_tai]',to_char(p_today,'DD/MM/YYYY')),
  '[So_ngay_qua_han]',(p_today-(p_month+14))::text);
 result:=replace(replace(replace(replace(result,'[Ten_hoc_sinh]',coalesce(p_target->>'students','')),
  '[Ten_phu_huynh]',coalesce(p_target->>'parent_name','')),'[So_tien_con_thieu]',amount),'[Ten_trung_tam]','Trung tâm MindUp');
 IF length(result)>5000 THEN RAISE EXCEPTION 'Nội dung sau khi điền biến quá dài'; END IF;
 RETURN result;
END;$$;

CREATE OR REPLACE FUNCTION public.overdue_tuition_settings()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_admin_actor() OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Không có quyền quản lý học phí'; END IF;
 RETURN (SELECT jsonb_build_object('send_day',send_day) FROM public.tuition_overdue_settings WHERE id=1);
END;$$;

CREATE OR REPLACE FUNCTION public.set_overdue_tuition_settings(p_content text,p_enabled boolean,p_send_day integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_admin_actor() OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Không có quyền quản lý học phí'; END IF;
 IF p_send_day IS NULL OR p_send_day NOT BETWEEN 16 AND 28 OR p_enabled IS NULL THEN RAISE EXCEPTION 'Ngày gửi phải từ 16 đến 28'; END IF;
 PERFORM public.render_overdue_tuition_notice(p_content,'{}',date '2026-10-01',date '2026-10-19');
 UPDATE public.tuition_overdue_settings SET send_day=p_send_day,activated=p_enabled WHERE id=1;
 UPDATE public.message_templates SET content=p_content,is_enabled=p_enabled,updated_at=now() WHERE id='tuition_overdue_notice';
 -- Stop pending work immediately. In-flight delivery cannot be retracted.
 UPDATE public.zalo_outbox o SET automation_paused=true FROM public.tuition_overdue_notices n WHERE n.outbox_id=o.id AND o.status='pending';
END;$$;

CREATE OR REPLACE FUNCTION public.preview_overdue_tuition_notices(p_template text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date; m date:=date_trunc('month',today)::date;
 content text;targets jsonb;
BEGIN
 IF NOT public.is_admin_actor() OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Không có quyền xem công nợ'; END IF;
 content:=coalesce(p_template,(SELECT t.content FROM public.message_templates t WHERE id='tuition_overdue_notice'));
 PERFORM public.render_overdue_tuition_notice(content,'{}',m,greatest(today,m+15));
 SELECT coalesce(jsonb_agg(target||jsonb_build_object('content',public.render_overdue_tuition_notice(content,target,m,greatest(today,m+15))) ORDER BY target->>'parent_name'),'[]')
 INTO targets FROM (SELECT public.overdue_tuition_target(u.id,m) target FROM public.users u WHERE u.role::text='parent') x WHERE target IS NOT NULL;
 RETURN jsonb_build_object('month',m,'today',today,'overdue',today>m+14,'recipients',targets);
END;$$;

CREATE OR REPLACE FUNCTION public.overdue_tuition_job_valid(p_job uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE n public.tuition_overdue_notices;target jsonb;template public.message_templates;
 clock timestamp:=now() AT TIME ZONE 'Asia/Ho_Chi_Minh';today date:=clock::date;m date:=date_trunc('month',today)::date;
BEGIN
 SELECT * INTO n FROM public.tuition_overdue_notices WHERE outbox_id=p_job;
 IF NOT FOUND THEN RETURN true; END IF;
 SELECT * INTO template FROM public.message_templates WHERE id='tuition_overdue_notice';
 IF n.month<>m OR NOT coalesce(template.is_enabled,false) OR clock::time<time '08:00' OR clock::time>=time '21:00'
  OR NOT EXISTS(SELECT 1 FROM public.tuition_overdue_settings WHERE id=1 AND activated AND send_day<=extract(day FROM today))
  OR NOT EXISTS(SELECT 1 FROM public.automatic_tuition_control WHERE id=1 AND NOT paused)
  OR NOT EXISTS(SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 AND NOT paused)
  OR NOT EXISTS(SELECT 1 FROM public.zalo_automation_state WHERE id=1 AND NOT paused) THEN RETURN false; END IF;
 target:=public.overdue_tuition_target(n.parent_id,m);
 IF target IS NULL THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.zalo_outbox o JOIN public.zalo_verified_links l ON l.audience_user_id=n.parent_id AND l.zalo_uid=o.zalo_uid AND l.enabled
  WHERE o.id=p_job AND o.content=public.render_overdue_tuition_notice(template.content,target,m,today));
EXCEPTION WHEN OTHERS THEN RETURN false;
END;$$;

CREATE OR REPLACE FUNCTION public.process_overdue_tuition_notices()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE clock timestamp:=now() AT TIME ZONE 'Asia/Ho_Chi_Minh'; today date:=clock::date;m date:=date_trunc('month',today)::date;
 settings public.tuition_overdue_settings;template public.message_templates;v_enabled boolean;ready boolean;
 item record;target jsonb;v_content text;uid text;cid uuid;mid uuid;job uuid;counted integer:=0;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('overdue-tuition-notices',0)) THEN RETURN 0; END IF;
 SELECT * INTO settings FROM public.tuition_overdue_settings WHERE id=1;
 SELECT * INTO template FROM public.message_templates WHERE id='tuition_overdue_notice';
 v_enabled:=coalesce(template.is_enabled,false) AND coalesce(settings.activated,false)
  AND EXISTS(SELECT 1 FROM public.automatic_tuition_control WHERE id=1 AND NOT paused)
  AND EXISTS(SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 AND NOT paused)
  AND EXISTS(SELECT 1 FROM public.zalo_automation_state WHERE id=1 AND NOT paused);
 ready:=coalesce(v_enabled AND extract(day FROM today)>=settings.send_day AND clock::time>=time '08:00' AND clock::time<time '21:00',false);
 -- Each job is refreshed and checked before the shared claim function can select it.
 FOR item IN SELECT n.parent_id,n.month,n.outbox_id,o.message_id,o.zalo_uid FROM public.tuition_overdue_notices n
  JOIN public.zalo_outbox o ON o.id=n.outbox_id WHERE o.status='pending' FOR UPDATE OF o LOOP
  BEGIN
   target:=CASE WHEN item.month=m THEN public.overdue_tuition_target(item.parent_id,m) END;
   IF target IS NULL OR NOT EXISTS(SELECT 1 FROM public.zalo_verified_links l WHERE l.audience_user_id=item.parent_id AND l.enabled AND l.zalo_uid=item.zalo_uid) THEN
    UPDATE public.zalo_outbox SET status='cancelled',error_message='Đã thanh toán, hết tháng hoặc thay đổi liên kết',updated_at=now() WHERE id=item.outbox_id;
   ELSIF NOT ready THEN UPDATE public.zalo_outbox SET automation_paused=true WHERE id=item.outbox_id;
   ELSE
    v_content:=public.render_overdue_tuition_notice(template.content,target,m,today);
    UPDATE public.zalo_outbox SET content=v_content,automation_paused=false,updated_at=now() WHERE id=item.outbox_id;
    UPDATE public.messages SET content=v_content WHERE id=item.message_id AND messages.content IS DISTINCT FROM v_content;
   END IF;
  EXCEPTION WHEN OTHERS THEN
   UPDATE public.zalo_outbox SET status='failed',error_message=left(SQLERRM,500),updated_at=now() WHERE id=item.outbox_id;
  END;
 END LOOP;
 IF NOT ready THEN RETURN 0; END IF;
 FOR item IN SELECT u.id FROM public.users u WHERE u.role::text='parent'
  AND EXISTS(SELECT 1 FROM public.zalo_verified_links l WHERE l.audience_user_id=u.id AND l.enabled)
  AND EXISTS(SELECT 1 FROM public.parent_students ps JOIN public.tuition_payments t ON t.student_id=ps.student_id
   WHERE ps.parent_id=u.id AND ps.revoked_at IS NULL AND t.month=m AND t.amount_due>t.amount_paid)
  AND NOT EXISTS(SELECT 1 FROM public.tuition_overdue_notices n WHERE n.parent_id=u.id AND n.month=m) ORDER BY u.id LOOP
  BEGIN
   target:=public.overdue_tuition_target(item.id,m);
   IF target IS NULL OR NOT (target->>'linked')::boolean THEN CONTINUE; END IF;
   SELECT l.zalo_uid INTO uid FROM public.zalo_verified_links l WHERE l.audience_user_id=item.id AND l.enabled;
   IF uid IS NULL THEN CONTINUE; END IF;
   INSERT INTO public.tuition_overdue_notices(parent_id,month) VALUES(item.id,m) ON CONFLICT DO NOTHING;
   IF NOT FOUND THEN CONTINUE; END IF;
   BEGIN
    v_content:=public.render_overdue_tuition_notice(template.content,target,m,today);
    cid:=public.ensure_mindup_official_audience_conversation(item.id);
    INSERT INTO public.messages(conversation_id,sender_id,content,transport,zalo_dispatch_source)
     VALUES(cid,'00000000-0000-0000-0000-000000000001',v_content,'web','tuition_overdue_notice') RETURNING id INTO mid;
    INSERT INTO public.zalo_outbox(message_id,conversation_id,audience_user_id,zalo_uid,content,dispatch_priority)
     VALUES(mid,cid,item.id,uid,v_content,1) RETURNING id INTO job;
    UPDATE public.tuition_overdue_notices SET outbox_id=job WHERE parent_id=item.id AND month=m;
    counted:=counted+1;
   EXCEPTION WHEN OTHERS THEN UPDATE public.tuition_overdue_notices SET error_message=left(SQLERRM,500) WHERE parent_id=item.id AND month=m;END;
  EXCEPTION WHEN OTHERS THEN CONTINUE;
  END;
 END LOOP;
 RETURN counted;
END;$$;

DO $hook$
DECLARE source text;
BEGIN
 source:=pg_get_functiondef('public.process_message_campaigns()'::regprocedure);
 IF position('process_overdue_tuition_notices' IN source)=0 THEN
  IF position('RETURN processed;' IN source)=0 THEN RAISE EXCEPTION 'Unexpected campaign scheduler'; END IF;
  EXECUTE replace(source,'RETURN processed;','PERFORM public.process_overdue_tuition_notices(); RETURN processed;');
 END IF;
 source:=pg_get_functiondef('public.claim_mindup_zalo_message()'::regprocedure);
 IF position('overdue_tuition_job_valid' IN source)=0 THEN
  IF position('AND NOT o.automation_paused ORDER BY' IN source)=0 THEN RAISE EXCEPTION 'Unexpected Zalo claim'; END IF;
  EXECUTE replace(source,'AND NOT o.automation_paused ORDER BY','AND NOT o.automation_paused AND public.overdue_tuition_job_valid(o.id) ORDER BY');
 END IF;
 source:=pg_get_functiondef('public.message_automation_systems()'::regprocedure);
 IF position('''tuition_overdue_notice''' IN source)=0 THEN
  IF position('WHERE id IN(''tuition_overdue'',''tuition_confirmed''' IN source)>0 THEN
   EXECUTE replace(source,'WHERE id IN(''tuition_overdue'',''tuition_confirmed''','WHERE id IN(''tuition_overdue_notice'',''tuition_confirmed''');
  ELSIF position('WHERE id IN(''tuition_confirmed''' IN source)>0 THEN
   EXECUTE replace(source,'WHERE id IN(''tuition_confirmed''','WHERE id IN(''tuition_overdue_notice'',''tuition_confirmed''');
  ELSE RAISE EXCEPTION 'Unexpected automation catalog'; END IF;
 END IF;
END;$hook$;
REVOKE ALL ON FUNCTION public.overdue_tuition_target(uuid,date),public.render_overdue_tuition_notice(text,jsonb,date,date),public.overdue_tuition_job_valid(uuid),public.process_overdue_tuition_notices() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_overdue_tuition_notices() TO service_role;
REVOKE ALL ON FUNCTION public.overdue_tuition_settings(),public.set_overdue_tuition_settings(text,boolean,integer),public.preview_overdue_tuition_notices(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.overdue_tuition_settings(),public.set_overdue_tuition_settings(text,boolean,integer),public.preview_overdue_tuition_notices(text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
