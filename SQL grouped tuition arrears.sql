BEGIN;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
ALTER TABLE public.zalo_tuition_deliveries ADD COLUMN IF NOT EXISTS debt_snapshot jsonb;
CREATE TABLE IF NOT EXISTS public.tuition_transfer_bundles (
  memo_key text PRIMARY KEY,
  memo text NOT NULL,
  student_id uuid NOT NULL REFERENCES public.users(id),
  months date[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tuition_transfer_bundles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tuition_transfer_bundles FROM anon,authenticated;
CREATE TABLE IF NOT EXISTS public.tuition_bank_allocations (
  log_id uuid NOT NULL REFERENCES public.bank_transaction_logs(id),
  payment_id uuid NOT NULL REFERENCES public.tuition_payments(id),
  amount numeric NOT NULL CHECK(amount>0),
  PRIMARY KEY(log_id,payment_id)
);
ALTER TABLE public.tuition_bank_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tuition_bank_allocations FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.tuition_debt_snapshot(p_student uuid,p_month date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('payment_id',id,'month',month,
    'remaining',amount_due-amount_paid) ORDER BY month),'[]'::jsonb)
  FROM public.tuition_payments WHERE student_id=p_student AND month<=p_month
    AND amount_due>amount_paid;
$$;
CREATE OR REPLACE FUNCTION public.tuition_bundle_memo(p_student uuid,p_debts jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE name text; phone text; words text[]; months text;
BEGIN
  SELECT trim(regexp_replace(unaccent(full_name),'[^a-zA-Z0-9\s]',' ','g')),
    regexp_replace(u.phone,'[^0-9]','','g') INTO name,phone FROM public.users u WHERE id=p_student;
  IF phone IS NULL OR phone !~ '^(0[0-9]{9}|84[0-9]{9})$' THEN RAISE EXCEPTION 'Invalid student phone'; END IF;
  words:=regexp_split_to_array(trim(regexp_replace(name,'\s+',' ','g')),' ');
  name:=initcap(array_to_string(words[greatest(1,array_length(words,1)-1):array_length(words,1)],' '));
  SELECT string_agg(to_char((value->>'month')::date,'MMYY'),' ' ORDER BY value->>'month') INTO months
    FROM jsonb_array_elements(p_debts);
  IF months IS NULL OR name='' THEN RAISE EXCEPTION 'Empty debt bundle'; END IF;
  RETURN 'SEVQR HP'||months||' '||name||' '||right(phone,4);
END;
$$;
CREATE OR REPLACE FUNCTION public.register_tuition_bundle(p_student uuid,p_debts jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE memo text; key text; old_student uuid; dates date[];
BEGIN
  memo:=public.tuition_bundle_memo(p_student,p_debts);
  key:=regexp_replace(upper(memo),'[^A-Z0-9]','','g');
  SELECT array_agg((value->>'month')::date ORDER BY value->>'month') INTO dates FROM jsonb_array_elements(p_debts);
  INSERT INTO public.tuition_transfer_bundles(memo_key,memo,student_id,months)
    VALUES(key,memo,p_student,dates) ON CONFLICT(memo_key) DO NOTHING;
  SELECT student_id INTO old_student FROM public.tuition_transfer_bundles WHERE memo_key=key;
  IF old_student IS DISTINCT FROM p_student THEN RAISE EXCEPTION 'Transfer memo collision; update student identification before sending'; END IF;
  RETURN memo;
END;
$$;
CREATE OR REPLACE FUNCTION public.list_tuition_arrears(p_month date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Tuition permission required'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('student_id',u.id,'student_name',u.full_name,'phone',u.phone,
    'debts',public.tuition_debt_snapshot(u.id,p_month),
    'current_amount_due',coalesce((SELECT t.amount_due FROM public.tuition_payments t WHERE t.student_id=u.id AND t.month=p_month),0),
    'parents',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'phone',p.phone) ORDER BY p.id),'[]'::jsonb)
      FROM public.parent_students ps JOIN public.users p ON p.id=ps.parent_id AND p.role::text='parent'
      WHERE ps.student_id=u.id AND ps.revoked_at IS NULL)) ORDER BY u.full_name),'[]'::jsonb) INTO result
  FROM public.users u WHERE EXISTS(SELECT 1 FROM public.tuition_payments t WHERE t.student_id=u.id AND t.month<=p_month AND t.amount_due>t.amount_paid);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_grouped_tuition(p_month date,p_items jsonb,p_replace boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; student uuid; parent uuid; debts jsonb; amount numeric; attempt integer;
  memo text; queued integer:=0; cancelled integer:=0; active integer:=0; changed integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Tuition permission required'; END IF;
  IF p_month<>date_trunc('month',p_month)::date OR jsonb_typeof(p_items)<>'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Invalid batch'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    student:=(item->>'student_id')::uuid; parent:=(item->>'parent_id')::uuid;
    PERFORM pg_advisory_xact_lock(hashtextextended(student::text,0));
    IF EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE request_key=(item->>'request_key')::uuid) THEN CONTINUE; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.parent_students ps JOIN public.users u ON u.id=ps.parent_id
      WHERE ps.student_id=student AND ps.parent_id=parent AND ps.revoked_at IS NULL AND u.role::text='parent'
      AND regexp_replace(u.phone,'[^0-9]','','g') ~ '^(0[0-9]{9}|84[0-9]{9})$') THEN RAISE EXCEPTION 'Invalid parent link'; END IF;
    PERFORM 1 FROM public.tuition_payments WHERE student_id=student AND month<=p_month ORDER BY month FOR UPDATE;
    debts:=public.tuition_debt_snapshot(student,p_month);
    SELECT sum((value->>'remaining')::numeric) INTO amount FROM jsonb_array_elements(debts);
    IF debts IS DISTINCT FROM item->'debts' OR amount IS NULL OR amount<>(item->>'remaining')::numeric THEN RAISE EXCEPTION 'Debt changed; reload before sending'; END IF;
    memo:=public.register_tuition_bundle(student,debts);
    IF item->>'memo' IS DISTINCT FROM memo OR item->>'encoded_memo' IS DISTINCT FROM replace(memo,' ','%20') OR length(coalesce(item->>'content','')) NOT BETWEEN 1 AND 5000
      OR position(memo IN item->>'content')=0 OR item->>'qr_url' IS DISTINCT FROM
      'https://img.vietqr.io/image/vietinbank-104888332556-compact2.png?amount='||amount::bigint::text||'&addInfo='||(item->>'encoded_memo')
      THEN RAISE EXCEPTION 'Invalid bundle message or QR'; END IF;
    IF EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE student_id=student AND status='processing') THEN active:=active+1; CONTINUE; END IF;
    IF p_replace THEN
      UPDATE public.zalo_tuition_deliveries SET status='cancelled',updated_at=now(),error_message='Replaced by grouped tuition notice'
        WHERE student_id=student AND month<=p_month AND status IN ('queued','not_found','not_friend','invited','greeted');
      GET DIAGNOSTICS changed=ROW_COUNT;
      cancelled:=cancelled+changed;
    ELSIF EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE student_id=student AND month<=p_month AND status IN ('queued','not_found','not_friend','invited','greeted')) THEN CONTINUE;
    END IF;
    INSERT INTO public.tuition_payments(student_id,month,amount_due,amount_paid) VALUES(student,p_month,0,0) ON CONFLICT(student_id,month) DO NOTHING;
    SELECT coalesce(max(attempt_no),0)+1 INTO attempt FROM public.zalo_tuition_deliveries WHERE student_id=student AND parent_id=parent AND month=p_month;
    INSERT INTO public.zalo_tuition_deliveries(request_key,batch_id,student_id,parent_id,month,attempt_no,remaining_snapshot,content,qr_url,created_by,debt_snapshot)
      VALUES((item->>'request_key')::uuid,(item->>'batch_id')::uuid,student,parent,p_month,attempt,amount,item->>'content',item->>'qr_url',auth.uid(),debts);
    queued:=queued+1;
  END LOOP;
  RETURN jsonb_build_object('queued',queued,'cancelled',cancelled,'processing',active);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_tuition_notice_amounts(p_month date,p_rows jsonb)
