BEGIN;
CREATE TABLE IF NOT EXISTS public.zalo_acknowledgement_conflicts (
  job_id uuid PRIMARY KEY REFERENCES public.zalo_outbox(id),
  external_id text NOT NULL,
  existing_message_id uuid NOT NULL,
  reason text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zalo_acknowledgement_conflicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zalo_acknowledgement_conflicts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.zalo_acknowledgement_conflicts TO service_role;

-- A conflicting acknowledgement is not proof that this job was delivered.
-- Retain both messages and the acknowledgement evidence, quarantine the job,
-- and let unrelated deliveries proceed instead of blocking the whole worker.
DO $$
DECLARE src text; needle text;
BEGIN
  src:=pg_get_functiondef('public.finish_mindup_zalo_message_v2(uuid,text,text,text)'::regprocedure);
  IF position('zalo_acknowledgement_conflicts' IN src)=0 THEN
    needle:='RAISE EXCEPTION ''Outgoing message id conflicts with another message'';';
    IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Unexpected acknowledgement function'; END IF;
    src:=replace(src,needle,
      'INSERT INTO public.zalo_acknowledgement_conflicts(job_id,external_id,existing_message_id,reason)
        VALUES(p_job_id,p_external_id,v_echo.id,''Outgoing acknowledgement conflicts with an existing message'')
        ON CONFLICT(job_id) DO UPDATE SET external_id=excluded.external_id,
          existing_message_id=excluded.existing_message_id,updated_at=now();
      UPDATE public.zalo_outbox SET status=''uncertain'',locked_until=NULL,
        error_message=''Acknowledgement conflict; inspect Zalo before retrying'',updated_at=now()
        WHERE id=p_job_id;
      RETURN;');
    EXECUTE src;
  END IF;
END;
$$;
COMMIT;
