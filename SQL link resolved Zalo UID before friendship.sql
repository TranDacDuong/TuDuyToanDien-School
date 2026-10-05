-- Apply after SQL unify parent Zalo identity.sql.
BEGIN;

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
  -- A resolved UID identifies the parent even if friendship/greeting later fails.
  v_valid := v_phone IS NOT NULL
    AND v_phone = public.canonical_parent_zalo_phone(c.phone)
    AND nullif(trim(c.zalo_uid), '') IS NOT NULL AND length(c.zalo_uid) <= 100
    AND c.status <> 'not_found'
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
  IF NOT COALESCE(v_valid, false) THEN RETURN; END IF;
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

DO $$ DECLARE v_id uuid; BEGIN
  FOR v_id IN SELECT parent_id FROM public.zalo_parent_contacts ORDER BY parent_id
  LOOP PERFORM public.reconcile_parent_zalo_identity(v_id); END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
