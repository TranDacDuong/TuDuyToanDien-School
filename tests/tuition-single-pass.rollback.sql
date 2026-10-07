BEGIN;
CREATE TEMP TABLE protected_notices AS
SELECT id,status,sent_at,dispatch_paused FROM public.zalo_tuition_deliveries
WHERE status IN ('sent','processing','uncertain','cancelled') OR sent_at IS NOT NULL OR dispatch_paused;
SELECT public.finalize_unreachable_tuition_notices() AS skipped;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM protected_notices original
    JOIN public.zalo_tuition_deliveries current ON current.id=original.id
    WHERE current.status IS DISTINCT FROM original.status
      OR current.sent_at IS DISTINCT FROM original.sent_at
      OR current.dispatch_paused IS DISTINCT FROM original.dispatch_paused) THEN
    RAISE EXCEPTION 'Protected notice changed';
  END IF;
  IF public.finalize_unreachable_tuition_notices()<>0 THEN
    RAISE EXCEPTION 'Single-pass sweep must be idempotent';
  END IF;
END;
$$;
SELECT 'PASS: success, processing, uncertainty, cancellation and manual pauses preserved; sweep idempotent' AS result;
ROLLBACK;
