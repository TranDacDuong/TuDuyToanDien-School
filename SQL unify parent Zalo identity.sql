-- Apply after SQL harden Zalo message sync.sql.
BEGIN;

ALTER TABLE public.zalo_verified_links
  DROP CONSTRAINT IF EXISTS zalo_verified_links_verification_source_check;
ALTER TABLE public.zalo_verified_links
  ADD CONSTRAINT zalo_verified_links_verification_source_check
  CHECK (verification_source IN ('admin', 'zalo_self_command', 'parent_contact'));

CREATE OR REPLACE FUNCTION public.canonical_parent_zalo_phone(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN d ~ '^0[0-9]{9}$' THEN '84' || substr(d, 2)
    WHEN d ~ '^84[0-9]{9}$' THEN d ELSE NULL END
  FROM (SELECT regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g') d) x;
$$;

-- Only adopt an unambiguous phone lookup; never override an explicit admin link.
CREATE OR REPLACE FUNCTION public.reconcile_parent_zalo_identity(p_parent_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.zalo_parent_contacts%ROWTYPE; v_phone text; v_valid boolean;
BEGIN
  SELECT * INTO c FROM public.zalo_parent_contacts WHERE parent_id = p_parent_id;
  SELECT public.canonical_parent_zalo_phone(phone) INTO v_phone FROM public.users
    WHERE id = p_parent_id AND role::text = 'parent';
  IF c.zalo_uid IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('zalo-link:' || c.zalo_uid, 0));
  END IF;
  v_valid := v_phone IS NOT NULL
    AND v_phone = public.canonical_parent_zalo_phone(c.phone)
    AND nullif(trim(c.zalo_uid), '') IS NOT NULL AND length(c.zalo_uid) <= 100
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id <> p_parent_id
      AND u.role::text = 'parent' AND public.canonical_parent_zalo_phone(u.phone) = v_phone)
    AND NOT EXISTS (SELECT 1 FROM public.zalo_parent_contacts other
      WHERE other.parent_id <> p_parent_id AND other.zalo_uid = c.zalo_uid)
    AND NOT EXISTS (SELECT 1 FROM public.zalo_verified_links other
      WHERE other.audience_user_id <> p_parent_id AND other.zalo_uid = c.zalo_uid);

  UPDATE public.zalo_verified_links SET enabled = false
    WHERE verification_source = 'parent_contact' AND enabled
      AND (audience_user_id = p_parent_id OR zalo_uid = c.zalo_uid)
      AND (NOT COALESCE(v_valid, false) OR
        (audience_user_id = p_parent_id AND zalo_uid IS DISTINCT FROM c.zalo_uid));
  IF NOT COALESCE(v_valid, false) OR c.status NOT IN ('friend', 'invited', 'not_friend') THEN
    RETURN;
  END IF;
  INSERT INTO public.zalo_verified_links
    (audience_user_id, zalo_uid, verified_by, verification_source)
  VALUES (p_parent_id, c.zalo_uid, NULL, 'parent_contact')
  ON CONFLICT (audience_user_id) DO UPDATE SET zalo_uid = excluded.zalo_uid,
    enabled = true, verified_at = now(), verified_by = NULL
  WHERE public.zalo_verified_links.verification_source = 'parent_contact'
    AND (public.zalo_verified_links.zalo_uid IS DISTINCT FROM excluded.zalo_uid
      OR NOT public.zalo_verified_links.enabled);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_parent_zalo_identity(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_parent_contact_zalo_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.reconcile_parent_zalo_identity(COALESCE(NEW.parent_id, OLD.parent_id));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_parent_contact_zalo_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_parent_contact_zalo_identity ON public.zalo_parent_contacts;
CREATE TRIGGER sync_parent_contact_zalo_identity
  AFTER INSERT OR UPDATE OF phone, zalo_uid, status OR DELETE ON public.zalo_parent_contacts
  FOR EACH ROW EXECUTE FUNCTION public.sync_parent_contact_zalo_identity();

CREATE OR REPLACE FUNCTION public.sync_parent_phone_zalo_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  -- Recheck both old and new phone families when an account changes its phone.
  FOR v_id IN SELECT id FROM public.users WHERE id = NEW.id
    OR (role::text = 'parent' AND public.canonical_parent_zalo_phone(phone) IN
      (public.canonical_parent_zalo_phone(OLD.phone), public.canonical_parent_zalo_phone(NEW.phone)))
  LOOP PERFORM public.reconcile_parent_zalo_identity(v_id); END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_parent_phone_zalo_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_parent_phone_zalo_identity ON public.users;
CREATE TRIGGER sync_parent_phone_zalo_identity AFTER INSERT OR UPDATE OF phone, role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_parent_phone_zalo_identity();

-- Manual confirmation in Messages also supplies the UID used by tuition/directory.
CREATE OR REPLACE FUNCTION public.sync_explicit_zalo_link_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text;
BEGIN
  IF NEW.enabled AND NEW.verification_source IN ('admin', 'zalo_self_command') THEN
    SELECT phone INTO v_phone FROM public.users
      WHERE id = NEW.audience_user_id AND role::text = 'parent';
    IF v_phone IS NOT NULL THEN
      INSERT INTO public.zalo_parent_contacts(parent_id, phone, zalo_uid, link_source, linked_at)
      VALUES (NEW.audience_user_id, v_phone, NEW.zalo_uid, NEW.verification_source, now())
      ON CONFLICT (parent_id) DO UPDATE SET phone = excluded.phone,
        zalo_uid = excluded.zalo_uid, link_source = excluded.link_source, linked_at = now()
      WHERE public.zalo_parent_contacts.zalo_uid IS DISTINCT FROM excluded.zalo_uid
        OR public.zalo_parent_contacts.phone IS DISTINCT FROM excluded.phone;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_explicit_zalo_link_contact() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_explicit_zalo_link_contact ON public.zalo_verified_links;
CREATE TRIGGER sync_explicit_zalo_link_contact
  AFTER INSERT OR UPDATE OF zalo_uid, enabled ON public.zalo_verified_links
  FOR EACH ROW EXECUTE FUNCTION public.sync_explicit_zalo_link_contact();

DO $$ DECLARE v_id uuid; BEGIN
  FOR v_id IN SELECT parent_id FROM public.zalo_parent_contacts ORDER BY parent_id
  LOOP PERFORM public.reconcile_parent_zalo_identity(v_id); END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
