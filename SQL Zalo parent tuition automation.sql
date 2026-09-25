-- Run after SQL Zalo web bridge.sql. All writes from the laptop use service-role RPCs.
CREATE TABLE public.zalo_parent_contacts (
  parent_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  zalo_uid text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','friend','invited','not_friend','not_found','rate_limited','error')),
  invitation_attempted_at timestamptz,
  invitation_sent_at timestamptz,
  greeting_attempted_at timestamptz,
  greeting_sent_at timestamptz,
  last_checked_at timestamptz,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX zalo_parent_contacts_due_idx ON public.zalo_parent_contacts (next_check_at)
  WHERE lease_until IS NULL;

CREATE TABLE public.zalo_tuition_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users(id),
  month date NOT NULL,
  attempt_no smallint NOT NULL CHECK (attempt_no BETWEEN 1 AND 3),
  remaining_snapshot numeric NOT NULL CHECK (remaining_snapshot > 0),
  content text NOT NULL,
  qr_url text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','not_found','not_friend','invited','greeted','sent','failed','uncertain','cancelled')),
  invitation_at timestamptz,
  greeting_at timestamptz,
  sent_at timestamptz,
  qr_sent_at timestamptz,
  error_message text,
  lease_until timestamptz,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, parent_id, month, attempt_no)
);
CREATE INDEX zalo_tuition_deliveries_queue_idx ON public.zalo_tuition_deliveries (status, created_at);

CREATE TABLE public.zalo_automation_state (
  id integer PRIMARY KEY CHECK (id = 1),
  paused boolean NOT NULL DEFAULT false,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.zalo_automation_state(id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.zalo_parent_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_tuition_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_automation_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zalo_parent_contacts, public.zalo_tuition_deliveries, public.zalo_automation_state FROM anon, authenticated;
GRANT SELECT ON public.zalo_parent_contacts, public.zalo_tuition_deliveries, public.zalo_automation_state TO authenticated;

CREATE POLICY zalo_parent_contacts_staff_read ON public.zalo_parent_contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role::text IN ('admin','assistant','accountant')));
CREATE POLICY zalo_tuition_deliveries_staff_read ON public.zalo_tuition_deliveries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role::text IN ('admin','assistant','accountant')));
CREATE POLICY zalo_automation_state_staff_read ON public.zalo_automation_state FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role::text IN ('admin','assistant','accountant')));

