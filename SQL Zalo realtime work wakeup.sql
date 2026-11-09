BEGIN;
-- A random capability topic, never a user-data stream. Only the existing gateway
-- service role can register/read it. No row contents or identifiers are broadcast.
CREATE TABLE IF NOT EXISTS public.zalo_work_wakeup_config(
 id int PRIMARY KEY CHECK(id=1), topic text NOT NULL CHECK(topic ~ '^zalo-work:[a-f0-9]{64}$')
);
ALTER TABLE public.zalo_work_wakeup_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zalo_work_wakeup_config FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.zalo_work_wakeup_config TO service_role;
CREATE OR REPLACE FUNCTION public.configure_zalo_work_wakeup(p_topic text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF p_topic IS NULL OR p_topic !~ '^zalo-work:[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid topic'; END IF;
 INSERT INTO public.zalo_work_wakeup_config VALUES(1,p_topic)
 ON CONFLICT(id) DO UPDATE SET topic=excluded.topic WHERE zalo_work_wakeup_config.topic<>excluded.topic;
END;$$;
REVOKE ALL ON FUNCTION public.configure_zalo_work_wakeup(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_zalo_work_wakeup(text) TO service_role;

-- A NULL claim can mean pacing/revalidation, rather than an empty queue. Keep
-- draining both sweeps without returning to the hourly idle schedule too soon.
CREATE OR REPLACE FUNCTION public.claim_tuition_notification_wakeup(p_allowed boolean,p_slot int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job jsonb; more_work boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 job:=public.claim_tuition_notification_v1(p_allowed,p_slot);
 SELECT EXISTS(SELECT 1 FROM public.tuition_notice_jobs j WHERE NOT j.paused
  AND (j.status='queued' OR (j.status='uncertain' AND j.scan_pass=1 AND j.scan_attempts<2))
  AND ((j.source<>'automatic' AND j.request_key NOT LIKE 'overdue-auto:%') OR
   (p_allowed AND NOT EXISTS(SELECT 1 FROM public.automatic_tuition_control WHERE id=1 AND paused)
    AND EXISTS(SELECT 1 FROM public.message_templates t WHERE t.id=CASE WHEN j.source='automatic' THEN 'tuition_reminder' ELSE 'tuition_overdue_notice' END AND t.is_enabled)))
 ) AND NOT EXISTS(SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 AND paused)
   AND NOT EXISTS(SELECT 1 FROM public.zalo_automation_state WHERE id=1 AND paused) INTO more_work;
 RETURN jsonb_build_object('data',job,'retryAfterMs',CASE WHEN more_work THEN 10000 ELSE 3600000 END);
END;$$;
REVOKE ALL ON FUNCTION public.claim_tuition_notification_wakeup(boolean,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tuition_notification_wakeup(boolean,int) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_zalo_worker() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE topic_name text; n jsonb; o jsonb;
BEGIN
 n:=to_jsonb(NEW);
 IF TG_OP='UPDATE' THEN
   o:=to_jsonb(OLD);
   IF TG_TABLE_NAME='mindup_zalo_dispatch_control' AND n->'paused' IS NOT DISTINCT FROM o->'paused' THEN RETURN NEW; END IF;
   -- Lease/ack progress is not new work. Avoid waking the worker for its own claims.
   IF n->>'status' IN('processing','sent','success','failed','uncertain','cancelled','completed')
     AND n->'manual_check_requested_at' IS NOT DISTINCT FROM o->'manual_check_requested_at'
     AND n->'manual_requested' IS NOT DISTINCT FROM o->'manual_requested' THEN RETURN NEW; END IF;
   IF (n-'updated_at'-'lease_until'-'last_seen_at'-'last_checked_at')=
      (o-'updated_at'-'lease_until'-'last_seen_at'-'last_checked_at') THEN RETURN NEW; END IF;
 END IF;
 SELECT topic INTO topic_name FROM public.zalo_work_wakeup_config WHERE id=1;
 IF topic_name IS NOT NULL THEN
   BEGIN
     PERFORM realtime.send(jsonb_build_object('kind',TG_ARGV[0]),'work',topic_name,false);
   EXCEPTION WHEN OTHERS THEN
     -- Notification delivery must never roll back the durable business request.
     RAISE WARNING 'Zalo work notification unavailable; hourly recovery will pick up work';
   END;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION public.notify_zalo_worker() FROM PUBLIC,anon,authenticated;
DO $$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('zalo_outbox','dispatch'),('zalo_tuition_deliveries','dispatch'),('zalo_tuition_receipts','dispatch'),
  ('automatic_tuition_reminders','dispatch'),('tuition_notice_jobs','dispatch'),
  ('zalo_parent_contacts','parents'),('zalo_parent_alias_jobs','parents'),('zalo_parent_alias_runs','parents'),
  ('zalo_class_group_jobs','groups'),('zalo_class_groups','groups'),
  ('zalo_local_reads','storage'),('messages','storage'),('zalo_message_mirrors','storage'),
  ('zalo_verified_links','links'),('zalo_automation_state','all'),('zalo_bot_config','all'),
  ('automatic_tuition_control','all'),('zalo_class_group_control','groups'),('mindup_zalo_dispatch_control','dispatch')
 ) AS sources(table_name,kind)
 LOOP
  IF to_regclass('public.'||item.table_name) IS NOT NULL THEN
   EXECUTE format('DROP TRIGGER IF EXISTS zalo_work_wakeup ON public.%I',item.table_name);
   EXECUTE format('CREATE TRIGGER zalo_work_wakeup AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.notify_zalo_worker(%L)',item.table_name,item.kind);
  END IF;
 END LOOP;
END;$$;
COMMIT;
