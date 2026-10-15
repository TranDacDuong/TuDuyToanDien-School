BEGIN;
DO $repair$
DECLARE source text;
BEGIN
  SELECT pg_get_functiondef('public.claim_automatic_tuition_reminder(date,integer)'::regprocedure) INTO source;
  source:=replace(source,'FROM public.automatic_tuition_control WHERE id=1 AND paused',
    'FROM public.automatic_tuition_control pause_control WHERE pause_control.id=1 AND pause_control.paused');
  EXECUTE source;
END;
$repair$;
NOTIFY pgrst,'reload schema';
COMMIT;
