BEGIN;
CREATE OR REPLACE FUNCTION public.automatic_tuition_sending_time(p_at timestamptz DEFAULT clock_timestamp())
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= time '06:00';
$$;
REVOKE ALL ON FUNCTION public.automatic_tuition_sending_time(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automatic_tuition_sending_time(timestamptz) TO service_role;

-- Patch the live definitions so existing pause, arrears and deduplication rules stay intact.
DO $migration$
DECLARE spec record;source text;
 auth_guard text:='IF auth.role() IS DISTINCT FROM ''service_role'' THEN RAISE EXCEPTION ''Service role required''; END IF;';
 resume_anchor text:='x.id,x.token,c.zalo_uid,x.payload FROM claimed x';
BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('public.claim_automatic_tuition_reminder(date,integer)','IF NOT public.automatic_tuition_sending_time() THEN RETURN; END IF;'),
  ('public.reserve_automatic_tuition_dispatch_slot(uuid,uuid,integer,integer,integer)','IF NOT public.automatic_tuition_sending_time() THEN RETURN NULL; END IF;'),
  ('public.begin_automatic_tuition_part(uuid,uuid,integer,date,boolean,integer)',
   $guard$IF NOT public.automatic_tuition_sending_time() THEN
    PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
    UPDATE public.automatic_tuition_reminders SET status='queued',lease_until=NULL,part_started=false,error_message=NULL,updated_at=now()
    WHERE id=p_id AND token=p_token AND status='processing' AND next_part=p_index AND lease_until>clock_timestamp();
    RETURN false;
   END IF;$guard$)
 )v(signature,guard_sql) LOOP
  source:=pg_get_functiondef(spec.signature::regprocedure);
  source:=replace(replace(source,E'\r\n',E'\n'),E'\r',E'\n');
  IF position('automatic_tuition_quiet_hours' IN source)=0 THEN
   IF position(auth_guard IN source)=0 THEN RAISE EXCEPTION 'Automatic tuition auth guard changed: %',spec.signature; END IF;
   source:=replace(source,auth_guard,auth_guard||E'\n  -- automatic_tuition_quiet_hours\n  '||spec.guard_sql);
   EXECUTE source;
  END IF;
 END LOOP;
 source:=pg_get_functiondef('public.claim_automatic_tuition_reminder(date,integer)'::regprocedure);
 source:=replace(replace(source,E'\r\n',E'\n'),E'\r',E'\n');
 IF position('automatic_tuition_resume_part' IN source)=0 THEN
  IF position(resume_anchor IN source)=0 THEN RAISE EXCEPTION 'Automatic tuition resume anchor changed'; END IF;
  source:=replace(source,resume_anchor,$resume$x.id,x.token,c.zalo_uid,
   x.payload||jsonb_build_object('next_part',(SELECT resume.next_part FROM public.automatic_tuition_reminders resume WHERE resume.id=x.id))
   FROM claimed x /* automatic_tuition_resume_part */$resume$);
  EXECUTE source;
 END IF;
END;
$migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
