-- Apply after SQL unified Zalo dispatch.sql and current Zalo sync/identity migrations.
-- Separate grouped queue: existing single-QR dispatchers must NOT consume this table.
-- Scheduler service supplies lunar-approved dates using @nghiavuive/lunar_date_vi@2.0.1.
-- No pg_cron job or live sends are installed. Only saved, locked tuition is eligible.
BEGIN;

CREATE TABLE IF NOT EXISTS public.automatic_tuition_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.users(id),
  phone text NOT NULL,
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  slot integer NOT NULL CHECK (slot IN (5,10,15)),
  due_date date NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','cancelled','uncertain')),
  token uuid,
  dispatch_uid text,
  lease_until timestamptz,
  next_part integer NOT NULL DEFAULT 0,
  part_started boolean NOT NULL DEFAULT false,
  acknowledgements jsonb NOT NULL DEFAULT '[]',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parent_id,month,slot),
  UNIQUE(phone,month,slot)
);
CREATE INDEX IF NOT EXISTS automatic_tuition_due ON public.automatic_tuition_reminders(status,due_date);
ALTER TABLE public.automatic_tuition_reminders ADD COLUMN IF NOT EXISTS dispatch_uid text;
ALTER TABLE public.automatic_tuition_reminders ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.automatic_tuition_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automatic_tuition_reminders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.automatic_tuition_reminders TO service_role;

CREATE OR REPLACE FUNCTION public.automatic_tuition_config()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_bank text; v_account text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  SELECT lower(regexp_replace(bank_name,'[^a-zA-Z0-9]','','g')),bank_account_no
    INTO v_bank,v_account FROM public.zalo_bot_config WHERE id='default' AND is_active;
  IF v_bank IS NULL OR v_account !~ '^[0-9]{6,30}$' THEN RAISE EXCEPTION 'Active tuition bank configuration required'; END IF;
  RETURN jsonb_build_object('code',v_bank,'account',v_account);
END;
$$;

CREATE OR REPLACE FUNCTION public.mirror_automatic_tuition_reminder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation uuid; v_message uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    v_conversation:=public.ensure_mindup_official_audience_conversation(NEW.parent_id);
    INSERT INTO public.messages(conversation_id,sender_id,content,transport,zalo_dispatch_source)
      VALUES(v_conversation,'00000000-0000-0000-0000-000000000001',
        (NEW.payload->>'content')||E'\n\n'||(SELECT string_agg(
          'Mã QR '||(NEW.payload->'children'->(n::integer-2)->>'student_name')||': '||(part->>'url'),E'\n' ORDER BY n)
          FROM jsonb_array_elements(NEW.payload->'parts') WITH ORDINALITY a(part,n) WHERE n>1),'web','tuition')
      RETURNING id INTO v_message;
    UPDATE public.automatic_tuition_reminders SET message_id=v_message WHERE id=NEW.id;
  ELSIF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.messages SET content=CASE WHEN NEW.next_part>0 THEN
      NEW.payload->>'content'||E'\n\n[Thông báo đã dừng: số dư hoặc liên kết đã thay đổi. Không sử dụng QR cũ.]'
      ELSE '[Thông báo học phí đã hủy: số dư, liên kết hoặc lịch gửi đã thay đổi.]' END
      WHERE id=NEW.message_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS automatic_tuition_chat ON public.automatic_tuition_reminders;
CREATE TRIGGER automatic_tuition_chat AFTER INSERT OR UPDATE OF status ON public.automatic_tuition_reminders
  FOR EACH ROW EXECUTE FUNCTION public.mirror_automatic_tuition_reminder();

