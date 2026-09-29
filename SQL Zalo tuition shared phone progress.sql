-- Share one Zalo identity across duplicate parent accounts with the same phone,
-- while keeping one tuition delivery per student. Tag queue batches for progress.

ALTER TABLE public.zalo_tuition_deliveries ADD COLUMN IF NOT EXISTS batch_id uuid;
CREATE INDEX IF NOT EXISTS zalo_tuition_deliveries_batch_idx
  ON public.zalo_tuition_deliveries (month, batch_id, created_at);

WITH latest AS (
  SELECT month, max(created_at) AS created_at
  FROM public.zalo_tuition_deliveries GROUP BY month
)
UPDATE public.zalo_tuition_deliveries d
SET batch_id = md5(d.month::text || '|' || d.created_at::text)::uuid
FROM latest l
WHERE d.month = l.month AND d.created_at = l.created_at AND d.batch_id IS NULL;

CREATE OR REPLACE FUNCTION public.queue_zalo_tuition_deliveries(p_month text, p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item jsonb; v_student uuid; v_parent uuid; v_request uuid; v_batch uuid; v_month date;
  v_attempt integer; v_count integer := 0; v_phone text;
  v_remaining numeric; v_due numeric; v_paid numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()
    AND role::text IN ('admin','assistant','accountant')) THEN RAISE EXCEPTION 'Tuition staff required'; END IF;
  IF p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Invalid month or batch size'; END IF;
  v_month := (p_month || '-01')::date;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_student := (v_item->>'student_id')::uuid;
    v_parent := (v_item->>'parent_id')::uuid;
    v_request := (v_item->>'request_key')::uuid;
    v_batch := COALESCE(NULLIF(v_item->>'batch_id','')::uuid, v_request);
    IF EXISTS (SELECT 1 FROM public.zalo_tuition_deliveries WHERE request_key = v_request) THEN CONTINUE; END IF;
    IF length(trim(COALESCE(v_item->>'content',''))) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Invalid tuition message'; END IF;
    IF nullif(v_item->>'qr_url','') IS NOT NULL AND
      ((v_item->>'qr_url') NOT LIKE 'https://img.vietqr.io/image/%' OR length(v_item->>'qr_url') > 1000) THEN
      RAISE EXCEPTION 'Invalid QR image URL';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.parent_students ps
      WHERE ps.student_id = v_student AND ps.parent_id = v_parent AND ps.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'Parent is not linked to student';
    END IF;
    SELECT regexp_replace(phone, '[^0-9]', '', 'g') INTO v_phone FROM public.users
    WHERE id = v_parent AND role::text = 'parent';
    IF v_phone IS NULL OR v_phone !~ '^(0[0-9]{9}|84[0-9]{9})$' THEN RAISE EXCEPTION 'Parent phone is missing or invalid'; END IF;
    SELECT tp.amount_due, tp.amount_paid INTO v_due, v_paid FROM public.tuition_payments tp
    WHERE tp.student_id = v_student AND tp.month = v_month;
    v_remaining := (v_item->>'remaining')::numeric;
    IF v_due IS NULL OR v_due <= 0 OR v_paid >= v_due OR v_remaining <> v_due - v_paid THEN
      RAISE EXCEPTION 'No unpaid saved tuition for this student/month';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_student::text || v_parent::text || p_month, 0));
    IF EXISTS (SELECT 1 FROM public.zalo_tuition_deliveries
      WHERE student_id = v_student AND parent_id = v_parent AND month = v_month
        AND status IN ('queued','processing','not_found','not_friend','invited','greeted')) THEN CONTINUE; END IF;
    SELECT COALESCE(max(attempt_no), 0) + 1 INTO v_attempt FROM public.zalo_tuition_deliveries
    WHERE student_id = v_student AND parent_id = v_parent AND month = v_month;
    IF v_attempt > 3 THEN RAISE EXCEPTION 'Maximum three reminders per student/month'; END IF;
    INSERT INTO public.zalo_tuition_deliveries
      (request_key,batch_id,student_id,parent_id,month,attempt_no,remaining_snapshot,content,qr_url,created_by)
    VALUES (v_request,v_batch,v_student,v_parent,v_month,v_attempt,v_remaining,
      trim(v_item->>'content'),nullif(v_item->>'qr_url',''),auth.uid());
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_zalo_parent_check()
RETURNS TABLE(parent_id uuid, phone text, zalo_uid text, status text,
  invitation_attempted_at timestamptz, invitation_sent_at timestamptz,
  greeting_attempted_at timestamptz, greeting_sent_at timestamptz, student_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF (SELECT paused FROM public.zalo_automation_state WHERE id = 1) THEN RETURN; END IF;

  INSERT INTO public.zalo_parent_contacts(parent_id, phone)
  SELECT p.id, regexp_replace(p.phone, '[^0-9]', '', 'g') FROM public.users p
  WHERE p.role::text = 'parent'
    AND regexp_replace(p.phone, '[^0-9]', '', 'g') ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.parent_id = p.id AND ps.revoked_at IS NULL)
  ON CONFLICT ON CONSTRAINT zalo_parent_contacts_pkey DO UPDATE SET
    phone = excluded.phone,
    zalo_uid = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone THEN public.zalo_parent_contacts.zalo_uid ELSE NULL END,
    status = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone THEN public.zalo_parent_contacts.status ELSE 'pending' END,
    invitation_attempted_at = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone THEN public.zalo_parent_contacts.invitation_attempted_at ELSE NULL END,
    invitation_sent_at = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone THEN public.zalo_parent_contacts.invitation_sent_at ELSE NULL END,
    greeting_attempted_at = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone THEN public.zalo_parent_contacts.greeting_attempted_at ELSE NULL END,
    greeting_sent_at = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone THEN public.zalo_parent_contacts.greeting_sent_at ELSE NULL END,
    next_check_at = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone THEN public.zalo_parent_contacts.next_check_at ELSE now() END;

  WITH best AS (
    SELECT DISTINCT ON (c.phone) c.phone,c.zalo_uid,c.status,c.invitation_attempted_at,c.invitation_sent_at,
      c.greeting_attempted_at,c.greeting_sent_at,c.last_checked_at,c.next_check_at,c.last_error
    FROM public.zalo_parent_contacts c
    ORDER BY c.phone, CASE c.status WHEN 'friend' THEN 0 WHEN 'invited' THEN 1 WHEN 'pending' THEN 2
      WHEN 'not_friend' THEN 3 WHEN 'error' THEN 4 WHEN 'not_found' THEN 5 ELSE 6 END,
      (c.zalo_uid IS NOT NULL) DESC,c.updated_at DESC
  )
  UPDATE public.zalo_parent_contacts c SET zalo_uid=b.zalo_uid,status=b.status,
    invitation_attempted_at=b.invitation_attempted_at,invitation_sent_at=b.invitation_sent_at,
    greeting_attempted_at=b.greeting_attempted_at,greeting_sent_at=b.greeting_sent_at,
    last_checked_at=b.last_checked_at,next_check_at=least(c.next_check_at,b.next_check_at),
    last_error=b.last_error,updated_at=now()
  FROM best b WHERE c.phone=b.phone
    AND (c.zalo_uid,c.status,c.invitation_sent_at,c.greeting_sent_at)
      IS DISTINCT FROM (b.zalo_uid,b.status,b.invitation_sent_at,b.greeting_sent_at);

  UPDATE public.zalo_parent_contacts c SET lease_until=NULL,
    status=CASE WHEN c.invitation_sent_at IS NOT NULL THEN 'invited' ELSE 'error' END,
    last_error=CASE WHEN c.invitation_sent_at IS NOT NULL THEN NULL ELSE 'Previous contact check interrupted; review before sending again' END,
    updated_at=now(),next_check_at=now()+interval '15 minutes'
  WHERE c.lease_until < now();

  RETURN QUERY WITH due AS (
    SELECT c.parent_id FROM public.zalo_parent_contacts c
    WHERE c.next_check_at<=now() AND c.lease_until IS NULL AND c.status<>'friend'
      AND EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=c.parent_id AND ps.revoked_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM public.zalo_parent_contacts busy WHERE busy.phone=c.phone AND busy.lease_until>now())
      AND c.parent_id=(SELECT c2.parent_id FROM public.zalo_parent_contacts c2
        WHERE c2.phone=c.phone AND c2.next_check_at<=now() AND c2.lease_until IS NULL AND c2.status<>'friend'
        ORDER BY EXISTS (SELECT 1 FROM public.zalo_tuition_deliveries d WHERE d.parent_id=c2.parent_id
          AND d.status IN ('queued','not_found','not_friend','invited','greeted')) DESC,
          c2.next_check_at,c2.parent_id LIMIT 1)
    ORDER BY EXISTS (SELECT 1 FROM public.zalo_tuition_deliveries d WHERE d.parent_id=c.parent_id
      AND d.status IN ('queued','not_found','not_friend','invited','greeted')) DESC,c.next_check_at,c.parent_id
    FOR UPDATE OF c SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE public.zalo_parent_contacts c SET lease_until=now()+interval '5 minutes',updated_at=now()
    FROM due d WHERE c.parent_id=d.parent_id
    RETURNING c.parent_id,c.phone,c.zalo_uid,c.status,c.invitation_attempted_at,c.invitation_sent_at,
      c.greeting_attempted_at,c.greeting_sent_at
  )
  SELECT x.parent_id,x.phone,x.zalo_uid,x.status,x.invitation_attempted_at,x.invitation_sent_at,
    x.greeting_attempted_at,x.greeting_sent_at,
    (SELECT string_agg(DISTINCT u.full_name,', ' ORDER BY u.full_name) FROM public.users p
      JOIN public.parent_students ps ON ps.parent_id=p.id AND ps.revoked_at IS NULL
      JOIN public.users u ON u.id=ps.student_id
      WHERE p.role::text='parent' AND regexp_replace(p.phone,'[^0-9]','','g')=x.phone)
  FROM claimed x;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_zalo_parent_attempt(p_parent_id uuid,p_phone text,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_action NOT IN ('invite','greeting') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.zalo_parent_contacts WHERE parent_id=p_parent_id AND phone=p_phone
    AND lease_until>now() AND (p_action<>'invite' OR invitation_attempted_at IS NULL)
    AND (p_action<>'greeting' OR greeting_attempted_at IS NULL)) THEN
    RAISE EXCEPTION 'Contact action already attempted or lease expired';
  END IF;
  UPDATE public.zalo_parent_contacts SET
    invitation_attempted_at=CASE WHEN p_action='invite' THEN COALESCE(invitation_attempted_at,now()) ELSE invitation_attempted_at END,
    greeting_attempted_at=CASE WHEN p_action='greeting' THEN COALESCE(greeting_attempted_at,now()) ELSE greeting_attempted_at END,
    updated_at=now() WHERE phone=p_phone;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_zalo_parent_check(
  p_parent_id uuid,p_phone text,p_uid text,p_status text,p_invited boolean DEFAULT false,
  p_greeted boolean DEFAULT false,p_error text DEFAULT NULL,p_invite_attempted boolean DEFAULT false,
  p_greeting_attempted boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_effective_status text; v_next_check timestamptz;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_status NOT IN ('friend','invited','not_friend','not_found','rate_limited','error') THEN RAISE EXCEPTION 'Invalid contact status'; END IF;
  SELECT CASE WHEN p_status='friend' THEN 'friend'
    WHEN p_status='invited' OR p_invited OR c.invitation_sent_at IS NOT NULL THEN 'invited' ELSE p_status END
  INTO v_effective_status FROM public.zalo_parent_contacts c
  WHERE c.parent_id=p_parent_id AND c.phone=p_phone AND c.lease_until IS NOT NULL;
  IF v_effective_status IS NULL THEN RAISE EXCEPTION 'Contact check lease not found'; END IF;
  v_next_check:=CASE WHEN v_effective_status='friend' THEN now()+interval '30 days'
    WHEN v_effective_status='not_found' THEN now()+interval '6 hours'
    WHEN v_effective_status IN ('error','not_friend') THEN now()+interval '15 minutes'+make_interval(secs=>floor(random()*1800)::int)
    ELSE now()+interval '1 day'+make_interval(secs=>floor(random()*21600)::int) END;

  UPDATE public.zalo_parent_contacts c SET
    zalo_uid=CASE WHEN v_effective_status='not_found' THEN NULL ELSE COALESCE(nullif(p_uid,''),c.zalo_uid) END,
    status=v_effective_status,
    invitation_attempted_at=CASE WHEN p_invite_attempted OR p_invited THEN COALESCE(c.invitation_attempted_at,now()) ELSE c.invitation_attempted_at END,
    invitation_sent_at=CASE WHEN p_invited THEN COALESCE(c.invitation_sent_at,now()) ELSE c.invitation_sent_at END,
    greeting_attempted_at=CASE WHEN p_greeting_attempted OR p_greeted THEN COALESCE(c.greeting_attempted_at,now()) ELSE c.greeting_attempted_at END,
    greeting_sent_at=CASE WHEN p_greeted THEN COALESCE(c.greeting_sent_at,now()) ELSE c.greeting_sent_at END,
    last_checked_at=now(),lease_until=NULL,next_check_at=v_next_check,last_error=left(p_error,500),updated_at=now()
  WHERE c.phone=p_phone;

  UPDATE public.zalo_tuition_deliveries d SET status=CASE
      WHEN v_effective_status='not_found' THEN 'not_found'
      WHEN p_greeted OR EXISTS (SELECT 1 FROM public.zalo_parent_contacts c WHERE c.parent_id=d.parent_id AND c.greeting_sent_at IS NOT NULL) THEN 'greeted'
      WHEN v_effective_status='friend' THEN 'queued'
      WHEN v_effective_status='invited' THEN 'invited' ELSE 'not_friend' END,
    invitation_at=COALESCE(d.invitation_at,(SELECT invitation_sent_at FROM public.zalo_parent_contacts WHERE parent_id=d.parent_id)),
    greeting_at=COALESCE(d.greeting_at,(SELECT greeting_sent_at FROM public.zalo_parent_contacts WHERE parent_id=d.parent_id)),
    error_message=left(p_error,500),updated_at=now()
  WHERE d.parent_id IN (SELECT c.parent_id FROM public.zalo_parent_contacts c WHERE c.phone=p_phone)
    AND d.status IN ('queued','not_found','not_friend','invited','greeted');
  IF p_status='rate_limited' THEN UPDATE public.zalo_automation_state SET paused=true,
    reason=left(COALESCE(p_error,'Zalo limited contact lookup'),500),updated_at=now() WHERE id=1; END IF;
END;
$$;

UPDATE public.zalo_parent_contacts c SET next_check_at=now(),lease_until=NULL,updated_at=now()
WHERE c.status IN ('pending','error','not_found','not_friend')
  AND EXISTS (SELECT 1 FROM public.zalo_tuition_deliveries d WHERE d.parent_id=c.parent_id
    AND d.status IN ('queued','not_found','not_friend','invited','greeted'));

REVOKE ALL ON FUNCTION public.queue_zalo_tuition_deliveries(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_zalo_parent_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_zalo_parent_attempt(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_zalo_parent_check(uuid,text,text,text,boolean,boolean,text,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_zalo_tuition_deliveries(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_zalo_parent_check() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_zalo_parent_attempt(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_zalo_parent_check(uuid,text,text,text,boolean,boolean,text,boolean,boolean) TO service_role;
