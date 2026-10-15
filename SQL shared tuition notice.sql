BEGIN;
ALTER TABLE public.automatic_tuition_control ADD COLUMN IF NOT EXISTS notice_template text;
CREATE OR REPLACE FUNCTION public.tuition_notice_template(p_template text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_template IS NOT NULL THEN
    IF length(trim(p_template)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Invalid template'; END IF;
    UPDATE public.automatic_tuition_control SET notice_template=p_template WHERE id=1;
  END IF;
  RETURN (SELECT notice_template FROM public.automatic_tuition_control WHERE id=1);
END;
$$;
REVOKE ALL ON FUNCTION public.tuition_notice_template(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tuition_notice_template(text) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.automatic_tuition_bank_config()') IS NULL THEN
    ALTER FUNCTION public.automatic_tuition_config() RENAME TO automatic_tuition_bank_config;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.automatic_tuition_config()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m date:=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date; result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  result:=public.automatic_tuition_bank_config();
  RETURN result||jsonb_build_object('bankName',CASE WHEN result->>'code'='vietinbank' THEN 'VietinBank' ELSE result->>'code' END,
    'notice_template',(SELECT notice_template FROM public.automatic_tuition_control WHERE id=1),
    'parent_names',(SELECT jsonb_object_agg(id,full_name) FROM public.users WHERE role::text='parent'),
    'billing_context',jsonb_build_object(
      'classes',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM (SELECT c.id,c.class_name,c.tuition_type,c.tuition_fee,c.makeup_fee,
        (SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) FROM public.class_schedules s WHERE s.class_id=c.id) AS class_schedules FROM public.classes c WHERE NOT hidden)c),
      'classStudents',(SELECT coalesce(jsonb_agg(to_jsonb(cs)),'[]'::jsonb) FROM (SELECT student_id,class_id,joined_at,left_at FROM public.class_students)cs),
      'attData',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM (SELECT student_id,class_id,date,status,status_overridden,schedule_id FROM public.attendance WHERE date>=m AND date<(m+interval '1 month'))a),
      'chosenSchedules',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) FROM (SELECT class_id,student_id,schedule_id,effective_from FROM public.class_student_schedules)s),
      'trialReqs',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (SELECT student_id,trial_class_id,trial_session_1_at,trial_session_2_at FROM public.trial_lesson_requests)t),
      'suppSessions',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) FROM (SELECT s.parent_class_id,s.topic,s.session_date,s.fee_per_student,
        (SELECT coalesce(jsonb_agg(to_jsonb(st)),'[]'::jsonb) FROM (SELECT student_id,attendance_status,tuition_fee FROM public.supplementary_session_students WHERE session_id=s.id)st) AS students
        FROM public.supplementary_sessions s WHERE s.status='completed' AND session_date>=m AND session_date<(m+interval '1 month'))s),
      'payments',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM (SELECT student_id,month,locked_at,gross_components FROM public.tuition_payments WHERE month=m)p),
      'discountRules',(SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM public.tuition_discounts d)
    ));
END;
$$;
REVOKE ALL ON FUNCTION public.automatic_tuition_config() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automatic_tuition_config() TO service_role;
DO $patch$
DECLARE source text; anchor text := 'ON CONFLICT DO NOTHING RETURNING id INTO v_id';
BEGIN
  SELECT pg_get_functiondef('public.automatic_tuition_valid(uuid)'::regprocedure) INTO source;
  EXECUTE replace(source,'public.automatic_tuition_config()','public.automatic_tuition_bank_config()');
  SELECT pg_get_functiondef('public.enqueue_automatic_tuition_reminder(uuid,date,integer,date,date,text,jsonb)'::regprocedure) INTO source;
  IF position(anchor IN source)>0 THEN
    source:=replace(source,anchor,'ON CONFLICT(parent_id,month,slot) DO UPDATE SET payload=excluded.payload,updated_at=now()
      WHERE automatic_tuition_reminders.status=''queued'' AND automatic_tuition_reminders.next_part=0
      AND NOT automatic_tuition_reminders.part_started
      AND automatic_tuition_reminders.payload->''children''=excluded.payload->''children''
      AND automatic_tuition_reminders.payload IS DISTINCT FROM excluded.payload RETURNING id INTO v_id');
    EXECUTE source;
  END IF;
END;
$patch$;
CREATE OR REPLACE FUNCTION public.mirror_pending_tuition_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='queued' AND NEW.next_part=0 AND NOT NEW.part_started AND NEW.payload IS DISTINCT FROM OLD.payload THEN
    UPDATE public.messages SET content=NEW.payload->>'content'||E'\n\n'||coalesce((SELECT string_agg(
      'Mã QR '||(NEW.payload->'children'->(n::integer-2)->>'student_name')||': '||(part->>'url'),E'\n' ORDER BY n)
      FROM jsonb_array_elements(NEW.payload->'parts') WITH ORDINALITY a(part,n) WHERE n>1),'') WHERE id=NEW.message_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mirror_pending_tuition_notice() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS automatic_tuition_pending_text ON public.automatic_tuition_reminders;
CREATE TRIGGER automatic_tuition_pending_text AFTER UPDATE OF payload ON public.automatic_tuition_reminders FOR EACH ROW EXECUTE FUNCTION public.mirror_pending_tuition_notice();
NOTIFY pgrst,'reload schema';
COMMIT;
