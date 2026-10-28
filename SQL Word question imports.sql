BEGIN;
CREATE TABLE IF NOT EXISTS public.word_question_imports (
 id uuid PRIMARY KEY, requested_by uuid NOT NULL REFERENCES public.users(id),
 topic_id uuid NOT NULL REFERENCES public.topics(id), file_name text NOT NULL,
 source_path text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'queued'
 CHECK(status IN ('queued','processing','paused','completed','failed','cancelled')),
 token uuid, locked_until timestamptz, progress jsonb NOT NULL DEFAULT '{}', error_message text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.word_question_import_items (
 job_id uuid NOT NULL REFERENCES public.word_question_imports(id), ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 5000),
 payload jsonb NOT NULL, warnings jsonb NOT NULL DEFAULT '[]',
 review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','needs_attention','approved','rejected')),
 linked_question_id text, reviewed_by uuid REFERENCES public.users(id), reviewed_at timestamptz,
 PRIMARY KEY(job_id,ordinal)
);
CREATE TABLE IF NOT EXISTS public.word_question_worker_state (
 id integer PRIMARY KEY CHECK(id=1), last_seen timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.word_question_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_question_import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_question_worker_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.word_question_imports,public.word_question_import_items,public.word_question_worker_state FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.can_manage_word_import(p_job uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND public.has_app_permission('question.import') AND EXISTS(
 SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.role::text IN('admin','teacher','assistant')
 AND (p_job IS NULL OR EXISTS(SELECT 1 FROM public.word_question_imports j WHERE j.id=p_job AND (j.requested_by=u.id OR u.role::text='admin'))));
$$;
GRANT SELECT ON public.word_question_imports,public.word_question_import_items,public.word_question_worker_state TO authenticated;
DROP POLICY IF EXISTS word_import_read ON public.word_question_imports;
DROP POLICY IF EXISTS word_import_item_read ON public.word_question_import_items;
DROP POLICY IF EXISTS word_import_worker_read ON public.word_question_worker_state;
CREATE POLICY word_import_read ON public.word_question_imports FOR SELECT TO authenticated USING(public.can_manage_word_import(id));
CREATE POLICY word_import_item_read ON public.word_question_import_items FOR SELECT TO authenticated USING(public.can_manage_word_import(job_id));
CREATE POLICY word_import_worker_read ON public.word_question_worker_state FOR SELECT TO authenticated USING(public.can_manage_word_import());

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('word-question-sources','word-question-sources',false,20971520,ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
 ('word-question-media','word-question-media',true,4194304,ARRAY['image/png']) ON CONFLICT(id) DO NOTHING;
DROP POLICY IF EXISTS word_import_source_upload ON storage.objects;
DROP POLICY IF EXISTS word_import_source_read ON storage.objects;
CREATE POLICY word_import_source_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(
 bucket_id='word-question-sources' AND (storage.foldername(name))[1]=auth.uid()::text
 AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/source\.docx$' AND public.can_manage_word_import());
CREATE POLICY word_import_source_read ON storage.objects FOR SELECT TO authenticated USING(
 bucket_id='word-question-sources' AND ((storage.foldername(name))[1]=auth.uid()::text AND public.can_manage_word_import()
 OR EXISTS(SELECT 1 FROM public.word_question_imports j WHERE j.source_path=name AND public.can_manage_word_import(j.id))));
-- Guard these buckets even if an older application policy broadly allows storage access.
DROP POLICY IF EXISTS word_import_private_source_guard ON storage.objects;
DROP POLICY IF EXISTS word_import_no_client_update ON storage.objects;
DROP POLICY IF EXISTS word_import_no_client_delete ON storage.objects;
DROP POLICY IF EXISTS word_import_no_client_media_insert ON storage.objects;
DROP POLICY IF EXISTS word_import_source_insert_guard ON storage.objects;
DROP POLICY IF EXISTS word_import_no_anon_source ON storage.objects;
CREATE POLICY word_import_private_source_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(
 bucket_id<>'word-question-sources' OR ((storage.foldername(name))[1]=auth.uid()::text AND public.can_manage_word_import())
 OR EXISTS(SELECT 1 FROM public.word_question_imports j WHERE j.source_path=name AND public.can_manage_word_import(j.id)));
CREATE POLICY word_import_no_client_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id NOT IN('word-question-sources','word-question-media'));
CREATE POLICY word_import_no_client_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id NOT IN('word-question-sources','word-question-media'));
CREATE POLICY word_import_no_client_media_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'word-question-media');
CREATE POLICY word_import_source_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'word-question-sources' OR (
 (storage.foldername(name))[1]=auth.uid()::text AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/source\.docx$' AND public.can_manage_word_import()));
CREATE POLICY word_import_no_anon_source ON storage.objects AS RESTRICTIVE FOR ALL TO anon USING(bucket_id<>'word-question-sources') WITH CHECK(bucket_id<>'word-question-sources');

CREATE OR REPLACE FUNCTION public.enqueue_word_question_import(p_id uuid,p_topic uuid,p_file_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE path text:=auth.uid()::text||'/'||p_id||'/source.docx';
BEGIN
 IF NOT public.can_manage_word_import() THEN RAISE EXCEPTION 'Không có quyền nhập Word'; END IF;
 IF length(p_file_name)>200 OR p_file_name !~* '\.docx$' THEN RAISE EXCEPTION 'Chỉ hỗ trợ DOCX'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='word-question-sources' AND name=path) THEN RAISE EXCEPTION 'Chưa tải xong file Word'; END IF;
 IF (SELECT count(*) FROM public.word_question_imports WHERE requested_by=auth.uid() AND status IN('queued','processing','paused'))>=5 THEN RAISE EXCEPTION 'Tối đa 5 file đang chờ xử lý'; END IF;
 INSERT INTO public.word_question_imports(id,requested_by,topic_id,file_name,source_path) VALUES(p_id,auth.uid(),p_topic,p_file_name,path);
 RETURN p_id;
END;$$;
CREATE OR REPLACE FUNCTION public.control_word_question_import(p_id uuid,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_manage_word_import(p_id) THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 IF p_action NOT IN('pause','resume','cancel') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 UPDATE public.word_question_imports SET status=CASE p_action WHEN 'pause' THEN 'paused' WHEN 'resume' THEN 'queued' ELSE 'cancelled' END,
 token=NULL,locked_until=NULL,updated_at=now(),error_message=NULL WHERE id=p_id AND
 ((p_action='pause' AND status IN('queued','processing')) OR (p_action='resume' AND status IN('paused','failed')) OR (p_action='cancel' AND status NOT IN('completed','cancelled')));
END;$$;
CREATE OR REPLACE FUNCTION public.claim_word_question_import()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.word_question_imports;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 INSERT INTO public.word_question_worker_state(id,last_seen) VALUES(1,now()) ON CONFLICT(id) DO UPDATE SET last_seen=now();
 PERFORM pg_advisory_xact_lock(hashtextextended('word-question-worker',0));
 IF EXISTS(SELECT 1 FROM public.word_question_imports WHERE status='processing' AND locked_until>now()) THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.word_question_imports WHERE status='queued' OR (status='processing' AND locked_until<now()) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.word_question_imports SET status='processing',token=gen_random_uuid(),locked_until=now()+interval '3 minutes',updated_at=now(),error_message=NULL WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j);
END;$$;
CREATE OR REPLACE FUNCTION public.word_question_import_cycle(p_id uuid,p_token uuid,p_items jsonb DEFAULT '[]',p_progress jsonb DEFAULT '{}',p_status text DEFAULT 'processing',p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF p_status NOT IN('processing','completed','failed') OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)>10 OR octet_length(p_items::text)>1500000 THEN RAISE EXCEPTION 'Invalid batch'; END IF;
 PERFORM 1 FROM public.word_question_imports WHERE id=p_id AND token=p_token AND status='processing' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(item->'payload')<>'object' OR length(item->'payload'->>'question_text')>200000 THEN RAISE EXCEPTION 'Invalid question'; END IF;
  INSERT INTO public.word_question_import_items(job_id,ordinal,payload,warnings,review_status)
   VALUES(p_id,(item->>'ordinal')::integer,item->'payload',coalesce(item->'warnings','[]'),CASE WHEN coalesce((item->>'needs_attention')::boolean,false) THEN 'needs_attention' ELSE 'pending' END)
   ON CONFLICT(job_id,ordinal) DO NOTHING;
 END LOOP;
 UPDATE public.word_question_imports SET progress=p_progress,status=p_status,error_message=left(p_error,500),updated_at=now(),locked_until=now()+interval '3 minutes' WHERE id=p_id;
 UPDATE public.word_question_worker_state SET last_seen=now() WHERE id=1;
 RETURN true;
END;$$;
CREATE OR REPLACE FUNCTION public.word_question_import_lease(p_id uuid,p_token uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.role()='service_role' AND EXISTS(SELECT 1 FROM public.word_question_imports WHERE id=p_id AND token=p_token AND status='processing' AND locked_until>now());
$$;
CREATE OR REPLACE FUNCTION public.review_word_question_import(p_job uuid,p_ordinal integer,p_payload jsonb,p_approve boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.word_question_imports;i public.word_question_import_items;qid public.question_bank.id%TYPE;typ text;ans text;
BEGIN
 IF NOT public.can_manage_word_import(p_job) OR NOT public.has_app_permission('question.create') THEN RAISE EXCEPTION 'Không có quyền duyệt'; END IF;
 SELECT * INTO j FROM public.word_question_imports WHERE id=p_job;
 SELECT * INTO i FROM public.word_question_import_items WHERE job_id=p_job AND ordinal=p_ordinal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy câu hỏi'; END IF;
 IF i.review_status='approved' THEN RETURN i.linked_question_id; END IF;
 IF p_approve THEN
  typ:=p_payload->>'question_type';ans:=nullif(trim(p_payload->>'answer'),'');
  IF typ NOT IN('multi_choice','true_false','short_answer','essay') OR coalesce(length(trim(p_payload->>'question_text')),0) NOT BETWEEN 1 AND 200000 THEN RAISE EXCEPTION 'Nội dung không hợp lệ'; END IF;
  IF typ<>'essay' AND ans IS NULL THEN RAISE EXCEPTION 'Cần bổ sung đáp án trước khi duyệt'; END IF;
  IF (p_payload->>'question_text') ~ 'WORDBLOCK[0-9]+TOKEN|\[CÔNG THỨC LỖI\]|\[HÌNH ẢNH LỖI\]' THEN RAISE EXCEPTION 'Cần sửa nội dung lỗi trước khi duyệt'; END IF;
  INSERT INTO public.question_bank(topic_id,question_type,difficulty,question_text,answer_text,answer,answer_count,answer_status,created_by,hidden)
   VALUES(j.topic_id,typ::public.question_type,coalesce((p_payload->>'difficulty')::integer,5),p_payload->>'question_text',p_payload->>'answer_text',ans,
    greatest(1,least(6,coalesce((p_payload->>'answer_count')::integer,1))),CASE WHEN ans IS NULL AND typ<>'essay' THEN 'missing' ELSE 'reviewed' END,j.requested_by,false) RETURNING id INTO qid;
 END IF;
 UPDATE public.word_question_import_items SET payload=p_payload,review_status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
  linked_question_id=qid::text,reviewed_by=auth.uid(),reviewed_at=now() WHERE job_id=p_job AND ordinal=p_ordinal;
 RETURN qid::text;
END;$$;
REVOKE ALL ON FUNCTION public.claim_word_question_import(),public.word_question_import_cycle(uuid,uuid,jsonb,jsonb,text,text),public.word_question_import_lease(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_word_question_import(),public.word_question_import_cycle(uuid,uuid,jsonb,jsonb,text,text),public.word_question_import_lease(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.can_manage_word_import(uuid),public.enqueue_word_question_import(uuid,uuid,text),public.control_word_question_import(uuid,text),public.review_word_question_import(uuid,integer,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_word_import(uuid),public.enqueue_word_question_import(uuid,uuid,text),public.control_word_question_import(uuid,text),public.review_word_question_import(uuid,integer,jsonb,boolean) TO authenticated;
COMMIT;
