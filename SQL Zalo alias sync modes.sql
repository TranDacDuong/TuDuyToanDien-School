-- Add explicit full/remaining modes to the durable parent alias synchronization.
-- Apply after SQL Zalo bulk parent alias sync.sql.

ALTER TABLE public.zalo_parent_alias_runs
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'all';

ALTER TABLE public.zalo_parent_alias_runs
  DROP CONSTRAINT IF EXISTS zalo_parent_alias_runs_mode_check;
ALTER TABLE public.zalo_parent_alias_runs
  ADD CONSTRAINT zalo_parent_alias_runs_mode_check CHECK (mode IN ('remaining','all'));

CREATE OR REPLACE FUNCTION public.start_zalo_parent_alias_sync_v2(p_mode text DEFAULT 'remaining')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_run uuid;
  v_total integer;
  v_mode text := lower(trim(coalesce(p_mode,'remaining')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text='admin') THEN
    RAISE EXCEPTION 'Admin required';
  END IF;
  IF v_mode NOT IN ('remaining','all') THEN
    RAISE EXCEPTION 'Invalid alias sync mode';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('zalo_parent_alias_sync'));
  SELECT id INTO v_run FROM public.zalo_parent_alias_runs
  WHERE status='running' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_run IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.zalo_parent_alias_jobs
    WHERE run_id=v_run AND status IN ('pending','processing')
  ) THEN
    RETURN jsonb_build_object(
      'run_id',v_run,
      'already_running',true,
      'mode',(SELECT mode FROM public.zalo_parent_alias_runs WHERE id=v_run),
      'total',(SELECT total FROM public.zalo_parent_alias_runs WHERE id=v_run)
    );
  END IF;
  IF v_run IS NOT NULL THEN
    UPDATE public.zalo_parent_alias_runs
    SET status='completed',completed_at=coalesce(completed_at,now())
    WHERE id=v_run;
  END IF;

  INSERT INTO public.zalo_parent_alias_runs(created_by,mode)
  VALUES(auth.uid(),v_mode) RETURNING id INTO v_run;

  INSERT INTO public.zalo_parent_alias_jobs(run_id,parent_id,zalo_uid,phone)
  SELECT v_run,c.parent_id,c.zalo_uid,c.phone
  FROM public.zalo_parent_contacts c
  JOIN public.users p ON p.id=c.parent_id AND p.role::text='parent'
  WHERE c.status='friend'
    AND nullif(trim(c.zalo_uid),'') IS NOT NULL
    AND regexp_replace(c.phone,'[^0-9]','','g') ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND c.phone=regexp_replace(p.phone,'[^0-9]','','g')
    AND EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id=c.parent_id AND ps.revoked_at IS NULL
    )
    AND (
      v_mode='all'
      OR c.alias_updated_at IS NULL
      OR nullif(trim(c.zalo_alias),'') IS NULL
      OR nullif(trim(c.alias_error),'') IS NOT NULL
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_total=ROW_COUNT;
  UPDATE public.zalo_parent_alias_runs
  SET total=v_total,
      status=CASE WHEN v_total=0 THEN 'completed' ELSE 'running' END,
      completed_at=CASE WHEN v_total=0 THEN now() ELSE NULL END
  WHERE id=v_run;

  RETURN jsonb_build_object(
    'run_id',v_run,'total',v_total,'mode',v_mode,'already_running',false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_zalo_parent_alias_sync_v2(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_zalo_parent_alias_sync_v2(text) TO authenticated;
