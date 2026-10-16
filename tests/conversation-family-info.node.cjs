const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {createRequire}=require('node:module');
const {PGlite}=createRequire(path.resolve('services/zalo-bot/package.json'))('@electric-sql/pglite');
const {summarize}=require('../conversation-family-model');const calculator=require('../tuition-calculation');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('family tuition reuses shared calculation, freezes discounts and separates old debt from credit',()=>{
  const student={id:'s1',finance:{classes:[{id:'c1',class_name:'Math',tuition_type:'per_session',tuition_fee:100,class_schedules:[{id:1,session_no:1,weekday:4,start_time:'18:00',end_time:'19:00',effective_from:'2026-01-01'}]}],
    classStudents:[{student_id:'s1',class_id:'c1',joined_at:'2026-10-01'}],attData:[{student_id:'s1',class_id:'c1',date:'2026-10-08',schedule_id:1,status:'absent'}],
    discountRules:[{student_id:'s1',starts_month:'2026-01-01',percent:50}],payments:[
      {student_id:'s1',month:'2026-08-01',amount_due:100,amount_paid:130},
      {student_id:'s1',month:'2026-09-01',amount_due:150,amount_paid:50},
      {student_id:'s1',month:'2026-10-01',amount_due:999,amount_paid:20} ]}};
  const summary=summarize(student,'2026-10',calculator);
  assert.equal(summary.due,200);assert.equal(summary.discount,200);assert.equal(summary.total,280);assert.equal(summary.credit,30);
  student.finance.payments[2].locked_at='2026-10-01';student.finance.payments[2].gross_components=[{class_id:'c1',percent:20}];
  assert.equal(summarize(student,'2026-10',calculator).due,320);
  assert.equal(summarize({id:'s1'},'2026-10',calculator),null);
});