-- Canonical snapshot detects changed amounts, deleted rows, unlocked tuition,
-- name/phone changes, and revoked or newly eligible child links. Never writes tuition.
CREATE OR REPLACE FUNCTION public.automatic_tuition_snapshot(p_parent uuid,p_month date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'student_id',s.id,'student_name',s.full_name,'payment_id',t.id,
    'amount_due',t.amount_due,'amount_paid',t.amount_paid,
    'remaining',t.amount_due-t.amount_paid,'locked_at',t.locked_at,
    'payment_phone',regexp_replace(s.phone,'[^0-9]','','g')
  ) ORDER BY s.id),'[]'::jsonb)
  FROM public.tuition_payments t
  JOIN public.users s ON s.id=t.student_id
  JOIN public.users p ON p.id=p_parent AND p.role::text='parent'
  WHERE t.month=p_month AND t.locked_at IS NOT NULL
    AND regexp_replace(coalesce(s.phone,''),'[^0-9]','','g') ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND t.amount_due>t.amount_paid AND t.amount_paid>=0
    AND t.amount_due-t.amount_paid=trunc(t.amount_due-t.amount_paid)
    AND EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=p_parent
      AND ps.student_id=s.id AND ps.revoked_at IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.automatic_tuition_candidates()
RETURNS TABLE(parent_id uuid,phone text,children jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.zalo_automation_state WHERE id=1 AND NOT paused) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 AND NOT paused) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.message_templates WHERE id='tuition_reminder' AND is_enabled) THEN RETURN; END IF;
  RETURN QUERY SELECT p.id,regexp_replace(p.phone,'[^0-9]','','g'),x.children
  FROM public.users p
  CROSS JOIN LATERAL (SELECT public.automatic_tuition_snapshot(p.id,
    date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS children) x
  WHERE p.role::text='parent' AND regexp_replace(p.phone,'[^0-9]','','g') ~ '^(0[0-9]{9}|84[0-9]{9})$'
    AND jsonb_array_length(x.children)>0
    -- Shared accounts with different parent IDs require identity reconciliation.
    AND NOT EXISTS (SELECT 1 FROM public.users other WHERE other.id<>p.id AND other.role::text='parent'
      AND EXISTS (SELECT 1 FROM public.parent_students active WHERE active.parent_id=other.id AND active.revoked_at IS NULL)
      AND right(regexp_replace(other.phone,'[^0-9]','','g'),9)=
        right(regexp_replace(p.phone,'[^0-9]','','g'),9));
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_automatic_tuition_reminder(
  p_parent uuid,p_month date,p_slot integer,p_due date,p_today date,p_phone text,p_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date; v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_today IS DISTINCT FROM v_today OR p_month IS DISTINCT FROM date_trunc('month',v_today)::date
    OR p_slot IS NULL OR p_slot NOT IN (5,10,15) OR p_due IS NULL
    OR p_due<p_month+(p_slot-1) OR p_due>p_month+(p_slot+1) OR p_due>v_today THEN
    RAISE EXCEPTION 'Invalid current-month schedule';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('automatic-tuition:'||p_parent::text||p_month::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.zalo_automation_state WHERE id=1 AND NOT paused) THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 AND NOT paused) THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.message_templates WHERE id='tuition_reminder' AND is_enabled) THEN RETURN false; END IF;
  -- Lock ledger rows only for this transaction, never alter saved amounts.
  PERFORM 1 FROM public.tuition_payments t WHERE t.month=p_month AND EXISTS (
    SELECT 1 FROM public.parent_students ps WHERE ps.student_id=t.student_id
      AND ps.parent_id=p_parent AND ps.revoked_at IS NULL) ORDER BY t.student_id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.automatic_tuition_candidates() c
    WHERE c.parent_id=p_parent AND c.phone=p_phone AND c.children=p_payload->'children') THEN RETURN false; END IF;
  IF jsonb_typeof(p_payload->'parts') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload->'parts')<>jsonb_array_length(p_payload->'children')+1
    OR p_payload->'parts'->0->>'kind' IS DISTINCT FROM 'text'
    OR length(coalesce(p_payload->'parts'->0->>'content','')) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Invalid grouped payload';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'parts') WITH ORDINALITY a(part,n)
    WHERE n>1 AND (part->>'kind' IS DISTINCT FROM 'qr'
      OR coalesce(part->>'url','') !~ '^https://img[.]vietqr[.]io/image/[a-zA-Z0-9]+-[0-9]{6,30}-compact2[.]png[?]amount=[0-9]+&addInfo='
      OR length(part->>'url')>1000
      OR split_part(split_part(part->>'url','?amount=',2),'&',1) IS DISTINCT FROM
        p_payload->'children'->(n::integer-2)->>'remaining'
      OR part->>'student_id' IS DISTINCT FROM p_payload->'children'->(n::integer-2)->>'student_id')) THEN
    RAISE EXCEPTION 'Invalid child QR';
  END IF;
  IF EXISTS (SELECT 1 FROM public.automatic_tuition_reminders r WHERE r.parent_id=p_parent
    AND r.month=p_month AND r.status IN ('processing','uncertain'))
    OR EXISTS (SELECT 1 FROM public.zalo_tuition_deliveries d WHERE d.parent_id=p_parent AND d.month=p_month
      AND d.status IN ('queued','processing','not_found','not_friend','invited','greeted','uncertain')) THEN RETURN false; END IF;
  UPDATE public.automatic_tuition_reminders SET status='cancelled',updated_at=now(),error_message='Superseded slot'
    WHERE parent_id=p_parent AND month=p_month AND slot<p_slot AND status='queued';
  INSERT INTO public.automatic_tuition_reminders(parent_id,phone,month,slot,due_date,payload)
    VALUES(p_parent,p_phone,p_month,p_slot,p_due,p_payload) ON CONFLICT DO NOTHING RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.automatic_tuition_valid(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT r.month=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    AND r.payload->'children'=public.automatic_tuition_snapshot(r.parent_id,r.month)
    AND jsonb_array_length(r.payload->'children')>0
    AND p.role::text='parent' AND r.phone=regexp_replace(p.phone,'[^0-9]','','g')
    AND c.phone=r.phone AND c.zalo_uid IS NOT NULL
    AND (r.status<>'processing' OR c.zalo_uid=r.dispatch_uid)
    AND (c.status='friend' OR c.greeting_sent_at IS NOT NULL)
    AND EXISTS (SELECT 1 FROM public.zalo_automation_state WHERE id=1 AND NOT paused)
    AND EXISTS (SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 AND NOT paused)
    AND EXISTS (SELECT 1 FROM public.message_templates WHERE id='tuition_reminder' AND is_enabled)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.payload->'parts') a(part)
      WHERE part->>'kind'='qr' AND part->>'url' NOT LIKE
        ('https://img.vietqr.io/image/'||(public.automatic_tuition_config()->>'code')||'-'||
          (public.automatic_tuition_config()->>'account')||'-compact2.png?%'))
    AND NOT EXISTS (SELECT 1 FROM public.users other WHERE other.id<>p.id AND other.role::text='parent'
      AND EXISTS (SELECT 1 FROM public.parent_students active WHERE active.parent_id=other.id AND active.revoked_at IS NULL)
      AND right(regexp_replace(other.phone,'[^0-9]','','g'),9)=right(r.phone,9))
    AND NOT EXISTS (SELECT 1 FROM public.zalo_tuition_deliveries d WHERE d.parent_id=r.parent_id AND d.month=r.month
      AND d.status IN ('queued','processing','not_found','not_friend','invited','greeted','uncertain'))
    FROM public.automatic_tuition_reminders r JOIN public.users p ON p.id=r.parent_id
    JOIN public.zalo_parent_contacts c ON c.parent_id=r.parent_id WHERE r.id=p_id),false);
