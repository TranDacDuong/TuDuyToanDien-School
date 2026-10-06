BEGIN;
CREATE TABLE IF NOT EXISTS public.attendance_absence_dispatch_config (
  id integer PRIMARY KEY CHECK(id=1),
  activated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.attendance_absence_dispatch_config(id) VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE public.attendance_absence_dispatch_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_absence_dispatch_config FROM PUBLIC,anon,authenticated;

-- Older cached clients may still call this RPC; a click must never publish.
CREATE OR REPLACE FUNCTION public.notify_explicit_attendance_absence(
  p_class_id uuid,p_student_id uuid,p_date date
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_ended_attendance_absences()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; recipient uuid; mid uuid; body text; template text; n integer:=0;
  baseline timestamptz; today date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  SELECT activated_at INTO baseline FROM public.attendance_absence_dispatch_config WHERE id=1;
  SELECT content INTO template FROM public.message_templates WHERE id='absent_notification' AND is_enabled;
  IF baseline IS NULL OR NULLIF(btrim(template),'') IS NULL THEN RETURN 0; END IF;
  FOR a IN
    SELECT att.class_id,att.student_id,att.date,u.full_name,c.class_name
    FROM public.attendance att JOIN public.users u ON u.id=att.student_id
      JOIN public.classes c ON c.id=att.class_id
    WHERE att.status='absent' AND att.status_overridden=true
      AND att.date BETWEEN today-1 AND today
      AND EXISTS(SELECT 1 FROM public.class_students cs WHERE cs.class_id=att.class_id
        AND cs.student_id=att.student_id AND (cs.joined_at IS NULL OR cs.joined_at::date<=att.date)
        AND (cs.left_at IS NULL OR cs.left_at::date>=att.date))
      AND (SELECT max(public.parent_evaluation_session_end(s.id)) FROM public.class_sessions s
        WHERE s.class_id=att.class_id AND s.session_date=att.date) BETWEEN baseline AND now()
    ORDER BY att.class_id,att.student_id,att.date FOR UPDATE OF att SKIP LOCKED
  LOOP
    body:=replace(replace(replace(template,'{{student_name}}',COALESCE(a.full_name,'')),
      '{{class_name}}',COALESCE(a.class_name,'')),'{{session_date}}',to_char(a.date,'DD/MM/YYYY'));
    FOR recipient IN SELECT DISTINCT ps.parent_id FROM public.parent_students ps
      JOIN public.users p ON p.id=ps.parent_id AND p.role::text='parent'
      WHERE ps.student_id=a.student_id AND ps.revoked_at IS NULL AND ps.parent_id<>a.student_id
    LOOP
      INSERT INTO public.attendance_parent_publications(class_id,student_id,attendance_date,parent_id)
        VALUES(a.class_id,a.student_id,a.date,recipient) ON CONFLICT DO NOTHING;
      IF NOT FOUND THEN CONTINUE; END IF;
      INSERT INTO public.messages(conversation_id,sender_id,content,context_student_id,transport,zalo_dispatch_source)
        VALUES(public.ensure_mindup_official_audience_conversation(recipient),
          '00000000-0000-0000-0000-000000000001',body,a.student_id,'web','automatic') RETURNING id INTO mid;
      UPDATE public.attendance_parent_publications SET message_id=mid
        WHERE class_id=a.class_id AND student_id=a.student_id AND attendance_date=a.date AND parent_id=recipient;
      n:=n+1;
    END LOOP;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_ended_attendance_absences() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_ended_attendance_absences() TO service_role;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    RAISE EXCEPTION 'pg_cron is required for absence notifications';
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='mindup-ended-session-absence';
  PERFORM cron.schedule('mindup-ended-session-absence','* * * * *',
    'SELECT public.publish_ended_attendance_absences();');
END;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
