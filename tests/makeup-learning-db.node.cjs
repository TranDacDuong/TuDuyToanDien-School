const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('private makeup links grade on server and convert only absent attendance atomically',async t=>{
 const db=new PGlite();const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const admin=id(1),student=id(2),reviewer=id(3),other=id(4),cid=id(5),topic=id(6),subject=id(7);
 let assignment,token,prefix,questions,secondToken;
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE SCHEMA extensions;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE FUNCTION has_app_permission(text) RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.deny',true) IS DISTINCT FROM 'yes'$$;
 CREATE FUNCTION digest(text,text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$SELECT decode(md5($1),'hex')$$;
 CREATE FUNCTION gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $$SELECT decode(md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),'hex')$$;
 CREATE TABLE users(id uuid PRIMARY KEY,full_name text,role text);
 INSERT INTO users VALUES('${admin}','Admin','admin'),('${student}','Test student','student'),('${reviewer}','Teacher','teacher'),('${other}','Other','teacher');
 CREATE TABLE classes(id uuid PRIMARY KEY,class_name text,subject_id uuid);INSERT INTO classes VALUES('${cid}','Test class','${subject}');
 CREATE TABLE class_teachers(class_id uuid,teacher_id uuid);INSERT INTO class_teachers VALUES('${cid}','${reviewer}');
 CREATE TABLE topics(id uuid PRIMARY KEY,name text,subject_id uuid);INSERT INTO topics VALUES('${topic}','Test topic','${subject}');
 CREATE TABLE class_students(class_id uuid,student_id uuid,joined_at timestamptz,left_at timestamptz);INSERT INTO class_students VALUES('${cid}','${student}','2020-01-01',NULL);
 CREATE TABLE attendance(class_id uuid,student_id uuid,date date,schedule_id integer,status text,status_overridden boolean DEFAULT false,UNIQUE(class_id,student_id,date));
 INSERT INTO attendance VALUES('${cid}','${student}','2020-01-06',1,'absent',false),('${cid}','${student}','2020-01-07',1,'absent',false);
 CREATE TABLE question_bank(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),topic_id uuid,question_type text,question_text text,question_img text,answer_count integer,answer text,answer_status text,word_import_review_status text,hidden boolean DEFAULT false);
 INSERT INTO question_bank(topic_id,question_type,question_text,answer_count,answer,answer_status) SELECT '${topic}','multi_choice','1+1? A.1 B.2 C.3 D.4',4,'B','reviewed' FROM generate_series(1,10);
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT INSERT,SELECT ON storage.objects TO anon,authenticated;GRANT USAGE ON SCHEMA storage,auth TO anon,authenticated;
 CREATE TABLE daily_tasks(id uuid DEFAULT gen_random_uuid(),source_key text UNIQUE,reviewer uuid);
 CREATE FUNCTION upsert_generated_task(uuid,text,text,text,text,text,text,text,date,timestamptz,text,text,jsonb) RETURNS uuid LANGUAGE plpgsql AS $$DECLARE result uuid;BEGIN
 IF current_setting('test.task_fail',true)='yes' THEN RAISE EXCEPTION 'Task unavailable';END IF;
 INSERT INTO daily_tasks(source_key,reviewer)VALUES($2,$1) ON CONFLICT(source_key)DO UPDATE SET reviewer=excluded.reviewer RETURNING id INTO result;RETURN result;END;$$;
 SET test.uid='${admin}';`);
 const migration=fs.readFileSync('SQL makeup learning links.sql','utf8');await db.exec(migration);await db.exec(migration);
 const unreviewedMigration=fs.readFileSync('SQL makeup allow unreviewed questions.sql','utf8');await db.exec(unreviewedMigration);await db.exec(unreviewedMigration);
 const create=async(date='2020-01-06',top=topic,rev=reviewer)=>(await db.query('select create_makeup_learning($1,$2,$3,$4,$5) as r',[cid,student,date,top,rev])).rows[0].r;
 const open=async tok=>(await db.query('select get_makeup_learning($1) as r',[tok])).rows[0].r;
 const submit=async(answers,paths,tok=token)=>(await db.query('select submit_makeup_learning($1,$2,$3) as r',[tok,JSON.stringify(answers),JSON.stringify(paths)])).rows[0].r;
 const answersFor=count=>Object.fromEntries(questions.map((q,i)=>[q.id,i<count?'B':'A']));
 await t.test('class authority, topic, usable answers and explicit rejection filters are enforced',async()=>{
  await db.exec(`SET test.uid='${other}'`);await assert.rejects(create(),/quyền/);await db.exec(`SET test.uid='${admin}'`);
  await assert.rejects(create('2020-01-06',id(90)),/Chủ đề/);await assert.rejects(create('2020-01-06',topic,other),/phụ trách/);
  for(const update of ["answer=''","answer='Đáp án B'","hidden=true","word_import_review_status='rejected'"]){
   await db.exec('BEGIN');try{await db.exec('UPDATE question_bank SET '+update);await assert.rejects(create(),/chưa đủ 10/);}finally{await db.exec('ROLLBACK');}
  }
 });
 await t.test('unreviewed imports and AI answers are usable without changing their review flags',async()=>{
  for(const review of ['pending','needs_attention',null]){
   await db.exec('BEGIN');
   try{
    await db.query("UPDATE question_bank SET answer_status='ai',word_import_review_status=$1",[review]);
    const created=await create(),m=await open(created.token);assert.equal(m.questions.length,10);
    const flags=(await db.query('SELECT answer_status,word_import_review_status FROM question_bank LIMIT 1')).rows[0];
    assert.equal(flags.answer_status,'ai');assert.equal(flags.word_import_review_status,review);
   }finally{await db.exec('ROLLBACK');}
  }
 });
 await t.test('forward migration also upgrades the older deployed reviewed-only function',async()=>{
  const signature='public.create_makeup_learning(uuid,uuid,date,uuid,uuid)';
  const current=(await db.query('SELECT pg_get_functiondef($1::regprocedure) AS source',[signature])).rows[0].source;
  await db.exec(current.replace("AND coalesce(word_import_review_status,'pending')<>'rejected'","AND coalesce(answer_status,'reviewed')='reviewed'\n  AND coalesce(word_import_review_status,'approved')='approved'"));
  await db.exec(unreviewedMigration);
  const upgraded=(await db.query('SELECT pg_get_functiondef($1::regprocedure) AS source',[signature])).rows[0].source;
  assert.ok(upgraded.includes("coalesce(word_import_review_status,'pending')<>'rejected'"));
  assert.ok(!upgraded.includes("coalesce(answer_status,'reviewed')='reviewed'"));
 });
 await t.test('link is random, key is private, question snapshot and draft persist',async()=>{
  const created=await create();assignment=created.id;token=created.token;assert.match(token,/^[a-f0-9]{64}$/);
  const m=await open(token);prefix=m.upload_prefix;questions=m.questions;assert.equal(questions.length,10);assert.ok(!JSON.stringify(m).includes('answer_key'));assert.ok(!JSON.stringify(m).includes('reviewer_id'));
  const row=(await db.query('select * from makeup_learning')).rows[0];assert.notEqual(row.token_hash,token);
  await db.query('select save_makeup_draft($1,$2)',[token,JSON.stringify({[questions[0].id]:'B'})]);assert.equal((await open(token)).draft_answers[questions[0].id],'B');
  await db.exec("UPDATE question_bank SET answer='A'");await assert.rejects(create(),/đã có bài/);
  await db.exec('SET ROLE anon');await assert.rejects(db.query('select * from makeup_learning'),/permission denied/);await db.exec('RESET ROLE');
  await assert.rejects(open('a'.repeat(64)),/Link/);
 });
 await t.test('upload requires the actual token, expires and restricts access to this assignment',async()=>{
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-makeup-token':token})]);
  assert.equal((await db.query('select can_upload_makeup($1) as ok',[prefix+'/photo.jpg'])).rows[0].ok,true);
  assert.equal((await db.query('select can_upload_makeup($1) as ok',['other/photo.jpg'])).rows[0].ok,false);
  await db.exec("SET request.headers='{}'");assert.equal((await db.query('select can_upload_makeup($1) as ok',[prefix+'/photo.jpg'])).rows[0].ok,false);
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('makeup-notebooks',$1,'{\"mimetype\":\"image/jpeg\"}')",[prefix+'/photo.jpg']);
 });
 await t.test('legacy permissive storage policies cannot expose notebooks or permit unauthorized uploads',async()=>{
  await db.exec("CREATE POLICY legacy_open ON storage.objects FOR ALL TO anon USING(true) WITH CHECK(true);SET test.uid='';SET ROLE anon");
  try{
   assert.equal((await db.query('select * from storage.objects')).rows.length,0);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name,metadata) values('makeup-notebooks','other/attack.jpg','{}')"),/row-level security/);
   await assert.rejects(db.query('select makeup_class_data($1)',[cid]),/permission denied/);
  }finally{await db.exec(`RESET ROLE;SET test.uid='${admin}'`);}
 });
 await t.test('missing notebook, fake image, missing answers and another students file cannot pass',async()=>{
  await assert.rejects(submit(answersFor(10),[]),/ảnh vở/);await assert.rejects(submit(answersFor(10),['other/photo.jpg']),/Ảnh vở/);
  await assert.rejects(submit({},[prefix+'/photo.jpg']),/trả lời đủ/);await assert.rejects(submit(null,null),/ảnh vở/);
  assert.equal((await db.query('select attempts from makeup_learning')).rows[0].attempts,0);
 });
 await t.test('6/10 stays absent, repeat requests do not consume attempts; 7/10 makes up and assigns exactly one task',async()=>{
  const paths=[prefix+'/photo.jpg'];let r=await submit(answersFor(6),paths);assert.equal(r.score,6);assert.equal(r.completed,false);
  assert.equal((await submit(answersFor(6),paths)).attempts,1);assert.equal((await db.query("select status from attendance where date='2020-01-06'")).rows[0].status,'absent');
  r=await submit(answersFor(7),paths);assert.equal(r.score,7);assert.equal(r.completed,true);
  const att=(await db.query("select * from attendance where date='2020-01-06'")).rows[0];assert.equal(att.status,'makeup');assert.equal(att.status_overridden,true);
  assert.equal((await db.query("select status from attendance where date='2020-01-07'")).rows[0].status,'absent');
  await submit(answersFor(10),paths);assert.equal((await db.query('select * from daily_tasks')).rows.length,1);assert.equal((await db.query('select * from daily_tasks')).rows[0].reviewer,reviewer);
  assert.equal((await db.query('select can_upload_makeup($1) as ok',[prefix+'/extra.jpg'])).rows[0].ok,false);
 });
 await t.test('changed attendance or task failure rolls back grade and completion',async()=>{
  await db.exec("UPDATE question_bank SET answer='B'");const second=await create('2020-01-07');secondToken=second.token;const m=await open(second.token);
  const a=Object.fromEntries(m.questions.map(q=>[q.id,'B'])),path=m.upload_prefix+'/photo.jpg';
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('makeup-notebooks',$1,'{\"mimetype\":\"image/jpeg\"}')",[path]);
  await db.exec("UPDATE attendance SET status='present' WHERE date='2020-01-07'");await assert.rejects(submit(a,[path],second.token),/đã thay đổi/);
  await db.exec("UPDATE attendance SET status='absent' WHERE date='2020-01-07';SET test.task_fail='yes'");await assert.rejects(submit(a,[path],second.token),/Task unavailable/);
  await db.exec("SET test.task_fail='no'");assert.equal((await open(second.token)).attempts,0);assert.equal((await db.query("select status from attendance where date='2020-01-07'")).rows[0].status,'absent');
 });
 await t.test('renew invalidates old token, revocation and expiry block access and submission',async()=>{
  const second=(await db.query("select id from makeup_learning where study_date='2020-01-07'")).rows[0];
  const fresh=(await db.query("select control_makeup_link($1,'renew') as r",[second.id])).rows[0].r.token;
  await assert.rejects(open(secondToken),/Link/);
  const m=await open(fresh),paths=[m.upload_prefix+'/photo.jpg'];
  for(const answer of ['A','C','D'])await submit(Object.fromEntries(m.questions.map(q=>[q.id,answer])),paths,fresh);
  await assert.rejects(submit(Object.fromEntries(m.questions.map(q=>[q.id,'B'])),paths,fresh),/hết 3 lượt/);
  await db.query("select control_makeup_link($1,'revoke')",[second.id]);await assert.rejects(open(fresh),/Link/);
  const renewed=(await db.query("select control_makeup_link($1,'renew') as r",[second.id])).rows[0].r.token;
  await db.query("UPDATE makeup_learning SET expires_at=now()-interval '1 second' WHERE id=$1",[second.id]);await assert.rejects(open(renewed),/Link/);
  await assert.rejects(db.query("select control_makeup_link($1,'renew')",[assignment]),/đã hoàn thành/);
 });
 }finally{await db.close();}
});
