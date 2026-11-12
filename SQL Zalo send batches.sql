BEGIN;

ALTER TABLE public.zalo_outbox ADD COLUMN IF NOT EXISTS score_parts_done integer,
  ADD COLUMN IF NOT EXISTS score_parts_total integer;

-- The existing authenticated worker acknowledgement carries score progress.
CREATE OR REPLACE FUNCTION public.record_zalo_score_parts() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE parts text[];
BEGIN
  parts := regexp_match(NEW.error_message, '^\[score-parts:([0-9]{1,2}):([1-6])\]');
  IF parts IS NOT NULL AND parts[1]::integer <= parts[2]::integer THEN
    NEW.score_parts_done := greatest(coalesce(OLD.score_parts_done,0),parts[1]::integer);
    NEW.score_parts_total := parts[2]::integer;
    NEW.error_message := nullif(substr(NEW.error_message,length(parts[1])+length(parts[2])+16),'');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS zalo_score_parts ON public.zalo_outbox;
CREATE TRIGGER zalo_score_parts BEFORE UPDATE OF error_message ON public.zalo_outbox
  FOR EACH ROW EXECUTE FUNCTION public.record_zalo_score_parts();

-- Read the existing queues without copying deliveries or changing their identifiers.
CREATE OR REPLACE VIEW public.zalo_send_batch_items AS
WITH web AS (
  SELECT o.*, m.message_key, m.context_student_id, m.conversation_id AS thread_id,
    e.class_session_id AS evaluation_session, a.class_id AS absence_class, a.attendance_date AS absence_date, cr.run_id AS campaign_run, c.name AS campaign_name,
    split_part(m.message_key, ':', 1) AS key_type,
    substring(m.message_key from '^[^:]+:(.+):[^:]+$') AS key_event
  FROM public.zalo_outbox o
  JOIN public.messages m ON m.id = o.message_id
  LEFT JOIN public.message_campaign_recipients cr ON cr.outbox_id = o.id
  LEFT JOIN public.message_campaign_runs r ON r.id = cr.run_id
  LEFT JOIN public.message_campaigns c ON c.id = r.campaign_id
  LEFT JOIN public.evaluation_zalo_publications p ON p.outbox_id = o.id
  LEFT JOIN public.session_student_evaluations e ON e.id = p.evaluation_id
  LEFT JOIN public.attendance_parent_publications a ON a.message_id = o.message_id
)
SELECT id, 'web'::text AS queue, CASE
    WHEN campaign_run IS NOT NULL THEN 'campaign'
    WHEN evaluation_session IS NOT NULL OR key_type = 'session_evaluation' THEN 'evaluation'
    WHEN key_type IN ('offline_test_score','session_score','exam_score','score-text-repair') THEN 'score'
    WHEN absence_class IS NOT NULL OR key_type LIKE 'absen%' OR content ILIKE '%vắng mặt%' THEN 'absence'
    ELSE 'other' END AS category,
  CASE WHEN campaign_run IS NOT NULL THEN 'campaign:' || campaign_run
    WHEN evaluation_session IS NOT NULL THEN 'session_evaluation:' || evaluation_session
    WHEN absence_class IS NOT NULL THEN 'absence:' || absence_class || ':' || absence_date
    WHEN key_type IN ('offline_test_score','session_score','exam_score','session_evaluation') AND key_event <> '' THEN key_type || ':' || key_event
    ELSE 'web:' || id END AS batch_key,
  coalesce(campaign_name, nullif(replace(substring(content from '(?m)^Đề kiểm tra:[ \t]*([^\r\n]+)'), '**', ''),''), CASE WHEN evaluation_session IS NOT NULL OR key_type = 'session_evaluation' THEN 'Nhận xét buổi học' END,
    nullif(left(replace(split_part(content, E'\n', 1), '**', ''), 110), ''), 'Tin nhắn Zalo') AS title,
  audience_user_id AS parent_id, coalesce(context_student_id,
    CASE WHEN key_type IN ('offline_test_score','session_score','exam_score','session_evaluation')
      THEN substring(message_key from ':([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid END) AS student_id, thread_id, status,
  automation_paused AS paused, error_message, created_at, updated_at,
  left(regexp_replace(content, '__(ACTION|CHART|EVALUATION)__.*$', '', 's'), 5000) AS body,
  score_parts_done AS completed_parts, score_parts_total AS total_parts,
  NULL::integer AS scan_pass, false AS awaiting_second_scan
FROM web
UNION ALL
SELECT j.id, 'notice', 'tuition', 'notice:' || j.batch_id,
  (CASE j.source WHEN 'automatic' THEN 'Nhắc học phí tự động' WHEN 'command' THEN 'Học phí theo lệnh #hocphi' ELSE 'Thông báo học phí' END) || ' ' || to_char(j.month,'MM/YYYY'),
  j.parent_id, NULL, m.conversation_id, j.status, j.paused, j.error_message, j.created_at, j.updated_at,
  left(m.content, 5000), j.next_part, jsonb_array_length(j.manifest), j.scan_pass,
  j.status = 'uncertain' AND j.scan_pass = 1 AND j.scan_attempts < 2
FROM public.tuition_notice_jobs j LEFT JOIN public.messages m ON m.id = j.message_id
UNION ALL
SELECT j.id, 'automatic_tuition', 'tuition', 'automatic_tuition:' || j.due_date,
  'Nhắc học phí ngày ' || to_char(j.due_date,'DD/MM/YYYY'), j.parent_id, NULL, m.conversation_id,
  j.status, false, j.error_message, j.created_at, j.updated_at,
  left(j.payload->'parts'->0->>'content',5000), j.next_part, jsonb_array_length(j.payload->'parts'), NULL, false
FROM public.automatic_tuition_reminders j LEFT JOIN public.messages m ON m.id=j.message_id
UNION ALL
SELECT j.id, 'tuition', 'tuition', 'tuition:' || coalesce(j.batch_id,j.id),
  'Thông báo học phí ' || to_char(j.month,'MM/YYYY'), j.parent_id,j.student_id,m.conversation_id,
  j.status,j.dispatch_paused,j.error_message,j.created_at,j.updated_at,left(j.content,5000),
  CASE WHEN j.qr_sent_at IS NOT NULL THEN 2 WHEN j.sent_at IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN j.qr_url IS NOT NULL THEN 2 ELSE 1 END,NULL,false
FROM public.zalo_tuition_deliveries j LEFT JOIN public.messages m ON m.id=j.message_id
UNION ALL
SELECT j.id,'receipt','receipt','receipt:' || j.id,'Xác nhận đã nộp học phí',j.parent_id,j.student_id,m.conversation_id,
  j.status,false,j.error_message,j.created_at,j.updated_at,left(j.content,5000),NULL,NULL,NULL,false
FROM public.zalo_tuition_receipts j LEFT JOIN public.messages m ON m.id=j.message_id
UNION ALL
SELECT md5(p.evaluation_id::text || ':' || p.parent_id)::uuid,'evaluation_missing','evaluation',
  'session_evaluation:' || e.class_session_id,'Nhận xét buổi học',p.parent_id,e.student_id,m.conversation_id,
  'not_queued',false,coalesce(p.delivery_error,'Chưa xếp hàng Zalo. Kiểm tra liên kết phụ huynh.'),
  m.created_at,p.updated_at,left(m.content,5000),NULL,NULL,NULL,false
FROM public.evaluation_zalo_publications p JOIN public.session_student_evaluations e ON e.id=p.evaluation_id
JOIN public.messages m ON m.id=p.message_id WHERE p.outbox_id IS NULL AND p.zalo_delivery_status='not_queued'
UNION ALL
SELECT md5(r.run_id::text || ':' || r.parent_id)::uuid,'campaign_missing','campaign','campaign:' || r.run_id,c.name,
  r.parent_id,CASE WHEN cardinality(r.student_ids)=1 THEN r.student_ids[1] END,NULL,
  'not_queued',false,r.error_message,run.created_at,run.created_at,left(r.content,5000),NULL,NULL,NULL,false
FROM public.message_campaign_recipients r JOIN public.message_campaign_runs run ON run.id=r.run_id
JOIN public.message_campaigns c ON c.id=run.campaign_id WHERE r.outbox_id IS NULL;

REVOKE ALL ON public.zalo_send_batch_items FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_zalo_send_batches()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NOT NULL AND (coalesce(public.is_admin_actor(),false)
    OR coalesce(public.can_manage_message_campaigns(),false)
    OR coalesce(public.has_app_permission('tuition.zalo_queue.manage'),false));
$$;

CREATE OR REPLACE FUNCTION public.can_manage_zalo_send_item(p_queue text, p_parent uuid, p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
    WHEN public.is_admin_actor() THEN true
    WHEN p_queue IN ('notice','automatic_tuition','tuition','receipt') THEN
      public.has_app_permission('tuition.zalo_queue.manage') AND (public.has_app_permission('tuition.view_all')
        OR (public.can_access_mindup_official_audience(p_parent) AND (public.teacher_manages_student(p_student)
          OR (p_student IS NULL AND NOT EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=p_parent AND ps.revoked_at IS NULL AND NOT coalesce(public.teacher_manages_student(ps.student_id),false))))))
    ELSE public.can_manage_message_campaigns() AND (public.has_app_permission('messages.automation.all')
      OR (public.can_access_mindup_official_audience(p_parent) AND (p_student IS NULL OR public.teacher_manages_student(p_student)))) END;
$$;
REVOKE ALL ON FUNCTION public.can_manage_zalo_send_batches(), public.can_manage_zalo_send_item(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_zalo_send_batches() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_zalo_send_batches(p_category text DEFAULT NULL, p_state text DEFAULT NULL, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_zalo_send_batches() THEN RAISE EXCEPTION 'Zalo batch permission required'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.latest DESC,b.batch_key) FROM (
    SELECT batch_key, category, min(title) AS title, min(created_at) AS started, max(created_at) AS latest,
      count(*) AS total, count(distinct parent_id) AS recipients,
      count(*) FILTER (WHERE status IN ('pending','queued','not_found','not_friend','invited','greeted') OR awaiting_second_scan) AS waiting,
      count(*) FILTER (WHERE status='processing') AS processing,
      count(*) FILTER (WHERE status='sent') AS sent,
      count(*) FILTER (WHERE status IN ('failed','uncertain','not_queued') AND NOT awaiting_second_scan) AS errors,
      count(*) FILTER (WHERE status='cancelled') AS skipped,
      count(*) FILTER (WHERE paused AND status IN ('pending','queued','not_found','not_friend','invited','greeted','uncertain')) AS paused
    FROM public.zalo_send_batch_items WHERE (p_category IS NULL OR category=p_category)
      AND public.can_manage_zalo_send_item(queue,parent_id,student_id)
    GROUP BY batch_key,category
    HAVING p_state IS NULL OR (p_state='active' AND bool_or(status IN ('pending','queued','processing','not_found','not_friend','invited','greeted') OR awaiting_second_scan))
      OR (p_state='errors' AND bool_or(status IN ('failed','uncertain','not_queued') AND NOT awaiting_second_scan))
    ORDER BY latest DESC,batch_key LIMIT 40 OFFSET greatest(coalesce(p_offset,0),0)
  ) b),'[]');
END; $$;

CREATE OR REPLACE FUNCTION public.list_zalo_send_batch_items(p_batch text, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_zalo_send_batches() THEN RAISE EXCEPTION 'Zalo batch permission required'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at,b.id) FROM (
    SELECT j.*, p.full_name AS parent_name, s.full_name AS student_name
    FROM public.zalo_send_batch_items j LEFT JOIN public.users p ON p.id=j.parent_id LEFT JOIN public.users s ON s.id=j.student_id
    WHERE j.batch_key=p_batch AND public.can_manage_zalo_send_item(j.queue,j.parent_id,j.student_id) ORDER BY j.created_at,j.id LIMIT 100 OFFSET greatest(coalesce(p_offset,0),0)
  ) b),'[]');
