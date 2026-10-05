-- Apply after learning RPCs, evaluation and receipt migrations.
-- Preserve employee jobs and all historical messages/notifications.
BEGIN;

-- Create the canonical reminder only when missing; never overwrite saved copy.
INSERT INTO public.message_templates(id,name,content,is_enabled,updated_at)
VALUES ('tuition_reminder','Nhắc học phí còn thiếu',
  'Kính gửi Quý phụ huynh, {{message}}',true,now()) ON CONFLICT(id) DO NOTHING;
UPDATE public.message_templates SET is_enabled = true, updated_at = now()
WHERE id IN ('tuition_confirmed','absent_notification','tuition_reminder',
  'session_score_notice','offline_test_score_notice','exam_score_notice',
  'session_evaluation_notice','session_evaluation');

-- Keep disabled tombstones: old consumers fall back to sending when a row is missing.
UPDATE public.message_templates SET is_enabled = false, updated_at = now()
WHERE id IN (
  'exam_result','low_score_review','review_exam_reminder','consecutive_absent_warning',
  'session_reminder_1h','session_reminder_7h','new_exam_notification',
  'session_evaluation_widget','praise_high_score','praise_improvement',
  'praise_big_improvement','late_study_warning','tuition_reminder_1',
  'tuition_reminder_3','tuition_overdue','birthday_wish','welcome_new_student',
  'learning_notification','course_created','course_enrolled',
  'course_request_approved','course_request_rejected','course_session_added',
  'course_session_updated','class_session_added','class_session_updated',
  'class_exam_added','tuition_due','tuition_due_manual','tuition_partial_manual'
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
      'mindup-tuition-reminder-day1','mindup-tuition-reminder-day8',
      'mindup-tuition-overdue-day11','mindup-birthday-wish',
      'mindup-session-reminder-morning'
    );
  END IF;
END $$;

-- RLS is additive; a BEFORE trigger also guards service-role notification writes.
CREATE OR REPLACE FUNCTION public.guard_parent_learning_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recipient_role text;
BEGIN
  SELECT role::text INTO recipient_role FROM public.users WHERE id = NEW.user_id;
  IF NEW.type = 'session_evaluation'
    OR COALESCE(NEW.meta->>'learning_thread', 'false') = 'true' THEN
    IF recipient_role IS DISTINCT FROM 'parent' THEN RETURN NULL; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = NEW.user_id AND ps.revoked_at IS NULL
        AND ps.student_id::text = NEW.meta->>'student_id'
    ) THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_parent_learning_notification() FROM PUBLIC;
DROP TRIGGER IF EXISTS parent_learning_notification_guard ON public.notifications;
CREATE TRIGGER parent_learning_notification_guard BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.guard_parent_learning_notification();

-- Patch checked anchors rather than replacing deployed context/outbox integrations.
-- Fail closed on unknown versions; the transaction then rolls back every change.
DO $migration$
DECLARE
  signature text;
  definition text;
  anchor text;
  guard text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.send_student_learning_message(uuid,text,uuid,uuid[])',
    'public.upsert_student_learning_message(uuid,text,text,uuid,uuid[])',
    'public.send_student_learning_message_to_audience(uuid,uuid,text,uuid)'
  ] LOOP
    definition := pg_get_functiondef(signature::regprocedure);
    definition := replace(replace(definition,E'\r\n',E'\n'),E'\r',E'\n');
    IF position('parent_learning_actor_guard_v2' IN definition) > 0 THEN CONTINUE; END IF;
    -- can_access_learning_thread(student, auth.uid()) is self-authorizing.
    -- Authorize the actor separately from the recipient relationship.
    definition := regexp_replace(definition, '(^|[[:space:]])BEGIN[[:space:]]*', '\1' || $actor$BEGIN
  -- parent_learning_actor_guard_v2
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id=auth.uid()
      AND (u.role::text='admin' OR (u.role::text IN ('teacher','assistant')
        AND public.is_class_staff_for_student(p_student_id)))
  ) THEN RAISE EXCEPTION 'Assigned class staff required'; END IF;
  IF p_real_sender_id IS NOT NULL AND p_real_sender_id IS DISTINCT FROM auth.uid()
  THEN RAISE EXCEPTION 'Sender must match authenticated staff'; END IF;