-- Queue one to three explicit reminders per student/month. Repeating a request key is harmless.
CREATE OR REPLACE FUNCTION public.queue_zalo_tuition_deliveries(p_month text, p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item jsonb;
  v_student uuid;
  v_parent uuid;
  v_request uuid;
  v_month date;
  v_attempt integer;
  v_count integer := 0;
  v_phone text;
  v_remaining numeric;
  v_due numeric;
  v_paid numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()
    AND role::text IN ('admin','assistant','accountant')) THEN
    RAISE EXCEPTION 'Tuition staff required';
  END IF;
  IF p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid month or batch size';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid batch size';
  END IF;
  v_month := (p_month || '-01')::date;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_student := (v_item->>'student_id')::uuid;
    v_parent := (v_item->>'parent_id')::uuid;
    v_request := (v_item->>'request_key')::uuid;
    IF EXISTS (SELECT 1 FROM public.zalo_tuition_deliveries WHERE request_key = v_request) THEN
      CONTINUE;
    END IF;
    IF length(trim(COALESCE(v_item->>'content',''))) NOT BETWEEN 1 AND 5000 THEN
      RAISE EXCEPTION 'Invalid tuition message';
    END IF;
    IF nullif(v_item->>'qr_url','') IS NOT NULL AND
      ((v_item->>'qr_url') NOT LIKE 'https://img.vietqr.io/image/%'
        OR length(v_item->>'qr_url') > 1000) THEN
      RAISE EXCEPTION 'Invalid QR image URL';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.parent_students ps
      WHERE ps.student_id = v_student AND ps.parent_id = v_parent AND ps.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'Parent is not linked to student';
    END IF;
    SELECT regexp_replace(phone, '[^0-9]', '', 'g') INTO v_phone FROM public.users
      WHERE id = v_parent AND role::text = 'parent';
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
      RAISE EXCEPTION 'A reminder is already pending for this student/month';
    END IF;
    SELECT COALESCE(max(attempt_no), 0) + 1 INTO v_attempt FROM public.zalo_tuition_deliveries
      WHERE student_id = v_student AND parent_id = v_parent AND month = v_month;
    IF v_attempt > 3 THEN RAISE EXCEPTION 'Maximum three reminders per student/month'; END IF;
    INSERT INTO public.zalo_tuition_deliveries
      (request_key, student_id, parent_id, month, attempt_no, remaining_snapshot, content, qr_url, created_by)
    VALUES (v_request, v_student, v_parent, v_month, v_attempt, v_remaining, trim(v_item->>'content'),
      nullif(v_item->>'qr_url',''), auth.uid());
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
  -- One parent contact may serve any number of actively linked students.
  INSERT INTO public.zalo_parent_contacts(parent_id, phone)
  SELECT p.id, regexp_replace(p.phone, '[^0-9]', '', 'g')
  FROM public.users p
  JOIN (SELECT DISTINCT link.parent_id FROM public.parent_students link WHERE link.revoked_at IS NULL) ps ON ps.parent_id = p.id
  WHERE p.role::text = 'parent' AND regexp_replace(p.phone, '[^0-9]', '', 'g') ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND (SELECT count(*) FROM public.users other
      WHERE other.role::text = 'parent' AND other.id <> p.id
        AND regexp_replace(other.phone, '[^0-9]', '', 'g') = regexp_replace(p.phone, '[^0-9]', '', 'g')) = 0
  ON CONFLICT ON CONSTRAINT zalo_parent_contacts_pkey DO UPDATE SET phone = excluded.phone,
    zalo_uid = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone
      THEN public.zalo_parent_contacts.zalo_uid ELSE NULL END,
    status = CASE WHEN public.zalo_parent_contacts.phone = excluded.phone
      THEN public.zalo_parent_contacts.status ELSE 'pending' END,
    invitation_attempted_at = NULL, invitation_sent_at = NULL,
    greeting_attempted_at = NULL, greeting_sent_at = NULL,
    next_check_at = now()
  WHERE public.zalo_parent_contacts.phone IS DISTINCT FROM excluded.phone;
  UPDATE public.zalo_parent_contacts c SET lease_until = NULL, status = 'error',
    last_error = 'Previous contact check interrupted; review before sending again', updated_at = now(),
    next_check_at = now() + interval '1 day'
  WHERE c.lease_until < now();
  RETURN QUERY
  WITH due AS (
    SELECT c.parent_id FROM public.zalo_parent_contacts c
    WHERE c.next_check_at <= now() AND c.lease_until IS NULL
      AND EXISTS (SELECT 1 FROM public.parent_students ps
        WHERE ps.parent_id = c.parent_id AND ps.revoked_at IS NULL)
    ORDER BY c.next_check_at, c.parent_id FOR UPDATE OF c SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE public.zalo_parent_contacts c SET lease_until = now() + interval '5 minutes', updated_at = now()
    FROM due d WHERE c.parent_id = d.parent_id
    RETURNING c.parent_id, c.phone, c.zalo_uid, c.status, c.invitation_attempted_at,
      c.invitation_sent_at, c.greeting_attempted_at, c.greeting_sent_at
  ) SELECT x.parent_id, x.phone, x.zalo_uid, x.status, x.invitation_attempted_at,
      x.invitation_sent_at, x.greeting_attempted_at, x.greeting_sent_at,
      (SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name) FROM public.parent_students ps
        JOIN public.users u ON u.id = ps.student_id
        WHERE ps.parent_id = x.parent_id AND ps.revoked_at IS NULL
      )
    FROM claimed x;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_zalo_parent_automation()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role::text = 'admin') THEN
    RAISE EXCEPTION 'Admin required';
  END IF;
  UPDATE public.zalo_automation_state SET paused = false, reason = NULL, updated_at = now() WHERE id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_zalo_parent_attempt(
  p_parent_id uuid, p_phone text, p_action text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_action NOT IN ('invite','greeting') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  UPDATE public.zalo_parent_contacts SET
    invitation_attempted_at = CASE WHEN p_action = 'invite' THEN now() ELSE invitation_attempted_at END,
    greeting_attempted_at = CASE WHEN p_action = 'greeting' THEN now() ELSE greeting_attempted_at END,
    updated_at = now()
  WHERE parent_id = p_parent_id AND phone = p_phone AND lease_until > now()
    AND (p_action <> 'invite' OR invitation_attempted_at IS NULL)
    AND (p_action <> 'greeting' OR greeting_attempted_at IS NULL);
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact action already attempted or lease expired'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_zalo_parent_check(
  p_parent_id uuid, p_phone text, p_uid text, p_status text,
  p_invited boolean DEFAULT false, p_greeted boolean DEFAULT false, p_error text DEFAULT NULL,
  p_invite_attempted boolean DEFAULT false, p_greeting_attempted boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_status NOT IN ('friend','invited','not_friend','not_found','rate_limited','error') THEN
    RAISE EXCEPTION 'Invalid contact status';
  END IF;
  UPDATE public.zalo_parent_contacts c SET
    zalo_uid = CASE WHEN p_status = 'not_found' THEN NULL ELSE COALESCE(nullif(p_uid,''), c.zalo_uid) END,
    status = CASE
      WHEN p_status = 'friend' THEN 'friend'
      WHEN p_status = 'invited' OR p_invited OR c.invitation_sent_at IS NOT NULL THEN 'invited'
      ELSE p_status END,
    invitation_attempted_at = CASE WHEN p_invite_attempted THEN COALESCE(c.invitation_attempted_at, now()) ELSE c.invitation_attempted_at END,
    invitation_sent_at = CASE WHEN p_invited THEN COALESCE(c.invitation_sent_at, now()) ELSE c.invitation_sent_at END,
    greeting_attempted_at = CASE WHEN p_greeting_attempted THEN COALESCE(c.greeting_attempted_at, now()) ELSE c.greeting_attempted_at END,
    greeting_sent_at = CASE WHEN p_greeted THEN COALESCE(c.greeting_sent_at, now()) ELSE c.greeting_sent_at END,
    last_checked_at = now(), lease_until = NULL,
    next_check_at = ((timezone('Asia/Ho_Chi_Minh', now())::date + 1 + time '09:00')
      AT TIME ZONE 'Asia/Ho_Chi_Minh') + make_interval(secs => floor(random() * 32400)::int),
    last_error = CASE
      WHEN p_status <> 'friend' AND (p_status = 'invited' OR p_invited OR c.invitation_sent_at IS NOT NULL)
        THEN NULL ELSE left(p_error,500) END,
    updated_at = now()
  WHERE c.parent_id = p_parent_id AND c.phone = p_phone AND c.lease_until IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact check lease not found'; END IF;
  UPDATE public.zalo_tuition_deliveries d SET
    status = CASE WHEN p_status = 'not_found' THEN 'not_found'
      WHEN p_status = 'friend' THEN 'queued'
      WHEN p_greeted OR EXISTS (SELECT 1 FROM public.zalo_parent_contacts c
        WHERE c.parent_id = p_parent_id AND c.greeting_sent_at IS NOT NULL) THEN 'greeted'
      WHEN p_status = 'invited' THEN 'invited' ELSE 'not_friend' END,
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

CREATE OR REPLACE FUNCTION public.claim_zalo_tuition_delivery()
RETURNS TABLE(job_id uuid, zalo_uid text, content text, qr_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF (SELECT paused FROM public.zalo_automation_state WHERE id = 1) THEN RETURN; END IF;
  UPDATE public.zalo_tuition_deliveries SET status = 'uncertain', lease_until = NULL,
    error_message = 'Sender interrupted; check Zalo before another reminder', updated_at = now()
  WHERE status = 'processing' AND lease_until < now();
  UPDATE public.zalo_tuition_deliveries d SET status = 'cancelled', updated_at = now(),
    error_message = 'Tuition paid or amount changed; create a fresh reminder'
  FROM public.tuition_payments tp
  WHERE d.student_id = tp.student_id AND d.month = tp.month
    AND (tp.amount_paid >= tp.amount_due OR tp.amount_due - tp.amount_paid <> d.remaining_snapshot)
    AND d.status IN ('queued','not_found','not_friend','invited','greeted');
  RETURN QUERY
  WITH due AS (
    SELECT d.id FROM public.zalo_tuition_deliveries d
    JOIN public.zalo_parent_contacts c ON c.parent_id = d.parent_id
    JOIN public.users p ON p.id = d.parent_id
    JOIN public.tuition_payments tp ON tp.student_id = d.student_id AND tp.month = d.month
    WHERE d.status IN ('queued','not_found','not_friend','invited','greeted')
      AND c.zalo_uid IS NOT NULL AND (c.status = 'friend' OR c.greeting_sent_at IS NOT NULL)
      AND c.phone = regexp_replace(p.phone, '[^0-9]', '', 'g')
      AND EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.parent_id = d.parent_id
        AND ps.student_id = d.student_id AND ps.revoked_at IS NULL)
      AND tp.amount_due > tp.amount_paid AND tp.amount_due > 0
      AND tp.amount_due - tp.amount_paid = d.remaining_snapshot
    ORDER BY d.created_at FOR UPDATE OF d SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE public.zalo_tuition_deliveries d SET status = 'processing',
      lease_until = now() + interval '5 minutes', updated_at = now()
    FROM due WHERE d.id = due.id RETURNING d.id, d.parent_id, d.content, d.qr_url
  ) SELECT x.id, c.zalo_uid, x.content, x.qr_url
    FROM claimed x JOIN public.zalo_parent_contacts c ON c.parent_id = x.parent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_zalo_tuition_delivery(
  p_job_id uuid, p_status text, p_qr_sent boolean DEFAULT false, p_error text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_status NOT IN ('sent','failed','uncertain') THEN RAISE EXCEPTION 'Invalid delivery status'; END IF;
  UPDATE public.zalo_tuition_deliveries SET status = p_status, lease_until = NULL,
    sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
    qr_sent_at = CASE WHEN p_qr_sent THEN now() ELSE qr_sent_at END,
    error_message = left(p_error,500), updated_at = now()
  WHERE id = p_job_id AND status = 'processing';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_zalo_parent_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_zalo_parent_attempt(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_zalo_parent_check(uuid,text,text,text,boolean,boolean,text,boolean,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_zalo_tuition_delivery() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_zalo_tuition_delivery(uuid,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_zalo_tuition_deliveries(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_zalo_parent_automation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_zalo_parent_check() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_zalo_parent_attempt(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_zalo_parent_check(uuid,text,text,text,boolean,boolean,text,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_zalo_tuition_delivery() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_zalo_tuition_delivery(uuid,text,boolean,text) TO service_role;
