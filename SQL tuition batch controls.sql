BEGIN;
ALTER TABLE public.zalo_tuition_deliveries ADD COLUMN IF NOT EXISTS dispatch_paused boolean NOT NULL DEFAULT false;
ALTER TABLE public.zalo_tuition_deliveries ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.mindup_zalo_dispatch_control ADD COLUMN IF NOT EXISTS next_tuition_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.control_zalo_tuition_batch(p_batch_id uuid,p_action text,p_confirm_uncertain boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN
    RAISE EXCEPTION 'Tuition queue permission required';
  END IF;
  IF p_action NOT IN ('pause','retry') OR p_batch_id IS NULL THEN RAISE EXCEPTION 'Invalid batch action'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_batch_id::text,0));
  IF p_action='pause' THEN
    UPDATE public.zalo_tuition_deliveries SET dispatch_paused=true,updated_at=now()
      WHERE batch_id=p_batch_id AND status NOT IN ('sent','cancelled');
    GET DIAGNOSTICS n=ROW_COUNT;
    RETURN n;
  END IF;
  IF EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE batch_id=p_batch_id AND status='processing') THEN
    RAISE EXCEPTION 'A message is still being sent; wait for its result before retrying';
  END IF;
  IF NOT p_confirm_uncertain AND EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries
    WHERE batch_id=p_batch_id AND status='uncertain') THEN
    RAISE EXCEPTION 'Confirm Zalo delivery review before retrying unconfirmed messages';
  END IF;
  UPDATE public.zalo_tuition_deliveries d SET status='queued',dispatch_paused=false,
    retry_count=retry_count+CASE WHEN d.status IN ('failed','uncertain') THEN 1 ELSE 0 END,
    lease_until=NULL,error_message=NULL,updated_at=now()
  FROM public.tuition_payments tp
  WHERE d.batch_id=p_batch_id AND d.status IN ('queued','failed','uncertain','not_found','not_friend','invited','greeted')
    AND (d.retry_count<5 OR d.status IN ('queued','not_found','not_friend','invited','greeted')) AND d.sent_at IS NULL
    AND tp.student_id=d.student_id AND tp.month=d.month
    AND tp.amount_due>tp.amount_paid AND tp.amount_due-tp.amount_paid=d.remaining_snapshot
    AND EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=d.parent_id
      AND ps.student_id=d.student_id AND ps.revoked_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries sent
      WHERE sent.batch_id=d.batch_id AND sent.student_id=d.student_id AND sent.parent_id=d.parent_id
        AND (sent.status='sent' OR sent.sent_at IS NOT NULL))
    AND NOT EXISTS(SELECT 1 FROM public.messages m WHERE m.id=d.message_id AND m.external_message_id IS NOT NULL);
  GET DIAGNOSTICS n=ROW_COUNT;
  UPDATE public.zalo_parent_contacts c SET next_check_at=now()
    WHERE c.status<>'friend' AND c.lease_until IS NULL AND EXISTS(
      SELECT 1 FROM public.zalo_tuition_deliveries d WHERE d.batch_id=p_batch_id
        AND d.parent_id=c.parent_id AND d.status='queued' AND NOT d.dispatch_paused);
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.control_zalo_tuition_batch(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_zalo_tuition_batch(uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.pause_uncertain_tuition_batch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='uncertain' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.batch_id IS NOT NULL THEN
    UPDATE public.zalo_tuition_deliveries SET dispatch_paused=true
      WHERE batch_id=NEW.batch_id AND status NOT IN ('sent','cancelled');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pause_uncertain_tuition_batch() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS pause_uncertain_tuition_batch ON public.zalo_tuition_deliveries;
CREATE TRIGGER pause_uncertain_tuition_batch AFTER UPDATE OF status ON public.zalo_tuition_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.pause_uncertain_tuition_batch();

-- Preserve the deployed claim's identity and payment checks; only add batch
-- pause and tuition-only pacing. Direct teacher messages remain immediate.
DO $$
DECLARE src text;
BEGIN
  src:=pg_get_functiondef('public.claim_zalo_tuition_delivery()'::regprocedure);
  IF position('next_tuition_at' IN src)=0 THEN
    IF position('  RETURN QUERY' IN src)=0 OR position('WHERE d.status IN' IN src)=0 THEN
      RAISE EXCEPTION 'Unexpected tuition claim definition';
    END IF;
    src:=replace(src,'  RETURN QUERY',
      '  PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
  IF (SELECT next_tuition_at>now() FROM public.mindup_zalo_dispatch_control WHERE id=1) THEN RETURN; END IF;
  RETURN QUERY');
    src:=replace(src,'WHERE d.status IN','WHERE NOT d.dispatch_paused AND d.status IN');
    src:=replace(src,'END;',
      'IF FOUND THEN UPDATE public.mindup_zalo_dispatch_control SET next_tuition_at=now()+interval ''45 seconds'' WHERE id=1; END IF;
END;');
    EXECUTE src;
  END IF;
END;
$$;
COMMIT;
