-- Append to SQL unified Zalo dispatch.sql in place of its final COMMIT.
-- The transaction rolls back every fixture and temporary queue state.
SELECT * FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
DO $test$
DECLARE a uuid; p public.zalo_parent_contacts%ROWTYPE; payment public.tuition_payments%ROWTYPE;
  greeting uuid; greeting_again uuid; receipt uuid; receipt_message uuid; conv uuid;
  job record; result text; n integer;
BEGIN
  SELECT id INTO a FROM public.users WHERE role::text='admin' LIMIT 1;
  SELECT c.* INTO p FROM public.zalo_parent_contacts c
    JOIN public.zalo_verified_links l ON l.audience_user_id=c.parent_id AND l.zalo_uid=c.zalo_uid AND l.enabled
    JOIN public.parent_students ps ON ps.parent_id=c.parent_id AND ps.revoked_at IS NULL
    JOIN public.tuition_payments tp ON tp.student_id=ps.student_id
    JOIN public.users u ON u.id=c.parent_id
    WHERE c.phone=regexp_replace(u.phone,'[^0-9]','','g') LIMIT 1;
  IF a IS NULL OR p.parent_id IS NULL THEN RAISE EXCEPTION 'Missing linked test parent/admin'; END IF;
  SELECT tp.* INTO payment FROM public.tuition_payments tp JOIN public.parent_students ps
    ON ps.student_id=tp.student_id AND ps.revoked_at IS NULL WHERE ps.parent_id=p.parent_id LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',a)::text,true);
  UPDATE public.zalo_outbox SET status='cancelled' WHERE status IN ('pending','processing');
  UPDATE public.zalo_tuition_receipts SET status='cancelled' WHERE status IN ('pending','processing');
  UPDATE public.zalo_tuition_deliveries SET status='cancelled'
    WHERE status IN ('queued','processing','not_found','not_friend','invited','greeted');
  UPDATE public.zalo_automation_state SET paused=false WHERE id=1;
  UPDATE public.mindup_zalo_dispatch_control SET paused=false,urgent_streak=0 WHERE id=1;
  UPDATE public.zalo_parent_contacts SET status='invited' WHERE parent_id=p.parent_id;

  greeting:=public.enqueue_mindup_parent_greeting(p.parent_id,p.phone,p.zalo_uid,'dispatch-test-greeting');
  greeting_again:=public.enqueue_mindup_parent_greeting(p.parent_id,p.phone,p.zalo_uid,'dispatch-test-greeting');
  IF greeting<>greeting_again THEN RAISE EXCEPTION 'Greeting deduplication failed'; END IF;
  -- Existing greeting may belong to this contact; make its content a fixture.
  UPDATE public.zalo_outbox SET status='pending',content='dispatch-test-greeting' WHERE id=greeting;
  INSERT INTO public.zalo_tuition_receipts(event_key,payment_id,student_id,parent_id,month,received_amount,content)
    VALUES('dispatch-test:'||gen_random_uuid(),payment.id,payment.student_id,p.parent_id,payment.month,1000,'dispatch-test-receipt')
    RETURNING id INTO receipt;
  SELECT message_id INTO receipt_message FROM public.zalo_tuition_receipts WHERE id=receipt;
  IF receipt_message IS NULL THEN RAISE EXCEPTION 'Receipt did not create web message'; END IF;
  IF EXISTS(SELECT 1 FROM public.zalo_outbox WHERE message_id=receipt_message) THEN RAISE EXCEPTION 'Receipt queued twice'; END IF;

  SELECT * INTO job FROM public.claim_next_mindup_zalo_dispatch(0,50,0);
  IF job.kind<>'receipt' OR job.job_id<>receipt THEN RAISE EXCEPTION 'Receipt priority failed'; END IF;
  SELECT count(*) INTO n FROM public.claim_next_mindup_zalo_dispatch(0,50,0);
  IF n<>0 THEN RAISE EXCEPTION 'Concurrent delivery was claimed'; END IF;
  result:=public.sync_mindup_zalo_message(p.zalo_uid||':dispatch-test-id',p.zalo_uid,'dispatch-test-receipt',NULL,true,now(),false);
  IF result<>'deferred' THEN RAISE EXCEPTION 'Receipt echo was not deferred'; END IF;
  PERFORM public.finish_mindup_tuition_dispatch('receipt',receipt,'sent',p.zalo_uid||':dispatch-test-id');
  result:=public.sync_mindup_zalo_message(p.zalo_uid||':dispatch-test-id',p.zalo_uid,'dispatch-test-receipt',NULL,true,now(),false);
  IF result<>'duplicate' THEN RAISE EXCEPTION 'Receipt echo duplicated'; END IF;
  SELECT * INTO job FROM public.claim_next_mindup_zalo_dispatch(0,50,0);
  IF job.job_id<>greeting THEN RAISE EXCEPTION 'Next delivery did not proceed immediately'; END IF;
  PERFORM public.finish_mindup_zalo_message_v2(greeting,'uncertain','test timeout',NULL);
  IF public.retry_mindup_zalo_dispatch('web',greeting) THEN RAISE EXCEPTION 'Uncertain delivery retried'; END IF;

  PERFORM public.set_mindup_zalo_dispatch_paused(true);
  IF NOT (SELECT paused FROM public.zalo_automation_state WHERE id=1) THEN RAISE EXCEPTION 'Pause did not cover all sources'; END IF;
  SELECT count(*) INTO n FROM public.claim_next_mindup_zalo_dispatch(0,50,0);
  IF n<>0 THEN RAISE EXCEPTION 'Paused dispatcher claimed work'; END IF;
  PERFORM public.set_mindup_zalo_dispatch_paused(false);
  PERFORM public.list_mindup_zalo_dispatch_jobs();
  PERFORM public.list_mindup_zalo_message_deliveries(ARRAY[receipt_message]);
  PERFORM public.get_mindup_zalo_dispatch_status();
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',p.parent_id)::text,true);
  BEGIN
    PERFORM public.list_mindup_zalo_dispatch_jobs();
    RAISE EXCEPTION 'Parent was able to inspect admin queue';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'Admin required' THEN RAISE; END IF;
  END;
END;
$test$;
ROLLBACK;
SELECT 'dispatch behavior verified; all fixtures rolled back' AS result;
