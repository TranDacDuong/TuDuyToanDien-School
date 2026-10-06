BEGIN;
DO $$
DECLARE a record; n integer;
BEGIN
  SELECT att.class_id,att.student_id,att.date INTO a FROM public.attendance att
    WHERE att.date=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      AND EXISTS(SELECT 1 FROM public.class_sessions s WHERE s.class_id=att.class_id AND s.session_date=att.date)
      AND EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.student_id=att.student_id AND ps.revoked_at IS NULL)
      AND EXISTS(SELECT 1 FROM public.class_students cs WHERE cs.class_id=att.class_id AND cs.student_id=att.student_id
        AND (cs.joined_at IS NULL OR cs.joined_at::date<=att.date) AND (cs.left_at IS NULL OR cs.left_at::date>=att.date)) LIMIT 1;
  IF a.class_id IS NULL THEN RAISE EXCEPTION 'No test fixture'; END IF;
  UPDATE public.attendance_absence_dispatch_config SET activated_at=now()-interval '1 minute' WHERE id=1;
  DELETE FROM public.attendance_parent_publications WHERE class_id=a.class_id AND student_id=a.student_id AND attendance_date=a.date;
  UPDATE public.class_sessions SET ends_at=now()+interval '1 minute' WHERE class_id=a.class_id AND session_date=a.date;
  UPDATE public.attendance SET status='absent',status_overridden=true WHERE class_id=a.class_id AND student_id=a.student_id AND date=a.date;
  PERFORM public.publish_ended_attendance_absences();
  IF EXISTS(SELECT 1 FROM public.attendance_parent_publications WHERE class_id=a.class_id AND student_id=a.student_id AND attendance_date=a.date) THEN
    RAISE EXCEPTION 'Published before session end'; END IF;
  UPDATE public.class_sessions SET ends_at=now()-interval '1 second' WHERE class_id=a.class_id AND session_date=a.date;
  UPDATE public.attendance SET status='present' WHERE class_id=a.class_id AND student_id=a.student_id AND date=a.date;
  PERFORM public.publish_ended_attendance_absences();
  IF EXISTS(SELECT 1 FROM public.attendance_parent_publications WHERE class_id=a.class_id AND student_id=a.student_id AND attendance_date=a.date) THEN
    RAISE EXCEPTION 'Published corrected present status'; END IF;
  UPDATE public.attendance SET status='absent' WHERE class_id=a.class_id AND student_id=a.student_id AND date=a.date;
  PERFORM public.publish_ended_attendance_absences();
  SELECT count(*) INTO n FROM public.attendance_parent_publications WHERE class_id=a.class_id AND student_id=a.student_id AND attendance_date=a.date AND message_id IS NOT NULL;
  IF n=0 THEN RAISE EXCEPTION 'Missing ended absence publication'; END IF;
  PERFORM public.publish_ended_attendance_absences();
  IF n<>(SELECT count(*) FROM public.attendance_parent_publications WHERE class_id=a.class_id AND student_id=a.student_id AND attendance_date=a.date) THEN
    RAISE EXCEPTION 'Duplicate publication'; END IF;
END;
$$;
SELECT 'PASS: no early send, corrected status ignored, ended absence published, no duplicates' AS result;
ROLLBACK;
