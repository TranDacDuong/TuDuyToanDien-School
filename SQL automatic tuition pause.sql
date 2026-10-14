BEGIN;
CREATE TABLE IF NOT EXISTS public.automatic_tuition_control (
  id integer PRIMARY KEY CHECK(id=1), paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.automatic_tuition_control(id) VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE public.automatic_tuition_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automatic_tuition_control FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.control_automatic_tuition(p_action text DEFAULT 'status')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text='admin')
    OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('status','pause','resume') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
  IF p_action<>'status' THEN
    UPDATE public.automatic_tuition_control SET paused=(p_action='pause'),updated_at=now() WHERE id=1;
  END IF;
  RETURN (SELECT jsonb_build_object('paused',paused,'updated_at',updated_at) FROM public.automatic_tuition_control WHERE id=1);
END;
$$;
REVOKE ALL ON FUNCTION public.control_automatic_tuition(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.control_automatic_tuition(text) TO authenticated;

DO $migration$
DECLARE source text; anchor text := 'PERFORM 1 FROM public.mindup_zalo_dispatch_control c WHERE c.id=1 FOR UPDATE;';
BEGIN
  SELECT pg_get_functiondef('public.claim_automatic_tuition_reminder(date,integer)'::regprocedure) INTO source;
  IF position('automatic_tuition_control' IN source)>0 THEN RETURN; END IF;
  IF position(anchor IN source)=0 THEN RAISE EXCEPTION 'Automatic claim lock anchor changed'; END IF;
  source:=replace(source,anchor,anchor||E'\n  IF EXISTS(SELECT 1 FROM public.automatic_tuition_control WHERE id=1 AND paused) THEN RETURN; END IF;');
  EXECUTE source;
END;
$migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