RETURNS SETOF public.tuition_payments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; student uuid; due numeric; existing public.tuition_payments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Tuition permission required'; END IF;
  IF p_month<>date_trunc('month',p_month)::date OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>300 THEN RAISE EXCEPTION 'Invalid amounts'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    student:=(item->>'student_id')::uuid; due:=(item->>'amount_due')::numeric;
    IF due IS NULL OR due<0 OR due<>trunc(due) THEN RAISE EXCEPTION 'Invalid amount'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(student::text,0));
    SELECT * INTO existing FROM public.tuition_payments WHERE student_id=student AND month=p_month FOR UPDATE;
    IF existing.locked_at IS NOT NULL AND existing.amount_due<>due THEN RAISE EXCEPTION 'Locked tuition amount changed'; END IF;
    INSERT INTO public.tuition_payments(student_id,month,amount_due,amount_paid) VALUES(student,p_month,due,0)
      ON CONFLICT(student_id,month) DO UPDATE SET amount_due=EXCLUDED.amount_due;
    RETURN QUERY SELECT * FROM public.tuition_payments WHERE student_id=student AND month=p_month;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.tuition_delivery_remaining(p_delivery public.zalo_tuition_deliveries)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN p_delivery.debt_snapshot IS NOT NULL AND p_delivery.debt_snapshot IS DISTINCT FROM public.tuition_debt_snapshot(p_delivery.student_id,p_delivery.month)
    THEN -1 ELSE coalesce(sum(greatest(0,t.amount_due-t.amount_paid)),0) END FROM public.tuition_payments t
  WHERE t.student_id=p_delivery.student_id AND (CASE WHEN p_delivery.debt_snapshot IS NULL THEN t.month=p_delivery.month
    ELSE EXISTS(SELECT 1 FROM jsonb_array_elements(p_delivery.debt_snapshot) part WHERE (part->>'month')::date=t.month) END);
