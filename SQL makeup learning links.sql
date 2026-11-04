BEGIN;

CREATE TABLE IF NOT EXISTS public.makeup_learning (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_id uuid NOT NULL REFERENCES public.classes(id),
 student_id uuid NOT NULL REFERENCES public.users(id),
 study_date date NOT NULL, schedule_id integer,
 topic_id uuid NOT NULL REFERENCES public.topics(id),
 reviewer_id uuid NOT NULL REFERENCES public.users(id),
 token_hash text NOT NULL UNIQUE,
 upload_prefix text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '14 days',
 revoked_at timestamptz, submitted_at timestamptz,
 questions jsonb NOT NULL, answer_key jsonb NOT NULL,
 draft_answers jsonb NOT NULL DEFAULT '{}', answers jsonb,
 notebook_paths jsonb NOT NULL DEFAULT '[]',
 score integer CHECK(score BETWEEN 0 AND 10),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 completed_at timestamptz, created_by uuid REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(class_id,student_id,study_date)
);
ALTER TABLE public.makeup_learning ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.makeup_learning FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_makeup(p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND public.has_app_permission('class.attendance.update')
 AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.role::text IN('admin','teacher','assistant')
 AND (u.role::text='admin' OR EXISTS(SELECT 1 FROM public.class_teachers ct WHERE ct.class_id=p_class AND ct.teacher_id=u.id)));
$$;

