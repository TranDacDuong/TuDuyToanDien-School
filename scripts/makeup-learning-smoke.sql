-- Live smoke test: all temporary rows and attendance/task changes are rolled back.
BEGIN;
DO $$
DECLARE actor uuid;candidate record;created jsonb;opened jsonb;result jsonb;answers jsonb;obj text;n integer;
BEGIN
 SELECT id INTO actor FROM public.users WHERE role::text='admin' LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'No admin available for smoke test'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 SELECT a.class_id,a.student_id,a.date,t.id AS topic_id INTO candidate
 FROM public.attendance a JOIN public.classes c ON c.id=a.class_id
 JOIN public.topics t ON t.subject_id=c.subject_id
 JOIN public.class_students cs ON cs.class_id=a.class_id AND cs.student_id=a.student_id
 WHERE a.status='absent' AND a.date<=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
 AND a.date>=(cs.joined_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
 AND (cs.left_at IS NULL OR a.date<=(cs.left_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
 AND NOT EXISTS(SELECT 1 FROM public.makeup_learning m WHERE m.class_id=a.class_id AND m.student_id=a.student_id AND m.study_date=a.date)
 AND (SELECT count(*) FROM public.question_bank q WHERE q.topic_id=t.id AND NOT coalesce(q.hidden,false)
  AND q.question_type::text='multi_choice' AND coalesce(q.answer_status,'reviewed')='reviewed'
  AND coalesce(q.word_import_review_status,'approved')='approved'
  AND upper(trim(q.answer))~'^[A-F]$' AND q.answer_count BETWEEN 2 AND 6
  AND ascii(upper(trim(q.answer)))-64<=q.answer_count)>=10 LIMIT 1;
 IF candidate.class_id IS NULL THEN
  SELECT a.class_id,a.student_id,a.date,t.id AS topic_id INTO candidate
  FROM public.attendance a JOIN public.classes c ON c.id=a.class_id JOIN public.topics t ON t.subject_id=c.subject_id
  JOIN public.class_students cs ON cs.class_id=a.class_id AND cs.student_id=a.student_id
  WHERE a.status='absent' AND a.date<=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  AND a.date>=(cs.joined_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  AND (cs.left_at IS NULL OR a.date<=(cs.left_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
  AND NOT EXISTS(SELECT 1 FROM public.makeup_learning m WHERE m.class_id=a.class_id AND m.student_id=a.student_id AND m.study_date=a.date) LIMIT 1;
  IF candidate.class_id IS NULL THEN RAISE EXCEPTION 'No absence available for transactional smoke'; END IF;
  -- Disposable bank questions exist only inside this rolled-back transaction.
  INSERT INTO public.question_bank(topic_id,question_type,question_text,answer_count,answer,answer_status,difficulty,created_by)
  SELECT candidate.topic_id,'multi_choice','SMOKE ONLY: 1+1? A.1 B.2 C.3 D.4',4,'B','reviewed',5,actor FROM generate_series(1,10);
 END IF;
 created:=public.create_makeup_learning(candidate.class_id,candidate.student_id,candidate.date,candidate.topic_id,actor);
 opened:=public.get_makeup_learning(created->>'token');
 IF opened ? 'answer_key' OR jsonb_array_length(opened->'questions')<>10 THEN RAISE EXCEPTION 'Public payload failed'; END IF;
 SELECT answer_key INTO answers FROM public.makeup_learning WHERE id=(created->>'id')::uuid;
 obj:=(opened->>'upload_prefix')||'/smoke-only.jpg';
 INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('makeup-notebooks',obj,'{"mimetype":"image/jpeg","size":100}');
 result:=public.submit_makeup_learning(created->>'token',answers,jsonb_build_array(obj));
 IF result->>'completed'<>'true' OR (result->>'score')::integer<>10 THEN RAISE EXCEPTION 'Grading failed'; END IF;
 result:=public.submit_makeup_learning(created->>'token',answers,jsonb_build_array(obj));
 SELECT count(*) INTO n FROM public.daily_tasks WHERE source_key='makeup_notebook:'||(created->>'id');
 IF n<>1 OR (result->>'attempts')::integer<>1 THEN RAISE EXCEPTION 'Idempotency/task creation failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.attendance WHERE class_id=candidate.class_id AND student_id=candidate.student_id AND date=candidate.date AND status='makeup')
 THEN RAISE EXCEPTION 'Attendance conversion failed'; END IF;
 PERFORM set_config('makeup.smoke','PASS: 10 questions, private payload, grading, attendance, one task, idempotent; all rolled back',true);
END;$$;
SELECT current_setting('makeup.smoke',true) AS smoke_result;
ROLLBACK;