test('family RPC scopes students, classes, finance and internal notes without sending messages',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY,role text,full_name text,phone text,birth_year int,school text,province text);
    CREATE TABLE parent_students(parent_id uuid,student_id uuid,revoked_at timestamptz);
    CREATE TABLE classes(id uuid PRIMARY KEY,class_name text,hidden boolean DEFAULT false,tuition_type text,tuition_fee numeric,makeup_fee numeric);
    CREATE TABLE class_teachers(class_id uuid,teacher_id uuid);
    CREATE TABLE class_students(id uuid DEFAULT gen_random_uuid(),class_id uuid,student_id uuid,joined_at date,left_at date);
    CREATE TABLE class_schedules(id int,class_id uuid,session_no int,weekday int,start_time time,end_time time,effective_from date);
    CREATE TABLE class_student_schedules(class_id uuid,student_id uuid,schedule_id int,effective_from date);
    CREATE TABLE attendance(student_id uuid,class_id uuid,date date,status text,status_overridden boolean,schedule_id int);
    CREATE TABLE tuition_payments(id uuid DEFAULT gen_random_uuid(),student_id uuid,month date,amount_due numeric,amount_paid numeric,paid_at timestamptz,locked_at timestamptz,gross_components jsonb,gross_amount numeric,discount_amount numeric,payment_method text);
    CREATE TABLE tuition_discounts(student_id uuid,percent numeric,starts_month date,ends_month date,class_ids uuid[],cancelled boolean,created_at timestamptz);
    CREATE TABLE bank_transaction_logs(id uuid PRIMARY KEY,created_at timestamptz,gateway text,amount numeric,status text,matched_tuition_id uuid);
    CREATE TABLE tuition_bank_allocations(log_id uuid,payment_id uuid,amount numeric);
    CREATE TABLE trial_lesson_requests(id uuid,student_id uuid,status text,trial_class_id uuid,trial_session_1_at timestamptz,trial_session_2_at timestamptz);
    CREATE TABLE supplementary_sessions(id uuid,parent_class_id uuid,topic text,session_date date,starts_at timestamptz,ends_at timestamptz,fee_per_student numeric,status text);
    CREATE TABLE supplementary_session_students(session_id uuid,student_id uuid,attendance_status text,tuition_fee numeric,tuition_charged boolean);
    CREATE TABLE class_offline_tests(id uuid,title text,test_date date);
    CREATE TABLE class_offline_test_scores(id uuid,test_id uuid,class_id uuid,student_id uuid,score numeric,max_score numeric,note text);
    CREATE TABLE session_student_evaluations(id uuid,class_id uuid,student_id uuid,state text,sent_at timestamptz,updated_at timestamptz,final_message text,generated_message text);
    CREATE TABLE zalo_verified_links(audience_user_id uuid,enabled boolean);
    CREATE FUNCTION is_admin_actor() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM users WHERE id=auth.uid() AND role='admin') $$;
    CREATE FUNCTION has_app_permission(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION can_access_mindup_official_audience(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM users WHERE id=auth.uid() AND role IN ('admin','teacher')) $$;
    CREATE FUNCTION teacher_manages_student(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM class_students cs JOIN class_teachers ct ON ct.class_id=cs.class_id WHERE cs.student_id=$1 AND ct.teacher_id=auth.uid()) $$;
    INSERT INTO users(id,role,full_name) VALUES('${id(1)}','admin','Admin'),('${id(2)}','teacher','Teacher'),('${id(3)}','parent','Parent'),('${id(4)}','student','Child 1'),('${id(5)}','student','Child 2');
    INSERT INTO parent_students VALUES('${id(3)}','${id(4)}',NULL),('${id(3)}','${id(5)}',NULL);
    INSERT INTO classes(id,class_name,tuition_type,tuition_fee) VALUES('${id(10)}','Assigned','per_month',100),('${id(11)}','Other','per_month',200);
    INSERT INTO class_teachers VALUES('${id(10)}','${id(2)}');
    INSERT INTO class_students(class_id,student_id,joined_at) VALUES('${id(10)}','${id(4)}','2020-01-01'),('${id(11)}','${id(4)}','2020-01-01'),('${id(11)}','${id(5)}','2020-01-01');
    INSERT INTO tuition_payments(student_id,month,amount_due,amount_paid) VALUES('${id(4)}','2020-09-01',100,40);
    INSERT INTO tuition_payments(student_id,month,amount_due,amount_paid) VALUES('${id(5)}','2020-09-01',200,60);
    INSERT INTO bank_transaction_logs SELECT '${id(40)}',now(),'sepay',120,'success',id FROM tuition_payments WHERE student_id='${id(4)}';
    INSERT INTO tuition_bank_allocations SELECT '${id(40)}',id,60 FROM tuition_payments;
    SELECT set_config('test.actor','${id(1)}',false);`);
  const sql=fs.readFileSync('SQL conversation family info.sql','utf8');await db.exec(sql);await db.exec(sql);
  const get=async()=> (await db.query('SELECT get_mindup_family_info($1,$2) data',[id(3),'2020-10-01'])).rows[0].data;
  const before=(await db.query('SELECT to_jsonb(p) p FROM tuition_payments p')).rows;
  const admin=await get();assert.equal(admin.students.length,2);assert.equal(admin.students[0].finance.payments.length,1);
  assert.equal(admin.students[0].finance.transactions.length,1);
  assert.equal(admin.students[0].finance.transactions[0].amount,60,'only the student allocation, not the entire family transfer');
  await db.query('SELECT add_mindup_family_note($1,$2,$3,$4)',[id(3),id(4),'Admin private note',id(20)]);
  await db.exec(`SELECT set_config('test.actor','${id(2)}',false)`);
  const teacher=await get();assert.equal(teacher.students.length,1);assert.equal(teacher.students[0].classes.length,1);
  assert.equal(teacher.students[0].classes[0].class_name,'Assigned');assert.equal(teacher.students[0].finance,null);assert.equal(teacher.students[0].notes.length,0);
  await db.query('SELECT add_mindup_family_note($1,$2,$3,$4)',[id(3),id(4),'Teacher note',id(21)]);
  await db.query('SELECT add_mindup_family_note($1,$2,$3,$4)',[id(3),id(4),'Teacher note',id(21)]);
  assert.equal((await get()).students[0].notes.length,1);
  await db.exec('GRANT USAGE ON SCHEMA auth TO authenticated; GRANT SELECT ON users TO authenticated; SET ROLE authenticated');
  assert.equal((await get()).students.length,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM mindup_family_notes')).rows[0].n,1);
  await assert.rejects(db.query('INSERT INTO mindup_family_notes(id,parent_id,student_id,created_by,content) VALUES($1,$2,$3,$4,$5)',[id(30),id(3),id(4),id(2),'Bypass']),/permission denied/);
  await db.exec('RESET ROLE');
  await assert.rejects(db.query('SELECT add_mindup_family_note($1,$2,$3,$4)',[id(3),id(5),'Denied',id(22)]),/access denied/);
  await db.exec(`SELECT set_config('test.actor','${id(1)}',false)`);assert.equal((await get()).students[0].notes.length,2);
  assert.deepEqual((await db.query('SELECT to_jsonb(p) p FROM tuition_payments p')).rows,before,'reading never updates tuition');
  await db.exec(`SELECT set_config('test.actor','${id(3)}',false)`);await assert.rejects(get(),/access denied/);
  await db.exec(`SELECT set_config('test.actor','${id(2)}',false); UPDATE parent_students SET revoked_at=now() WHERE student_id='${id(4)}'`);
  assert.equal((await get()).students.length,0);
  await assert.rejects(db.query('SELECT add_mindup_family_note($1,$2,$3,$4)',[id(3),id(4),'Revoked',id(23)]),/access denied/);
});
