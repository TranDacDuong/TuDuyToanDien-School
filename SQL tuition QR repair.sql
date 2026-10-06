BEGIN;
ALTER TABLE public.zalo_tuition_deliveries ADD COLUMN IF NOT EXISTS qr_only_requested boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.request_tuition_qr_repair(p_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN
    RAISE EXCEPTION 'Tuition queue permission required';
  END IF;
  UPDATE public.zalo_tuition_deliveries d SET qr_only_requested=true,dispatch_paused=false,updated_at=now()
  FROM public.tuition_payments tp
  WHERE d.id=p_job_id AND d.status='sent' AND d.sent_at IS NOT NULL
    AND d.qr_sent_at IS NULL AND d.qr_url IS NOT NULL
    AND tp.student_id=d.student_id AND tp.month=d.month
    AND tp.amount_due>tp.amount_paid AND tp.amount_due-tp.amount_paid=d.remaining_snapshot
    AND EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.student_id=d.student_id
      AND ps.parent_id=d.parent_id AND ps.revoked_at IS NULL);
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.request_tuition_qr_repair(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_tuition_qr_repair(uuid) TO authenticated;

DO $$
DECLARE src text; needle text;
BEGIN
  src:=pg_get_functiondef('public.claim_zalo_tuition_delivery()'::regprocedure);
  IF position('qr_only_requested' IN src)=0 THEN
    needle:='WHERE NOT d.dispatch_paused AND d.status IN (''queued'',''not_found'',''not_friend'',''invited'',''greeted'')';
    IF position(needle IN src)=0 OR position('d.parent_id, d.content, d.qr_url' IN src)=0 THEN
      RAISE EXCEPTION 'Unexpected tuition claim definition';
    END IF;
    src:=replace(src,needle,
      'WHERE NOT d.dispatch_paused AND (d.status IN (''queued'',''not_found'',''not_friend'',''invited'',''greeted'')
        OR (d.status=''sent'' AND d.qr_only_requested AND d.qr_sent_at IS NULL))');
    src:=replace(src,'SET status = ''processing'',','SET status = ''processing'', qr_only_requested=false,');
    src:=replace(src,'d.parent_id, d.content, d.qr_url',
      'd.parent_id, CASE WHEN d.sent_at IS NOT NULL THEN NULL::text ELSE d.content END AS content, d.qr_url');
    EXECUTE src;
  END IF;
END;
$$;
COMMIT;
