BEGIN;
SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
DO $$
DECLARE batch uuid; admin_id uuid; before_sent bigint; n integer; denied boolean:=false;
BEGIN
  SELECT id INTO admin_id FROM public.users WHERE role::text='admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  SELECT batch_id INTO batch FROM public.zalo_tuition_deliveries
    WHERE batch_id IS NOT NULL AND status='uncertain' ORDER BY created_at DESC LIMIT 1;
  IF batch IS NULL THEN RAISE EXCEPTION 'No batch fixture'; END IF;
  SELECT count(*) INTO before_sent FROM public.zalo_tuition_deliveries WHERE batch_id=batch AND status='sent';
  PERFORM public.control_zalo_tuition_batch(batch,'pause',false);
  IF EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE batch_id=batch
    AND status NOT IN ('sent','cancelled') AND NOT dispatch_paused) THEN RAISE EXCEPTION 'Pause failed'; END IF;
  BEGIN
    PERFORM public.control_zalo_tuition_batch(batch,'retry',false);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Confirm Zalo delivery review%' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Unconfirmed retry must require review'; END IF;
  n:=public.control_zalo_tuition_batch(batch,'retry',true);
  IF n=0 THEN RAISE EXCEPTION 'Retry did not queue eligible deliveries'; END IF;
  IF (SELECT count(*) FROM public.zalo_tuition_deliveries WHERE batch_id=batch AND status='sent')<>before_sent THEN
    RAISE EXCEPTION 'Sent history changed'; END IF;
  IF EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE batch_id=batch AND status='queued' AND sent_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Acknowledged delivery requeued'; END IF;
  UPDATE public.zalo_tuition_deliveries SET status='uncertain'
    WHERE id=(SELECT id FROM public.zalo_tuition_deliveries WHERE batch_id=batch AND status='queued' LIMIT 1);
  IF EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE batch_id=batch AND status='queued' AND NOT dispatch_paused) THEN
    RAISE EXCEPTION 'Missing acknowledgement did not stop the batch'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.mindup_zalo_dispatch_control SET next_tuition_at=now()+interval '1 minute' WHERE id=1;
  SELECT count(*) INTO n FROM public.claim_zalo_tuition_delivery();
  IF n<>0 THEN RAISE EXCEPTION 'Tuition pacing failed'; END IF;
  RAISE NOTICE 'PASS: pause, review gate, retry, sent preservation, uncertain halt, pacing';
END;
$$;
SELECT 'PASS: pause, review gate, retry, sent preservation, uncertain halt, pacing' AS result;
ROLLBACK;
