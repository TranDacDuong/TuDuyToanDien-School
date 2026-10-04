-- Append instead of the migration COMMIT; all fixtures and migration roll back.
DO $$
DECLARE a uuid; b uuid; uid_a text; uid_b text; phone_a text; n integer;
BEGIN
  SELECT c.parent_id, c.zalo_uid, u.phone INTO a, uid_a, phone_a
    FROM public.zalo_parent_contacts c JOIN public.users u ON u.id = c.parent_id
    JOIN public.zalo_verified_links l ON l.audience_user_id = c.parent_id
    WHERE l.verification_source = 'parent_contact' AND l.enabled LIMIT 1;
  SELECT c.parent_id, c.zalo_uid INTO b, uid_b FROM public.zalo_parent_contacts c
    JOIN public.zalo_verified_links l ON l.audience_user_id = c.parent_id
    WHERE l.verification_source = 'parent_contact' AND l.enabled AND c.parent_id <> a LIMIT 1;
  IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'Need two adopted contacts'; END IF;
  SELECT count(*) INTO n FROM public.zalo_verified_links WHERE enabled;
  PERFORM public.reconcile_parent_zalo_identity(a);
  IF (SELECT count(*) FROM public.zalo_verified_links WHERE enabled) <> n THEN
    RAISE EXCEPTION 'Reconciliation is not idempotent'; END IF;
  UPDATE public.zalo_parent_contacts SET status = 'error' WHERE parent_id = a;
  IF NOT (SELECT enabled FROM public.zalo_verified_links WHERE audience_user_id = a) THEN
    RAISE EXCEPTION 'Transient errors must not destroy an established identity'; END IF;
  UPDATE public.zalo_parent_contacts SET status = 'invited' WHERE parent_id = a;
  IF NOT (SELECT enabled FROM public.zalo_verified_links WHERE audience_user_id = a) THEN
    RAISE EXCEPTION 'Invited contacts cannot synchronize'; END IF;
  UPDATE public.zalo_parent_contacts SET zalo_uid = NULL WHERE parent_id = a;
  IF (SELECT enabled FROM public.zalo_verified_links WHERE audience_user_id = a) THEN
    RAISE EXCEPTION 'Removed UID left an enabled link'; END IF;
  UPDATE public.zalo_parent_contacts SET zalo_uid = uid_a WHERE parent_id = a;
  UPDATE public.users SET phone = 'invalid-test-phone' WHERE id = a;
  IF (SELECT enabled FROM public.zalo_verified_links WHERE audience_user_id = a) THEN
    RAISE EXCEPTION 'Changed phone left an enabled automatic link'; END IF;
  UPDATE public.users SET phone = phone_a WHERE id = a;
  IF NOT (SELECT enabled FROM public.zalo_verified_links WHERE audience_user_id = a) THEN
    RAISE EXCEPTION 'Restored identity did not reconnect'; END IF;
  UPDATE public.zalo_parent_contacts SET zalo_uid = uid_a WHERE parent_id = b;
  IF EXISTS (SELECT 1 FROM public.zalo_verified_links WHERE audience_user_id IN (a,b) AND enabled) THEN
    RAISE EXCEPTION 'Duplicate UID must not be automatically assigned'; END IF;
  UPDATE public.zalo_parent_contacts SET zalo_uid = uid_b WHERE parent_id = b;
  PERFORM public.reconcile_parent_zalo_identity(a);
  UPDATE public.zalo_verified_links SET verification_source = 'admin', enabled = false
    WHERE audience_user_id = a;
  PERFORM public.reconcile_parent_zalo_identity(a);
  IF (SELECT enabled FROM public.zalo_verified_links WHERE audience_user_id = a) THEN
    RAISE EXCEPTION 'Explicitly disabled link was silently re-enabled'; END IF;
  UPDATE public.zalo_verified_links SET zalo_uid = 'unified-fixture-uid', enabled = true
    WHERE audience_user_id = a;
  IF (SELECT zalo_uid FROM public.zalo_parent_contacts WHERE parent_id = a) <> 'unified-fixture-uid' THEN
    RAISE EXCEPTION 'Manual message link did not update tuition contact'; END IF;
  IF public.canonical_parent_zalo_phone('0912 422 333') <> public.canonical_parent_zalo_phone('+84 912422333') THEN
    RAISE EXCEPTION 'Phone normalization failed'; END IF;
  IF has_function_privilege('authenticated', 'public.reconcile_parent_zalo_identity(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Client may invoke internal reconciler'; END IF;
END $$;
SELECT 'Unified identity behavior tests passed; changes rolled back' AS result;
ROLLBACK;
