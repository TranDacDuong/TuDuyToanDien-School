-- Apply after SQL Zalo tuition access followup.sql.
ALTER TABLE public.zalo_parent_contacts
  ADD COLUMN bulk_run_id uuid,
  ADD COLUMN bulk_checked_at timestamptz;

ALTER TABLE public.zalo_automation_state
  ADD COLUMN bulk_run_id uuid,
  ADD COLUMN bulk_started_at timestamptz,
  ADD COLUMN bulk_total integer NOT NULL DEFAULT 0;

CREATE INDEX zalo_parent_contacts_bulk_idx
  ON public.zalo_parent_contacts (bulk_run_id, bulk_checked_at);

CREATE OR REPLACE FUNCTION public.mark_zalo_parent_bulk_checked()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.bulk_run_id IS NOT NULL AND (
    NEW.last_checked_at IS DISTINCT FROM OLD.last_checked_at OR
    (OLD.lease_until IS NOT NULL AND NEW.lease_until IS NULL AND NEW.status = 'error')
  ) THEN
    NEW.bulk_checked_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zalo_parent_bulk_checked
  BEFORE UPDATE ON public.zalo_parent_contacts
  FOR EACH ROW EXECUTE FUNCTION public.mark_zalo_parent_bulk_checked();

CREATE OR REPLACE FUNCTION public.start_zalo_parent_bulk_run()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current uuid;
  v_run uuid := gen_random_uuid();
  v_total integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role::text = 'admin') THEN
    RAISE EXCEPTION 'Admin required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('zalo_parent_bulk_run'));
  SELECT bulk_run_id INTO v_current FROM public.zalo_automation_state WHERE id = 1 FOR UPDATE;
  IF v_current IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.zalo_parent_contacts
    WHERE bulk_run_id = v_current AND bulk_checked_at IS NULL
  ) THEN
    RETURN jsonb_build_object('run_id', v_current::text, 'already_running', true);
  END IF;

  -- Match the bot's contact eligibility: linked parent account, valid unique phone.
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
    AND c.phone = regexp_replace(p.phone, '[^0-9]', '', 'g')
    AND c.phone ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND EXISTS (SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = c.parent_id AND ps.revoked_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.users other
      WHERE other.role::text = 'parent' AND other.id <> p.id
        AND regexp_replace(other.phone, '[^0-9]', '', 'g') = c.phone);
  GET DIAGNOSTICS v_total = ROW_COUNT;

  UPDATE public.zalo_automation_state SET bulk_run_id = v_run,
    bulk_started_at = now(), bulk_total = v_total, updated_at = now()
  WHERE id = 1;
  RETURN jsonb_build_object('run_id', v_run::text, 'total', v_total, 'already_running', false);
END;
$$;
REVOKE ALL ON FUNCTION public.start_zalo_parent_bulk_run() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_zalo_parent_bulk_run() TO authenticated;

CREATE OR REPLACE FUNCTION public.pause_zalo_parent_bulk_run()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role::text = 'admin') THEN
    RAISE EXCEPTION 'Admin required';
  END IF;
  UPDATE public.zalo_automation_state SET paused = true,
    reason = 'Quản trị viên tạm dừng kiểm tra Zalo', updated_at = now() WHERE id = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.pause_zalo_parent_bulk_run() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_zalo_parent_bulk_run() TO authenticated;