$actor$);
    IF position('parent_learning_actor_guard_v2' IN definition) = 0 THEN
      RAISE EXCEPTION 'Unknown learning RPC body: %',signature;
    END IF;
    IF signature LIKE '%upsert_student_learning_message(%' THEN
      IF position('      message_key,' IN definition) = 0
        OR position('      p_message_key,' IN definition) = 0
        OR position('      real_sender_id = EXCLUDED.real_sender_id,' IN definition) = 0 THEN
        RAISE EXCEPTION 'Unknown upsert context version';
      END IF;
      IF position('context_student_id' IN definition) = 0 THEN
        definition := replace(definition,'      message_key,',E'      message_key,\n      context_student_id,');
        definition := replace(definition,'      p_message_key,',E'      p_message_key,\n      p_student_id,');
        definition := replace(definition,'      real_sender_id = EXCLUDED.real_sender_id,',
          E'      real_sender_id = EXCLUDED.real_sender_id,\n      context_student_id = EXCLUDED.context_student_id,');
      ELSE
        RAISE EXCEPTION 'Unexpected pre-existing upsert context: review before applying';
      END IF;
    ELSE
      IF position('conversation_id, sender_id, content, real_sender_id)' IN definition)>0 THEN
        definition := replace(definition,'conversation_id, sender_id, content, real_sender_id)',
          'conversation_id, sender_id, content, real_sender_id, context_student_id)');
      END IF;
      IF position('conversation_id, sender_id, content, real_sender_id, context_student_id)' IN definition)=0
        OR definition !~ '(v_real_sender|COALESCE\(p_real_sender_id, v_actor\))\s*\)' THEN
        RAISE EXCEPTION 'Unknown learning INSERT values: %',signature;
      END IF;
      definition := regexp_replace(definition,
        '(v_real_sender|COALESCE\(p_real_sender_id, v_actor\))(\s*\))',
        '\1, p_student_id\2');
    END IF;
    IF position('parent_notification_policy_guard' IN definition)>0 THEN
      EXECUTE definition;
      CONTINUE;
    END IF;
    IF signature LIKE '%_to_audience(%' THEN
      anchor := '  v_conv_id := public.ensure_mindup_official_audience_conversation(p_audience_user_id);';
      guard := $guard$
  -- parent_notification_policy_guard
  IF p_audience_user_id = p_student_id OR NOT EXISTS (
    SELECT 1 FROM public.parent_students ps
    JOIN public.users u ON u.id = ps.parent_id AND u.role::text = 'parent'
    WHERE ps.student_id = p_student_id AND ps.parent_id = p_audience_user_id
      AND ps.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'Active linked parent audience required'; END IF;
$guard$;
    ELSE
      anchor := '    WHERE user_id IS NOT NULL';
      guard := $guard$
    -- parent_notification_policy_guard
    AND user_id <> p_student_id
    AND EXISTS (
      SELECT 1 FROM public.parent_students ps
      JOIN public.users u ON u.id = ps.parent_id AND u.role::text = 'parent'
      WHERE ps.student_id = p_student_id AND ps.parent_id = src.user_id
        AND ps.revoked_at IS NULL
    )
$guard$;
    END IF;
    IF position(anchor IN definition) = 0
      OR (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 THEN
      RAISE EXCEPTION 'Unknown learning RPC version: %', signature;
    END IF;
    IF signature LIKE '%_to_audience(%' THEN
      definition := replace(definition, anchor, guard || anchor);
    ELSE
      definition := replace(definition, anchor, anchor || guard);
    END IF;
    EXECUTE definition;
  END LOOP;
END $migration$;

-- Receipt enqueue must honor the same enabled switch as frontend receipt delivery.
DO $migration$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.enqueue_zalo_tuition_receipt(uuid,numeric,text)'::regprocedure);
  definition := replace(replace(definition,E'\r\n',E'\n'),E'\r',E'\n');
  IF position('parent_receipt_template_guard' IN definition) = 0 THEN
    IF position('  SELECT * INTO v_payment FROM public.tuition_payments' IN definition) = 0 THEN
      RAISE EXCEPTION 'Unknown receipt enqueue version';
    END IF;
    definition := replace(definition,
      '  SELECT * INTO v_payment FROM public.tuition_payments',
      $guard$
  -- parent_receipt_template_guard
  IF NOT EXISTS (SELECT 1 FROM public.message_templates
    WHERE id = 'tuition_confirmed' AND is_enabled = true) THEN RETURN NULL; END IF;
  SELECT * INTO v_payment FROM public.tuition_payments$guard$);
    EXECUTE definition;
  END IF;
END $migration$;

-- Also honor disablement for receipts already waiting in the queue.
DO $migration$
DECLARE definition text; anchor text := 'WHERE r.status = ''pending''';
BEGIN
  definition := pg_get_functiondef('public.claim_zalo_tuition_receipt()'::regprocedure);
  definition := replace(replace(definition,E'\r\n',E'\n'),E'\r',E'\n');
  IF position('parent_receipt_claim_guard' IN definition) > 0 THEN RETURN; END IF;
  IF position(anchor IN definition) = 0 THEN RAISE EXCEPTION 'Unknown receipt claim version'; END IF;
  definition := replace(definition, anchor, anchor || $guard$
      -- parent_receipt_claim_guard
      AND p.role::text = 'parent'
      AND EXISTS (SELECT 1 FROM public.message_templates
        WHERE id = 'tuition_confirmed' AND is_enabled = true)
$guard$);
  EXECUTE definition;
END $migration$;

-- Existing evaluation state='sent' means an in-app notification was persisted,
-- NOT Zalo/push delivery. Do not fabricate transport delivery timestamps.
ALTER TABLE public.session_student_evaluations
  ADD COLUMN IF NOT EXISTS notification_delivery_state text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS notification_published_at timestamptz;
COMMENT ON COLUMN public.session_student_evaluations.notification_delivery_state IS
  'unknown=legacy unverified; awaiting_parent=no in-app recipient; published=in-app notification created, not Zalo/push delivered';
COMMENT ON COLUMN public.session_student_evaluations.sent_at IS
  'Legacy publication timestamp, NOT an external transport delivery acknowledgement';

-- Recover only evidence-backed publication timestamps; do not resend old sent rows.
UPDATE public.session_student_evaluations e
SET notification_delivery_state = 'published', notification_published_at = n.published_at
FROM (
  SELECT meta->>'evaluation_id' AS evaluation_id, min(created_at) AS published_at
  FROM public.notifications WHERE type = 'session_evaluation'
  GROUP BY meta->>'evaluation_id'
) n
WHERE e.id::text = n.evaluation_id AND e.notification_delivery_state = 'unknown';

DO $migration$
DECLARE definition text; update_block text;
BEGIN
  definition := pg_get_functiondef('public.auto_send_session_evaluations_after_30m(uuid,date,boolean)'::regprocedure);
  definition := replace(replace(definition,E'\r\n',E'\n'),E'\r',E'\n');
  IF position('parent_evaluation_delivery_guard' IN definition) > 0 THEN RETURN; END IF;
  update_block := substring(definition FROM '      UPDATE public.session_student_evaluations[\s\S]*?v_eval_count := v_eval_count \+ 1;');
  IF update_block IS NULL
    OR position('      GET DIAGNOSTICS v_rows = ROW_COUNT;' IN definition) = 0
    OR position('        AND ps.revoked_at IS NULL;' IN definition) = 0
    OR position('    SET auto_eval_sent_at = now()' IN definition) = 0
    OR position('(cs.auto_eval_sent_at IS NULL OR p_force = true)' IN definition) = 0
    OR position('''evaluations_sent'', v_eval_count' IN definition) = 0
    OR position('''notifications_sent'', v_notif_count' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unknown auto evaluation function version';
  END IF;
  definition := replace(definition, update_block, '');
  definition := replace(definition, '      GET DIAGNOSTICS v_rows = ROW_COUNT;',
    '      GET DIAGNOSTICS v_rows = ROW_COUNT;' || E'\n'
    || '      -- parent_evaluation_delivery_guard' || E'\n'
    || '      IF v_rows > 0 THEN' || E'\n' || update_block || E'\n'
    || '        UPDATE public.session_student_evaluations SET notification_delivery_state = ''published'', notification_published_at = now() WHERE id = v_eval.eval_id;' || E'\n'
    || '      ELSE' || E'\n'
    || '        UPDATE public.session_student_evaluations SET notification_delivery_state = ''awaiting_parent'' WHERE id = v_eval.eval_id;' || E'\n      END IF;');
  definition := replace(definition, '        AND ps.revoked_at IS NULL;',
    $guard$        AND ps.revoked_at IS NULL
        AND ps.parent_id <> v_eval.student_id
        AND EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = ps.parent_id AND pu.role::text = 'parent');$guard$);
  definition := replace(definition, '    SET auto_eval_sent_at = now()',
    $guard$    SET auto_eval_sent_at = CASE WHEN EXISTS (
      SELECT 1 FROM public.session_student_evaluations pending
      WHERE pending.class_session_id = v_session.session_id AND pending.state = 'draft'
        AND EXISTS (SELECT 1 FROM public.session_student_evaluation_statuses es WHERE es.evaluation_id = pending.id)
    ) THEN NULL ELSE now() END$guard$);
  -- Serialize concurrent cron/manual evaluation sends.
  definition := replace(definition, 'BEGIN',
    $guard$BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('parent-auto-evaluations'));
  IF EXISTS (SELECT 1 FROM public.message_templates
    WHERE id = 'session_evaluation_notice' AND is_enabled = false)
  THEN RETURN jsonb_build_object('success', true, 'skipped', 'template_disabled'); END IF;
$guard$);
  -- Late-created drafts must not be hidden by a session-level completion marker.
  definition := replace(definition, '(cs.auto_eval_sent_at IS NULL OR p_force = true)',
    $guard$(cs.auto_eval_sent_at IS NULL OR p_force = true OR EXISTS (
      SELECT 1 FROM public.session_student_evaluations pending
      WHERE pending.class_session_id = cs.id AND pending.state = 'draft'
        AND EXISTS (SELECT 1 FROM public.session_student_evaluation_statuses es WHERE es.evaluation_id = pending.id)
    ))$guard$);
  definition := replace(definition, '''evaluations_sent'', v_eval_count',
    '''evaluations_published'', v_eval_count, ''evaluations_sent'', v_eval_count');
  definition := replace(definition, '''notifications_sent'', v_notif_count',
    '''notifications_created'', v_notif_count, ''notifications_sent'', v_notif_count');
  EXECUTE definition;
END $migration$;

-- Attendance backfills use the same absent status as genuine absences. Do NOT
-- attach a raw attendance trigger; call only after a deliberate frontend save.
CREATE TABLE IF NOT EXISTS public.attendance_parent_publications (
  class_id uuid NOT NULL REFERENCES public.classes(id),
  student_id uuid NOT NULL REFERENCES public.users(id),
  attendance_date date NOT NULL,
  parent_id uuid NOT NULL REFERENCES public.users(id),
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(class_id,student_id,attendance_date,parent_id)
);
ALTER TABLE public.attendance_parent_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_parent_publications FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.notify_explicit_attendance_absence(
  p_class_id uuid, p_student_id uuid, p_date date
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent uuid; mid uuid; content text; student_name text; class_name text; delivered integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id=auth.uid()
      AND (u.role::text='admin' OR (u.role::text IN ('teacher','assistant')
        AND EXISTS (SELECT 1 FROM public.class_teachers ct
          WHERE ct.class_id=p_class_id AND ct.teacher_id=auth.uid())))
  ) THEN RAISE EXCEPTION 'Assigned class staff required'; END IF;
  IF p_date IS NULL OR p_date > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN RETURN 0; END IF;
  -- Lock the saved record against concurrent corrections while publishing.
  PERFORM 1 FROM public.attendance a WHERE a.class_id=p_class_id
    AND a.student_id=p_student_id AND a.date=p_date
    AND a.status='absent' AND a.status_overridden=true FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.class_students cs
    WHERE cs.class_id=p_class_id AND cs.student_id=p_student_id
      AND (cs.joined_at IS NULL OR cs.joined_at::date <= p_date)
      AND (cs.left_at IS NULL OR cs.left_at::date >= p_date)) THEN RETURN 0; END IF;
  SELECT mt.content INTO content FROM public.message_templates mt
    WHERE mt.id='absent_notification' AND mt.is_enabled=true;
  IF NULLIF(trim(content),'') IS NULL THEN RETURN 0; END IF;
  SELECT full_name INTO student_name FROM public.users WHERE id=p_student_id;
  SELECT c.class_name INTO class_name FROM public.classes c WHERE c.id=p_class_id;
  content := replace(replace(replace(content,'{{student_name}}',COALESCE(student_name,'')),
    '{{class_name}}',COALESCE(class_name,'')),'{{session_date}}',to_char(p_date,'DD/MM/YYYY'));
  FOR parent IN SELECT DISTINCT ps.parent_id FROM public.parent_students ps
    JOIN public.users u ON u.id=ps.parent_id AND u.role::text='parent'
    WHERE ps.student_id=p_student_id AND ps.revoked_at IS NULL AND ps.parent_id<>p_student_id
  LOOP
    INSERT INTO public.attendance_parent_publications(class_id,student_id,attendance_date,parent_id)
      VALUES(p_class_id,p_student_id,p_date,parent) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;
    mid := public.send_student_learning_message_to_audience(p_student_id,parent,content,auth.uid());
    UPDATE public.attendance_parent_publications SET message_id=mid
      WHERE class_id=p_class_id AND student_id=p_student_id AND attendance_date=p_date AND parent_id=parent;
    delivered := delivered+1;
  END LOOP;
  RETURN delivered;
END $$;
REVOKE ALL ON FUNCTION public.notify_explicit_attendance_absence(uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notify_explicit_attendance_absence(uuid,uuid,date) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
