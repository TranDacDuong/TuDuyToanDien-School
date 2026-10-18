const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const {PGlite}=createRequire(path.resolve('services/zalo-bot/package.json'))('@electric-sql/pglite');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT 'service_role'::text$$;
 CREATE TABLE users(id uuid PRIMARY KEY,role text,full_name text,phone text);
 CREATE FUNCTION is_admin_actor() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM users WHERE id=auth.uid() AND role='admin')$$;
 CREATE TABLE app_permissions(permission_key text PRIMARY KEY,section text,label text,description text,sort_order integer);
 CREATE TABLE role_permission_defaults(role_name text,permission_key text,allowed boolean,PRIMARY KEY(role_name,permission_key));
 CREATE FUNCTION has_app_permission(p text,u uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM users WHERE id=u AND (role='admin' OR (role='teacher' AND p='messages.automation.manage')))$$;
 CREATE TABLE classes(id uuid PRIMARY KEY,class_name text,hidden boolean DEFAULT false);
 CREATE TABLE class_teachers(class_id uuid,teacher_id uuid);
 CREATE TABLE class_students(class_id uuid,student_id uuid,joined_at date,left_at date);
 CREATE TABLE parent_students(parent_id uuid,student_id uuid,revoked_at timestamptz);
 CREATE TABLE zalo_verified_links(audience_user_id uuid,zalo_uid text,enabled boolean);
 CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid,sender_id uuid,real_sender_id uuid,content text,transport text,zalo_dispatch_source text,context_student_id uuid);
 CREATE TABLE zalo_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),message_id uuid,conversation_id uuid,audience_user_id uuid,zalo_uid text,content text,dispatch_priority integer,status text DEFAULT 'pending',created_at timestamptz DEFAULT now(),updated_at timestamptz,locked_until timestamptz,error_message text,sent_at timestamptz);
 CREATE FUNCTION ensure_mindup_official_audience_conversation(p uuid) RETURNS uuid LANGUAGE sql AS $$SELECT p$$;
 CREATE FUNCTION claim_mindup_zalo_message() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$DECLARE job uuid;BEGIN SELECT o.id INTO job FROM zalo_outbox o WHERE o.status='pending' ORDER BY o.dispatch_priority,o.created_at,o.id LIMIT 1;RETURN job;END$$;
 INSERT INTO users VALUES('${id(1)}','admin','Admin',''),('${id(2)}','teacher','Teacher',''),('${id(3)}','parent','Mother',''),('${id(4)}','student','Child A',''),('${id(5)}','student','Child B',''),('${id(6)}','parent','Outside parent',''),('${id(7)}','student','Outside child',''),('${id(8)}','teacher','Other teacher','');
 INSERT INTO classes VALUES('${id(10)}','Math',false),('${id(11)}','Physics',false);
 INSERT INTO class_teachers VALUES('${id(10)}','${id(2)}');
 INSERT INTO class_students VALUES('${id(10)}','${id(4)}',NULL,NULL),('${id(10)}','${id(5)}',NULL,NULL),('${id(11)}','${id(7)}',NULL,NULL);
 INSERT INTO parent_students VALUES('${id(3)}','${id(4)}',NULL),('${id(3)}','${id(5)}',NULL),('${id(6)}','${id(7)}',NULL);
 INSERT INTO zalo_verified_links VALUES('${id(3)}','zalo-3',true),('${id(6)}','zalo-6',true);
 SELECT set_config('request.jwt.claim.sub','${id(2)}',false);`);
 const sql=fs.readFileSync('SQL message automation campaigns.sql','utf8');await db.exec(sql);await db.exec(sql);
 return db;
}
async function scalar(db,sql,args=[]){return Object.values((await db.query(sql,args)).rows[0])[0];}
async function draft(db,n=20,recurrence='once'){
 await db.query(`SELECT save_message_campaign($1,'Greeting','Hello [Ten_hoc_sinh] [Ten_phu_huynh]',now()+interval '1 hour',$2,24)`,[id(n),recurrence]);
}
async function due(db,n=20){await db.query(`UPDATE message_campaigns SET next_run_at=now()-interval '1 minute' WHERE id=$1`,[id(n)]);return scalar(db,'SELECT process_message_campaigns()');}
test('campaign scope, grouping, template validation and draft safety',async t=>{
 const db=await fixture(t);
 const rows=await scalar(db,"SELECT preview_message_campaign('[Ten_hoc_sinh] [Ngay_gui]',now())");
 assert.equal(rows.length,1);assert.equal(rows[0].students,'Child A và Child B');assert.equal(rows[0].linked,true);
 await assert.rejects(scalar(db,"SELECT preview_message_campaign('[Unsupported]',now())"),/Biến không hỗ trợ/);
 await assert.rejects(scalar(db,"SELECT preview_message_campaign('__ACTION__{}',now())"),/không hợp lệ/);
 await draft(db);assert.equal(await scalar(db,'SELECT count(*) FROM messages'),0);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(8)]);
 await assert.rejects(draft(db),/Không có quyền sửa/);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(3)]);
 await assert.rejects(scalar(db,'SELECT message_automation_console()'),/Không có quyền/);
 await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT * FROM message_campaigns'),/permission denied/);
 await assert.rejects(db.query('SELECT process_message_campaigns()'),/permission denied/);
});
test('scheduled campaign uses shared queue exactly once; pause/resume, failed-only retry and cancellation',async t=>{
 const db=await fixture(t);await draft(db);
 await scalar(db,"SELECT control_message_campaign($1,'publish')",[id(20)]);
 assert.equal(await scalar(db,'SELECT process_message_campaigns()'),0);
 await due(db);assert.equal(await scalar(db,'SELECT count(*) FROM zalo_outbox'),1);assert.equal(await scalar(db,'SELECT count(*) FROM messages'),1);
 await scalar(db,'SELECT process_message_campaigns()');assert.equal(await scalar(db,'SELECT count(*) FROM zalo_outbox'),1);
 await scalar(db,"SELECT control_message_campaign($1,'pause')",[id(20)]);
 assert.equal(await scalar(db,'SELECT claim_mindup_zalo_message()'),null);
 await scalar(db,"SELECT control_message_campaign($1,'resume')",[id(20)]);
 assert.ok(await scalar(db,'SELECT claim_mindup_zalo_message()'));
 await db.exec("UPDATE zalo_outbox SET status='uncertain'");await scalar(db,'SELECT process_message_campaigns()');
 await scalar(db,"SELECT control_message_campaign($1,'retry')",[id(20)]);
 assert.equal(await scalar(db,'SELECT status FROM zalo_outbox'),'uncertain');
 await db.exec("UPDATE zalo_outbox SET status='failed'");await scalar(db,'SELECT process_message_campaigns()');
 await scalar(db,"SELECT control_message_campaign($1,'retry')",[id(20)]);assert.equal(await scalar(db,'SELECT status FROM zalo_outbox'),'pending');
 await scalar(db,"SELECT control_message_campaign($1,'cancel')",[id(20)]);assert.equal(await scalar(db,'SELECT status FROM zalo_outbox'),'cancelled');
});
test('yearly, expiration and revoked scope never produce duplicate or unauthorized delivery',async t=>{
 const db=await fixture(t);await draft(db,21,'yearly');await scalar(db,"SELECT control_message_campaign($1,'publish')",[id(21)]);await due(db,21);
 assert.equal(await scalar(db,'SELECT count(*) FROM message_campaign_runs'),1);
 assert.ok(new Date(await scalar(db,"SELECT next_run_at FROM message_campaigns WHERE id=$1",[id(21)]))>new Date());
 await db.exec('DELETE FROM class_teachers');await scalar(db,'SELECT process_message_campaigns()');assert.equal(await scalar(db,'SELECT status FROM zalo_outbox'),'cancelled');
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(1)]);await draft(db,22);await scalar(db,"SELECT control_message_campaign($1,'publish')",[id(22)]);
 await db.query("UPDATE message_campaigns SET next_run_at=now()-interval '2 days' WHERE id=$1",[id(22)]);await scalar(db,'SELECT process_message_campaigns()');
 assert.equal(await scalar(db,"SELECT state FROM message_campaigns WHERE id=$1",[id(22)]),'finished');assert.equal(await scalar(db,'SELECT count(*) FROM zalo_outbox'),1);
});

test('system catalog preserves business templates and greeting identity / deduplication',async t=>{
 const db=await fixture(t);
 await db.exec(`CREATE TABLE message_templates(id text PRIMARY KEY,name text,content text,is_enabled boolean,updated_at timestamptz);
 CREATE TABLE automatic_tuition_control(id integer,paused boolean,notice_template text);
 INSERT INTO automatic_tuition_control VALUES(1,false,'Tuition template');
 INSERT INTO message_templates VALUES('absent_notification','Absence','Keep {{student_name}}',true,now());
 ALTER TABLE zalo_outbox ADD dispatch_purpose text;ALTER TABLE zalo_outbox ADD contact_phone text;
 CREATE FUNCTION canonical_parent_zalo_phone(p text) RETURNS text LANGUAGE sql AS $$SELECT p$$;
 CREATE FUNCTION tuition_notice_template(p text) RETURNS text LANGUAGE plpgsql AS $$BEGIN UPDATE automatic_tuition_control SET notice_template=p;RETURN p;END$$;
 CREATE FUNCTION control_automatic_tuition(p text) RETURNS void LANGUAGE plpgsql AS $$BEGIN UPDATE automatic_tuition_control SET paused=(p='pause');END$$;`);
 const source=fs.readFileSync('SQL unified Zalo dispatch.sql','utf8');
 const start=source.indexOf('CREATE OR REPLACE FUNCTION public.enqueue_mindup_parent_greeting(');
 await db.exec(source.slice(start,source.indexOf('REVOKE ALL ON FUNCTION public.enqueue_mindup_parent_greeting',start)));
 const sql=fs.readFileSync('SQL message automation system catalog.sql','utf8');await db.exec(sql);await db.exec(sql);
 const data=await scalar(db,'SELECT message_automation_systems()');assert.equal(data.admin,false);assert.equal(data.templates.length,2);
 await assert.rejects(db.query("SELECT update_message_automation_system('absent_notification','Changed',false)"),/Chỉ admin/);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
 await db.exec("SELECT update_message_automation_system('tuition','New template',false)");
 assert.equal(await scalar(db,'SELECT paused FROM automatic_tuition_control'),true);
 assert.equal(await scalar(db,'SELECT content FROM message_templates WHERE id=\'absent_notification\''),'Keep {{student_name}}');
 await db.exec("SELECT update_message_automation_system('parent_greeting','Hi [Ten_hoc_sinh]',false)");
 assert.equal(await scalar(db,"SELECT enqueue_mindup_parent_greeting($1,'','zalo-3','original')",[id(3)]),null);
 await db.exec("SELECT update_message_automation_system('parent_greeting','Hi [Ten_hoc_sinh]',true)");
 const job=await scalar(db,"SELECT enqueue_mindup_parent_greeting($1,'','zalo-3','original')",[id(3)]);
 assert.ok(job);assert.equal(await scalar(db,'SELECT content FROM zalo_outbox'),'Hi Child A và Child B');
 assert.equal(await scalar(db,"SELECT enqueue_mindup_parent_greeting($1,'','zalo-3','original')",[id(3)]),job);
});
