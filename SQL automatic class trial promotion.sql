BEGIN;
CREATE OR REPLACE FUNCTION public.promote_finished_class_trials()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE candidate record; t public.trial_lesson_requests; last_end timestamptz; last_day date; promoted integer:=0;
BEGIN
 FOR candidate IN
  SELECT r.id,r.trial_class_id,r.student_id FROM public.trial_lesson_requests r
  JOIN public.classes c ON c.id=r.trial_class_id AND NOT coalesce(c.hidden,false)
  WHERE r.managed_in_class AND r.status IN('scheduled','trial_1_done','trial_2_done')
   AND jsonb_array_length(r.trial_sessions)>0
   AND (SELECT max((s->>'ends_at')::timestamptz) FROM jsonb_array_elements(r.trial_sessions)s)<=now()
   AND EXISTS(SELECT 1 FROM public.class_students cs WHERE cs.class_id=r.trial_class_id
    AND cs.student_id=r.student_id AND cs.is_trial AND cs.left_at IS NULL)
  ORDER BY r.id LIMIT 200
 LOOP
  -- Share the lock with manual stop/extension, then re-read their latest decision.
  IF NOT pg_try_advisory_xact_lock(hashtextextended(candidate.trial_class_id::text||candidate.student_id::text,0)) THEN CONTINUE; END IF;
  SELECT * INTO t FROM public.trial_lesson_requests WHERE id=candidate.id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR NOT t.managed_in_class OR t.status NOT IN('scheduled','trial_1_done','trial_2_done') THEN CONTINUE; END IF;
  SELECT max((s->>'ends_at')::timestamptz),max((s->>'date')::date)
   INTO last_end,last_day FROM jsonb_array_elements(t.trial_sessions)s;
  IF last_end IS NULL OR last_day IS NULL OR last_end>now() THEN CONTINUE; END IF;
  UPDATE public.class_students SET is_trial=false,tuition_starts_on=last_day+1
   WHERE class_id=t.trial_class_id AND student_id=t.student_id AND is_trial AND left_at IS NULL;
  IF NOT FOUND THEN CONTINUE; END IF;
  UPDATE public.trial_lesson_requests SET status='enrolled',enrolled_at=last_end,handled_at=now(),handled_by=NULL WHERE id=t.id;
  promoted:=promoted+1;
 END LOOP;
 RETURN promoted;
END;$$;
REVOKE ALL ON FUNCTION public.promote_finished_class_trials() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.promote_finished_class_trials() TO service_role;
DO $$ BEGIN
 IF to_regnamespace('cron') IS NULL THEN RAISE EXCEPTION 'pg_cron is required for automatic trial promotion'; END IF;
 PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='mindup-finished-class-trials';
 PERFORM cron.schedule('mindup-finished-class-trials','* * * * *','SELECT public.promote_finished_class_trials();');
END;$$;
SELECT public.promote_finished_class_trials();
NOTIFY pgrst,'reload schema';
COMMIT;
