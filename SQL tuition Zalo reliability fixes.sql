-- Apply after the existing Zalo tuition and bank webhook SQL files.

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
