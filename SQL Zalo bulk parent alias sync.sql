-- Durable background queue for synchronizing aliases of confirmed Zalo friends.
-- Apply after SQL Zalo manual parent linking.sql.

CREATE TABLE IF NOT EXISTS public.zalo_parent_alias_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','cancelled')),
  total integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.zalo_parent_alias_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.zalo_parent_alias_runs(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  zalo_uid text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','success','skipped','failed','cancelled')),
  attempts smallint NOT NULL DEFAULT 0,
  alias text,
  error_message text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (run_id,parent_id)
);
CREATE INDEX IF NOT EXISTS zalo_parent_alias_jobs_claim_idx
  ON public.zalo_parent_alias_jobs(status,created_at) WHERE status IN ('pending','processing');

ALTER TABLE public.zalo_parent_alias_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_parent_alias_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zalo_parent_alias_runs, public.zalo_parent_alias_jobs FROM anon, authenticated;
GRANT SELECT ON public.zalo_parent_alias_runs, public.zalo_parent_alias_jobs TO authenticated;

DROP POLICY IF EXISTS zalo_parent_alias_runs_admin_read ON public.zalo_parent_alias_runs;
CREATE POLICY zalo_parent_alias_runs_admin_read ON public.zalo_parent_alias_runs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.role::text='admin'));
DROP POLICY IF EXISTS zalo_parent_alias_jobs_admin_read ON public.zalo_parent_alias_jobs;
CREATE POLICY zalo_parent_alias_jobs_admin_read ON public.zalo_parent_alias_jobs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.role::text='admin'));

CREATE OR REPLACE FUNCTION public.start_zalo_parent_alias_sync()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_run uuid;
  v_total integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text='admin') THEN
    RAISE EXCEPTION 'Admin required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('zalo_parent_alias_sync'));
  SELECT id INTO v_run FROM public.zalo_parent_alias_runs
  WHERE status='running' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_run IS NOT NULL AND EXISTS (SELECT 1 FROM public.zalo_parent_alias_jobs
    WHERE run_id=v_run AND status IN ('pending','processing')) THEN
    RETURN jsonb_build_object('run_id',v_run,'already_running',true,
      'total',(SELECT total FROM public.zalo_parent_alias_runs WHERE id=v_run));
  END IF;
  IF v_run IS NOT NULL THEN
    UPDATE public.zalo_parent_alias_runs SET status='completed',completed_at=COALESCE(completed_at,now())
    WHERE id=v_run;
  END IF;

  INSERT INTO public.zalo_parent_alias_runs(created_by) VALUES(auth.uid()) RETURNING id INTO v_run;
  INSERT INTO public.zalo_parent_alias_jobs(run_id,parent_id,zalo_uid,phone)
  SELECT v_run,c.parent_id,c.zalo_uid,c.phone
  FROM public.zalo_parent_contacts c
  JOIN public.users p ON p.id=c.parent_id AND p.role::text='parent'
  WHERE c.status='friend' AND nullif(trim(c.zalo_uid),'') IS NOT NULL
    AND regexp_replace(c.phone,'[^0-9]','','g') ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND c.phone=regexp_replace(p.phone,'[^0-9]','','g')
    AND EXISTS (SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id=c.parent_id AND ps.revoked_at IS NULL)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_total=ROW_COUNT;
  UPDATE public.zalo_parent_alias_runs SET total=v_total,
    status=CASE WHEN v_total=0 THEN 'completed' ELSE 'running' END,
    completed_at=CASE WHEN v_total=0 THEN now() ELSE NULL END
  WHERE id=v_run;
  RETURN jsonb_build_object('run_id',v_run,'total',v_total,'already_running',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_zalo_parent_alias_sync()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_run uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text='admin') THEN
    RAISE EXCEPTION 'Admin required';
  END IF;
  SELECT id INTO v_run FROM public.zalo_parent_alias_runs
    WHERE status='running' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_run IS NULL THEN RETURN; END IF;
  UPDATE public.zalo_parent_alias_jobs SET status='cancelled',lease_until=NULL,
    error_message='Đã hủy bởi quản trị viên',completed_at=now(),updated_at=now()
  WHERE run_id=v_run AND status='pending';
  UPDATE public.zalo_parent_alias_runs SET status='cancelled',cancelled_at=now() WHERE id=v_run;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_zalo_parent_alias_job()
