-- Apply after the existing automatic tuition, shared notice and quiet-hours migrations.
BEGIN;
ALTER TABLE public.automatic_tuition_reminders ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.automatic_tuition_reminders ADD COLUMN IF NOT EXISTS retry_history jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.automatic_tuition_reminders ADD COLUMN IF NOT EXISTS scan_pass integer NOT NULL DEFAULT 1 CHECK(scan_pass IN(1,2));
ALTER TABLE public.automatic_tuition_reminders ADD COLUMN IF NOT EXISTS scan_attempts integer NOT NULL DEFAULT 0 CHECK(scan_attempts BETWEEN 0 AND 2);
ALTER TABLE public.automatic_tuition_reminders ADD COLUMN IF NOT EXISTS scan_started boolean NOT NULL DEFAULT false;
ALTER TABLE public.mindup_zalo_dispatch_control ADD COLUMN IF NOT EXISTS next_automatic_scan_at timestamptz NOT NULL DEFAULT '-infinity';
-- Existing uncertain/active records already used their first attempt. Never
-- reset these counters on redeployment, restart, or the minute scheduler tick.
UPDATE public.automatic_tuition_reminders SET scan_attempts=1,scan_started=true
  WHERE status IN('uncertain','processing','sent') AND scan_attempts=0;

