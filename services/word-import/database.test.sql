-- Run as postgres in SQL Editor. Everything, including the approved test question, is rolled back.
BEGIN;
DO $$
DECLARE actor uuid;topic uuid;job uuid:=gen_random_uuid();claimed jsonb;lease uuid;old_lease uuid;
 question_id text;before_count integer;after_count integer;batch jsonb;
BEGIN
 SELECT id INTO actor FROM public.users WHERE role::text='admin' LIMIT 1;
 SELECT id INTO topic FROM public.topics LIMIT 1;
 IF actor IS NULL OR topic IS NULL THEN RAISE EXCEPTION 'Missing admin/topic fixture'; END IF;
 SELECT count(*) INTO before_count FROM public.question_bank;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 INSERT INTO storage.objects(bucket_id,name) VALUES('word-question-sources',actor||'/'||job||'/source.docx');
 PERFORM public.enqueue_word_question_import(job,topic,'word-import-rollback-test.docx');
 UPDATE public.word_question_imports SET created_at='1900-01-01' WHERE id=job;
 IF has_function_privilege('anon','public.claim_word_question_import()','EXECUTE') THEN RAISE EXCEPTION 'Worker RPC accessible to anonymous'; END IF;
 IF has_table_privilege('authenticated','public.word_question_import_items','INSERT') THEN RAISE EXCEPTION 'Client can forge worker drafts'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 claimed:=public.claim_word_question_import();
 IF claimed->>'id'<>job::text THEN RAISE EXCEPTION 'Unexpected claimed job'; END IF;
 lease:=(claimed->>'token')::uuid;
 batch:=jsonb_build_array(jsonb_build_object('ordinal',1,'payload',jsonb_build_object('question_type','short_answer','question_text','WORD IMPORT TRANSACTION TEST','answer','1','answer_count',1,'difficulty',5),'warnings','[]'::jsonb));
 IF NOT public.word_question_import_cycle(job,lease,batch) THEN RAISE EXCEPTION 'Batch refused'; END IF;
 PERFORM public.word_question_import_cycle(job,lease,batch);
 IF (SELECT count(*) FROM public.word_question_import_items WHERE job_id=job)<>1 THEN RAISE EXCEPTION 'Duplicate drafts'; END IF;
 IF (SELECT count(*) FROM public.question_bank)<>before_count THEN RAISE EXCEPTION 'Unreviewed draft was published'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM public.control_word_question_import(job,'pause');
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 IF public.word_question_import_cycle(job,lease,batch) THEN RAISE EXCEPTION 'Paused lease accepted'; END IF;
 old_lease:=lease;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM public.control_word_question_import(job,'resume');
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 claimed:=public.claim_word_question_import();lease:=(claimed->>'token')::uuid;
 IF lease=old_lease THEN RAISE EXCEPTION 'Old lease reused'; END IF;
 PERFORM public.word_question_import_cycle(job,lease,batch,'{"total":1,"saved":1}','completed');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 BEGIN
  PERFORM public.review_word_question_import(job,1,'{"question_type":"short_answer","question_text":"test","answer":""}',true);
  RAISE EXCEPTION 'Missing answer accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Missing answer accepted' THEN RAISE; END IF;
 END;
 question_id:=public.review_word_question_import(job,1,batch->0->'payload',true);
 IF question_id IS NULL THEN RAISE EXCEPTION 'No question ID'; END IF;
 IF public.review_word_question_import(job,1,batch->0->'payload',true)<>question_id THEN RAISE EXCEPTION 'Approval not idempotent'; END IF;
 SELECT count(*) INTO after_count FROM public.question_bank;
 IF after_count<>before_count+1 THEN RAISE EXCEPTION 'Wrong publish count'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 IF public.can_manage_word_import(job) THEN RAISE EXCEPTION 'Unrelated user can view import'; END IF;
END;$$;
SELECT 'PASS: claims, draft isolation, duplicate protection, pause/resume, explicit approval, permissions' AS word_import_tests;
ROLLBACK;
