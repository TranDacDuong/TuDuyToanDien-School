-- Apply after SQL Zalo 24 hour parent checks.sql.
-- Never let repeated checks of old contacts delay the first check of a new parent.
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
    ORDER BY (c.last_checked_at IS NOT NULL), c.next_check_at, c.parent_id
    FOR UPDATE OF c SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE public.zalo_parent_contacts c SET lease_until = now() + interval '5 minutes', updated_at = now()
    FROM due d WHERE c.parent_id = d.parent_id
    RETURNING c.parent_id, c.phone, c.zalo_uid, c.status, c.invitation_attempted_at,
      c.invitation_sent_at, c.greeting_attempted_at, c.greeting_sent_at
  ) SELECT x.parent_id, x.phone, x.zalo_uid, x.status, x.invitation_attempted_at,
      x.invitation_sent_at, x.greeting_attempted_at, x.greeting_sent_at,
      (SELECT u.full_name FROM public.parent_students ps
        JOIN public.users u ON u.id = ps.student_id
        WHERE ps.parent_id = x.parent_id AND ps.revoked_at IS NULL
        ORDER BY u.full_name LIMIT 1)
    FROM claimed x;
END;
$$;