END; $$;

CREATE OR REPLACE FUNCTION public.control_zalo_send_batch(p_batch text, p_action text, p_job uuid DEFAULT NULL, p_checked boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j record; changed integer := 0; n integer; new_job uuid;
BEGIN
  IF NOT public.can_manage_zalo_send_batches() THEN RAISE EXCEPTION 'Zalo batch permission required'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('pause','resume','skip','retry') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  -- Serialize against worker claims. In-flight jobs finish using their existing lease.
  PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
  FOR j IN SELECT * FROM public.zalo_send_batch_items WHERE batch_key=p_batch AND (p_job IS NULL OR id=p_job)
    AND public.can_manage_zalo_send_item(queue,parent_id,student_id) LOOP
    n := 0;
    IF p_action IN ('pause','resume') THEN
      IF j.queue='web' THEN
        UPDATE public.zalo_outbox SET automation_paused=(p_action='pause'),updated_at=now()
          WHERE id=j.id AND status IN ('pending','failed') AND automation_paused IS DISTINCT FROM (p_action='pause');
      ELSIF j.queue='notice' THEN
        UPDATE public.tuition_notice_jobs SET paused=(p_action='pause'),updated_at=now()
          WHERE id=j.id AND status IN ('queued','uncertain') AND paused IS DISTINCT FROM (p_action='pause');
      ELSIF j.queue='tuition' THEN
        UPDATE public.zalo_tuition_deliveries SET dispatch_paused=(p_action='pause'),updated_at=now()
          WHERE id=j.id AND status IN ('queued','not_found','not_friend','invited','greeted','failed') AND dispatch_paused IS DISTINCT FROM (p_action='pause');
      ELSE CONTINUE; END IF;
      GET DIAGNOSTICS n=ROW_COUNT;
    ELSIF p_action='skip' THEN
      IF j.queue='notice' THEN
        UPDATE public.tuition_notice_jobs SET status='cancelled',updated_at=now()
          WHERE id=j.id AND (status='queued' OR (status='uncertain' AND (p_job IS NOT NULL OR j.awaiting_second_scan)));
        GET DIAGNOSTICS n=ROW_COUNT;
      ELSIF j.queue='automatic_tuition' THEN
        UPDATE public.automatic_tuition_reminders SET status='cancelled',updated_at=now()
          WHERE id=j.id AND status='queued';
        GET DIAGNOSTICS n=ROW_COUNT;
      ELSIF j.queue='web' AND p_job IS NOT NULL AND j.status IN ('failed','uncertain') THEN
        UPDATE public.zalo_outbox SET status='cancelled',updated_at=now() WHERE id=j.id AND status=j.status;
        GET DIAGNOSTICS n=ROW_COUNT;
      ELSIF j.queue='web' THEN
        UPDATE public.zalo_outbox SET status='cancelled',updated_at=now() WHERE id=j.id AND status='pending';
        GET DIAGNOSTICS n=ROW_COUNT;
      ELSIF j.queue='receipt' THEN
        UPDATE public.zalo_tuition_receipts SET status='cancelled',updated_at=now() WHERE id=j.id AND status='pending';
        GET DIAGNOSTICS n=ROW_COUNT;
      ELSIF j.queue='tuition' THEN
        UPDATE public.zalo_tuition_deliveries SET status='cancelled',updated_at=now()
          WHERE id=j.id AND status IN ('queued','not_found','not_friend','invited','greeted');
        GET DIAGNOSTICS n=ROW_COUNT;
      END IF;
    ELSIF j.queue='evaluation_missing' THEN
      -- Recheck that the published evaluation still belongs to this verified parent.
      INSERT INTO public.zalo_outbox(message_id,conversation_id,audience_user_id,zalo_uid,content,dispatch_priority)
      SELECT m.id,m.conversation_id,p.parent_id,l.zalo_uid,regexp_replace(m.content,'__(ACTION|CHART|EVALUATION)__.*$','','s'),1
      FROM public.evaluation_zalo_publications p JOIN public.messages m ON m.id=p.message_id
      JOIN public.zalo_verified_links l ON l.audience_user_id=p.parent_id AND l.enabled
      JOIN public.parent_students ps ON ps.parent_id=p.parent_id AND ps.student_id=j.student_id AND ps.revoked_at IS NULL
      WHERE p.outbox_id IS NULL AND p.zalo_delivery_status='not_queued'
        AND md5(p.evaluation_id::text || ':' || p.parent_id)::uuid=j.id
        AND m.sender_id='00000000-0000-0000-0000-000000000001' AND nullif(btrim(j.body),'') IS NOT NULL
      ON CONFLICT(message_id) DO NOTHING RETURNING id INTO new_job;
      IF new_job IS NOT NULL THEN
        UPDATE public.evaluation_zalo_publications SET outbox_id=new_job,zalo_delivery_status='pending',delivery_error=NULL,updated_at=now()
          WHERE md5(evaluation_id::text || ':' || parent_id)::uuid=j.id AND outbox_id IS NULL;
        GET DIAGNOSTICS n=ROW_COUNT;
      END IF;
    ELSIF j.queue='notice' THEN
      -- An ambiguous send is only retried individually after checking its conversation.
      UPDATE public.tuition_notice_jobs SET status='queued',scan_pass=1,scan_attempts=0,scan_started=false,
        part_started=false,paused=false,revision=revision+1,token=NULL,lease_until=NULL,
        history=history||jsonb_build_array(jsonb_build_object('error',error_message,'at',now(),'by',auth.uid(),'kind','manual_retry')),
        error_message=NULL,updated_at=now()
        WHERE id=j.id AND status='uncertain' AND NOT (scan_pass=1 AND scan_attempts<2)
          AND (NOT part_started AND coalesce(error_message,'') !~* 'timeout|timed out|uncertain|no message id|interrupted|network|fetch failed|econn|abort|reset'
            OR (p_job IS NOT NULL AND p_checked IS TRUE));
      GET DIAGNOSTICS n=ROW_COUNT;
    ELSIF j.queue IN ('web','receipt','tuition') AND j.status='failed'
      AND (j.queue <> 'tuition' OR j.completed_parts=0) THEN
      IF j.queue='web' THEN
        UPDATE public.zalo_outbox SET status='pending',locked_until=NULL,error_message=NULL,automation_paused=false,updated_at=now()
          WHERE id=j.id AND status='failed';
      ELSIF j.queue='receipt' THEN
        UPDATE public.zalo_tuition_receipts SET status='pending',lease_until=NULL,error_message=NULL,updated_at=now()
          WHERE id=j.id AND status='failed';
      ELSE
        UPDATE public.zalo_tuition_deliveries SET status='queued',lease_until=NULL,error_message=NULL,dispatch_paused=false,updated_at=now()
          WHERE id=j.id AND status='failed' AND sent_at IS NULL;
      END IF;
      GET DIAGNOSTICS n=ROW_COUNT;
    END IF;
    changed := changed + coalesce(n,0);
  END LOOP;
  RETURN changed;
END; $$;

REVOKE ALL ON FUNCTION public.list_zalo_send_batches(text,text,integer), public.list_zalo_send_batch_items(text,integer), public.control_zalo_send_batch(text,text,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_zalo_send_batches(text,text,integer), public.list_zalo_send_batch_items(text,integer), public.control_zalo_send_batch(text,text,uuid,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
