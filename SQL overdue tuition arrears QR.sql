BEGIN;
-- Use the same canonical, discounted multi-month debt snapshot as normal reminders.
CREATE OR REPLACE FUNCTION public.overdue_tuition_target(p_parent uuid,p_month date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE children jsonb; bank text; account text; target jsonb;
BEGIN
 children:=public.automatic_tuition_snapshot(p_parent,p_month);
 IF jsonb_array_length(children)=0 THEN RETURN NULL; END IF;
 SELECT lower(regexp_replace(bank_name,'[^a-zA-Z0-9]','','g')),bank_account_no INTO bank,account
 FROM public.zalo_bot_config WHERE id='default' AND is_active;
 IF bank IS NULL OR account IS NULL OR account !~ '^[0-9]{6,30}$' THEN RAISE EXCEPTION 'Cần cấu hình ngân hàng học phí đang hoạt động'; END IF;
 SELECT jsonb_build_object('parent_id',p.id,'parent_name',p.full_name,
  'students',(SELECT string_agg(c->>'student_name',' và ' ORDER BY c->>'student_name') FROM jsonb_array_elements(children)c),
  'student_ids',(SELECT jsonb_agg(c->'student_id') FROM jsonb_array_elements(children)c),
  'remaining',(SELECT sum((c->>'remaining')::numeric) FROM jsonb_array_elements(children)c),
  'children',children,'bank',bank,'account',account,
  'qrs',(SELECT jsonb_agg(jsonb_build_object('student_id',c->>'student_id','student_name',c->>'student_name',
    'remaining',(c->>'remaining')::numeric,'memo',c->>'transfer_memo','qr_url',
    'https://img.vietqr.io/image/'||bank||'-'||account||'-compact2.png?amount='||(c->>'remaining')::numeric::bigint::text||'&addInfo='||replace(c->>'transfer_memo',' ','%20')))
    FROM jsonb_array_elements(children)c),
  'linked',EXISTS(SELECT 1 FROM public.zalo_verified_links l WHERE l.audience_user_id=p.id AND l.enabled))
 INTO target FROM public.users p WHERE p.id=p_parent AND p.role::text='parent';
 RETURN target;
END;$$;

DO $$ BEGIN
 IF to_regprocedure('public.render_overdue_tuition_notice_base(text,jsonb,date,date)') IS NULL THEN
  ALTER FUNCTION public.render_overdue_tuition_notice(text,jsonb,date,date) RENAME TO render_overdue_tuition_notice_base;
 END IF;
END;$$;
CREATE OR REPLACE FUNCTION public.render_overdue_tuition_notice(p_template text,p_target jsonb,p_month date,p_today date)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE result text; child jsonb; debt jsonb;
BEGIN
 result:=public.render_overdue_tuition_notice_base(p_template,p_target,p_month,p_today);
 IF coalesce(jsonb_array_length(p_target->'children'),0)=0 THEN RETURN result; END IF;
 result:=result||E'\n\nChi tiết học phí còn thiếu đến tháng '||to_char(p_month,'MM/YYYY')||':';
 FOR child IN SELECT value FROM jsonb_array_elements(p_target->'children') LOOP
  result:=result||E'\n\n'||(child->>'student_name')||':';
  FOR debt IN SELECT value FROM jsonb_array_elements(child->'debts') ORDER BY value->>'month' LOOP
   result:=result||E'\n- Tháng '||to_char((debt->>'month')::date,'MM/YYYY')||': '||replace(to_char((debt->>'remaining')::numeric,'FM999,999,999,999,990'),',','.')||'đ';
  END LOOP;
  result:=result||E'\nTổng còn thiếu: '||replace(to_char((child->>'remaining')::numeric,'FM999,999,999,999,990'),',','.')||E'đ\nNội dung chuyển khoản: '||(child->>'transfer_memo');
 END LOOP;
 result:=result||E'\n\nNgân hàng: '||(p_target->>'bank')||E'\nSố tài khoản: '||(p_target->>'account')||E'\nQuý phụ huynh quét mã QR đính kèm tương ứng từng học sinh để thanh toán tổng công nợ các tháng.';
 IF length(result)>5000 THEN RAISE EXCEPTION 'Nội dung gộp công nợ quá dài'; END IF;
 RETURN result;
END;$$;

CREATE OR REPLACE FUNCTION public.overdue_tuition_wire_content(p_template text,p_target jsonb,p_month date,p_today date)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE result text;
BEGIN
 IF jsonb_typeof(p_target->'qrs') IS DISTINCT FROM 'array' OR jsonb_array_length(p_target->'qrs') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Thiếu mã QR thanh toán công nợ'; END IF;
 result:=public.render_overdue_tuition_notice(p_template,p_target,p_month,p_today)||E'\n__TUITION_QRS__'||(p_target->'qrs')::text;
 IF length(result)>10000 THEN RAISE EXCEPTION 'Thông báo và mã QR quá dài'; END IF;
 RETURN result;
END;$$;
CREATE OR REPLACE FUNCTION public.register_overdue_tuition_bundles(p_target jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE child jsonb; memo text;
BEGIN
 FOR child IN SELECT value FROM jsonb_array_elements(p_target->'children') LOOP
  memo:=public.register_tuition_bundle((child->>'student_id')::uuid,child->'debts');
  IF memo IS DISTINCT FROM child->>'transfer_memo' THEN RAISE EXCEPTION 'Nội dung chuyển khoản đã thay đổi'; END IF;
 END LOOP;
END;$$;

-- Keep all existing permission, manual-send, idempotence, pause and expiry guards.
DO $patch$
DECLARE source text; name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['queue_overdue_tuition_manual(uuid,text,uuid[])','overdue_tuition_job_valid(uuid)','process_overdue_tuition_notices()'] LOOP
  source:=pg_get_functiondef(('public.'||name)::regprocedure);
  IF position('overdue_tuition_wire_content' IN source)>0 THEN CONTINUE; END IF;
  IF position('public.render_overdue_tuition_notice(' IN source)=0 THEN RAISE EXCEPTION 'Unexpected overdue function: %',name; END IF;
  source:=replace(source,'public.render_overdue_tuition_notice(p_template,target,m,today)','public.overdue_tuition_wire_content(p_template,target,m,today)');
  source:=replace(source,'public.render_overdue_tuition_notice(item.template,target,item.month,today)','public.overdue_tuition_wire_content(item.template,target,item.month,today)');
  IF position('overdue_tuition_wire_content' IN source)=0 THEN RAISE EXCEPTION 'Missing overdue target expression: %',name; END IF;
  IF name LIKE 'queue_%' OR name LIKE 'process_%' THEN
   IF position('v_content:=public.overdue_tuition_wire_content(' IN source)=0 THEN RAISE EXCEPTION 'Missing content assignment: %',name; END IF;
   source:=replace(source,'v_content:=public.overdue_tuition_wire_content(', 'PERFORM public.register_overdue_tuition_bundles(target); v_content:=public.overdue_tuition_wire_content(');
   source:=replace(source,$needle$auth.uid(),v_content,'web','tuition_overdue_manual'$needle$, $replacement$auth.uid(),split_part(v_content,E'\n__TUITION_QRS__',1),'web','tuition_overdue_manual'$replacement$);
   source:=replace(source,'UPDATE public.messages SET content=v_content WHERE',$replacement$UPDATE public.messages SET content=split_part(v_content,E'\n__TUITION_QRS__',1) WHERE$replacement$);
   source:=replace(source,'messages.content IS DISTINCT FROM v_content',$replacement$messages.content IS DISTINCT FROM split_part(v_content,E'\n__TUITION_QRS__',1)$replacement$);
  END IF;
  EXECUTE source;
 END LOOP;
END;$patch$;

-- Wire metadata is not part of the text Zalo echoes back. Preserve existing sync guards.
DO $echo$
DECLARE source text;
BEGIN
 IF to_regprocedure('public.sync_mindup_zalo_message_text_v1(text,text,text,text,boolean,timestamptz,boolean)') IS NOT NULL THEN
  source:=pg_get_functiondef('public.sync_mindup_zalo_message_text_v1(text,text,text,text,boolean,timestamptz,boolean)'::regprocedure);
  IF position('split_part(o.content' IN source)=0 THEN
   IF position('o.content = p_content' IN source)=0 THEN RAISE EXCEPTION 'Unexpected Zalo text echo guard'; END IF;
   EXECUTE replace(source,'o.content = p_content',$replacement$(o.content = p_content OR (m.zalo_dispatch_source='tuition_overdue_manual' AND split_part(o.content,E'\n__TUITION_QRS__',1)=p_content))$replacement$);
  END IF;
 END IF;
END;$echo$;

CREATE OR REPLACE FUNCTION public.validate_overdue_tuition_dispatch(p_job uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 RETURN EXISTS(SELECT 1 FROM public.zalo_outbox o JOIN public.tuition_overdue_manual_recipients r ON r.outbox_id=o.id
  WHERE o.id=p_job AND o.status='processing' AND o.locked_until>now() AND public.overdue_tuition_job_valid(o.id));
END;$$;

UPDATE public.message_templates SET content=replace(content,'Số tiền còn thiếu của tháng [Thang_hoc_phi]:','Tổng học phí còn thiếu đến tháng [Thang_hoc_phi]:'),updated_at=now()
 WHERE id='tuition_overdue_notice' AND content LIKE '%Số tiền còn thiếu của tháng [Thang_hoc_phi]:%';
REVOKE ALL ON FUNCTION public.overdue_tuition_target(uuid,date),public.render_overdue_tuition_notice_base(text,jsonb,date,date),public.render_overdue_tuition_notice(text,jsonb,date,date),public.overdue_tuition_wire_content(text,jsonb,date,date),public.register_overdue_tuition_bundles(jsonb),public.validate_overdue_tuition_dispatch(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_overdue_tuition_dispatch(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
