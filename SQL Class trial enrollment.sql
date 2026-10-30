BEGIN;
ALTER TABLE public.class_students ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS tuition_starts_on date;
ALTER TABLE public.trial_lesson_requests ADD COLUMN IF NOT EXISTS managed_in_class boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS trial_sessions jsonb NOT NULL DEFAULT '[]';

CREATE OR REPLACE FUNCTION public.can_manage_class_trial(p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND public.has_app_permission('trial.class.assign')
 AND public.has_app_permission('class.students.add') AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid()
 AND u.role::text IN('admin','teacher','assistant') AND (u.role::text='admin' OR public.has_app_permission('classes.all.view')
 OR EXISTS(SELECT 1 FROM public.class_teachers ct WHERE ct.class_id=p_class AND ct.teacher_id=u.id)));
$$;

-- Official insertions keep their existing synchronisation behaviour.
CREATE OR REPLACE FUNCTION public.sync_trial_request_on_class_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.is_trial THEN RETURN NEW; END IF;
 UPDATE public.trial_lesson_requests SET status='enrolled',handled_at=now()
 WHERE trial_class_id=NEW.class_id AND student_id=NEW.student_id AND status<>'enrolled';
 RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.class_trial_session(p_class uuid,p_schedule integer,p_date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE s public.class_schedules;start_at timestamptz;end_at timestamptz;
BEGIN
 SELECT * INTO s FROM public.class_schedules WHERE id=p_schedule AND class_id=p_class;
 IF NOT FOUND OR p_date IS NULL OR extract(isodow FROM p_date)::integer<>s.weekday
 OR coalesce(s.effective_from,date '2000-01-01')>p_date THEN RAISE EXCEPTION 'Ngày học thử không khớp lịch của lớp'; END IF;
 start_at:=(p_date+s.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh';
 end_at:=(p_date+s.end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh';
 IF end_at<=start_at THEN end_at:=end_at+interval '1 day'; END IF;
 RETURN jsonb_build_object('date',p_date,'schedule_id',s.id,'session_no',coalesce(s.session_no,1),'starts_at',start_at,'ends_at',end_at);
END;$$;

CREATE OR REPLACE FUNCTION public.save_class_trial(p_id uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid:=(p_payload->>'trial_class_id')::uuid;sid uuid:=(p_payload->>'student_id')::uuid;
 old public.trial_lesson_requests;enrollment public.class_students;first_session jsonb;second_session jsonb;
 sessions jsonb;rid uuid;chosen record;
BEGIN
 IF NOT public.can_manage_class_trial(cid) OR NOT public.has_app_permission(CASE WHEN p_id IS NULL THEN 'trial.create' ELSE 'trial.update' END)
 THEN RAISE EXCEPTION 'Không có quyền thêm/sửa học thử trong lớp này'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=sid AND role::text='student') THEN RAISE EXCEPTION 'Cần chọn tài khoản học sinh hợp lệ'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.classes WHERE id=cid AND NOT coalesce(hidden,false)) THEN RAISE EXCEPTION 'Lớp không hoạt động'; END IF;
 IF p_payload->>'student_name' IS NULL OR p_payload->>'phone' IS NULL OR p_payload->>'grade' IS NULL OR p_payload->>'subject' IS NULL
 THEN RAISE EXCEPTION 'Thiếu thông tin học sinh'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(cid::text||sid::text,0));
 IF p_id IS NOT NULL THEN
  SELECT * INTO old FROM public.trial_lesson_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR (old.managed_in_class AND (old.trial_class_id<>cid OR old.student_id<>sid OR old.status IN('enrolled','closed','cancelled')))
  THEN RAISE EXCEPTION 'Không thể thay đổi học sinh/lớp hoặc hồ sơ học thử đã kết thúc'; END IF;
  IF old.trial_class_id IS NOT NULL AND old.trial_class_id<>cid AND NOT public.can_manage_class_trial(old.trial_class_id)
  THEN RAISE EXCEPTION 'Không có quyền sửa lớp gốc'; END IF;
  IF jsonb_array_length(old.trial_sessions)>2 THEN RAISE EXCEPTION 'Hồ sơ đã gia hạn: dùng nút Gia hạn để giữ lịch sử'; END IF;
 END IF;
 SELECT * INTO enrollment FROM public.class_students WHERE class_id=cid AND student_id=sid ORDER BY joined_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND AND NOT enrollment.is_trial THEN RAISE EXCEPTION 'Học sinh đã có lịch sử học chính thức ở lớp; không thay đổi dữ liệu cũ'; END IF;
 IF EXISTS(SELECT 1 FROM public.trial_lesson_requests WHERE student_id=sid AND trial_class_id=cid AND managed_in_class
  AND status NOT IN('enrolled','closed','cancelled') AND id IS DISTINCT FROM p_id) THEN RAISE EXCEPTION 'Học sinh đã đang học thử trong lớp'; END IF;
 first_session:=public.class_trial_session(cid,(p_payload->>'trial_schedule_1_id')::integer,
  ((p_payload->>'trial_session_1_at')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
 second_session:=public.class_trial_session(cid,(p_payload->>'trial_schedule_2_id')::integer,
  ((p_payload->>'trial_session_2_at')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
 IF (second_session->>'date')::date<=(first_session->>'date')::date THEN RAISE EXCEPTION 'Hai buổi học thử phải ở hai ngày khác nhau, buổi 2 sau buổi 1'; END IF;
 sessions:=jsonb_build_array(first_session,second_session);
 IF old.managed_in_class AND old.trial_sessions IS DISTINCT FROM sessions THEN
  RAISE EXCEPTION 'Lịch học thử đã lưu; dùng Gia hạn để bổ sung buổi và giữ nguyên lịch sử';
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.trial_lesson_requests(student_id,student_name,phone,grade,subject,school,parent_id,parent_full_name,parent_phone,
    trial_class_id,trial_schedule_1_id,trial_schedule_2_id,trial_session_1_at,trial_session_2_at,note,status,managed_in_class,trial_sessions,source_url)
  VALUES(sid,p_payload->>'student_name',p_payload->>'phone',p_payload->>'grade',p_payload->>'subject',p_payload->>'school',
    (p_payload->>'parent_id')::uuid,p_payload->>'parent_full_name',p_payload->>'parent_phone',cid,(first_session->>'schedule_id')::integer,
    (second_session->>'schedule_id')::integer,(first_session->>'starts_at')::timestamptz,(second_session->>'starts_at')::timestamptz,
    p_payload->>'note','scheduled',true,sessions,'class') RETURNING id INTO rid;
 ELSE
  rid:=p_id;
  UPDATE public.trial_lesson_requests SET student_id=sid,student_name=p_payload->>'student_name',phone=p_payload->>'phone',
   grade=p_payload->>'grade',subject=p_payload->>'subject',school=p_payload->>'school',parent_id=(p_payload->>'parent_id')::uuid,
   parent_full_name=p_payload->>'parent_full_name',parent_phone=p_payload->>'parent_phone',trial_class_id=cid,
   trial_schedule_1_id=(first_session->>'schedule_id')::integer,trial_schedule_2_id=(second_session->>'schedule_id')::integer,
   trial_session_1_at=(first_session->>'starts_at')::timestamptz,trial_session_2_at=(second_session->>'starts_at')::timestamptz,
   note=p_payload->>'note',status='scheduled',managed_in_class=true,trial_sessions=sessions WHERE id=rid;
 END IF;
 IF enrollment.id IS NULL THEN
  INSERT INTO public.class_students(class_id,student_id,joined_at,is_trial) VALUES(cid,sid,(first_session->>'starts_at')::timestamptz,true);
 ELSE
  UPDATE public.class_students SET joined_at=(first_session->>'starts_at')::timestamptz,left_at=NULL,is_trial=true,tuition_starts_on=NULL WHERE id=enrollment.id;
 END IF;
 -- Only provision the trial appointments; pre-joining absences remain display defaults, never notifications.
 FOR chosen IN SELECT value FROM jsonb_array_elements(sessions) LOOP
  INSERT INTO public.attendance(class_id,student_id,date,status,schedule_id,status_overridden)
   VALUES(cid,sid,(chosen.value->>'date')::date,'trial',(chosen.value->>'schedule_id')::integer,false)
   ON CONFLICT(class_id,student_id,date) DO NOTHING;
 END LOOP;
 INSERT INTO public.class_student_schedules(class_id,student_id,session_no,schedule_id,effective_from)
 SELECT cid,sid,(value->>'session_no')::integer,(value->>'schedule_id')::integer,(first_session->>'date')::date
 FROM (SELECT DISTINCT ON(value->>'session_no') value FROM jsonb_array_elements(sessions) ORDER BY value->>'session_no',value->>'date')x
 ON CONFLICT(class_id,student_id,session_no,effective_from) DO UPDATE SET schedule_id=excluded.schedule_id;
 RETURN rid;
END;$$;

CREATE OR REPLACE FUNCTION public.control_class_trial(p_id uuid,p_action text,p_date date DEFAULT NULL,p_schedule integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trial_lesson_requests;last_end timestamptz;last_day date;extra jsonb;
BEGIN
 SELECT * INTO t FROM public.trial_lesson_requests WHERE id=p_id;
 IF NOT FOUND OR NOT t.managed_in_class OR NOT public.can_manage_class_trial(t.trial_class_id)
 OR NOT public.has_app_permission('trial.update') THEN RAISE EXCEPTION 'Không có quyền xử lý học thử'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t.trial_class_id::text||t.student_id::text,0));
 SELECT * INTO t FROM public.trial_lesson_requests WHERE id=p_id FOR UPDATE;
 IF t.status IN('enrolled','closed','cancelled') THEN RAISE EXCEPTION 'Hồ sơ đã kết thúc'; END IF;
 SELECT max((value->>'ends_at')::timestamptz),max((value->>'date')::date) INTO last_end,last_day FROM jsonb_array_elements(t.trial_sessions);
 IF last_end IS NULL OR last_day IS NULL THEN RAISE EXCEPTION 'Hồ sơ thiếu lịch học thử'; END IF;
 IF p_action='official' THEN
  IF now()<last_end OR p_date IS NULL OR p_date<=last_day THEN RAISE EXCEPTION 'Chỉ chuyển chính thức sau khi hết học thử; ngày thu phí phải sau buổi học thử cuối'; END IF;
  UPDATE public.class_students SET is_trial=false,tuition_starts_on=p_date WHERE class_id=t.trial_class_id AND student_id=t.student_id AND is_trial AND left_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy học sinh đang học thử trong lớp'; END IF;
  UPDATE public.trial_lesson_requests SET status='enrolled',enrolled_at=now(),handled_at=now(),handled_by=auth.uid() WHERE id=p_id;
 ELSIF p_action='extend' THEN
  IF p_date IS NULL OR p_date<=last_day THEN RAISE EXCEPTION 'Ngày gia hạn phải sau buổi học thử cuối'; END IF;
  extra:=public.class_trial_session(t.trial_class_id,p_schedule,p_date);
  UPDATE public.trial_lesson_requests SET trial_sessions=trial_sessions||jsonb_build_array(extra),status='scheduled',
   trial_session_2_at=(extra->>'starts_at')::timestamptz,trial_schedule_2_id=p_schedule WHERE id=p_id;
  INSERT INTO public.attendance(class_id,student_id,date,status,schedule_id,status_overridden)
   VALUES(t.trial_class_id,t.student_id,p_date,'trial',p_schedule,false) ON CONFLICT(class_id,student_id,date) DO NOTHING;
  INSERT INTO public.class_student_schedules(class_id,student_id,session_no,schedule_id,effective_from)
   SELECT t.trial_class_id,t.student_id,previous.session_no,previous.schedule_id,p_date
   FROM public.class_student_schedules previous
   WHERE previous.class_id=t.trial_class_id AND previous.student_id=t.student_id
    AND previous.session_no<>(extra->>'session_no')::integer
    AND previous.effective_from=(SELECT max(effective_from) FROM public.class_student_schedules
      WHERE class_id=t.trial_class_id AND student_id=t.student_id AND effective_from<=p_date)
   UNION ALL SELECT t.trial_class_id,t.student_id,(extra->>'session_no')::integer,p_schedule,p_date
   ON CONFLICT(class_id,student_id,session_no,effective_from) DO UPDATE SET schedule_id=excluded.schedule_id;
 ELSIF p_action='stop' THEN
  UPDATE public.class_students SET left_at=least(now(),last_end) WHERE class_id=t.trial_class_id AND student_id=t.student_id AND is_trial AND left_at IS NULL;
  UPDATE public.attendance SET status='absent' WHERE class_id=t.trial_class_id AND student_id=t.student_id
   AND date>(least(now(),last_end) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND status='trial' AND NOT coalesce(status_overridden,false);
  UPDATE public.trial_lesson_requests SET status='closed',handled_at=now(),handled_by=auth.uid() WHERE id=p_id;
 ELSE RAISE EXCEPTION 'Thao tác không hợp lệ'; END IF;
END;$$;
REVOKE ALL ON FUNCTION public.class_trial_session(uuid,integer,date),public.can_manage_class_trial(uuid),public.save_class_trial(uuid,jsonb),public.control_class_trial(uuid,text,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_class_trial(uuid),public.save_class_trial(uuid,jsonb),public.control_class_trial(uuid,text,date,integer) TO authenticated;

-- Retain every existing automation rule; include the new billing boundary in its existing context.
DO $$ DECLARE src text;BEGIN
 IF to_regprocedure('public.automatic_tuition_config()') IS NOT NULL THEN
  src:=pg_get_functiondef('public.automatic_tuition_config()'::regprocedure);
  IF position('SELECT student_id,class_id,joined_at,left_at FROM public.class_students' IN src)>0 THEN
   src:=replace(src,'SELECT student_id,class_id,joined_at,left_at FROM public.class_students',
    'SELECT student_id,class_id,joined_at,left_at,is_trial,tuition_starts_on FROM public.class_students');
   src:=replace(src,'SELECT student_id,trial_class_id,trial_session_1_at,trial_session_2_at FROM public.trial_lesson_requests',
    'SELECT student_id,trial_class_id,trial_session_1_at,trial_session_2_at,trial_sessions FROM public.trial_lesson_requests');
   EXECUTE src;
  ELSIF position('tuition_starts_on' IN src)=0 THEN RAISE EXCEPTION 'Unexpected automatic tuition config: inspect before migration'; END IF;
 END IF;
END;$$;
NOTIFY pgrst,'reload schema';
COMMIT;
