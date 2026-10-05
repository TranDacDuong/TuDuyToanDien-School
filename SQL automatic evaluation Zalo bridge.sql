-- Apply AFTER parent notification policy and unified Zalo dispatch.
-- Future automatic AND manual publications only; no historical messages are requeued.
BEGIN;
CREATE TABLE IF NOT EXISTS public.evaluation_zalo_bridge_installation (
  id boolean PRIMARY KEY DEFAULT true CHECK(id), installed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.evaluation_zalo_bridge_installation(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.evaluation_zalo_bridge_installation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evaluation_zalo_bridge_installation FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS public.evaluation_zalo_publications (
  evaluation_id uuid NOT NULL REFERENCES public.session_student_evaluations(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users(id),
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  PRIMARY KEY(evaluation_id,parent_id)
);
ALTER TABLE public.evaluation_zalo_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_zalo_publications
  ADD COLUMN IF NOT EXISTS outbox_id uuid REFERENCES public.zalo_outbox(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS zalo_delivery_status text NOT NULL DEFAULT 'unknown'
    CHECK (zalo_delivery_status IN ('unknown','not_queued','pending','processing','sent','failed','uncertain','cancelled')),
  ADD COLUMN IF NOT EXISTS zalo_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS evaluation_zalo_publications_message_idx ON public.evaluation_zalo_publications(message_id);
REVOKE ALL ON public.evaluation_zalo_publications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.evaluation_zalo_publications TO authenticated;
DROP POLICY IF EXISTS evaluation_zalo_publications_read ON public.evaluation_zalo_publications;
CREATE POLICY evaluation_zalo_publications_read ON public.evaluation_zalo_publications
FOR SELECT TO authenticated USING (
  parent_id=auth.uid() OR EXISTS (
    SELECT 1 FROM public.session_student_evaluations e WHERE e.id=evaluation_id
      AND public.can_access_learning_thread(e.student_id,parent_id)
  )
);
COMMENT ON COLUMN public.evaluation_zalo_publications.zalo_delivery_status IS
  'Per-parent transport state. In-app publication is NOT pending queue or sent acknowledgement; unknown legacy rows are not resent.';

CREATE OR REPLACE FUNCTION public.bridge_automatic_parent_evaluation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE eid uuid; sid uuid; mid uuid; cid uuid; job public.zalo_outbox;
BEGIN
  IF NEW.type<>'session_evaluation' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.meta->>'evaluation_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR COALESCE(NEW.meta->>'student_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RETURN NEW; END IF;
  eid:=(NEW.meta->>'evaluation_id')::uuid;
  sid:=(NEW.meta->>'student_id')::uuid;
  -- Automatic sends insert before draft publication; manual sends persist sent
  -- first. The stable installation cutoff excludes historic sent records.
  IF NOT EXISTS (SELECT 1 FROM public.session_student_evaluations e
    WHERE e.id=eid AND e.student_id=sid AND (
      (e.state='draft' AND e.sent_at IS NULL) OR
      (e.state='sent' AND e.sent_at >= (SELECT installed_at FROM public.evaluation_zalo_bridge_installation WHERE id))
    ))
    OR NULLIF(trim(NEW.message),'') IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.parent_students ps JOIN public.users u ON u.id=ps.parent_id AND u.role::text='parent'
    WHERE ps.parent_id=NEW.user_id AND ps.student_id=sid AND ps.revoked_at IS NULL
      AND ps.parent_id<>sid) THEN RETURN NEW; END IF;
  UPDATE public.session_student_evaluations SET notification_delivery_state='published',
    notification_published_at=COALESCE(notification_published_at,NEW.created_at),updated_at=now()
    WHERE id=eid;
  IF EXISTS (SELECT 1 FROM public.message_templates
    WHERE id='session_evaluation_notice' AND is_enabled=false)
    OR EXISTS (SELECT 1 FROM public.notifications historical
      WHERE historical.type='session_evaluation' AND historical.user_id=NEW.user_id
        AND historical.meta->>'evaluation_id'=eid::text
        AND historical.created_at < (SELECT installed_at FROM public.evaluation_zalo_bridge_installation WHERE id))
  THEN RETURN NEW; END IF;
  INSERT INTO public.evaluation_zalo_publications(evaluation_id,parent_id,zalo_delivery_status) VALUES(eid,NEW.user_id,'not_queued')
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN NEW; END IF;
  cid:=public.ensure_mindup_official_audience_conversation(NEW.user_id);
  INSERT INTO public.messages(conversation_id,sender_id,content,transport,context_student_id,zalo_dispatch_source)
    VALUES(cid,'00000000-0000-0000-0000-000000000001',NEW.message,'web',sid,'automatic') RETURNING id INTO mid;
  SELECT * INTO job FROM public.zalo_outbox WHERE message_id=mid;
  UPDATE public.evaluation_zalo_publications SET message_id=mid,outbox_id=job.id,
    zalo_delivery_status=COALESCE(job.status,'not_queued'),
    zalo_delivered_at=CASE WHEN job.status='sent' THEN job.sent_at ELSE NULL END,
    delivery_error=job.error_message,updated_at=now()
    WHERE evaluation_id=eid AND parent_id=NEW.user_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bridge_automatic_parent_evaluation() FROM PUBLIC;
DROP TRIGGER IF EXISTS automatic_parent_evaluation_bridge ON public.notifications;
CREATE TRIGGER automatic_parent_evaluation_bridge AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.bridge_automatic_parent_evaluation();

-- All gateway finish acknowledgements and lease/retry/cancel transitions update
-- the outbox. Mirror them without changing unrelated dispatchers or retrying.
CREATE OR REPLACE FUNCTION public.track_evaluation_zalo_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.evaluation_zalo_publications SET outbox_id=NEW.id,zalo_delivery_status=NEW.status,
    zalo_delivered_at=CASE WHEN NEW.status='sent' THEN NEW.sent_at ELSE NULL END,
    delivery_error=NEW.error_message,updated_at=now()
    WHERE message_id=NEW.message_id AND parent_id=NEW.audience_user_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.track_evaluation_zalo_delivery() FROM PUBLIC;
DROP TRIGGER IF EXISTS evaluation_zalo_delivery_tracking ON public.zalo_outbox;
CREATE TRIGGER evaluation_zalo_delivery_tracking
AFTER INSERT OR UPDATE OF status,sent_at,error_message ON public.zalo_outbox
FOR EACH ROW EXECUTE FUNCTION public.track_evaluation_zalo_delivery();

-- Evidence-only ledger reconciliation, never backfill messages or queue jobs.
UPDATE public.evaluation_zalo_publications p SET outbox_id=o.id,zalo_delivery_status=o.status,
  zalo_delivered_at=CASE WHEN o.status='sent' THEN o.sent_at ELSE NULL END,
  delivery_error=o.error_message,updated_at=now()
FROM public.zalo_outbox o WHERE o.message_id=p.message_id AND o.audience_user_id=p.parent_id;

-- The worker needs structured chart payloads. Leave token parsing to its own
-- renderer; stripping everything after the first token destroys those charts.
DO $migration$
DECLARE definition text;
  anchor text := 'regexp_replace(NEW.content,''__(ACTION|CHART|EVALUATION)__.*$'','''',''s'')';
BEGIN
  definition := pg_get_functiondef('public.enqueue_mindup_official_message_trigger()'::regprocedure);
  definition := replace(replace(definition,E'\r\n',E'\n'),E'\r',E'\n');
  IF position(anchor IN definition)>0 THEN
    IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN
      RAISE EXCEPTION 'Ambiguous official outbox content filter';
    END IF;
    definition := replace(definition,anchor,'NEW.content');
    EXECUTE definition;
  ELSIF definition !~ 'v_uid,[[:space:]]*NEW\.content,' THEN
    RAISE EXCEPTION 'Unknown official outbox content filter; review before applying';
  END IF;
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