$$;

CREATE OR REPLACE FUNCTION public.claim_automatic_tuition_reminder(p_today date,p_slot integer)
RETURNS TABLE(id uuid,token uuid,zalo_uid text,payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_today IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    OR p_slot IS NULL OR p_slot NOT IN (5,10,15) THEN RAISE EXCEPTION 'Invalid clock or slot'; END IF;
  PERFORM 1 FROM public.mindup_zalo_dispatch_control c WHERE c.id=1 FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.mindup_zalo_dispatch_control c WHERE c.id=1 AND NOT c.paused)
    OR NOT EXISTS (SELECT 1 FROM public.zalo_automation_state s WHERE s.id=1 AND NOT s.paused) THEN RETURN; END IF;
  UPDATE public.zalo_outbox SET status='uncertain',locked_until=NULL WHERE status='processing' AND locked_until<=now();
  UPDATE public.zalo_tuition_receipts SET status='uncertain',lease_until=NULL WHERE status='processing' AND lease_until<=now();
  UPDATE public.zalo_tuition_deliveries SET status='uncertain',lease_until=NULL WHERE status='processing' AND lease_until<=now();
  UPDATE public.automatic_tuition_reminders r SET status='uncertain',lease_until=NULL,
    error_message='Interrupted dispatcher; inspect Zalo before resuming',updated_at=now()
    WHERE r.status='processing' AND r.lease_until<=now();
  UPDATE public.automatic_tuition_reminders r SET status='cancelled',updated_at=now(),error_message='Expired month or slot'
    WHERE r.status='queued' AND (r.month<>date_trunc('month',p_today)::date OR r.slot<p_slot);
  UPDATE public.automatic_tuition_reminders r SET status='cancelled',updated_at=now(),error_message='Saved calculation changed'
    WHERE r.status='queued' AND r.payload->'children' IS DISTINCT FROM public.automatic_tuition_snapshot(r.parent_id,r.month);
  IF EXISTS (SELECT 1 FROM public.automatic_tuition_reminders WHERE status='processing')
    OR EXISTS (SELECT 1 FROM public.zalo_outbox WHERE status='processing')
    OR EXISTS (SELECT 1 FROM public.zalo_tuition_receipts WHERE status='processing')
    OR EXISTS (SELECT 1 FROM public.zalo_tuition_deliveries WHERE status='processing') THEN RETURN; END IF;
  RETURN QUERY WITH candidate AS (
    SELECT r.id FROM public.automatic_tuition_reminders r
    WHERE r.status='queued' AND r.due_date<=p_today AND r.slot=p_slot
      AND public.automatic_tuition_valid(r.id)
      AND NOT EXISTS (SELECT 1 FROM public.automatic_tuition_reminders other WHERE other.parent_id=r.parent_id
        AND other.month=r.month AND other.status IN ('processing','uncertain'))
    ORDER BY r.created_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE public.automatic_tuition_reminders r SET status='processing',token=gen_random_uuid(),
      dispatch_uid=(SELECT c.zalo_uid FROM public.zalo_parent_contacts c WHERE c.parent_id=r.parent_id),
      lease_until=now()+interval '5 minutes',updated_at=now() FROM candidate x WHERE r.id=x.id
    RETURNING r.id,r.token,r.parent_id,r.payload
  ) SELECT x.id,x.token,c.zalo_uid,x.payload FROM claimed x JOIN public.zalo_parent_contacts c ON c.parent_id=x.parent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_automatic_tuition_part(
  p_id uuid,p_token uuid,p_index integer,p_today date,p_allowed boolean,p_slot integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.automatic_tuition_reminders;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
  SELECT * INTO r FROM public.automatic_tuition_reminders WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR r.token IS DISTINCT FROM p_token OR r.status<>'processing'
    OR r.lease_until<=now() OR r.part_started OR r.next_part IS DISTINCT FROM p_index THEN
    RAISE EXCEPTION 'Invalid lease or part';
  END IF;
  IF p_allowed IS DISTINCT FROM true OR p_today IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    OR p_slot IS DISTINCT FROM r.slot OR NOT public.automatic_tuition_valid(p_id) THEN
    UPDATE public.automatic_tuition_reminders SET status='cancelled',lease_until=NULL,updated_at=now(),
      error_message='Balance, contact, link or schedule changed; partial messages may exist' WHERE id=p_id;
    RETURN false;
  END IF;
  UPDATE public.automatic_tuition_reminders SET part_started=true,lease_until=now()+interval '5 minutes',updated_at=now() WHERE id=p_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_automatic_tuition_part(p_id uuid,p_token uuid,p_index integer,p_external_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.automatic_tuition_reminders; v_conversation uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  SELECT * INTO r FROM public.automatic_tuition_reminders WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR split_part(p_external_id,':',1) IS DISTINCT FROM r.dispatch_uid
    OR nullif(split_part(p_external_id,':',2),'') IS NULL OR length(p_external_id)>220 THEN RAISE EXCEPTION 'Message ID required'; END IF;
  IF r.token=p_token AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.acknowledgements) a
    WHERE (a->>'index')::integer=p_index AND a->>'external_id'=p_external_id) THEN RETURN; END IF;
  UPDATE public.automatic_tuition_reminders j SET next_part=p_index+1,part_started=false,
    acknowledgements=j.acknowledgements||jsonb_build_array(jsonb_build_object('index',p_index,'external_id',p_external_id,'at',now())),
    status=CASE WHEN p_index+1=jsonb_array_length(j.payload->'parts') THEN 'sent' ELSE 'processing' END,
    lease_until=CASE WHEN p_index+1=jsonb_array_length(j.payload->'parts') THEN NULL ELSE now()+interval '5 minutes' END,
    updated_at=now()
  WHERE j.id=p_id AND j.token=p_token AND j.status='processing' AND j.lease_until>now()
    AND j.part_started AND j.next_part=p_index;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid acknowledgement lease'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_external_id,0));
  IF p_index=0 THEN
    UPDATE public.messages SET external_message_id=p_external_id WHERE id=r.message_id;
  ELSE
    SELECT conversation_id INTO v_conversation FROM public.messages WHERE id=r.message_id;
    INSERT INTO public.messages(conversation_id,sender_id,content,transport,external_message_id,zalo_dispatch_source)
      VALUES(v_conversation,'00000000-0000-0000-0000-000000000001',
        'Mã QR thanh toán học phí MindUp','zalo',p_external_id,'tuition') ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.uncertain_automatic_tuition_reminder(p_id uuid,p_token uuid,p_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  UPDATE public.automatic_tuition_reminders SET status='uncertain',lease_until=NULL,error_message=left(p_error,500),updated_at=now()
    WHERE id=p_id AND token=p_token AND status='processing';
END;
$$;

-- Keep the current dispatcher definition (including score context fields) and
-- extend only its shared-lock guard. Unknown versions abort the migration.
DO $migration$
DECLARE s text; anchor text := '  SELECT * INTO ctl FROM public.mindup_zalo_dispatch_control WHERE id = 1 FOR UPDATE;';
BEGIN
  s:=pg_get_functiondef('public.claim_next_mindup_zalo_dispatch(integer,integer,integer)'::regprocedure);
  s:=replace(replace(s,E'\r\n',E'\n'),E'\r',E'\n');
  IF position('automatic_tuition_shared_guard' IN s)=0 THEN
    IF position(anchor IN s)=0 THEN RAISE EXCEPTION 'Unexpected unified dispatcher version'; END IF;
    s:=replace(s,anchor,anchor||E'\n'||$guard$
  -- automatic_tuition_shared_guard
  UPDATE public.automatic_tuition_reminders SET status='uncertain',lease_until=NULL,
    error_message='Interrupted dispatcher; inspect Zalo',updated_at=now()
    WHERE status='processing' AND lease_until<=now();
  IF EXISTS (SELECT 1 FROM public.automatic_tuition_reminders WHERE status='processing') THEN RETURN; END IF;
$guard$);
    EXECUTE s;
  END IF;
END;
$migration$;

-- Legacy service-role claims also join the shared sender lock. The gateway no
-- longer exposes them, but a direct RPC must not race automatic processing.
DO $legacy$
DECLARE name text; s text; pos integer;
BEGIN
  FOREACH name IN ARRAY ARRAY['claim_mindup_zalo_message','claim_zalo_tuition_delivery','claim_zalo_tuition_receipt'] LOOP
    s:=pg_get_functiondef(('public.'||name||'()')::regprocedure);
    s:=replace(replace(s,E'\r\n',E'\n'),E'\r',E'\n');
    IF position('automatic_tuition_legacy_guard' IN s)=0 THEN
      pos:=position('BEGIN' IN s);
      IF pos=0 THEN RAISE EXCEPTION 'Unexpected legacy claim version: %',name; END IF;
      s:=overlay(s placing 'BEGIN'||$guard$
  -- automatic_tuition_legacy_guard
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  PERFORM 1 FROM public.mindup_zalo_dispatch_control control WHERE control.id=1 FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.mindup_zalo_dispatch_control control WHERE control.id=1 AND NOT control.paused)
    OR NOT EXISTS (SELECT 1 FROM public.zalo_automation_state automation WHERE automation.id=1 AND NOT automation.paused) THEN RETURN; END IF;
  UPDATE public.automatic_tuition_reminders SET status='uncertain',lease_until=NULL,
    error_message='Interrupted dispatcher; inspect Zalo',updated_at=now()
    WHERE status='processing' AND lease_until<=now();
  IF EXISTS (SELECT 1 FROM public.automatic_tuition_reminders WHERE status='processing') THEN RETURN; END IF;
$guard$ from pos for 5);
      EXECUTE s;
    END IF;
  END LOOP;
