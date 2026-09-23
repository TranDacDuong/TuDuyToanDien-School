-- Apply after SQL Zalo cancel bulk run.sql.
-- Bulk runs only revisit parents who are not currently confirmed friends.
CREATE OR REPLACE FUNCTION public.start_zalo_parent_bulk_run()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current uuid;
  v_cancelled timestamptz;
  v_run uuid := gen_random_uuid();
  v_total integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role::text = 'admin') THEN
    RAISE EXCEPTION 'Admin required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('zalo_parent_bulk_run'));
  SELECT bulk_run_id, bulk_cancelled_at INTO v_current, v_cancelled
  FROM public.zalo_automation_state WHERE id = 1 FOR UPDATE;
  IF v_current IS NOT NULL AND v_cancelled IS NULL AND EXISTS (
    SELECT 1 FROM public.zalo_parent_contacts
    WHERE bulk_run_id = v_current AND bulk_checked_at IS NULL
  ) THEN
    RETURN jsonb_build_object('run_id', v_current::text, 'already_running', true);
  END IF;
  IF v_current IS NOT NULL AND v_cancelled IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.zalo_parent_contacts
    WHERE bulk_run_id = v_current AND bulk_checked_at IS NULL AND lease_until > now()
  ) THEN
    RAISE EXCEPTION 'Wait for the in-flight contact check to finish before starting another run';
  END IF;

  INSERT INTO public.zalo_parent_contacts(parent_id, phone)
  SELECT p.id, regexp_replace(p.phone, '[^0-9]', '', 'g')
  FROM public.users p
  WHERE p.role::text = 'parent'
    AND regexp_replace(p.phone, '[^0-9]', '', 'g') ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND EXISTS (SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = p.id AND ps.revoked_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.users other
      WHERE other.role::text = 'parent' AND other.id <> p.id
        AND regexp_replace(other.phone, '[^0-9]', '', 'g') = regexp_replace(p.phone, '[^0-9]', '', 'g'))
  ON CONFLICT ON CONSTRAINT zalo_parent_contacts_pkey DO UPDATE
    SET phone = excluded.phone,
      zalo_uid = NULL,
      status = 'pending',
      invitation_attempted_at = NULL,
      invitation_sent_at = NULL,
      greeting_attempted_at = NULL,
      greeting_sent_at = NULL,
      next_check_at = now()
    WHERE public.zalo_parent_contacts.phone IS DISTINCT FROM excluded.phone;

  UPDATE public.zalo_parent_contacts c SET
    bulk_run_id = v_run,
    bulk_checked_at = NULL,
    next_check_at = CASE WHEN c.lease_until IS NULL THEN now() ELSE c.next_check_at END,
    updated_at = now()
  FROM public.users p
  WHERE p.id = c.parent_id AND p.role::text = 'parent'
    AND c.status <> 'friend'
    AND c.phone = regexp_replace(p.phone, '[^0-9]', '', 'g')
    AND c.phone ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND EXISTS (SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = c.parent_id AND ps.revoked_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.users other
      WHERE other.role::text = 'parent' AND other.id <> p.id
        AND regexp_replace(other.phone, '[^0-9]', '', 'g') = c.phone);
  GET DIAGNOSTICS v_total = ROW_COUNT;

  UPDATE public.zalo_automation_state SET bulk_run_id = v_run,
    bulk_started_at = now(), bulk_total = v_total, bulk_cancelled_at = NULL, updated_at = now()
  WHERE id = 1;
  RETURN jsonb_build_object('run_id', v_run::text, 'total', v_total, 'already_running', false);
END;
$$;

REVOKE ALL ON FUNCTION public.start_zalo_parent_bulk_run() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_zalo_parent_bulk_run() TO authenticated;

-- Remove not-yet-processed friends from the currently active run as well.
WITH active AS (
  SELECT bulk_run_id FROM public.zalo_automation_state
  WHERE id = 1 AND bulk_cancelled_at IS NULL
), removed AS (
  UPDATE public.zalo_parent_contacts c
  SET bulk_run_id = NULL, bulk_checked_at = NULL, updated_at = now()
  FROM active a
  WHERE c.bulk_run_id = a.bulk_run_id
    AND c.bulk_checked_at IS NULL
    AND c.lease_until IS NULL
    AND c.status = 'friend'
  RETURNING c.parent_id
)
UPDATE public.zalo_automation_state s
SET bulk_total = (SELECT count(*) FROM public.zalo_parent_contacts c WHERE c.bulk_run_id = s.bulk_run_id),
    updated_at = now()
WHERE s.id = 1 AND EXISTS (SELECT 1 FROM removed);
