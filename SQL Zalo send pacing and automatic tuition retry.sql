-- Apply after the existing automatic tuition, shared notice and quiet-hours migrations.
BEGIN;
ALTER TABLE public.automatic_tuition_reminders ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.automatic_tuition_reminders ADD COLUMN IF NOT EXISTS retry_history jsonb NOT NULL DEFAULT '[]';

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
  IF EXISTS(SELECT 1 FROM public.automatic_tuition_reminders WHERE month=p_month AND due_date=p_due AND status IN('queued','processing')) THEN
    RAISE EXCEPTION 'Hãy chờ đợt hiện tại xử lý xong trước khi gửi lại';
  END IF;
  IF p_confirm_uncertain IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cần xác nhận kiểm tra Zalo trước khi gửi lại'; END IF;
  UPDATE public.automatic_tuition_reminders r SET status='queued',token=NULL,lease_until=NULL,part_started=false,
    retry_count=r.retry_count+1,
    retry_history=r.retry_history||jsonb_build_array(jsonb_build_object('attempt',r.retry_count,
      'error',r.error_message,'next_part',r.next_part,'retried_at',clock_timestamp(),'retried_by',auth.uid())),
    error_message=NULL,updated_at=now()
  WHERE r.month=p_month AND r.due_date=p_due AND r.status='uncertain'
    AND r.next_part<jsonb_array_length(r.payload->'parts')
    -- Do not call the service-role bank RPC from an authenticated admin RPC.
    -- Claim/begin still perform the full final validation before publication.
    AND r.payload->'children'=public.automatic_tuition_snapshot(r.parent_id,r.month)
    AND jsonb_array_length(r.payload->'children')>0
    AND EXISTS(SELECT 1 FROM public.users p JOIN public.zalo_parent_contacts c ON c.parent_id=p.id
      WHERE p.id=r.parent_id AND p.role::text='parent' AND r.phone=regexp_replace(p.phone,'[^0-9]','','g')
        AND c.phone=r.phone AND c.zalo_uid IS NOT NULL AND (c.status='friend' OR c.greeting_sent_at IS NOT NULL))
    AND NOT EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries d WHERE d.parent_id=r.parent_id AND d.month=r.month
      AND d.status IN('queued','processing','not_found','not_friend','invited','greeted','uncertain'))
    AND (r.next_part=0 OR r.dispatch_uid=(SELECT c.zalo_uid FROM public.zalo_parent_contacts c WHERE c.parent_id=r.parent_id))
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
NOTIFY pgrst,'reload schema';
COMMIT;
