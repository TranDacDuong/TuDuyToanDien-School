-- Run after the migration inside a transaction; never sends real messages.
BEGIN;
SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
DO $$
DECLARE student uuid; admin_id uuid; parent uuid; debts jsonb; memo text; log_id uuid; r jsonb; paid numeric; total_paid numeric; p_id uuid; amount numeric; child jsonb; delivery public.zalo_tuition_deliveries%ROWTYPE;
BEGIN
  SELECT u.id INTO student FROM public.users u WHERE u.role::text='student'
    AND regexp_replace(u.phone,'[^0-9]','','g') ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND EXISTS(SELECT 1 FROM public.parent_students ps JOIN public.users p ON p.id=ps.parent_id
      WHERE ps.student_id=u.id AND ps.revoked_at IS NULL AND p.role::text='parent' AND regexp_replace(p.phone,'[^0-9]','','g') ~ '^(0[0-9]{9}|84[0-9]{9})$')
    AND NOT EXISTS(SELECT 1 FROM public.tuition_payments p WHERE p.student_id=u.id AND p.month>='2090-01-01') LIMIT 1;
  IF student IS NULL THEN RAISE EXCEPTION 'No student fixture'; END IF;
  SELECT id INTO admin_id FROM public.users WHERE role::text='admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  SELECT ps.parent_id INTO parent FROM public.parent_students ps JOIN public.users p ON p.id=ps.parent_id WHERE ps.student_id=student AND ps.revoked_at IS NULL AND regexp_replace(p.phone,'[^0-9]','','g') ~ '^(0[0-9]{9}|84[0-9]{9})$' LIMIT 1;
  INSERT INTO public.tuition_payments(student_id,month,amount_due,amount_paid) VALUES
    (student,'2090-08-01',240000,0),(student,'2090-09-01',360000,0),(student,'2090-10-01',960000,0);
  debts:=public.tuition_debt_snapshot(student,'2090-10-01');
  SELECT sum((value->>'remaining')::numeric) INTO amount FROM jsonb_array_elements(debts);
  UPDATE public.tuition_payments SET locked_at=now() WHERE student_id=student AND month='2090-10-01';
  SELECT value INTO child FROM jsonb_array_elements(public.automatic_tuition_snapshot(parent,'2090-10-01')) WHERE value->>'student_id'=student::text;
  IF child->'debts' IS DISTINCT FROM debts OR (child->>'remaining')::numeric<>amount THEN RAISE EXCEPTION 'Automatic reminder omitted arrears'; END IF;
  UPDATE public.tuition_payments SET locked_at=NULL WHERE student_id=student AND month='2090-10-01';
  memo:=public.tuition_bundle_memo(student,debts);
  r:=public.queue_grouped_tuition('2090-10-01',jsonb_build_array(jsonb_build_object(
    'request_key',gen_random_uuid(),'batch_id',gen_random_uuid(),'student_id',student,'parent_id',parent,
    'remaining',amount,'debts',debts,'memo',memo,'encoded_memo',replace(memo,' ','%20'),'content','Test '||memo,
    'qr_url','https://img.vietqr.io/image/vietinbank-104888332556-compact2.png?amount='||amount::bigint::text||'&addInfo='||replace(memo,' ','%20'))),true);
  IF (r->>'queued')::integer<>1 THEN RAISE EXCEPTION 'Queue did not create grouped notice: %',r; END IF;
  SELECT * INTO delivery FROM public.zalo_tuition_deliveries WHERE student_id=student AND month='2090-10-01';
  IF public.tuition_delivery_remaining(delivery)<>amount THEN RAISE EXCEPTION 'Grouped send amount mismatch'; END IF;
  UPDATE public.tuition_payments SET amount_paid=1 WHERE student_id=student AND month='2090-08-01';
  IF public.tuition_delivery_remaining(delivery)<>-1 THEN RAISE EXCEPTION 'Changed debt was not detected'; END IF;
  UPDATE public.tuition_payments SET amount_paid=0 WHERE student_id=student AND month='2090-08-01';
  SELECT jsonb_agg(jsonb_build_object('payment_id',id,'month',month,'remaining',amount_due-amount_paid) ORDER BY month) INTO debts
    FROM public.tuition_payments WHERE student_id=student AND month BETWEEN '2090-08-01' AND '2090-10-01';
  memo:=public.register_tuition_bundle(student,debts);
  IF position('HP0890 0990 1090' IN memo)=0 THEN RAISE EXCEPTION 'Readable month tags failed: %',memo; END IF;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.bank_transaction_logs(gateway,transaction_id,amount,signed_amount,content,status,direction,transaction_at)
    VALUES('test','arrears-'||gen_random_uuid()::text,400000,400000,memo,'failed','in',now()) RETURNING id INTO log_id;
  r:=public.reconcile_tuition_bundle(log_id);
  IF r->>'status'<>'success' THEN RAISE EXCEPTION 'Reconciliation failed: %',r; END IF;
  SELECT amount_paid INTO paid FROM public.tuition_payments WHERE student_id=student AND month='2090-08-01';
  IF paid<>240000 THEN RAISE EXCEPTION 'Oldest month not paid first'; END IF;
  SELECT amount_paid INTO paid FROM public.tuition_payments WHERE student_id=student AND month='2090-09-01';
  IF paid<>160000 THEN RAISE EXCEPTION 'Partial month allocation failed'; END IF;
  r:=public.reconcile_tuition_bundle(log_id);
  SELECT sum(amount_paid) INTO total_paid FROM public.tuition_payments WHERE student_id=student AND month BETWEEN '2090-08-01' AND '2090-10-01';
  IF total_paid<>400000 OR r->>'status'<>'duplicate_ignored' THEN RAISE EXCEPTION 'Duplicate callback credited twice'; END IF;
  INSERT INTO public.bank_transaction_logs(gateway,transaction_id,amount,signed_amount,content,status,direction,transaction_at)
    VALUES('test','arrears-'||gen_random_uuid()::text,1260000,1260000,memo,'failed','in',now()) RETURNING id INTO log_id;
  PERFORM public.reconcile_tuition_bundle(log_id);
  SELECT amount_paid INTO paid FROM public.tuition_payments WHERE student_id=student AND month='2090-10-01';
  IF paid<>1060000 THEN RAISE EXCEPTION 'Overpayment credit lost'; END IF;
  SELECT id INTO admin_id FROM public.users WHERE role::text='admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM public.save_tuition_notice_amounts('2090-10-01',jsonb_build_array(jsonb_build_object('student_id',student,'amount_due',960000)));
  SELECT amount_paid INTO paid FROM public.tuition_payments WHERE student_id=student AND month='2090-10-01';
  IF paid<>1060000 THEN RAISE EXCEPTION 'Preparing notice overwrote paid balance'; END IF;
END;
$$;
SELECT 'PASS: memo, oldest-first, partial, duplicate, overpayment and paid-balance preservation' AS result;
ROLLBACK;
