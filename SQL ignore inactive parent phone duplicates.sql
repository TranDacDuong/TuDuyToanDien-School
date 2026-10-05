BEGIN;
DO $$
DECLARE s text; anchor text;
BEGIN
  SELECT pg_get_functiondef('public.request_parent_zalo_action(uuid,text)'::regprocedure) INTO s;
  anchor := 'AND public.canonical_parent_zalo_phone(phone)=public.canonical_parent_zalo_phone(v_phone)) THEN';
  IF position(anchor IN s)=0 THEN RAISE EXCEPTION 'Parent phone guard changed'; END IF;
  s:=replace(s,anchor,
    'AND public.canonical_parent_zalo_phone(phone)=public.canonical_parent_zalo_phone(v_phone)
    AND EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=users.id AND ps.revoked_at IS NULL)) THEN');
  EXECUTE s;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
