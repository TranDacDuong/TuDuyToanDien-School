BEGIN;
-- An ambiguous acknowledgement quarantines one delivery, not its entire batch.
DROP TRIGGER IF EXISTS pause_uncertain_tuition_batch ON public.zalo_tuition_deliveries;

DO $$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.control_zalo_tuition_batch(uuid,text,boolean)'::regprocedure);
  IF position('p_action=''resume''' IN src) = 0 THEN
    IF position('p_action NOT IN (''pause'',''retry'')' IN src) = 0
      OR position('  IF EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE batch_id=p_batch_id AND status=''processing'')' IN src) = 0 THEN
      RAISE EXCEPTION 'Unexpected tuition batch control definition';
    END IF;
    src := replace(src, 'p_action NOT IN (''pause'',''retry'')', 'p_action NOT IN (''pause'',''retry'',''resume'')');
    src := replace(src,
      '  IF EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE batch_id=p_batch_id AND status=''processing'')',
      '  IF p_action=''resume'' THEN
    UPDATE public.zalo_tuition_deliveries SET dispatch_paused=false,updated_at=now()
      WHERE batch_id=p_batch_id AND dispatch_paused AND status NOT IN (''sent'',''cancelled'',''uncertain'');
    GET DIAGNOSTICS n=ROW_COUNT;
    RETURN n;
  END IF;
  IF EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE batch_id=p_batch_id AND status=''processing'')');
    EXECUTE src;
  END IF;
END;
$$;
-- Existing pauses are intentionally preserved: old rows cannot tell a manual
-- pause from an automatic one. Resume is explicit and never requeues uncertainty.
COMMIT;
