BEGIN;

CREATE TABLE IF NOT EXISTS public.mindup_zalo_dispatch_control (
  id integer PRIMARY KEY CHECK (id = 1),
  paused boolean NOT NULL DEFAULT false,
  next_send_at timestamptz NOT NULL DEFAULT now(),
  urgent_streak integer NOT NULL DEFAULT 0,
  batch_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.mindup_zalo_dispatch_control(id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.zalo_outbox ADD COLUMN IF NOT EXISTS dispatch_purpose text NOT NULL DEFAULT 'message';
ALTER TABLE public.zalo_outbox ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.zalo_outbox ADD COLUMN IF NOT EXISTS dispatch_priority smallint NOT NULL DEFAULT 0;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS zalo_dispatch_source text NOT NULL DEFAULT 'automatic';
ALTER TABLE public.zalo_tuition_receipts ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.zalo_tuition_deliveries ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS zalo_outbox_greeting_unique
  ON public.zalo_outbox(audience_user_id, zalo_uid, contact_phone)
  WHERE dispatch_purpose = 'greeting';
ALTER TABLE public.mindup_zalo_dispatch_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mindup_zalo_dispatch_control FROM anon, authenticated;

-- Three existing durable sources form one dispatch list. Priority does not alter
-- the order within a source; every sixth opportunity goes to a tuition notice.
CREATE OR REPLACE FUNCTION public.claim_mindup_zalo_message()
RETURNS TABLE(job_id uuid,zalo_uid text,content text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  UPDATE public.zalo_outbox SET status='uncertain',locked_until=NULL,
    error_message='Sender interrupted; verify in Zalo before retrying',updated_at=now()
    WHERE status='processing' AND locked_until<now();
  RETURN QUERY WITH next_job AS (
    SELECT o.id FROM public.zalo_outbox o JOIN public.zalo_verified_links l
      ON l.audience_user_id=o.audience_user_id AND l.zalo_uid=o.zalo_uid AND l.enabled
    WHERE o.status='pending' ORDER BY o.dispatch_priority,o.created_at,o.id
    FOR UPDATE OF o SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE public.zalo_outbox o SET status='processing',attempts=o.attempts+1,
      locked_until=now()+interval '5 minutes',updated_at=now()
    FROM next_job n WHERE o.id=n.id RETURNING o.id,o.zalo_uid,o.content
  ) SELECT c.id,c.zalo_uid,c.content FROM claimed c;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_mindup_zalo_message() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mindup_zalo_message() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_next_mindup_zalo_dispatch(
  p_spacing_seconds integer, p_batch_size integer, p_batch_pause_seconds integer)
RETURNS TABLE(kind text, job_id uuid, zalo_uid text, content text, qr_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ctl public.mindup_zalo_dispatch_control%ROWTYPE;
  v_web record; v_receipt record; v_tuition record; v_kind text;
  v_id uuid; v_uid text; v_content text; v_qr text; v_web_at timestamptz; v_receipt_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_spacing_seconds NOT BETWEEN 0 AND 300 OR p_batch_size NOT BETWEEN 1 AND 500
    OR p_batch_pause_seconds NOT BETWEEN 0 AND 86400 THEN RAISE EXCEPTION 'Invalid pacing'; END IF;
  SELECT * INTO ctl FROM public.mindup_zalo_dispatch_control WHERE id = 1 FOR UPDATE;
  IF ctl.paused OR (SELECT paused FROM public.zalo_automation_state WHERE id=1) THEN RETURN; END IF;
  -- A claimed delivery holds the shared sender until completion or lease expiry.
  UPDATE public.zalo_outbox SET status='uncertain', locked_until=NULL,
    error_message='Sender interrupted; verify in Zalo before retrying', updated_at=now()
    WHERE status='processing' AND locked_until < now();
  UPDATE public.zalo_tuition_receipts SET status='uncertain', lease_until=NULL,
    error_message='Sender interrupted; verify in Zalo before retrying', updated_at=now()
    WHERE status='processing' AND lease_until < now();
  UPDATE public.zalo_tuition_deliveries SET status='uncertain', lease_until=NULL,
    error_message='Sender interrupted; verify in Zalo before retrying', updated_at=now()
    WHERE status='processing' AND lease_until < now();
  IF EXISTS (SELECT 1 FROM public.zalo_outbox WHERE status='processing')
    OR EXISTS (SELECT 1 FROM public.zalo_tuition_receipts WHERE status='processing')
    OR EXISTS (SELECT 1 FROM public.zalo_tuition_deliveries WHERE status='processing') THEN RETURN; END IF;

  IF ctl.urgent_streak >= 5 THEN
    SELECT * INTO v_tuition FROM public.claim_zalo_tuition_delivery();
    IF v_tuition.job_id IS NOT NULL THEN
      v_kind := 'tuition'; v_id := v_tuition.job_id; v_uid := v_tuition.zalo_uid;
      v_content := v_tuition.content; v_qr := v_tuition.qr_url;
    END IF;
  END IF;
  IF v_id IS NULL THEN
    SELECT min(o.created_at) INTO v_web_at FROM public.zalo_outbox o
      JOIN public.zalo_verified_links l ON l.audience_user_id=o.audience_user_id AND l.zalo_uid=o.zalo_uid AND l.enabled
      WHERE o.status='pending' AND o.dispatch_priority=0;
    SELECT min(r.created_at) INTO v_receipt_at FROM public.zalo_tuition_receipts r
      JOIN public.zalo_parent_contacts c ON c.parent_id=r.parent_id
      JOIN public.users u ON u.id=r.parent_id
      WHERE r.status='pending' AND c.zalo_uid IS NOT NULL
        AND (c.status IN ('friend','invited') OR c.greeting_sent_at IS NOT NULL)
        AND c.phone=regexp_replace(u.phone,'[^0-9]','','g')
        AND EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=r.parent_id AND ps.student_id=r.student_id AND ps.revoked_at IS NULL);
    IF v_web_at IS NOT NULL AND (v_receipt_at IS NULL OR v_web_at<=v_receipt_at) THEN
      SELECT * INTO v_web FROM public.claim_mindup_zalo_message();
      IF v_web.job_id IS NOT NULL THEN
        v_kind:='web'; v_id:=v_web.job_id; v_uid:=v_web.zalo_uid; v_content:=v_web.content;
      END IF;
    END IF;
  END IF;
  IF v_id IS NULL THEN
    SELECT * INTO v_receipt FROM public.claim_zalo_tuition_receipt();
    IF v_receipt.job_id IS NOT NULL THEN
      v_kind := 'receipt'; v_id := v_receipt.job_id; v_uid := v_receipt.zalo_uid;
      v_content := v_receipt.content;
    END IF;
  END IF;
  IF v_id IS NULL THEN
    SELECT * INTO v_web FROM public.claim_mindup_zalo_message();
    IF v_web.job_id IS NOT NULL THEN
      v_kind := 'web'; v_id := v_web.job_id; v_uid := v_web.zalo_uid;
      v_content := v_web.content;
    END IF;
  END IF;
  IF v_id IS NULL THEN
    SELECT * INTO v_tuition FROM public.claim_zalo_tuition_delivery();
    IF v_tuition.job_id IS NOT NULL THEN
      v_kind := 'tuition'; v_id := v_tuition.job_id; v_uid := v_tuition.zalo_uid;
      v_content := v_tuition.content; v_qr := v_tuition.qr_url;
    END IF;
  END IF;
  IF v_id IS NULL THEN RETURN; END IF;

  UPDATE public.mindup_zalo_dispatch_control SET
    batch_count = 0,
    urgent_streak = CASE WHEN v_kind = 'tuition' THEN 0 ELSE LEAST(ctl.urgent_streak + 1, 5) END,
    next_send_at = now(),
    updated_at = now() WHERE id = 1;
  RETURN QUERY SELECT v_kind, v_id, v_uid, v_content, v_qr;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_next_mindup_zalo_dispatch(integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_mindup_zalo_dispatch(integer,integer,integer) TO service_role;

-- QR is a second Zalo message. Reserve its own slot before uploading it.
CREATE OR REPLACE FUNCTION public.reserve_mindup_zalo_dispatch_slot(
  p_spacing_seconds integer, p_batch_size integer, p_batch_pause_seconds integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ctl public.mindup_zalo_dispatch_control%ROWTYPE; v_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_spacing_seconds NOT BETWEEN 0 AND 300 OR p_batch_size NOT BETWEEN 1 AND 500
    OR p_batch_pause_seconds NOT BETWEEN 0 AND 86400 THEN RAISE EXCEPTION 'Invalid pacing'; END IF;
  SELECT * INTO ctl FROM public.mindup_zalo_dispatch_control WHERE id = 1 FOR UPDATE;
  IF ctl.paused OR (SELECT paused FROM public.zalo_automation_state WHERE id=1) THEN RETURN NULL; END IF;
  v_at := now();
  UPDATE public.mindup_zalo_dispatch_control SET
    batch_count = 0,
    next_send_at = v_at,
    updated_at = now() WHERE id = 1;
  RETURN v_at;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_mindup_zalo_dispatch_slot(integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_mindup_zalo_dispatch_slot(integer,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_mindup_zalo_dispatch_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role::text = 'admin')
    THEN RAISE EXCEPTION 'Admin required'; END IF;
  RETURN (SELECT jsonb_build_object(
    'paused', c.paused OR COALESCE((SELECT paused FROM public.zalo_automation_state WHERE id=1),false),
    'reason', (SELECT reason FROM public.zalo_automation_state WHERE id=1), 'nextSendAt', c.next_send_at,
    'waitingWeb', (SELECT count(*) FROM public.zalo_outbox WHERE status='pending'),
    'waitingReceipts', (SELECT count(*) FROM public.zalo_tuition_receipts WHERE status='pending'),
    'waitingTuition', (SELECT count(*) FROM public.zalo_tuition_deliveries
      WHERE status IN ('queued','not_found','not_friend','invited','greeted')),
    'sent', (SELECT count(*) FROM public.zalo_outbox WHERE status='sent') +
      (SELECT count(*) FROM public.zalo_tuition_receipts WHERE status='sent') +
      (SELECT count(*) FROM public.zalo_tuition_deliveries WHERE status='sent'),
    'failed', (SELECT count(*) FROM public.zalo_outbox WHERE status IN ('failed','uncertain')) +
      (SELECT count(*) FROM public.zalo_tuition_receipts WHERE status IN ('failed','uncertain')) +
      (SELECT count(*) FROM public.zalo_tuition_deliveries WHERE status IN ('failed','uncertain')),
    'processing', (SELECT count(*) FROM public.zalo_outbox WHERE status='processing') +
      (SELECT count(*) FROM public.zalo_tuition_receipts WHERE status='processing') +
      (SELECT count(*) FROM public.zalo_tuition_deliveries WHERE status='processing'))
    FROM public.mindup_zalo_dispatch_control c WHERE c.id = 1);
END;
$$;
REVOKE ALL ON FUNCTION public.get_mindup_zalo_dispatch_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mindup_zalo_dispatch_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_mindup_parent_zalo_aliases()
RETURNS TABLE(parent_id uuid, zalo_alias text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.parent_id, c.zalo_alias FROM public.zalo_parent_contacts c
  WHERE nullif(trim(c.zalo_alias), '') IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid()
      AND (me.role::text = 'admin' OR (me.role::text = 'teacher' AND EXISTS (
        SELECT 1 FROM public.parent_students ps WHERE ps.parent_id = c.parent_id
          AND ps.revoked_at IS NULL AND public.teacher_manages_student(ps.student_id)))));
$$;
REVOKE ALL ON FUNCTION public.list_mindup_parent_zalo_aliases() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_mindup_parent_zalo_aliases() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_mindup_zalo_dispatch_paused(p_paused boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role::text = 'admin')
    THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF p_paused IS NULL THEN RAISE EXCEPTION 'Invalid pause state'; END IF;
  UPDATE public.mindup_zalo_dispatch_control SET paused=p_paused, updated_at=now() WHERE id=1;
  UPDATE public.zalo_automation_state SET paused=p_paused,
    reason=CASE WHEN p_paused THEN 'Admin paused sending' ELSE NULL END, updated_at=now() WHERE id=1;
END;
$$;
REVOKE ALL ON FUNCTION public.set_mindup_zalo_dispatch_paused(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_mindup_zalo_dispatch_paused(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_mindup_zalo_dispatch(p_kind text, p_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role::text = 'admin')
    THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF p_kind = 'web' THEN
    UPDATE public.zalo_outbox SET status='cancelled', updated_at=now()
      WHERE id=p_job_id AND status='pending';
  ELSIF p_kind = 'receipt' THEN
    UPDATE public.zalo_tuition_receipts SET status='cancelled', updated_at=now()
      WHERE id=p_job_id AND status='pending';
  ELSIF p_kind = 'tuition' THEN
    UPDATE public.zalo_tuition_deliveries SET status='cancelled', updated_at=now()
      WHERE id=p_job_id AND status IN ('queued','not_found','not_friend','invited','greeted');
  ELSE RAISE EXCEPTION 'Invalid dispatch kind'; END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_mindup_zalo_dispatch(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_mindup_zalo_dispatch(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_mindup_parent_greeting(
  p_parent_id uuid, p_phone text, p_uid text, p_content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation uuid; v_message uuid; v_job uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF nullif(trim(p_uid),'') IS NULL OR length(p_uid)>100
    OR nullif(trim(p_content),'') IS NULL OR length(p_content)>10000
    OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_parent_id AND role::text='parent'
      AND public.canonical_parent_zalo_phone(phone)=public.canonical_parent_zalo_phone(p_phone)) THEN
    RAISE EXCEPTION 'Invalid parent greeting';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_parent_id::text || ':greeting',0));
  SELECT id INTO v_job FROM public.zalo_outbox WHERE audience_user_id=p_parent_id
    AND zalo_uid=p_uid AND contact_phone=p_phone AND dispatch_purpose='greeting';
  IF v_job IS NOT NULL THEN RETURN v_job; END IF;
  v_conversation := public.ensure_mindup_official_audience_conversation(p_parent_id);
  INSERT INTO public.messages(conversation_id,sender_id,content,transport,zalo_dispatch_source)
    VALUES(v_conversation,'00000000-0000-0000-0000-000000000001',p_content,'web','greeting') RETURNING id INTO v_message;
  INSERT INTO public.zalo_outbox(message_id,conversation_id,audience_user_id,zalo_uid,content,dispatch_purpose,contact_phone,dispatch_priority)
    VALUES(v_message,v_conversation,p_parent_id,p_uid,p_content,'greeting',p_phone,1) RETURNING id INTO v_job;
  RETURN v_job;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_mindup_parent_greeting(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_mindup_parent_greeting(uuid,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_mindup_greeting_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.dispatch_purpose='greeting' AND NEW.status='sent' AND OLD.status IS DISTINCT FROM 'sent' THEN
    UPDATE public.zalo_parent_contacts SET greeting_attempted_at=COALESCE(greeting_attempted_at,now()),
      greeting_sent_at=COALESCE(greeting_sent_at,now()), updated_at=now()
      WHERE parent_id=NEW.audience_user_id AND zalo_uid=NEW.zalo_uid AND phone=NEW.contact_phone;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mindup_greeting_delivery ON public.zalo_outbox;
CREATE TRIGGER mindup_greeting_delivery AFTER UPDATE OF status ON public.zalo_outbox
  FOR EACH ROW EXECUTE FUNCTION public.record_mindup_greeting_delivery();

-- Future system messages use the same dispatcher. Existing history is not re-sent.
CREATE OR REPLACE FUNCTION public.enqueue_mindup_official_message_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_parent uuid; v_uid text;
BEGIN
  IF NEW.sender_id <> '00000000-0000-0000-0000-000000000001'::uuid
    OR NEW.transport <> 'web' OR NEW.zalo_dispatch_source <> 'automatic'
    OR left(NEW.content,14)='__CHAT_IMAGE__' THEN RETURN NEW; END IF;
  SELECT public.mindup_official_audience_id(c.direct_key) INTO v_parent
    FROM public.conversations c WHERE c.id=NEW.conversation_id
      AND public.is_mindup_official_direct_key(c.direct_key);
  SELECT l.zalo_uid INTO v_uid FROM public.zalo_verified_links l
    JOIN public.users u ON u.id=l.audience_user_id AND u.role::text='parent'
    WHERE l.audience_user_id=v_parent AND l.enabled;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.zalo_outbox(message_id,conversation_id,audience_user_id,zalo_uid,content,dispatch_priority)
      VALUES(NEW.id,NEW.conversation_id,v_parent,v_uid,
        regexp_replace(NEW.content,'__(ACTION|CHART|EVALUATION)__.*$','','s'),
        CASE WHEN NEW.real_sender_id IS NULL THEN 1 ELSE 0 END)
      ON CONFLICT(message_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mindup_official_zalo_enqueue ON public.messages;
CREATE TRIGGER mindup_official_zalo_enqueue AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_mindup_official_message_trigger();

CREATE OR REPLACE FUNCTION public.mirror_mindup_tuition_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation uuid; v_message uuid;
BEGIN
  v_conversation:=public.ensure_mindup_official_audience_conversation(NEW.parent_id);
  INSERT INTO public.messages(conversation_id,sender_id,content,transport,context_student_id,zalo_dispatch_source)
    VALUES(v_conversation,'00000000-0000-0000-0000-000000000001',NEW.content,'web',NEW.student_id,
      CASE WHEN TG_TABLE_NAME='zalo_tuition_receipts' THEN 'receipt' ELSE 'tuition' END)
    RETURNING id INTO v_message;
  IF TG_TABLE_NAME='zalo_tuition_receipts' THEN
    UPDATE public.zalo_tuition_receipts SET message_id=v_message WHERE id=NEW.id;
  ELSE
    UPDATE public.zalo_tuition_deliveries SET message_id=v_message WHERE id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mindup_receipt_chat ON public.zalo_tuition_receipts;
CREATE TRIGGER mindup_receipt_chat AFTER INSERT ON public.zalo_tuition_receipts
  FOR EACH ROW EXECUTE FUNCTION public.mirror_mindup_tuition_dispatch();
DROP TRIGGER IF EXISTS mindup_tuition_chat ON public.zalo_tuition_deliveries;
CREATE TRIGGER mindup_tuition_chat AFTER INSERT ON public.zalo_tuition_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.mirror_mindup_tuition_dispatch();

CREATE OR REPLACE FUNCTION public.finish_mindup_tuition_dispatch(
  p_kind text,p_job_id uuid,p_status text,p_external_id text DEFAULT NULL,
  p_qr_sent boolean DEFAULT false,p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_message uuid; v_parent uuid; v_uid text; v_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('sent','failed','uncertain') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF p_kind='receipt' THEN
    SELECT message_id,parent_id,status INTO v_message,v_parent,v_status FROM public.zalo_tuition_receipts WHERE id=p_job_id FOR UPDATE;
  ELSIF p_kind='tuition' THEN
    SELECT message_id,parent_id,status INTO v_message,v_parent,v_status FROM public.zalo_tuition_deliveries WHERE id=p_job_id FOR UPDATE;
  ELSE RAISE EXCEPTION 'Invalid kind'; END IF;
  IF v_status IS NULL OR v_status NOT IN ('processing','uncertain','sent') THEN RAISE EXCEPTION 'Job was not claimed'; END IF;
  IF v_status='sent' THEN RETURN; END IF;
  IF p_status='sent' AND p_external_id IS NOT NULL THEN
    SELECT zalo_uid INTO v_uid FROM public.zalo_parent_contacts WHERE parent_id=v_parent;
    IF split_part(p_external_id,':',1) IS DISTINCT FROM v_uid OR nullif(split_part(p_external_id,':',2),'') IS NULL
      OR length(p_external_id)>220 THEN RAISE EXCEPTION 'Invalid Zalo message id'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_external_id,0));
    IF v_message IS NOT NULL THEN
      -- Sync defers echoes until this acknowledgement attaches the authoritative id.
      UPDATE public.messages SET external_message_id=p_external_id WHERE id=v_message;
    END IF;
  END IF;
  IF p_kind='receipt' THEN
    UPDATE public.zalo_tuition_receipts SET status=p_status,lease_until=NULL,error_message=left(p_error,500),
      sent_at=CASE WHEN p_status='sent' THEN now() ELSE sent_at END,updated_at=now() WHERE id=p_job_id;
  ELSE
    UPDATE public.zalo_tuition_deliveries SET status=p_status,lease_until=NULL,error_message=left(p_error,500),
      sent_at=CASE WHEN p_status='sent' THEN now() ELSE sent_at END,
      qr_sent_at=CASE WHEN p_qr_sent THEN now() ELSE qr_sent_at END,updated_at=now() WHERE id=p_job_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_mindup_tuition_dispatch(text,uuid,text,text,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_mindup_tuition_dispatch(text,uuid,text,text,boolean,text) TO service_role;

-- Extend the existing deduplication function without replacing its RLS and
-- notification rules. Fail transactionally if the expected version is absent.
DO $migration$
DECLARE v_definition text; v_anchor text;
BEGIN
  v_definition:=pg_get_functiondef('public.sync_mindup_zalo_message(text,text,text,text,boolean,timestamptz,boolean)'::regprocedure);
  v_anchor:='  v_conversation_id := public.ensure_mindup_official_audience_conversation(v_parent_id);';
  IF position(v_anchor IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected sync function version'; END IF;
  IF position('FROM public.zalo_tuition_receipts r JOIN public.zalo_parent_contacts' IN v_definition)=0 THEN
  v_definition:=replace(v_definition,v_anchor,$addition$
  IF p_is_self AND (EXISTS (
    SELECT 1 FROM public.zalo_tuition_receipts r JOIN public.zalo_parent_contacts c ON c.parent_id=r.parent_id
    JOIN public.messages m ON m.id=r.message_id WHERE c.zalo_uid=p_zalo_uid AND r.content=p_content
      AND r.status IN ('processing','uncertain') AND m.external_message_id IS NULL)
    OR EXISTS (
    SELECT 1 FROM public.zalo_tuition_deliveries d JOIN public.zalo_parent_contacts c ON c.parent_id=d.parent_id
    JOIN public.messages m ON m.id=d.message_id WHERE c.zalo_uid=p_zalo_uid AND d.content=p_content
      AND d.status IN ('processing','uncertain') AND m.external_message_id IS NULL)) THEN RETURN 'deferred'; END IF;
  v_conversation_id := public.ensure_mindup_official_audience_conversation(v_parent_id);
$addition$);
  EXECUTE v_definition;
  END IF;
END;
$migration$;

DO $scope$
DECLARE v_proc regprocedure; v_definition text;
BEGIN
  FOREACH v_proc IN ARRAY ARRAY[
    'public.send_student_learning_message(uuid,text,uuid,uuid[])'::regprocedure,
    'public.send_student_learning_message_to_audience(uuid,uuid,text,uuid)'::regprocedure]
  LOOP
    v_definition:=pg_get_functiondef(v_proc);
    IF position('context_student_id' IN v_definition)=0 THEN
      v_definition:=replace(v_definition,'conversation_id, sender_id, content, real_sender_id)',
        'conversation_id, sender_id, content, real_sender_id, context_student_id)');
      v_definition:=replace(v_definition,'p_content, v_real_sender','p_content, v_real_sender, p_student_id');
      v_definition:=replace(v_definition,'p_content, COALESCE(p_real_sender_id, v_actor)',
        'p_content, COALESCE(p_real_sender_id, v_actor), p_student_id');
      IF position('context_student_id' IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected learning function version'; END IF;
      EXECUTE v_definition;
    END IF;
  END LOOP;
END;
$scope$;

CREATE OR REPLACE FUNCTION public.list_mindup_zalo_message_deliveries(p_message_ids uuid[])
RETURNS TABLE(id uuid,message_id uuid,status text,kind text,error_message text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT j.id,j.message_id,j.status,j.kind,j.error_message FROM (
    SELECT o.id,o.message_id,o.status,'web'::text kind,o.error_message FROM public.zalo_outbox o
    UNION ALL SELECT r.id,r.message_id,r.status,'receipt',r.error_message FROM public.zalo_tuition_receipts r
    UNION ALL SELECT d.id,d.message_id,d.status,'tuition',d.error_message FROM public.zalo_tuition_deliveries d
  ) j JOIN public.messages m ON m.id=j.message_id
    JOIN public.conversations c ON c.id=m.conversation_id
  WHERE j.message_id=ANY(p_message_ids)
    AND public.can_access_mindup_official_direct_key(c.direct_key)
    AND (public.is_admin_actor() OR public.teacher_manages_student(m.context_student_id));
$$;
REVOKE ALL ON FUNCTION public.list_mindup_zalo_message_deliveries(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_mindup_zalo_message_deliveries(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_mindup_zalo_dispatch_jobs()
RETURNS TABLE(id uuid,kind text,parent_name text,student_name text,content text,status text,error_message text,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin_actor() THEN RAISE EXCEPTION 'Admin required'; END IF;
  RETURN QUERY SELECT j.id,j.kind,COALESCE(c.zalo_alias,u.full_name),s.full_name,j.content,j.status,j.error_message,j.created_at
    FROM (
      SELECT o.id,'web'::text kind,o.audience_user_id parent_id,m.context_student_id student_id,o.content,o.status,o.error_message,o.created_at
        FROM public.zalo_outbox o JOIN public.messages m ON m.id=o.message_id
      UNION ALL SELECT r.id,'receipt',r.parent_id,r.student_id,r.content,r.status,r.error_message,r.created_at FROM public.zalo_tuition_receipts r
      UNION ALL SELECT d.id,'tuition',d.parent_id,d.student_id,d.content,d.status,d.error_message,d.created_at FROM public.zalo_tuition_deliveries d
    ) j JOIN public.users u ON u.id=j.parent_id LEFT JOIN public.users s ON s.id=j.student_id
      LEFT JOIN public.zalo_parent_contacts c ON c.parent_id=j.parent_id
    ORDER BY CASE WHEN j.status IN ('pending','processing','queued','not_found','not_friend','invited','greeted') THEN 0
      WHEN j.status IN ('failed','uncertain') THEN 1 ELSE 2 END,j.created_at DESC LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION public.list_mindup_zalo_dispatch_jobs() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_mindup_zalo_dispatch_jobs() TO authenticated;

CREATE OR REPLACE FUNCTION public.retry_mindup_zalo_dispatch(p_kind text,p_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.is_admin_actor() THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF p_kind='web' THEN
    UPDATE public.zalo_outbox SET status='pending',locked_until=NULL,error_message=NULL,updated_at=now()
      WHERE id=p_job_id AND status='failed';
  ELSIF p_kind='receipt' THEN
    UPDATE public.zalo_tuition_receipts SET status='pending',lease_until=NULL,error_message=NULL,updated_at=now()
      WHERE id=p_job_id AND status='failed';
  ELSIF p_kind='tuition' THEN
    UPDATE public.zalo_tuition_deliveries SET status='queued',lease_until=NULL,error_message=NULL,updated_at=now()
      WHERE id=p_job_id AND status='failed';
  ELSE RAISE EXCEPTION 'Invalid kind'; END IF;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count=1;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_mindup_zalo_dispatch(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_mindup_zalo_dispatch(text,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
