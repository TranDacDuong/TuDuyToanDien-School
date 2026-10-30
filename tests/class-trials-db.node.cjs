const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('trial RPC lifecycle and permissions in isolated PostgreSQL',async t=>{
 const db=new PGlite();
 const admin='00000000-0000-0000-0000-000000000001',student='00000000-0000-0000-0000-000000000002',cid='00000000-0000-0000-0000-000000000003';
 try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${admin}'::uuid$$;
 CREATE FUNCTION public.has_app_permission(text) RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.deny',true) IS DISTINCT FROM 'yes'$$;
 CREATE TABLE users(id uuid PRIMARY KEY,role text);
 INSERT INTO users VALUES('${admin}','admin'),('${student}','student');
 CREATE TABLE classes(id uuid PRIMARY KEY,hidden boolean DEFAULT false);
 INSERT INTO classes(id) VALUES('${cid}');
 CREATE TABLE class_teachers(class_id uuid,teacher_id uuid);
 CREATE TABLE class_schedules(id integer PRIMARY KEY,class_id uuid,weekday smallint,start_time time,end_time time,session_no integer,effective_from date);
 INSERT INTO class_schedules VALUES(1,'${cid}',1,'18:00','19:30',1,'2000-01-01');
 CREATE TABLE class_students(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id uuid,student_id uuid,joined_at timestamptz,left_at timestamptz,UNIQUE(class_id,student_id));
 CREATE TABLE trial_lesson_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid,student_name text,phone text,grade text,subject text,school text,parent_id uuid,parent_full_name text,parent_phone text,trial_class_id uuid,trial_schedule_1_id integer,trial_schedule_2_id integer,trial_session_1_at timestamptz,trial_session_2_at timestamptz,note text,status text,source_url text,enrolled_at timestamptz,handled_at timestamptz,handled_by uuid);
 CREATE FUNCTION sync_trial_request_on_class_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END;$$;
 CREATE TRIGGER sync_trial AFTER INSERT ON class_students FOR EACH ROW EXECUTE FUNCTION sync_trial_request_on_class_enrollment();
 CREATE TABLE attendance(class_id uuid,student_id uuid,date date,status text,schedule_id integer,status_overridden boolean DEFAULT false,UNIQUE(class_id,student_id,date));
 CREATE TABLE class_student_schedules(class_id uuid,student_id uuid,session_no integer,schedule_id integer,effective_from date,UNIQUE(class_id,student_id,session_no,effective_from));
 CREATE FUNCTION automatic_tuition_config() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('unchanged',42,'classStudents',(SELECT jsonb_agg(to_jsonb(cs)) FROM (SELECT student_id,class_id,joined_at,left_at FROM public.class_students)cs)) $$;`);
 await db.exec(fs.readFileSync('SQL Class trial enrollment.sql','utf8'));
 const payload={trial_class_id:cid,student_id:student,student_name:'Test student',phone:'000',grade:'10',subject:'Math',trial_schedule_1_id:1,trial_schedule_2_id:1,trial_session_1_at:'2020-01-06T18:00:00+07:00',trial_session_2_at:'2020-01-13T18:00:00+07:00'};
 const save=async(p=payload,id=null)=>(await db.query('select save_class_trial($1,$2) as id',[id,JSON.stringify(p)])).rows[0].id;
 const control=(id,action,date=null,schedule=null)=>db.query('select control_class_trial($1,$2,$3,$4)',[id,action,date,schedule]);
 await t.test('reject invalid date without creating partial membership',async()=>{
  await assert.rejects(save({...payload,trial_session_2_at:'2020-01-14T18:00:00+07:00'}),/không khớp/);
  assert.equal((await db.query('select * from class_students')).rows.length,0);
 });
 const id=await save();
 await t.test('save immediately adds trial membership and two non-notifying attendance rows',async()=>{
  const cs=(await db.query('select * from class_students')).rows[0];assert.equal(cs.is_trial,true);assert.equal(cs.tuition_starts_on,null);
  assert.equal((await db.query('select status from trial_lesson_requests')).rows[0].status,'scheduled');
  const attendance=(await db.query('select * from attendance')).rows;assert.equal(attendance.length,2);assert.ok(attendance.every(a=>a.status==='trial'&&!a.status_overridden));
  await assert.rejects(save(),/đang học thử/);
 });
 await t.test('unauthorized updates are rejected',async()=>{
  await db.exec("SET test.deny='yes'");await assert.rejects(control(id,'stop'),/quyền/);await assert.rejects(save(),/quyền/);await db.exec("SET test.deny='no'");
 });
 await t.test('editing details keeps appointments and rejects rewriting trial history',async()=>{
  assert.equal(await save({...payload,note:'Updated note'},id),id);
  await assert.rejects(save({...payload,trial_session_2_at:'2020-01-20T18:00:00+07:00'},id),/giữ nguyên lịch sử/);
 });
 await t.test('extension preserves appointments and prevents early official conversion',async()=>{
  await db.exec(`INSERT INTO class_student_schedules VALUES('${cid}','${student}',2,2,'2020-01-06');`);
  await control(id,'extend','2099-01-19',1);
  assert.equal((await db.query("select * from class_student_schedules where effective_from='2099-01-19'")).rows.length,2);
  const request=(await db.query('select * from trial_lesson_requests')).rows[0];assert.equal(request.trial_sessions.length,3);assert.equal(request.trial_sessions[1].date,'2020-01-13');
  await assert.rejects(control(id,'official','2099-01-20'),/Chỉ chuyển/);
 });
 await t.test('stop preserves membership history, never marks as official',async()=>{
  await control(id,'stop');const cs=(await db.query('select * from class_students')).rows[0];assert.equal(cs.is_trial,true);assert.ok(cs.left_at);
  await assert.rejects(control(id,'official','2099-01-20'),/kết thúc/);
 });
 await t.test('official enrollment retains original join date and sets billing boundary',async()=>{
  await db.exec('TRUNCATE attendance,class_student_schedules,class_students,trial_lesson_requests');
  const rid=await save();await assert.rejects(control(rid,'official','2020-01-13'),/ngày thu phí/);
  await control(rid,'official','2020-01-14');const cs=(await db.query('select * from class_students')).rows[0];assert.equal(cs.is_trial,false);assert.ok(String(cs.tuition_starts_on).includes('2020'));assert.equal(new Date(cs.joined_at).toISOString(),'2020-01-06T11:00:00.000Z');
  await assert.rejects(save(),/chính thức/);
  const config=(await db.query('select automatic_tuition_config() as c')).rows[0].c;assert.equal(config.unchanged,42);assert.equal(config.classStudents[0].is_trial,false);
 });
 await t.test('ordinary class insertion retains legacy trial synchronization',async()=>{
  await db.exec(`TRUNCATE attendance,class_student_schedules,class_students,trial_lesson_requests;
   INSERT INTO trial_lesson_requests(student_id,trial_class_id,status) VALUES('${student}','${cid}','scheduled');
   INSERT INTO class_students(student_id,class_id) VALUES('${student}','${cid}');`);
  assert.equal((await db.query('select status from trial_lesson_requests')).rows[0].status,'enrolled');
 });
 }finally{await db.close();}
});