RETURNS TABLE(job_id uuid,parent_id uuid,zalo_uid text,phone text,current_alias text,student_names text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  UPDATE public.zalo_parent_alias_jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,
    lease_until=NULL,error_message=CASE WHEN attempts>=3 THEN 'Bot bị gián đoạn nhiều lần' ELSE error_message END,
    completed_at=CASE WHEN attempts>=3 THEN now() ELSE completed_at END,updated_at=now()
  WHERE status='processing' AND lease_until<now();
  RETURN QUERY
  WITH next_job AS (
    SELECT j.id FROM public.zalo_parent_alias_jobs j
    JOIN public.zalo_parent_alias_runs r ON r.id=j.run_id AND r.status='running'
    WHERE j.status='pending'
    ORDER BY j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE public.zalo_parent_alias_jobs j SET status='processing',attempts=attempts+1,
      lease_until=now()+interval '5 minutes',updated_at=now()
    FROM next_job n WHERE j.id=n.id
    RETURNING j.id,j.parent_id,j.zalo_uid,j.phone
  )
  SELECT c.id,c.parent_id,c.zalo_uid,c.phone,pc.zalo_alias,
    ARRAY(SELECT s.full_name FROM public.parent_students ps
      JOIN public.users s ON s.id=ps.student_id
      WHERE ps.parent_id=c.parent_id AND ps.revoked_at IS NULL ORDER BY s.full_name)
  FROM claimed c LEFT JOIN public.zalo_parent_contacts pc ON pc.parent_id=c.parent_id;
  UPDATE public.zalo_parent_alias_runs r SET status='completed',completed_at=now()
  WHERE r.status='running' AND NOT EXISTS (SELECT 1 FROM public.zalo_parent_alias_jobs j
    WHERE j.run_id=r.id AND j.status IN ('pending','processing'));
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_zalo_parent_alias_job(
  p_job_id uuid,p_status text,p_alias text DEFAULT NULL,p_error text DEFAULT NULL,
  p_relationship_status text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_parent uuid; v_run uuid;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_status NOT IN ('success','skipped','failed') THEN RAISE EXCEPTION 'Invalid alias status'; END IF;
  IF p_relationship_status IS NOT NULL AND p_relationship_status NOT IN ('friend','invited','not_friend') THEN
    RAISE EXCEPTION 'Invalid relationship status';
  END IF;
  UPDATE public.zalo_parent_alias_jobs SET status=p_status,alias=left(nullif(trim(p_alias),''),100),
    error_message=left(nullif(trim(p_error),''),500),lease_until=NULL,completed_at=now(),updated_at=now()
  WHERE id=p_job_id AND status='processing' RETURNING parent_id,run_id INTO v_parent,v_run;
  IF v_parent IS NULL THEN RAISE EXCEPTION 'Alias job lease not found'; END IF;

  UPDATE public.zalo_parent_contacts SET
    status=COALESCE(p_relationship_status,status),
    zalo_alias=CASE WHEN p_status='success' THEN left(nullif(trim(p_alias),''),100) ELSE zalo_alias END,
    alias_updated_at=CASE WHEN p_status='success' THEN now() ELSE alias_updated_at END,
    alias_error=CASE WHEN p_status='success' THEN NULL ELSE left(nullif(trim(p_error),''),500) END,
    last_checked_at=CASE WHEN p_relationship_status IS NOT NULL THEN now() ELSE last_checked_at END,
    updated_at=now()
  WHERE parent_id=v_parent;

  IF NOT EXISTS (SELECT 1 FROM public.zalo_parent_alias_jobs
    WHERE run_id=v_run AND status IN ('pending','processing')) THEN
    UPDATE public.zalo_parent_alias_runs SET status='completed',completed_at=now()
    WHERE id=v_run AND status='running';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.start_zalo_parent_alias_sync() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_zalo_parent_alias_sync() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.claim_zalo_parent_alias_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_zalo_parent_alias_job(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_zalo_parent_alias_sync() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_zalo_parent_alias_sync() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_zalo_parent_alias_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_zalo_parent_alias_job(uuid,text,text,text,text) TO service_role;