CREATE OR REPLACE FUNCTION public.makeup_class_data(p_class uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_makeup(p_class) THEN RAISE EXCEPTION 'Không có quyền quản lý học bù lớp này'; END IF;
 RETURN jsonb_build_object(
 'absences',(SELECT coalesce(jsonb_agg(x ORDER BY x.study_date DESC,x.student_name),'[]') FROM (
  SELECT a.student_id,u.full_name AS student_name,a.date AS study_date,a.schedule_id
  FROM public.attendance a JOIN public.users u ON u.id=a.student_id
  WHERE a.class_id=p_class AND a.status='absent' AND a.date<=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  AND EXISTS(SELECT 1 FROM public.class_students cs WHERE cs.class_id=p_class AND cs.student_id=a.student_id
    AND a.date>=(cs.joined_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    AND (cs.left_at IS NULL OR a.date<=(cs.left_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))
 )x),
 'topics',(SELECT coalesce(jsonb_agg(x ORDER BY x.name),'[]') FROM (
  SELECT t.id,t.name FROM public.topics t JOIN public.classes c ON c.subject_id=t.subject_id WHERE c.id=p_class
 )x),
 'reviewers',(SELECT coalesce(jsonb_agg(x),'[]') FROM (
  SELECT DISTINCT u.id,u.full_name FROM public.users u JOIN public.class_teachers ct ON ct.teacher_id=u.id
  WHERE ct.class_id=p_class AND u.role::text IN('admin','teacher','assistant')
  UNION SELECT u.id,u.full_name FROM public.users u WHERE u.id=auth.uid() AND u.role::text='admin'
 )x),
 'assignments',(SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC),'[]') FROM (
  SELECT m.id,m.student_id,u.full_name AS student_name,m.study_date,m.score,m.attempts,m.completed_at,
   m.expires_at,m.revoked_at,m.submitted_at,m.created_at,m.notebook_paths,m.draft_answers,m.answers,m.questions
  FROM public.makeup_learning m JOIN public.users u ON u.id=m.student_id WHERE m.class_id=p_class
 )x));
END;$$;

CREATE OR REPLACE FUNCTION public.create_makeup_learning(p_class uuid,p_student uuid,p_date date,p_topic uuid,p_reviewer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE a public.attendance;qs jsonb;key jsonb;token text:=encode(gen_random_bytes(32),'hex');mid uuid;
BEGIN
 IF NOT public.can_manage_makeup(p_class) THEN RAISE EXCEPTION 'Không có quyền giao học bù lớp này'; END IF;
 SELECT * INTO a FROM public.attendance WHERE class_id=p_class AND student_id=p_student AND date=p_date FOR UPDATE;
 IF NOT FOUND OR a.status<>'absent' OR p_date>(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
 THEN RAISE EXCEPTION 'Chỉ giao học bù cho buổi đã điểm danh Vắng'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.class_students cs WHERE cs.class_id=p_class AND cs.student_id=p_student
   AND p_date>=(cs.joined_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
   AND (cs.left_at IS NULL OR p_date<=(cs.left_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))
 THEN RAISE EXCEPTION 'Học sinh không tham gia lớp tại ngày đã chọn'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.topics t JOIN public.classes c ON c.subject_id=t.subject_id WHERE c.id=p_class AND t.id=p_topic)
 THEN RAISE EXCEPTION 'Chủ đề không thuộc môn của lớp'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_reviewer AND u.role::text IN('admin','teacher','assistant')
   AND (EXISTS(SELECT 1 FROM public.class_teachers ct WHERE ct.class_id=p_class AND ct.teacher_id=u.id)
    OR (u.id=auth.uid() AND u.role::text='admin')))
 THEN RAISE EXCEPTION 'Chọn giáo viên/trợ giảng phụ trách lớp'; END IF;
 IF EXISTS(SELECT 1 FROM public.makeup_learning WHERE class_id=p_class AND student_id=p_student AND study_date=p_date)
 THEN RAISE EXCEPTION 'Buổi này đã có bài học bù. Dùng nút Cấp lại link'; END IF;
 -- Snapshot questions and keys together, so later bank edits cannot change this test.
 SELECT jsonb_agg(jsonb_build_object('id',id,'text',question_text,'answer_count',answer_count,'image',question_img)),
  jsonb_object_agg(id::text,upper(trim(answer))) INTO qs,key
 FROM (SELECT * FROM public.question_bank WHERE topic_id=p_topic AND NOT coalesce(hidden,false)
  AND question_type::text='multi_choice' AND coalesce(answer_status,'reviewed')='reviewed'
  AND coalesce(word_import_review_status,'approved')='approved'
  AND upper(trim(answer)) ~ '^[A-F]$' AND answer_count BETWEEN 2 AND 6
  AND ascii(upper(trim(answer)))-64<=answer_count
  ORDER BY random() LIMIT 10)q;
 IF coalesce(jsonb_array_length(qs),0)<>10 THEN RAISE EXCEPTION 'Chủ đề chưa đủ 10 câu trắc nghiệm một đáp án đã kiểm duyệt'; END IF;
 INSERT INTO public.makeup_learning(class_id,student_id,study_date,schedule_id,topic_id,reviewer_id,token_hash,questions,answer_key,created_by)
 VALUES(p_class,p_student,p_date,a.schedule_id,p_topic,p_reviewer,encode(digest(token,'sha256'),'hex'),qs,key,auth.uid()) RETURNING id INTO mid;
 RETURN jsonb_build_object('id',mid,'token',token);
END;$$;

CREATE OR REPLACE FUNCTION public.control_makeup_link(p_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE m public.makeup_learning;token text;
BEGIN
 SELECT * INTO m FROM public.makeup_learning WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT public.can_manage_makeup(m.class_id) THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 IF p_action='revoke' THEN UPDATE public.makeup_learning SET revoked_at=now() WHERE id=p_id;RETURN '{}'::jsonb; END IF;
 IF p_action<>'renew' OR m.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Không thể cấp lại bài đã hoàn thành'; END IF;
 token:=encode(gen_random_bytes(32),'hex');
 UPDATE public.makeup_learning SET token_hash=encode(digest(token,'sha256'),'hex'),expires_at=now()+interval '14 days',revoked_at=NULL WHERE id=p_id;
 RETURN jsonb_build_object('token',token);
END;$$;

CREATE OR REPLACE FUNCTION public.get_makeup_learning(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE m public.makeup_learning;
BEGIN
 IF length(p_token)<>64 THEN RAISE EXCEPTION 'Link không hợp lệ hoặc đã hết hạn'; END IF;
 SELECT * INTO m FROM public.makeup_learning WHERE token_hash=encode(digest(p_token,'sha256'),'hex') AND revoked_at IS NULL AND expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Link không hợp lệ hoặc đã hết hạn'; END IF;
 RETURN jsonb_build_object('id',m.id,'student_name',(SELECT full_name FROM public.users WHERE id=m.student_id),
  'class_name',(SELECT class_name FROM public.classes WHERE id=m.class_id),'study_date',m.study_date,
  'questions',m.questions,'draft_answers',m.draft_answers,'score',m.score,'attempts',m.attempts,
  'completed',m.completed_at IS NOT NULL,'submitted',m.submitted_at IS NOT NULL,
  'upload_prefix',m.upload_prefix,'expires_at',m.expires_at);
END;$$;

CREATE OR REPLACE FUNCTION public.save_makeup_draft(p_token text,p_answers jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF jsonb_typeof(p_answers)<>'object' OR octet_length(p_answers::text)>4096 THEN RAISE EXCEPTION 'Bài làm không hợp lệ'; END IF;
 UPDATE public.makeup_learning SET draft_answers=p_answers WHERE token_hash=encode(digest(p_token,'sha256'),'hex')
 AND revoked_at IS NULL AND expires_at>now() AND completed_at IS NULL AND attempts<3;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không thể lưu bài: link đã đóng hoặc hết lượt'; END IF;
END;$$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('makeup-notebooks','makeup-notebooks',false,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO NOTHING;

-- The bearer token is checked from the request header; it never appears in object names.
CREATE OR REPLACE FUNCTION public.can_upload_makeup(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.makeup_learning m WHERE m.upload_prefix=split_part(p_name,'/',1)
 AND m.token_hash=encode(digest(coalesce(current_setting('request.headers',true),'{}')::jsonb->>'x-makeup-token','sha256'),'hex')
 AND m.expires_at>now() AND m.revoked_at IS NULL AND m.completed_at IS NULL AND m.attempts<3
 AND (SELECT count(*) FROM storage.objects o WHERE o.bucket_id='makeup-notebooks' AND split_part(o.name,'/',1)=m.upload_prefix)<15);
$$;
DROP POLICY IF EXISTS makeup_notebook_upload ON storage.objects;
CREATE POLICY makeup_notebook_upload ON storage.objects FOR INSERT TO anon,authenticated
WITH CHECK(bucket_id='makeup-notebooks' AND public.can_upload_makeup(name));
-- Storage policy subqueries must not grant clients access to answer keys.
CREATE OR REPLACE FUNCTION public.can_read_makeup_photo(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.makeup_learning m WHERE m.upload_prefix=split_part(p_name,'/',1) AND public.can_manage_makeup(m.class_id));
$$;
DROP POLICY IF EXISTS makeup_notebook_read ON storage.objects;
CREATE POLICY makeup_notebook_read ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='makeup-notebooks' AND public.can_read_makeup_photo(name));
-- Restrictive policies keep legacy broad storage policies from opening this private bucket.
DROP POLICY IF EXISTS makeup_notebook_read_guard ON storage.objects;
CREATE POLICY makeup_notebook_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING(bucket_id<>'makeup-notebooks' OR public.can_read_makeup_photo(name));
DROP POLICY IF EXISTS makeup_notebook_upload_guard ON storage.objects;
CREATE POLICY makeup_notebook_upload_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
WITH CHECK(bucket_id<>'makeup-notebooks' OR public.can_upload_makeup(name));
DROP POLICY IF EXISTS makeup_notebook_update_guard ON storage.objects;
CREATE POLICY makeup_notebook_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
USING(bucket_id<>'makeup-notebooks') WITH CHECK(bucket_id<>'makeup-notebooks');
DROP POLICY IF EXISTS makeup_notebook_delete_guard ON storage.objects;
CREATE POLICY makeup_notebook_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
USING(bucket_id<>'makeup-notebooks');

CREATE OR REPLACE FUNCTION public.submit_makeup_learning(p_token text,p_answers jsonb,p_paths jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE m public.makeup_learning;q jsonb;points integer:=0;path text;v_task uuid;v_student text;
BEGIN
 SELECT * INTO m FROM public.makeup_learning WHERE token_hash=encode(digest(p_token,'sha256'),'hex') AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Link không hợp lệ hoặc đã hết hạn'; END IF;
 IF m.completed_at IS NOT NULL THEN RETURN jsonb_build_object('score',m.score,'completed',true,'attempts',m.attempts); END IF;
 -- Same submission is idempotent even when a failing result is retried after a network error.
 IF m.submitted_at IS NOT NULL AND m.answers=p_answers AND m.notebook_paths=p_paths
 THEN RETURN jsonb_build_object('score',m.score,'completed',false,'attempts',m.attempts); END IF;
 IF m.attempts>=3 THEN RAISE EXCEPTION 'Đã hết 3 lượt làm bài. Hãy liên hệ giáo viên'; END IF;
 IF p_answers IS NULL OR p_paths IS NULL OR jsonb_typeof(p_answers)<>'object' OR jsonb_typeof(p_paths)<>'array'
 OR coalesce(jsonb_array_length(p_paths),0) NOT BETWEEN 1 AND 5 OR octet_length(p_answers::text)>4096
 THEN RAISE EXCEPTION 'Cần nộp ảnh vở và trả lời đủ 10 câu'; END IF;
 FOR path IN SELECT jsonb_array_elements_text(p_paths) LOOP
  IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='makeup-notebooks' AND o.name=path
    AND split_part(o.name,'/',1)=m.upload_prefix AND o.metadata->>'mimetype' IN('image/jpeg','image/png','image/webp'))
  THEN RAISE EXCEPTION 'Ảnh vở chưa tải lên thành công hoặc không thuộc bài này'; END IF;
 END LOOP;
 FOR q IN SELECT value FROM jsonb_array_elements(m.questions) LOOP
  IF NOT coalesce(p_answers->>(q->>'id'),'') ~ '^[A-F]$'
   OR ascii(p_answers->>(q->>'id'))-64>(q->>'answer_count')::integer THEN RAISE EXCEPTION 'Cần trả lời đủ 10 câu'; END IF;
  IF p_answers->>(q->>'id')=m.answer_key->>(q->>'id') THEN points:=points+1; END IF;
 END LOOP;
 UPDATE public.makeup_learning SET answers=p_answers,draft_answers=p_answers,notebook_paths=p_paths,score=points,
  attempts=attempts+1,submitted_at=now() WHERE id=m.id;
 IF points>=7 THEN
  -- Never overwrite a teacher's subsequent present/trial correction or a different schedule.
  UPDATE public.attendance SET status='makeup',status_overridden=true
  WHERE class_id=m.class_id AND student_id=m.student_id AND date=m.study_date AND status='absent'
    AND schedule_id IS NOT DISTINCT FROM m.schedule_id;
  IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.attendance WHERE class_id=m.class_id AND student_id=m.student_id
    AND date=m.study_date AND status='makeup' AND schedule_id IS NOT DISTINCT FROM m.schedule_id)
  THEN RAISE EXCEPTION 'Điểm danh buổi này đã thay đổi. Hãy liên hệ giáo viên để kiểm tra'; END IF;
  UPDATE public.makeup_learning SET completed_at=now() WHERE id=m.id;
  SELECT full_name INTO v_student FROM public.users WHERE id=m.student_id;
  v_task:=public.upsert_generated_task(m.reviewer_id,'makeup_notebook:'||m.id,
   'Kiểm tra vở học bù: '||v_student,'Buổi '||to_char(m.study_date,'DD/MM/YYYY')||'. Điểm test: '||points||'/10. Điểm danh đã chuyển Học bù.',
   'makeup_notebook','makeup_learning',m.id::text,'normal',(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
   NULL,'class.html?openClassId='||m.class_id||'&makeup='||m.id,'manual',jsonb_build_object('class_id',m.class_id,'makeup_id',m.id));
 END IF;
 RETURN jsonb_build_object('score',points,'completed',points>=7,'attempts',m.attempts+1);
END;$$;

REVOKE ALL ON FUNCTION public.can_manage_makeup(uuid),public.makeup_class_data(uuid),public.create_makeup_learning(uuid,uuid,date,uuid,uuid),
 public.control_makeup_link(uuid,text),public.get_makeup_learning(text),public.save_makeup_draft(text,jsonb),
 public.submit_makeup_learning(text,jsonb,jsonb),public.can_upload_makeup(text),public.can_read_makeup_photo(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_makeup(uuid),public.makeup_class_data(uuid),public.create_makeup_learning(uuid,uuid,date,uuid,uuid),
 public.control_makeup_link(uuid,text),public.can_read_makeup_photo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_makeup_learning(text),public.save_makeup_draft(text,jsonb),public.submit_makeup_learning(text,jsonb,jsonb),public.can_upload_makeup(text),public.can_read_makeup_photo(text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
