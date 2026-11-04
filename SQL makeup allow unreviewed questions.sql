BEGIN;
DO $migration$
DECLARE source text;patched text;
BEGIN
 source:=pg_get_functiondef('public.create_makeup_learning(uuid,uuid,date,uuid,uuid)'::regprocedure);
 IF position('coalesce(answer_status,''reviewed'')=''reviewed''' IN source)>0 THEN
  patched:=regexp_replace(source,
   'AND\s+coalesce\(answer_status,''reviewed''\)=''reviewed''\s+AND\s+coalesce\(word_import_review_status,''approved''\)=''approved''',
   'AND coalesce(word_import_review_status,''pending'')<>''rejected''');
  IF patched=source THEN RAISE EXCEPTION 'Makeup question eligibility filter changed; review before applying'; END IF;
  source:=patched;
 END IF;
 source:=replace(source,'Chủ đề chưa đủ 10 câu trắc nghiệm một đáp án đã kiểm duyệt',
  'Chủ đề chưa đủ 10 câu trắc nghiệm một đáp án hợp lệ để chấm tự động (dùng được cả câu chưa kiểm duyệt và đáp án AI)');
 EXECUTE source;
END;
$migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
