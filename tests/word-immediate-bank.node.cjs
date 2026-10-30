const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
test('unreviewed answers are never labelled manually approved and missing-answer filters still work',()=>{
 const source=fs.readFileSync('question_list.js','utf8');
 const start=source.indexOf('function isAnswerMissing('),end=source.indexOf('\nfunction ',source.indexOf('function getAnswerStatusMeta(')+10);
 const context={};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 assert.equal(context.getAnswerStatusValue({question_type:'short_answer',answer:'1',word_import_review_status:'pending'}),'unreviewed');
 assert.equal(context.getAnswerStatusMeta({question_type:'short_answer',answer:'1',word_import_review_status:'pending'}).label,'Chưa kiểm duyệt');
 assert.equal(context.getAnswerStatusValue({question_type:'short_answer',answer:'',word_import_review_status:'pending'}),'missing');
 assert.equal(context.getAnswerStatusValue({question_type:'short_answer',answer:'1',word_import_review_status:'approved'}),'reviewed');
});
test('Word imports publish immediately and review updates the same bank record',async t=>{
 const db=new PGlite();
 const actor='00000000-0000-0000-0000-000000000001',topic='00000000-0000-0000-0000-000000000002',job='00000000-0000-0000-0000-000000000003',token='00000000-0000-0000-0000-000000000004';
 const payload={question_type:'short_answer',question_text:'Original $x=1$',answer:'1',answer_text:'Solution',answer_count:1,difficulty:5};
 const claims=role=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:actor})]);
 const count=async()=>(await db.query('select count(*)::integer as n from question_bank')).rows[0].n;
 const cycle=(items,tok=token)=>db.query('select word_question_import_cycle($1,$2,$3) as active',[job,tok,JSON.stringify(items)]);
 const review=(ordinal,p,approve=true)=>db.query('select review_word_question_import($1,$2,$3,$4) as id',[job,ordinal,JSON.stringify(p),approve]);
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA storage;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claims',true)::jsonb->>'role'$$;
  CREATE TABLE users(id uuid PRIMARY KEY,role text);INSERT INTO users VALUES('${actor}','admin');
  CREATE FUNCTION has_app_permission(text,uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql AS $$SELECT $2='${actor}'::uuid AND current_setting('test.deny',true) IS DISTINCT FROM $1$$;
  CREATE TABLE topics(id uuid PRIMARY KEY);INSERT INTO topics VALUES('${topic}');
  CREATE TYPE question_type AS ENUM('multi_choice','true_false','short_answer','essay');
  CREATE TABLE question_bank(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),topic_id uuid REFERENCES topics(id),question_type question_type,
   difficulty integer CHECK(difficulty BETWEEN 1 AND 10),question_text text,answer_text text,answer text,answer_count integer,answer_status text CHECK(answer_status IN('missing','ai','reviewed')),
   created_by uuid REFERENCES users(id),hidden boolean DEFAULT false,question_img text);
  CREATE TABLE exam_questions(question_id uuid REFERENCES question_bank(id));
  CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  CREATE TABLE storage.objects(bucket_id text,name text);
  CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$SELECT string_to_array($1,'/')$$;`);
 await claims('service_role');await db.exec(fs.readFileSync('SQL Word question imports.sql','utf8'));
 await db.query("insert into word_question_imports(id,requested_by,topic_id,file_name,source_path,status,token,locked_until) values($1,$2,$3,'test.docx','test/source.docx','processing',$4,now()+interval '1 hour')",[job,actor,topic,token]);
 await cycle([{ordinal:1,payload}]);assert.equal(await count(),0);
 const migration=fs.readFileSync('SQL Word questions immediate bank.sql','utf8');await db.exec(migration);
 const q1=(await db.query('select * from question_bank')).rows[0];
 await t.test('existing pending imports are backfilled and immediately usable in an exam',async()=>{
  assert.equal(await count(),1);assert.equal(q1.hidden,false);assert.equal(q1.word_import_review_status,'pending');assert.equal(q1.word_import_job_id,job);
  await db.query('insert into exam_questions select id from question_bank where not hidden');
  assert.equal((await db.query('select * from exam_questions')).rows[0].question_id,q1.id);
 });
 await t.test('new worker batches and retries publish once even when answers are missing',async()=>{
  const item={ordinal:2,payload:{...payload,question_text:'[CÔNG THỨC LỖI]',answer:''},needs_attention:true,warnings:['Review formula']};
  await cycle([item]);await cycle([item]);assert.equal(await count(),2);
  const q=(await db.query('select * from question_bank where word_import_ordinal=2')).rows[0];assert.equal(q.hidden,false);assert.equal(q.word_import_review_status,'needs_attention');assert.equal(q.answer_status,'missing');
 });
 await t.test('approval updates the published question ID and preserves existing exam references',async()=>{
  await claims('authenticated');const edited={...payload,question_text:'Edited $x=2$',answer:'2'};
  assert.equal((await review(1,edited)).rows[0].id,q1.id);assert.equal((await review(1,edited)).rows[0].id,q1.id);assert.equal(await count(),2);
  const q=(await db.query('select * from question_bank where id=$1',[q1.id])).rows[0];assert.equal(q.answer,'2');assert.equal(q.word_import_review_status,'approved');
  assert.equal((await db.query('select * from exam_questions')).rows[0].question_id,q1.id);
  await claims('service_role');await cycle([{ordinal:1,payload}]);assert.equal((await db.query('select answer from question_bank where id=$1',[q1.id])).rows[0].answer,'2');
 });
 await t.test('reject hides without deleting; review still validates answers and permissions',async()=>{
  await claims('authenticated');await assert.rejects(review(2,{...payload,answer:''}),/bổ sung đáp án/);
  await db.exec("SET test.deny='question.archive'");await assert.rejects(review(2,payload,false),/ẩn câu hỏi/);await db.exec("SET test.deny='none'");
  await assert.rejects(review(2,payload,null),/chọn thao tác/);
  const qid=(await review(2,payload,false)).rows[0].id;assert.ok(qid);assert.equal(await count(),2);
  assert.equal((await db.query('select hidden from question_bank where id=$1',[qid])).rows[0].hidden,true);
 });
 await t.test('invalid leases, revoked creation rights and deleted questions cannot create replacements',async()=>{
  await claims('service_role');assert.equal((await cycle([{ordinal:3,payload}],'00000000-0000-0000-0000-000000000099')).rows[0].active,false);
  await db.exec("SET test.deny='question.create'");await cycle([{ordinal:3,payload}]);assert.equal(await count(),2);await db.exec("SET test.deny='none'");
  await cycle([{ordinal:3,payload}]);assert.equal(await count(),3);
  await db.exec('delete from question_bank where word_import_ordinal=3');await cycle([{ordinal:3,payload}]);assert.equal(await count(),2);
  await claims('authenticated');await assert.rejects(review(3,payload),/đã bị xóa/);
 });
 await t.test('migration is repeatable and publishing is not exposed to web clients',async()=>{
  await db.exec(migration);assert.equal(await count(),2);
  assert.equal((await db.query("select has_function_privilege('authenticated','publish_word_question_import_item(uuid,integer)','execute') as allowed")).rows[0].allowed,false);
  assert.equal((await db.query('select question_text from question_bank where id=$1',[q1.id])).rows[0].question_text,'Edited $x=2$');
 });
 await t.test('existing rollback smoke script covers pause, resume and same-ID approval',async()=>{
  await db.exec("UPDATE word_question_imports SET status='completed',locked_until=NULL");
  await db.exec(fs.readFileSync('services/word-import/database.test.sql','utf8'));
  assert.equal(await count(),2);
 });
 }finally{await db.close();}
});