$$;
DO $$
DECLARE src text;
BEGIN
  src:=pg_get_functiondef('public.claim_zalo_tuition_delivery()'::regprocedure);
  IF position('tuition_delivery_remaining' IN src)=0 THEN
    IF position('tp.amount_due - tp.amount_paid <> d.remaining_snapshot' IN src)=0 THEN RAISE EXCEPTION 'Unexpected claim definition'; END IF;
    src:=replace(src,'tp.amount_paid >= tp.amount_due OR tp.amount_due - tp.amount_paid <> d.remaining_snapshot',
      'public.tuition_delivery_remaining(d)<=0 OR public.tuition_delivery_remaining(d)<>d.remaining_snapshot');
    src:=replace(src,'tp.amount_due > tp.amount_paid AND tp.amount_due > 0','public.tuition_delivery_remaining(d)>0');
    src:=replace(src,'tp.amount_due - tp.amount_paid = d.remaining_snapshot','public.tuition_delivery_remaining(d)=d.remaining_snapshot');
    EXECUTE src;
  END IF;
  src:=pg_get_functiondef('public.control_zalo_tuition_batch(uuid,text,boolean)'::regprocedure);
  IF position('tuition_delivery_remaining' IN src)=0 THEN
    IF position('tp.amount_due>tp.amount_paid AND tp.amount_due-tp.amount_paid=d.remaining_snapshot' IN src)=0 THEN RAISE EXCEPTION 'Unexpected retry definition'; END IF;
    src:=replace(src,'tp.amount_due>tp.amount_paid AND tp.amount_due-tp.amount_paid=d.remaining_snapshot',
      'public.tuition_delivery_remaining(d)>0 AND public.tuition_delivery_remaining(d)=d.remaining_snapshot');
    EXECUTE src;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_tuition_bundle(p_log_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE log public.bank_transaction_logs%ROWTYPE; bundle public.tuition_transfer_bundles%ROWTYPE;
  candidates integer; key text; payment record; remaining numeric; allocated numeric; last_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  SELECT * INTO log FROM public.bank_transaction_logs WHERE id=p_log_id FOR UPDATE;
  IF NOT FOUND OR log.direction='out' OR log.amount<=0 THEN RETURN jsonb_build_object('handled',false); END IF;
  key:=regexp_replace(upper(log.content),'[^A-Z0-9]','','g');
  SELECT count(*) INTO candidates FROM public.tuition_transfer_bundles b WHERE position(b.memo_key IN key)>0;
  IF candidates<>1 THEN
    IF key ~ 'HP[0-9]{4}[0-9]{4}' THEN
      UPDATE public.bank_transaction_logs SET status='unmatched' WHERE id=p_log_id;
      RETURN jsonb_build_object('handled',true,'status','unmatched');
    END IF;
    RETURN jsonb_build_object('handled',false);
  END IF;
  SELECT * INTO bundle FROM public.tuition_transfer_bundles b WHERE position(b.memo_key IN key)>0;
  PERFORM pg_advisory_xact_lock(hashtextextended(bundle.student_id::text,0));
  IF EXISTS(SELECT 1 FROM public.tuition_bank_allocations WHERE log_id=p_log_id) THEN RETURN jsonb_build_object('handled',true,'status','duplicate_ignored'); END IF;
  remaining:=log.amount;
  FOR payment IN SELECT * FROM public.tuition_payments WHERE student_id=bundle.student_id AND month=ANY(bundle.months) ORDER BY month FOR UPDATE LOOP
    last_id:=payment.id;
    allocated:=least(remaining,greatest(0,payment.amount_due-payment.amount_paid));
    IF allocated>0 THEN
      UPDATE public.tuition_payments SET amount_paid=amount_paid+allocated,paid_at=now(),payment_method='bank_auto',
        transaction_ref=log.transaction_id,auto_reconciled=true,updated_at=now() WHERE id=payment.id;
      INSERT INTO public.tuition_bank_allocations VALUES(p_log_id,payment.id,allocated);
      remaining:=remaining-allocated;
    END IF;
  END LOOP;
  IF remaining>0 AND last_id IS NOT NULL THEN
    UPDATE public.tuition_payments SET amount_paid=amount_paid+remaining,paid_at=now(),payment_method='bank_auto',transaction_ref=log.transaction_id,auto_reconciled=true,updated_at=now() WHERE id=last_id;
    INSERT INTO public.tuition_bank_allocations VALUES(p_log_id,last_id,remaining)
      ON CONFLICT(log_id,payment_id) DO UPDATE SET amount=tuition_bank_allocations.amount+EXCLUDED.amount;
  END IF;
  IF last_id IS NULL THEN RETURN jsonb_build_object('handled',true,'status','unmatched'); END IF;
  FOR payment IN SELECT * FROM public.tuition_bank_allocations WHERE log_id=p_log_id LOOP
    PERFORM public.enqueue_zalo_tuition_receipt(payment.payment_id,payment.amount,'bundle:'||p_log_id::text||':'||payment.payment_id::text);
  END LOOP;
  UPDATE public.bank_transaction_logs SET status='success',matched_tuition_id=last_id,business_description='Thanh toan hoc phi gop: '||bundle.memo WHERE id=p_log_id;
  RETURN jsonb_build_object('handled',true,'status','success','matchedId',last_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.automatic_tuition_snapshot(p_parent uuid,p_month date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'student_id',s.id,'student_name',s.full_name,'payment_id',t.id,
    'amount_due',a.remaining,'amount_paid',0,'remaining',a.remaining,'locked_at',t.locked_at,
    'payment_phone',regexp_replace(s.phone,'[^0-9]','','g'),
    'debts',a.debts,'transfer_memo',public.tuition_bundle_memo(s.id,a.debts)
  ) ORDER BY s.id),'[]'::jsonb)
  FROM public.users s JOIN public.users p ON p.id=p_parent AND p.role::text='parent'
  CROSS JOIN LATERAL (SELECT public.tuition_debt_snapshot(s.id,p_month) AS debts) debt
  CROSS JOIN LATERAL (SELECT debt.debts,sum((value->>'remaining')::numeric) AS remaining
    FROM jsonb_array_elements(debt.debts) GROUP BY debt.debts) a
  CROSS JOIN LATERAL (SELECT * FROM public.tuition_payments t WHERE t.student_id=s.id
    AND t.month<=p_month AND t.locked_at IS NOT NULL AND t.amount_due>t.amount_paid ORDER BY t.month DESC LIMIT 1) t
  WHERE regexp_replace(coalesce(s.phone,''),'[^0-9]','','g') ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND a.remaining>0 AND a.remaining=trunc(a.remaining)
    AND EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=p_parent AND ps.student_id=s.id AND ps.revoked_at IS NULL);
