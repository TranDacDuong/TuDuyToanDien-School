BEGIN;
ALTER TABLE public.question_bank
 ADD COLUMN IF NOT EXISTS word_import_job_id uuid REFERENCES public.word_question_imports(id),
 ADD COLUMN IF NOT EXISTS word_import_ordinal integer,
 ADD COLUMN IF NOT EXISTS word_import_review_status text CHECK(word_import_review_status IN('pending','needs_attention','approved','rejected'));
CREATE UNIQUE INDEX IF NOT EXISTS question_bank_word_import_source ON public.question_bank(word_import_job_id,word_import_ordinal);

CREATE OR REPLACE FUNCTION public.publish_word_question_import_item(p_job uuid,p_ordinal integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.word_question_imports; i public.word_question_import_items; qid public.question_bank.id%TYPE; typ text; ans text;
BEGIN
 SELECT * INTO j FROM public.word_question_imports WHERE id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đợt nhập'; END IF;
 SELECT * INTO i FROM public.word_question_import_items WHERE job_id=p_job AND ordinal=p_ordinal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy câu hỏi'; END IF;
 IF i.linked_question_id IS NOT NULL OR i.review_status NOT IN('pending','needs_attention') THEN RETURN i.linked_question_id; END IF;
 IF NOT public.has_app_permission('question.create',j.requested_by) OR NOT public.has_app_permission('question.import',j.requested_by)
  OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=j.requested_by AND role::text IN('admin','teacher','assistant')) THEN RETURN NULL; END IF;
 typ:=i.payload->>'question_type'; ans:=nullif(trim(i.payload->>'answer'),'');
 IF typ IS NULL OR typ NOT IN('multi_choice','true_false','short_answer','essay')
  OR coalesce(length(trim(i.payload->>'question_text')),0) NOT BETWEEN 1 AND 200000 THEN RAISE EXCEPTION 'Nội dung câu hỏi nhập Word không hợp lệ'; END IF;
 INSERT INTO public.question_bank(topic_id,question_type,difficulty,question_text,answer_text,answer,answer_count,answer_status,created_by,hidden,
  word_import_job_id,word_import_ordinal,word_import_review_status)
 VALUES(j.topic_id,typ::public.question_type,greatest(1,least(10,coalesce((i.payload->>'difficulty')::integer,5))),i.payload->>'question_text',i.payload->>'answer_text',ans,
  greatest(1,least(6,coalesce((i.payload->>'answer_count')::integer,1))),CASE WHEN ans IS NULL AND typ<>'essay' THEN 'missing' ELSE 'reviewed' END,j.requested_by,false,
  p_job,p_ordinal,i.review_status)
 ON CONFLICT(word_import_job_id,word_import_ordinal) DO NOTHING RETURNING id INTO qid;
 IF qid IS NULL THEN SELECT id INTO qid FROM public.question_bank WHERE word_import_job_id=p_job AND word_import_ordinal=p_ordinal; END IF;
 UPDATE public.word_question_import_items SET linked_question_id=qid::text WHERE job_id=p_job AND ordinal=p_ordinal;
 RETURN qid::text;
