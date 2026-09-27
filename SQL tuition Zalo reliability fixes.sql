-- Apply after the existing Zalo tuition and bank webhook SQL files.

ALTER TABLE public.bank_transaction_logs
  DROP CONSTRAINT IF EXISTS bank_transaction_logs_status_check;
ALTER TABLE public.bank_transaction_logs
  ADD CONSTRAINT bank_transaction_logs_status_check
  CHECK (status IN ('success','unmatched','failed','duplicate','resolved'));

CREATE OR REPLACE FUNCTION public.manage_unmatched_bank_transaction(p_id uuid, p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role::text IN ('admin','accountant')) THEN
    RAISE EXCEPTION 'Tuition admin or accountant required';
  END IF;
  IF p_action NOT IN ('resolve','delete') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  PERFORM 1 FROM public.bank_transaction_logs WHERE id = p_id AND status = 'unmatched' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_action = 'resolve' THEN
    UPDATE public.bank_transaction_logs SET status = 'resolved' WHERE id = p_id;
  ELSE
    DELETE FROM public.bank_transaction_logs WHERE id = p_id;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_unmatched_bank_transaction(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_unmatched_bank_transaction(uuid,text) TO authenticated;

-- A duplicate active reminder is skipped per student instead of aborting the
-- whole batch selected by the accountant.
CREATE OR REPLACE FUNCTION public.queue_zalo_tuition_deliveries(p_month text, p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item jsonb; v_student uuid; v_parent uuid; v_request uuid; v_month date;
  v_attempt integer; v_count integer := 0; v_phone text;
  v_remaining numeric; v_due numeric; v_paid numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()
    AND role::text IN ('admin','assistant','accountant')) THEN
    RAISE EXCEPTION 'Tuition staff required';
  END IF;
  IF p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid month or batch size';
  END IF;
  v_month := (p_month || '-01')::date;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_student := (v_item->>'student_id')::uuid;
    v_parent := (v_item->>'parent_id')::uuid;
    v_request := (v_item->>'request_key')::uuid;
    IF EXISTS (SELECT 1 FROM public.zalo_tuition_deliveries WHERE request_key = v_request) THEN CONTINUE; END IF;
    IF length(trim(COALESCE(v_item->>'content',''))) NOT BETWEEN 1 AND 5000 THEN
      RAISE EXCEPTION 'Invalid tuition message';
    END IF;
    IF nullif(v_item->>'qr_url','') IS NOT NULL AND
      ((v_item->>'qr_url') NOT LIKE 'https://img.vietqr.io/image/%' OR length(v_item->>'qr_url') > 1000) THEN
      RAISE EXCEPTION 'Invalid QR image URL';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.parent_students ps
      WHERE ps.student_id = v_student AND ps.parent_id = v_parent AND ps.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'Parent is not linked to student';
    END IF;
    SELECT regexp_replace(phone, '[^0-9]', '', 'g') INTO v_phone
    FROM public.users WHERE id = v_parent AND role::text = 'parent';
    IF v_phone IS NULL OR v_phone !~ '^(0[0-9]{9}|84[0-9]{9})$' THEN
      RAISE EXCEPTION 'Parent phone is missing or invalid';
    END IF;
    SELECT tp.amount_due, tp.amount_paid INTO v_due, v_paid
    FROM public.tuition_payments tp WHERE tp.student_id = v_student AND tp.month = v_month;
    v_remaining := (v_item->>'remaining')::numeric;
    IF v_due IS NULL OR v_due <= 0 OR v_paid >= v_due OR v_remaining <> v_due - v_paid THEN
      RAISE EXCEPTION 'No unpaid saved tuition for this student/month';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_student::text || v_parent::text || p_month, 0));
    IF EXISTS (SELECT 1 FROM public.zalo_tuition_deliveries
      WHERE student_id = v_student AND parent_id = v_parent AND month = v_month
        AND status IN ('queued','processing','not_found','not_friend','invited','greeted')) THEN
      CONTINUE;
    END IF;
    SELECT COALESCE(max(attempt_no), 0) + 1 INTO v_attempt
    FROM public.zalo_tuition_deliveries
    WHERE student_id = v_student AND parent_id = v_parent AND month = v_month;
    IF v_attempt > 3 THEN RAISE EXCEPTION 'Maximum three reminders per student/month'; END IF;
    INSERT INTO public.zalo_tuition_deliveries
      (request_key, student_id, parent_id, month, attempt_no, remaining_snapshot, content, qr_url, created_by)
    VALUES (v_request, v_student, v_parent, v_month, v_attempt, v_remaining,
      trim(v_item->>'content'), nullif(v_item->>'qr_url',''), auth.uid());
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_zalo_tuition_deliveries(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_zalo_tuition_deliveries(text,jsonb) TO authenticated;

-- Keep one durable row per gateway transaction so concurrent callbacks cannot
-- credit the same payment twice.
DELETE FROM public.bank_transaction_logs newer
USING public.bank_transaction_logs older
WHERE newer.gateway = older.gateway
  AND newer.transaction_id = older.transaction_id
  AND newer.transaction_id IS NOT NULL
  AND (newer.created_at, newer.id) > (older.created_at, older.id);

DROP INDEX IF EXISTS public.bank_tx_logs_gateway_tx_idx;
CREATE UNIQUE INDEX bank_tx_logs_gateway_tx_idx
  ON public.bank_transaction_logs (gateway, transaction_id)
  WHERE transaction_id IS NOT NULL;

UPDATE public.zalo_parent_contacts
SET status = 'invited', last_error = NULL, updated_at = now()
WHERE invitation_sent_at IS NOT NULL AND status <> 'friend';

UPDATE public.zalo_tuition_deliveries d
SET status = 'invited', error_message = NULL, updated_at = now()
FROM public.zalo_parent_contacts c
WHERE c.parent_id = d.parent_id AND c.status = 'invited'
  AND d.status IN ('queued','not_found','not_friend','invited','greeted');

-- Check one parent account once even when that parent has several children, and
-- provide all linked student names for the greeting.
CREATE OR REPLACE FUNCTION public.claim_zalo_parent_check()
RETURNS TABLE(parent_id uuid, phone text, zalo_uid text, status text,
  invitation_attempted_at timestamptz, invitation_sent_at timestamptz,
  greeting_attempted_at timestamptz, greeting_sent_at timestamptz, student_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF (SELECT paused FROM public.zalo_automation_state WHERE id = 1) THEN RETURN; END IF;

  INSERT INTO public.zalo_parent_contacts(parent_id, phone)
  SELECT p.id, regexp_replace(p.phone, '[^0-9]', '', 'g')
  FROM public.users p
  WHERE p.role::text = 'parent'
    AND regexp_replace(p.phone, '[^0-9]', '', 'g') ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND EXISTS (SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = p.id AND ps.revoked_at IS NULL)
    AND (SELECT count(*) FROM public.users other
      WHERE other.role::text = 'parent' AND other.id <> p.id
        AND regexp_replace(other.phone, '[^0-9]', '', 'g') = regexp_replace(p.phone, '[^0-9]', '', 'g')) = 0
  ON CONFLICT ON CONSTRAINT zalo_parent_contacts_pkey DO UPDATE SET
    phone = excluded.phone,
    zalo_uid = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone
      THEN public.zalo_parent_contacts.zalo_uid ELSE NULL END,
    status = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone
      THEN public.zalo_parent_contacts.status ELSE 'pending' END,
    invitation_attempted_at = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone
      THEN public.zalo_parent_contacts.invitation_attempted_at ELSE NULL END,
    invitation_sent_at = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone
      THEN public.zalo_parent_contacts.invitation_sent_at ELSE NULL END,
    greeting_attempted_at = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone
      THEN public.zalo_parent_contacts.greeting_attempted_at ELSE NULL END,
    greeting_sent_at = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone
      THEN public.zalo_parent_contacts.greeting_sent_at ELSE NULL END,
    next_check_at = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone
      THEN public.zalo_parent_contacts.next_check_at ELSE now() END;

  UPDATE public.zalo_parent_contacts c SET lease_until = NULL,
    status = CASE WHEN c.invitation_sent_at IS NOT NULL THEN 'invited' ELSE 'error' END,
    last_error = CASE WHEN c.invitation_sent_at IS NOT NULL THEN NULL
      ELSE 'Previous contact check interrupted; review before sending again' END,
    updated_at = now(), next_check_at = now() + interval '1 day'
  WHERE c.lease_until < now();

  RETURN QUERY
  WITH due AS (
    SELECT c.parent_id FROM public.zalo_parent_contacts c
    WHERE c.next_check_at <= now() AND c.lease_until IS NULL
      AND c.status <> 'friend'
      AND EXISTS (SELECT 1 FROM public.parent_students ps
        WHERE ps.parent_id = c.parent_id AND ps.revoked_at IS NULL)
    ORDER BY c.next_check_at, c.parent_id FOR UPDATE OF c SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE public.zalo_parent_contacts c
    SET lease_until = now() + interval '5 minutes', updated_at = now()
    FROM due d WHERE c.parent_id = d.parent_id
    RETURNING c.parent_id, c.phone, c.zalo_uid, c.status,
      c.invitation_attempted_at, c.invitation_sent_at,
      c.greeting_attempted_at, c.greeting_sent_at
  )
  SELECT x.parent_id, x.phone, x.zalo_uid, x.status,
    x.invitation_attempted_at, x.invitation_sent_at,
    x.greeting_attempted_at, x.greeting_sent_at,
    (SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name)
      FROM public.parent_students ps
      JOIN public.users u ON u.id = ps.student_id
      WHERE ps.parent_id = x.parent_id AND ps.revoked_at IS NULL)
  FROM claimed x;
END;
$$;

-- A recorded invitation stays "invited" even when Zalo temporarily stops
-- reporting is_requesting. A successfully sent greeting unlocks tuition sends.
CREATE OR REPLACE FUNCTION public.finish_zalo_parent_check(
  p_parent_id uuid, p_phone text, p_uid text, p_status text,
  p_invited boolean DEFAULT false, p_greeted boolean DEFAULT false, p_error text DEFAULT NULL,
  p_invite_attempted boolean DEFAULT false, p_greeting_attempted boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_effective_status text;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_status NOT IN ('friend','invited','not_friend','not_found','rate_limited','error') THEN
    RAISE EXCEPTION 'Invalid contact status';
  END IF;

  SELECT CASE
    WHEN p_status = 'friend' THEN 'friend'
    WHEN p_status = 'invited' OR p_invited OR c.invitation_sent_at IS NOT NULL THEN 'invited'
    ELSE p_status END INTO v_effective_status
  FROM public.zalo_parent_contacts c
  WHERE c.parent_id = p_parent_id AND c.phone = p_phone AND c.lease_until IS NOT NULL;
  IF v_effective_status IS NULL THEN RAISE EXCEPTION 'Contact check lease not found'; END IF;

  UPDATE public.zalo_parent_contacts c SET
    zalo_uid = CASE WHEN v_effective_status = 'not_found' THEN NULL ELSE COALESCE(nullif(p_uid,''), c.zalo_uid) END,
    status = v_effective_status,
    invitation_attempted_at = CASE WHEN p_invite_attempted THEN COALESCE(c.invitation_attempted_at, now()) ELSE c.invitation_attempted_at END,
    invitation_sent_at = CASE WHEN p_invited THEN COALESCE(c.invitation_sent_at, now()) ELSE c.invitation_sent_at END,
    greeting_attempted_at = CASE WHEN p_greeting_attempted THEN COALESCE(c.greeting_attempted_at, now()) ELSE c.greeting_attempted_at END,
    greeting_sent_at = CASE WHEN p_greeted THEN COALESCE(c.greeting_sent_at, now()) ELSE c.greeting_sent_at END,
    last_checked_at = now(), lease_until = NULL,
    next_check_at = now() + interval '1 day' + make_interval(secs => floor(random() * 21600)::int),
    last_error = CASE WHEN v_effective_status = 'invited' THEN NULL ELSE left(p_error,500) END,
    updated_at = now()
  WHERE c.parent_id = p_parent_id AND c.phone = p_phone AND c.lease_until IS NOT NULL;

  UPDATE public.zalo_tuition_deliveries d SET
    status = CASE
      WHEN v_effective_status = 'not_found' THEN 'not_found'
      WHEN p_greeted OR EXISTS (SELECT 1 FROM public.zalo_parent_contacts c
        WHERE c.parent_id = p_parent_id AND c.greeting_sent_at IS NOT NULL) THEN 'greeted'
      WHEN v_effective_status = 'friend' THEN 'queued'
      WHEN v_effective_status = 'invited' THEN 'invited'
      ELSE 'not_friend' END,
    invitation_at = COALESCE(d.invitation_at, (SELECT invitation_sent_at FROM public.zalo_parent_contacts WHERE parent_id = p_parent_id)),
    greeting_at = COALESCE(d.greeting_at, (SELECT greeting_sent_at FROM public.zalo_parent_contacts WHERE parent_id = p_parent_id)),
    updated_at = now()
  WHERE d.parent_id = p_parent_id AND d.status IN ('queued','not_found','not_friend','invited','greeted');

  IF p_status = 'rate_limited' THEN
    UPDATE public.zalo_automation_state SET paused = true,
      reason = left(COALESCE(p_error,'Zalo limited contact lookup'),500), updated_at = now() WHERE id = 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_zalo_parent_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_zalo_parent_check(uuid,text,text,text,boolean,boolean,text,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_zalo_parent_check() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_zalo_parent_check(uuid,text,text,text,boolean,boolean,text,boolean,boolean) TO service_role;