$$;
CREATE OR REPLACE FUNCTION public.register_automatic_tuition_bundles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE child jsonb; child_index bigint; expected_memo text;
BEGIN
  FOR child,child_index IN SELECT value,ordinality FROM jsonb_array_elements(NEW.payload->'children') WITH ORDINALITY LOOP
    IF child ? 'debts' THEN
      expected_memo := public.tuition_bundle_memo((child->>'student_id')::uuid,child->'debts');
      IF split_part(NEW.payload->'parts'->(child_index::integer)->>'url','&addInfo=',2)
          IS DISTINCT FROM replace(expected_memo,' ','%20') THEN
        RAISE EXCEPTION 'Grouped tuition QR memo mismatch; update and restart Zalo bot';
      END IF;
      PERFORM public.register_tuition_bundle((child->>'student_id')::uuid,child->'debts');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.register_automatic_tuition_bundles() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS register_automatic_tuition_bundles ON public.automatic_tuition_reminders;
CREATE TRIGGER register_automatic_tuition_bundles BEFORE INSERT ON public.automatic_tuition_reminders
  FOR EACH ROW EXECUTE FUNCTION public.register_automatic_tuition_bundles();

REVOKE ALL ON FUNCTION public.tuition_debt_snapshot(uuid,date),public.tuition_bundle_memo(uuid,jsonb),public.register_tuition_bundle(uuid,jsonb),public.tuition_delivery_remaining(public.zalo_tuition_deliveries) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.list_tuition_arrears(date),public.queue_grouped_tuition(date,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_tuition_arrears(date),public.queue_grouped_tuition(date,jsonb,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.save_tuition_notice_amounts(date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_tuition_notice_amounts(date,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.reconcile_tuition_bundle(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_tuition_bundle(uuid) TO service_role;
COMMIT;