END;$$;
REVOKE ALL ON FUNCTION public.publish_word_question_import_item(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_word_question_import_item(uuid,integer) TO service_role;

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
  PERFORM public.publish_word_question_import_item(p_id,(item->>'ordinal')::integer);
 END LOOP;
 UPDATE public.word_question_imports SET progress=p_progress,status=p_status,error_message=left(p_error,500),updated_at=now(),locked_until=now()+interval '3 minutes' WHERE id=p_id;
 UPDATE public.word_question_worker_state SET last_seen=now() WHERE id=1;
 RETURN true;
END;$$;

CREATE OR REPLACE FUNCTION public.review_word_question_import(p_job uuid,p_ordinal integer,p_payload jsonb,p_approve boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.word_question_imports; i public.word_question_import_items; qid public.question_bank.id%TYPE; typ text; ans text;
BEGIN
 IF NOT public.can_manage_word_import(p_job) OR NOT public.has_app_permission('question.create') THEN RAISE EXCEPTION 'Không có quyền duyệt'; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Cần chọn thao tác kiểm duyệt'; END IF;
 SELECT * INTO j FROM public.word_question_imports WHERE id=p_job;
 SELECT * INTO i FROM public.word_question_import_items WHERE job_id=p_job AND ordinal=p_ordinal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy câu hỏi'; END IF;
 IF i.review_status='approved' THEN RETURN i.linked_question_id; END IF;
 IF i.linked_question_id IS NOT NULL THEN
  SELECT id INTO qid FROM public.question_bank WHERE id::text=i.linked_question_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Câu hỏi đã bị xóa khỏi ngân hàng'; END IF;
  IF p_approve AND NOT public.has_app_permission('question.update') THEN RAISE EXCEPTION 'Không có quyền sửa câu hỏi'; END IF;
  IF NOT p_approve AND NOT public.has_app_permission('question.archive') THEN RAISE EXCEPTION 'Không có quyền ẩn câu hỏi'; END IF;
 END IF;
 IF p_approve THEN
  typ:=p_payload->>'question_type'; ans:=nullif(trim(p_payload->>'answer'),'');
  IF typ IS NULL OR typ NOT IN('multi_choice','true_false','short_answer','essay') OR coalesce(length(trim(p_payload->>'question_text')),0) NOT BETWEEN 1 AND 200000 THEN RAISE EXCEPTION 'Nội dung không hợp lệ'; END IF;
  IF typ<>'essay' AND ans IS NULL THEN RAISE EXCEPTION 'Cần bổ sung đáp án trước khi duyệt'; END IF;
  IF (p_payload->>'question_text') ~ 'WORDBLOCK[0-9]+TOKEN|\[CÔNG THỨC LỖI\]|\[HÌNH ẢNH LỖI\]' THEN RAISE EXCEPTION 'Cần sửa nội dung lỗi trước khi duyệt'; END IF;
  IF qid IS NULL THEN
   INSERT INTO public.question_bank(topic_id,question_type,difficulty,question_text,answer_text,answer,answer_count,answer_status,created_by,hidden,word_import_job_id,word_import_ordinal,word_import_review_status)
    VALUES(j.topic_id,typ::public.question_type,coalesce((p_payload->>'difficulty')::integer,5),p_payload->>'question_text',p_payload->>'answer_text',ans,
     greatest(1,least(6,coalesce((p_payload->>'answer_count')::integer,1))),'reviewed',j.requested_by,false,p_job,p_ordinal,'approved') RETURNING id INTO qid;
  ELSE
   UPDATE public.question_bank SET question_type=typ::public.question_type,difficulty=coalesce((p_payload->>'difficulty')::integer,5),
    question_text=p_payload->>'question_text',answer_text=p_payload->>'answer_text',answer=ans,
    answer_count=greatest(1,least(6,coalesce((p_payload->>'answer_count')::integer,1))),answer_status='reviewed',word_import_review_status='approved' WHERE id=qid;
  END IF;
 ELSIF qid IS NOT NULL THEN
  UPDATE public.question_bank SET hidden=true,word_import_review_status='rejected' WHERE id=qid;
 END IF;
 UPDATE public.word_question_import_items SET payload=p_payload,review_status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
  linked_question_id=qid::text,reviewed_by=auth.uid(),reviewed_at=now() WHERE job_id=p_job AND ordinal=p_ordinal;
 RETURN qid::text;
END;$$;

-- Keep published IDs, and make previously staged questions usable without re-uploading their files.
UPDATE public.question_bank q SET word_import_job_id=i.job_id,word_import_ordinal=i.ordinal,word_import_review_status=i.review_status
 FROM public.word_question_import_items i WHERE i.linked_question_id=q.id::text AND q.word_import_job_id IS NULL;
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT job_id,ordinal FROM public.word_question_import_items
  WHERE linked_question_id IS NULL AND review_status IN('pending','needs_attention') ORDER BY job_id,ordinal
 LOOP PERFORM public.publish_word_question_import_item(item.job_id,item.ordinal); END LOOP;
END;$$;
NOTIFY pgrst,'reload schema';
COMMIT;