END;
$legacy$;

CREATE OR REPLACE FUNCTION public.claim_next_mindup_zalo_dispatch_with_automatic(
  p_spacing_seconds integer,p_batch_size integer,p_batch_pause_seconds integer,
  p_today date,p_slot integer,p_allowed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_normal record; v_auto record; v_streak integer; v_eligible boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_spacing_seconds IS NULL OR p_spacing_seconds NOT BETWEEN 0 AND 300
    OR p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 500
    OR p_batch_pause_seconds IS NULL OR p_batch_pause_seconds NOT BETWEEN 0 AND 86400 THEN RAISE EXCEPTION 'Invalid pacing'; END IF;
  SELECT urgent_streak INTO v_streak FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
  v_eligible:=p_allowed IS TRUE AND p_slot IN (5,10,15)
    AND p_today=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF v_eligible AND v_streak>=5 THEN
    SELECT * INTO v_auto FROM public.claim_automatic_tuition_reminder(p_today,p_slot);
    IF v_auto.id IS NOT NULL THEN
      UPDATE public.mindup_zalo_dispatch_control SET urgent_streak=0,updated_at=now() WHERE id=1;
      RETURN to_jsonb(v_auto)||jsonb_build_object('kind','automatic_tuition');
    END IF;
  END IF;
  SELECT * INTO v_normal FROM public.claim_next_mindup_zalo_dispatch(p_spacing_seconds,p_batch_size,p_batch_pause_seconds);
  IF v_normal.job_id IS NOT NULL THEN RETURN to_jsonb(v_normal); END IF;
  IF v_eligible THEN
    SELECT * INTO v_auto FROM public.claim_automatic_tuition_reminder(p_today,p_slot);
    IF v_auto.id IS NOT NULL THEN
      UPDATE public.mindup_zalo_dispatch_control SET urgent_streak=0,updated_at=now() WHERE id=1;
      RETURN to_jsonb(v_auto)||jsonb_build_object('kind','automatic_tuition');
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_automatic_tuition_dispatch_slot(
  p_id uuid,p_token uuid,p_spacing_seconds integer,p_batch_size integer,p_batch_pause_seconds integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.automatic_tuition_reminders WHERE id=p_id AND token=p_token
    AND status='processing' AND lease_until>now()) THEN RAISE EXCEPTION 'Invalid automatic dispatch lease'; END IF;
  RETURN public.reserve_mindup_zalo_dispatch_slot(p_spacing_seconds,p_batch_size,p_batch_pause_seconds);
END;
$$;

DO $status$
DECLARE s text;
BEGIN
  s:=pg_get_functiondef('public.get_mindup_zalo_dispatch_status()'::regprocedure);
  s:=replace(replace(s,E'\r\n',E'\n'),E'\r',E'\n');
  IF position('waitingAutomatic' IN s)=0 THEN
    IF position('''waitingWeb'',' IN s)=0 OR position('''processing'', (SELECT count(*) FROM public.zalo_outbox' IN s)=0 THEN
      RAISE EXCEPTION 'Unexpected dispatcher status version';
    END IF;
    s:=replace(s,'''waitingWeb'',',$fields$
    'waitingAutomatic', (SELECT count(*) FROM public.automatic_tuition_reminders WHERE status='queued'),
    'sentAutomatic', (SELECT count(*) FROM public.automatic_tuition_reminders WHERE status='sent'),
    'processingAutomatic', (SELECT count(*) FROM public.automatic_tuition_reminders WHERE status='processing'),
    'uncertainAutomatic', (SELECT count(*) FROM public.automatic_tuition_reminders WHERE status='uncertain'),
    'waitingWeb',$fields$);
    s:=replace(s,'''sent'', (SELECT count(*) FROM public.zalo_outbox',
      '''sent'', (SELECT count(*) FROM public.automatic_tuition_reminders WHERE status=''sent'') + (SELECT count(*) FROM public.zalo_outbox');
    s:=replace(s,'''failed'', (SELECT count(*) FROM public.zalo_outbox',
      '''failed'', (SELECT count(*) FROM public.automatic_tuition_reminders WHERE status=''uncertain'') + (SELECT count(*) FROM public.zalo_outbox');
    s:=replace(s,'''processing'', (SELECT count(*) FROM public.zalo_outbox',
      '''processing'', (SELECT count(*) FROM public.automatic_tuition_reminders WHERE status=''processing'') + (SELECT count(*) FROM public.zalo_outbox');
    EXECUTE s;
  END IF;
END;
$status$;

-- Prevent self-echo duplication before the authoritative per-part ACK arrives.
DO $sync$
DECLARE s text; anchor text := '  v_conversation_id := public.ensure_mindup_official_audience_conversation(v_parent_id);';
BEGIN
  s:=pg_get_functiondef('public.sync_mindup_zalo_message(text,text,text,text,boolean,timestamptz,boolean)'::regprocedure);
  s:=replace(replace(s,E'\r\n',E'\n'),E'\r',E'\n');
  IF position('automatic_tuition_echo_guard' IN s)=0 THEN
    IF position(anchor IN s)=0 THEN RAISE EXCEPTION 'Unexpected Zalo sync version'; END IF;
    s:=replace(s,anchor,$guard$
  -- automatic_tuition_echo_guard
  IF p_is_self AND EXISTS (SELECT 1 FROM public.automatic_tuition_reminders r
    WHERE r.dispatch_uid=p_zalo_uid AND r.status IN ('processing','uncertain')
      AND (r.payload->>'content'=p_content OR p_content='Mã QR thanh toán học phí MindUp')) THEN RETURN 'deferred'; END IF;
$guard$||anchor);
    EXECUTE s;
  END IF;
END;
$sync$;

REVOKE ALL ON FUNCTION public.mirror_automatic_tuition_reminder(),public.automatic_tuition_snapshot(uuid,date),public.automatic_tuition_valid(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.automatic_tuition_config(),
  public.claim_next_mindup_zalo_dispatch_with_automatic(integer,integer,integer,date,integer,boolean),
  public.reserve_automatic_tuition_dispatch_slot(uuid,uuid,integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automatic_tuition_config(),
  public.claim_next_mindup_zalo_dispatch_with_automatic(integer,integer,integer,date,integer,boolean),
  public.reserve_automatic_tuition_dispatch_slot(uuid,uuid,integer,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.automatic_tuition_candidates(),
  public.enqueue_automatic_tuition_reminder(uuid,date,integer,date,date,text,jsonb),
  public.claim_automatic_tuition_reminder(date,integer),
  public.begin_automatic_tuition_part(uuid,uuid,integer,date,boolean,integer),
  public.finish_automatic_tuition_part(uuid,uuid,integer,text),
  public.uncertain_automatic_tuition_reminder(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automatic_tuition_candidates(),
  public.enqueue_automatic_tuition_reminder(uuid,date,integer,date,date,text,jsonb),
  public.claim_automatic_tuition_reminder(date,integer),
  public.begin_automatic_tuition_part(uuid,uuid,integer,date,boolean,integer),
  public.finish_automatic_tuition_part(uuid,uuid,integer,text),
  public.uncertain_automatic_tuition_reminder(uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
