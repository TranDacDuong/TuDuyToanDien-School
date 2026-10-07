BEGIN;
SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
DO $$
DECLARE student uuid; admin_id uuid; r jsonb; baseline numeric; paid numeric;
BEGIN
  SELECT id INTO admin_id FROM public.users WHERE role::text='admin' LIMIT 1;
  SELECT id INTO student FROM public.users u WHERE role::text='student'
    AND regexp_replace(phone,'[^0-9]','','g') ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND NOT EXISTS(SELECT 1 FROM public.tuition_payments t WHERE t.student_id=u.id AND t.month>='2090-01-01') LIMIT 1;
  IF student IS NULL OR admin_id IS NULL THEN RAISE EXCEPTION 'No fixture'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  SELECT coalesce(sum(amount_due-amount_paid),0) INTO baseline FROM public.tuition_payments
    WHERE student_id=student AND month<'2090-01-01' AND amount_due>amount_paid;
  INSERT INTO public.tuition_payments(student_id,month,amount_due,amount_paid) VALUES
    (student,'2090-09-01',360000,120000),(student,'2090-10-01',960000,100000),
    (student,'2090-11-01',100000,0);
  r:=public.prepare_tuition_detail_bundle(student,'2090-10-01',960000);
  IF (r->>'remaining')::numeric<>baseline+1100000 THEN RAISE EXCEPTION 'Wrong total or included future debt'; END IF;
  IF position('0990 1090' IN r->>'memo')=0 THEN RAISE EXCEPTION 'Missing readable months'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tuition_transfer_bundles WHERE memo=r->>'memo' AND student_id=student) THEN RAISE EXCEPTION 'QR memo not registered'; END IF;
  r:=public.prepare_tuition_detail_bundle(student,'2090-10-01',1000000);
  SELECT amount_paid INTO paid FROM public.tuition_payments WHERE student_id=student AND month='2090-10-01';
  IF paid<>100000 OR (r->>'remaining')::numeric<>baseline+1140000 THEN RAISE EXCEPTION 'Paid balance lost'; END IF;
  UPDATE public.tuition_payments SET locked_at=now() WHERE student_id=student AND month='2090-10-01';
  BEGIN
    PERFORM public.prepare_tuition_detail_bundle(student,'2090-10-01',1200000);
    RAISE EXCEPTION 'Locked amount was overwritten';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'Locked tuition amount changed; reload tuition' THEN RAISE; END IF;
  END;
  UPDATE public.tuition_payments SET locked_at=NULL WHERE student_id=student AND month='2090-10-01';
  UPDATE public.tuition_payments SET amount_paid=1000000 WHERE student_id=student AND month='2090-10-01';
  r:=public.prepare_tuition_detail_bundle(student,'2090-10-01',1000000);
  IF (r->>'remaining')::numeric<>baseline+240000 OR position('1090' IN r->>'memo')>0 THEN RAISE EXCEPTION 'Paid current month still included'; END IF;
  PERFORM set_config('request.jwt.claim.sub',student::text,true);
  r:=public.prepare_tuition_detail_bundle(student,'2090-10-01',1000000);
  IF (r->>'remaining')::numeric<>baseline+240000 THEN RAISE EXCEPTION 'Own tuition inaccessible'; END IF;
  BEGIN
    PERFORM public.prepare_tuition_detail_bundle(student,'2090-10-01',1200000);
    RAISE EXCEPTION 'Read-only user changed tuition';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'Current tuition has not been saved; ask an administrator to save it before generating QR' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  BEGIN
    PERFORM public.prepare_tuition_detail_bundle(student,'2090-10-01',1000000);
    RAISE EXCEPTION 'Permission check bypassed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'Tuition access denied' THEN RAISE; END IF;
  END;
END;
$$;
SELECT 'PASS: detail totals, future exclusion, registered QR, paid preservation and access checks' AS result;
ROLLBACK;
