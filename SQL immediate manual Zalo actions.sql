BEGIN;
ALTER TABLE public.zalo_parent_alias_jobs ADD COLUMN IF NOT EXISTS manual_requested boolean NOT NULL DEFAULT false;
DO $$ DECLARE s text; BEGIN
  SELECT pg_get_functiondef('public.request_parent_zalo_action(uuid,text)'::regprocedure) INTO s;
  s:=replace(s,'INSERT INTO public.zalo_parent_alias_jobs(run_id,parent_id,zalo_uid,phone)',
    'INSERT INTO public.zalo_parent_alias_jobs(run_id,parent_id,zalo_uid,phone,manual_requested)');
  s:=replace(s,'VALUES(v_run,p_parent_id,c.zalo_uid,c.phone)',
    'VALUES(v_run,p_parent_id,c.zalo_uid,c.phone,true)');
  s:=replace(s,'IF v_job IS NOT NULL THEN RETURN',
    'IF v_job IS NOT NULL THEN UPDATE public.zalo_parent_alias_jobs SET manual_requested=true WHERE id=v_job; RETURN');
  EXECUTE s;
  SELECT pg_get_functiondef('public.claim_zalo_parent_alias_job()'::regprocedure) INTO s;
  s:=replace(s,'public.claim_zalo_parent_alias_job()', 'public.claim_manual_zalo_parent_alias_job()');
  s:=replace(s,'WHERE j.status=''pending''', 'WHERE j.status=''pending'' AND j.manual_requested');
  IF position('AND j.manual_requested' IN s)=0 THEN RAISE EXCEPTION 'Alias claim anchor changed'; END IF;
  EXECUTE s;
  SELECT pg_get_functiondef('public.claim_zalo_parent_check()'::regprocedure) INTO s;
  s:=replace(s,'public.claim_zalo_parent_check()', 'public.claim_manual_zalo_parent_check()');
  s:=replace(s,'WHERE c.next_check_at<=now() AND c.lease_until IS NULL',
    'WHERE c.next_check_at<=now() AND c.lease_until IS NULL AND c.manual_check_requested_at>COALESCE(c.last_checked_at,''-infinity''::timestamptz)');
  s:=replace(s,'AND c.status<>''friend''','');
  s:=replace(s,'AND c2.status<>''friend''',
    'AND c2.manual_check_requested_at>COALESCE(c2.last_checked_at,''-infinity''::timestamptz)');
  IF position('AND c.manual_check_requested_at>' IN s)=0 THEN RAISE EXCEPTION 'Contact claim anchor changed'; END IF;
  EXECUTE s;
END $$;
CREATE OR REPLACE FUNCTION public.claim_manual_parent_zalo_action(p_allow_alias boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF (SELECT paused FROM public.zalo_automation_state WHERE id=1) THEN RETURN NULL; END IF;
  IF p_allow_alias AND EXISTS (SELECT 1 FROM public.zalo_parent_alias_jobs WHERE manual_requested AND status='pending') THEN
    SELECT * INTO j FROM public.claim_manual_zalo_parent_alias_job();
    IF FOUND THEN RETURN jsonb_build_object('kind','alias','job',to_jsonb(j)); END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.zalo_parent_contacts WHERE manual_check_requested_at>COALESCE(last_checked_at,'-infinity'::timestamptz) AND next_check_at<=now() AND lease_until IS NULL) THEN
    SELECT * INTO j FROM public.claim_manual_zalo_parent_check();
    IF FOUND THEN RETURN jsonb_build_object('kind','parent','job',to_jsonb(j)); END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.claim_manual_zalo_parent_alias_job(),public.claim_manual_zalo_parent_check(),public.claim_manual_parent_zalo_action(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_manual_parent_zalo_action(boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