CREATE OR REPLACE FUNCTION public.retry_failed_automatic_tuition(
  p_month date,p_due date,p_confirm_uncertain boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; latest_due date;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text='admin')
    OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_month IS DISTINCT FROM date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RAISE EXCEPTION 'Chỉ gửi lại thông báo của tháng hiện tại';
  END IF;
  PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
  SELECT max(due_date) INTO latest_due FROM public.automatic_tuition_reminders WHERE month=p_month;
  IF p_due IS NULL OR p_due IS DISTINCT FROM latest_due THEN RAISE EXCEPTION 'Đợt gửi đã thay đổi; hãy tải lại'; END IF;
  IF EXISTS(SELECT 1 FROM public.automatic_tuition_reminders WHERE month=p_month AND due_date=p_due
    AND (status IN('queued','processing') OR (status='uncertain' AND scan_pass=1))) THEN
    RAISE EXCEPTION 'Hãy chờ đợt hiện tại xử lý xong trước khi gửi lại';
  END IF;
  IF p_confirm_uncertain IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cần xác nhận kiểm tra Zalo trước khi gửi lại'; END IF;
  UPDATE public.automatic_tuition_reminders r SET status='queued',token=NULL,lease_until=NULL,part_started=false,
    retry_count=r.retry_count+1,scan_pass=1,scan_attempts=0,scan_started=false,
    retry_history=r.retry_history||jsonb_build_array(jsonb_build_object('attempt',r.retry_count,
      'error',r.error_message,'next_part',r.next_part,'retried_at',clock_timestamp(),'retried_by',auth.uid())),
    error_message=NULL,updated_at=now()
  WHERE r.month=p_month AND r.due_date=p_due AND r.status='uncertain'
    AND r.next_part<jsonb_array_length(r.payload->'parts')
    -- Requeue missing/unreachable contacts too: the scan must assess and finish
    -- them, rather than leave them queued forever. Claim/begin validate content.
    AND NOT EXISTS(SELECT 1 FROM public.automatic_tuition_reminders newer
      WHERE newer.parent_id=r.parent_id AND newer.month=r.month AND newer.slot>r.slot);
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_failed_automatic_tuition(date,date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_failed_automatic_tuition(date,date,boolean) TO authenticated;

-- Carry an explicit attempt identity to the local receipt ledger. Scheduler
-- refreshes can replace payloads, so the counter must live outside the payload.
DO $migration$
DECLARE source text;
BEGIN
  source:=pg_get_functiondef('public.claim_automatic_tuition_reminder(date,integer)'::regprocedure);
  IF position('automatic_tuition_retry_identity' IN source)=0 THEN
    IF position('x.payload' IN source)=0 THEN RAISE EXCEPTION 'Automatic claim payload changed'; END IF;
    source:=replace(source,'x.payload',
      '(x.payload||jsonb_build_object(''retry_attempt'',(SELECT retry.retry_count FROM public.automatic_tuition_reminders retry WHERE retry.id=x.id))) /* automatic_tuition_retry_identity */');
    EXECUTE source;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.reserve_mindup_zalo_dispatch_slot(
  p_spacing_seconds integer,p_batch_size integer,p_batch_pause_seconds integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ctl public.mindup_zalo_dispatch_control%ROWTYPE; v_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_spacing_seconds IS NULL OR p_spacing_seconds NOT BETWEEN 0 AND 300
    OR p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 500
    OR p_batch_pause_seconds IS NULL OR p_batch_pause_seconds NOT BETWEEN 0 AND 86400 THEN RAISE EXCEPTION 'Invalid pacing'; END IF;
  SELECT * INTO ctl FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
  IF ctl.paused OR (SELECT paused FROM public.zalo_automation_state WHERE id=1) THEN RETURN NULL; END IF;
  v_at:=greatest(clock_timestamp(),ctl.next_send_at);
  UPDATE public.mindup_zalo_dispatch_control SET batch_count=0,
    next_send_at=v_at+make_interval(secs=>greatest(10,p_spacing_seconds)),updated_at=now() WHERE id=1;
  RETURN v_at;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_mindup_zalo_dispatch_slot(integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_mindup_zalo_dispatch_slot(integer,integer,integer) TO service_role;

DO $migration$
DECLARE source text; anchor text:='IF ctl.paused OR (SELECT paused FROM public.zalo_automation_state WHERE id=1) THEN RETURN; END IF;';
BEGIN
  source:=pg_get_functiondef('public.claim_next_mindup_zalo_dispatch(integer,integer,integer)'::regprocedure);
  IF position('minimum_ten_second_pacing' IN source)=0 THEN
    IF position(anchor IN source)=0 OR position('next_send_at = now()' IN source)=0 THEN RAISE EXCEPTION 'Shared claim pacing changed'; END IF;
    source:=replace(source,anchor,anchor||E'\n  -- minimum_ten_second_pacing\n  IF ctl.next_send_at>clock_timestamp() THEN RETURN; END IF;');
    source:=replace(source,'next_send_at = now()','next_send_at = clock_timestamp()+make_interval(secs=>greatest(10,p_spacing_seconds))');
    EXECUTE source;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.claim_automatic_tuition_reminder(p_today date,p_slot integer)
RETURNS TABLE(id uuid,token uuid,zalo_uid text,payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job public.automatic_tuition_reminders; contact public.zalo_parent_contacts;
  valid boolean; reason text; claim_token uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_today IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date OR p_slot IS NULL OR p_slot NOT IN(5,10,15) THEN
    RAISE EXCEPTION 'Invalid clock or slot'; END IF;
  IF NOT public.automatic_tuition_sending_time() THEN RETURN; END IF;
  PERFORM 1 FROM public.mindup_zalo_dispatch_control ctl WHERE ctl.id=1 FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.mindup_zalo_dispatch_control ctl WHERE ctl.id=1 AND NOT ctl.paused)
    OR NOT EXISTS(SELECT 1 FROM public.zalo_automation_state s WHERE s.id=1 AND NOT s.paused)
    OR EXISTS(SELECT 1 FROM public.automatic_tuition_control ctl WHERE ctl.id=1 AND ctl.paused)
    OR NOT EXISTS(SELECT 1 FROM public.message_templates t WHERE t.id='tuition_reminder' AND t.is_enabled) THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM public.mindup_zalo_dispatch_control ctl WHERE ctl.id=1 AND ctl.next_automatic_scan_at>clock_timestamp()) THEN RETURN; END IF;
  UPDATE public.zalo_outbox SET status='uncertain',locked_until=NULL WHERE status='processing' AND locked_until<=now();
  UPDATE public.zalo_tuition_receipts SET status='uncertain',lease_until=NULL WHERE status='processing' AND lease_until<=now();
  UPDATE public.zalo_tuition_deliveries SET status='uncertain',lease_until=NULL WHERE status='processing' AND lease_until<=now();
  UPDATE public.automatic_tuition_reminders r SET status='uncertain',lease_until=NULL,
    error_message='Interrupted dispatcher; inspect Zalo before resuming',updated_at=now()
    WHERE r.status='processing' AND r.lease_until<=now();
  UPDATE public.automatic_tuition_reminders r SET status='cancelled',updated_at=now(),error_message='Expired month or slot'
    WHERE r.status='queued' AND (r.month<>date_trunc('month',p_today)::date OR r.slot<p_slot);
  UPDATE public.automatic_tuition_reminders r SET scan_pass=2,updated_at=now(),
    error_message=left('Đợt gửi đã hết hạn; không tự quét tiếp. '||coalesce(r.error_message,''),500)
    WHERE r.status='uncertain' AND r.scan_pass=1 AND (r.month<>date_trunc('month',p_today)::date OR r.slot<p_slot);
  IF EXISTS(SELECT 1 FROM public.automatic_tuition_reminders r WHERE r.status='processing')
    OR EXISTS(SELECT 1 FROM public.zalo_outbox WHERE status='processing')
    OR EXISTS(SELECT 1 FROM public.zalo_tuition_receipts WHERE status='processing')
    OR EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE status='processing') THEN RETURN; END IF;

  -- The second sweep starts only after EVERY queued parent in the first sweep
  -- has been assessed. Successful/cancelled jobs are never requeued.
  IF NOT EXISTS(SELECT 1 FROM public.automatic_tuition_reminders r WHERE r.status='queued'
    AND r.month=date_trunc('month',p_today)::date AND r.slot=p_slot AND r.due_date<=p_today) THEN
    UPDATE public.automatic_tuition_reminders r SET status='queued',scan_pass=2,scan_started=false,
      retry_count=r.retry_count+1,token=NULL,lease_until=NULL,part_started=false,
      retry_history=r.retry_history||jsonb_build_array(jsonb_build_object('attempt',r.retry_count,
        'error',r.error_message,'next_part',r.next_part,'retry_kind','second_sweep','retried_at',clock_timestamp())),updated_at=now()
    WHERE r.status='uncertain' AND r.scan_pass=1 AND r.scan_attempts<2
      AND r.month=date_trunc('month',p_today)::date AND r.slot=p_slot AND r.due_date<=p_today;
  END IF;
  SELECT r.* INTO job FROM public.automatic_tuition_reminders r WHERE r.status='queued'
    AND r.month=date_trunc('month',p_today)::date AND r.slot=p_slot AND r.due_date<=p_today
    ORDER BY r.scan_pass,r.created_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.mindup_zalo_dispatch_control ctl SET next_automatic_scan_at=clock_timestamp()+interval '10 seconds' WHERE ctl.id=1;
  -- A quiet-hours deferral resumes the same attempt, not a third attempt.
  IF NOT job.scan_started AND job.scan_attempts>=2 THEN
    UPDATE public.automatic_tuition_reminders r SET status='uncertain',scan_pass=2,error_message='Đã thử tối đa 2 lần; cần bấm Gửi lại phụ huynh bị lỗi',updated_at=now() WHERE r.id=job.id;
    RETURN;
  END IF;
  SELECT c.* INTO contact FROM public.zalo_parent_contacts c WHERE c.parent_id=job.parent_id;
  IF job.payload->'children' IS DISTINCT FROM public.automatic_tuition_snapshot(job.parent_id,job.month) THEN
    UPDATE public.automatic_tuition_reminders r SET status='cancelled',error_message='Saved calculation changed',updated_at=now() WHERE r.id=job.id;
    RETURN;
  END IF;
  IF contact.zalo_uid IS NULL THEN reason:='Chưa tìm thấy hoặc chưa liên kết Zalo phụ huynh.';
  ELSIF contact.status IS DISTINCT FROM 'friend' AND contact.greeting_sent_at IS NULL THEN
    reason:=coalesce(nullif(contact.last_error,''),CASE WHEN contact.status='invited'
      THEN 'Phụ huynh chưa chấp nhận lời mời kết bạn Zalo.' ELSE 'Chưa đủ điều kiện nhắn Zalo cho phụ huynh.' END);
  ELSIF job.next_part>0 AND job.dispatch_uid IS DISTINCT FROM contact.zalo_uid THEN reason:='Liên kết Zalo đã thay đổi sau khi gửi một phần; cần kiểm tra trước khi gửi tiếp.';
  ELSIF EXISTS(SELECT 1 FROM public.automatic_tuition_reminders r WHERE r.id<>job.id
    AND r.parent_id=job.parent_id AND r.month=job.month AND r.status='uncertain') THEN reason:='Có lượt gửi khác chưa xác nhận; cần kiểm tra Zalo.';
  ELSE
    BEGIN
      valid:=public.automatic_tuition_valid(job.id);
    EXCEPTION WHEN OTHERS THEN valid:=false; reason:=SQLERRM;
    END;
    IF valid IS DISTINCT FROM true THEN reason:=coalesce(reason,'Công nợ, số điện thoại, liên kết, cấu hình QR hoặc lượt gửi khác không còn hợp lệ.'); END IF;
  END IF;
  IF reason IS NOT NULL THEN
    UPDATE public.automatic_tuition_reminders r SET status='uncertain',lease_until=NULL,part_started=false,
      scan_attempts=r.scan_attempts+CASE WHEN r.scan_started THEN 0 ELSE 1 END,scan_started=true,
      error_message=left(reason,500),updated_at=now() WHERE r.id=job.id;
    RETURN;
  END IF;
  claim_token:=gen_random_uuid();
  UPDATE public.automatic_tuition_reminders r SET status='processing',token=claim_token,dispatch_uid=contact.zalo_uid,error_message=NULL,
    scan_attempts=r.scan_attempts+CASE WHEN r.scan_started THEN 0 ELSE 1 END,scan_started=true,
    lease_until=now()+interval '5 minutes',updated_at=now() WHERE r.id=job.id;
  RETURN QUERY SELECT job.id,claim_token,contact.zalo_uid,
    job.payload||jsonb_build_object('next_part',job.next_part,'retry_attempt',job.retry_count);
  -- automatic_tuition_retry_identity / automatic_tuition_resume_part
END;
$$;
REVOKE ALL ON FUNCTION public.claim_automatic_tuition_reminder(date,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automatic_tuition_reminder(date,integer) TO service_role;

DO $read_status$
DECLARE source text;
BEGIN
  source:=pg_get_functiondef('public.list_automatic_tuition_reminders(date)'::regprocedure);
  IF position('auto_retry_pending' IN source)=0 THEN
    IF source !~ $pattern$'status',\s*r.status,$pattern$ THEN RAISE EXCEPTION 'Automatic status definition changed'; END IF;
    source:=regexp_replace(source,$pattern$'status',\s*r.status,$pattern$,
      $fields$'status',r.status,'scan_pass',r.scan_pass,'scan_attempts',r.scan_attempts,
      'auto_retry_pending',(r.status='uncertain' AND r.scan_pass=1 AND r.month=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),$fields$);
    EXECUTE source;
  END IF;
END;
$read_status$;
NOTIFY pgrst,'reload schema';
COMMIT;
