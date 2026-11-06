const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('SQL merge duplicate parent profiles.sql','utf8');
const preview=fs.readFileSync('SQL preview duplicate parent merge.sql','utf8');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec(`
 CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TYPE app_role AS ENUM('parent','student');
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz DEFAULT now(),last_sign_in_at timestamptz);
 CREATE TABLE users(id uuid PRIMARY KEY REFERENCES auth.users(id),full_name text,role app_role,phone text,email text,account_password text);
 CREATE TABLE parent_students(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),parent_id uuid REFERENCES users(id),student_id uuid REFERENCES users(id),revoked_at timestamptz,UNIQUE(parent_id,student_id));
 CREATE TABLE zalo_parent_contacts(parent_id uuid REFERENCES users(id),zalo_uid text);
 CREATE TABLE zalo_verified_links(audience_user_id uuid REFERENCES users(id),enabled boolean,zalo_uid text);
 CREATE TABLE conversations(id uuid PRIMARY KEY,direct_key text UNIQUE,audience_user_id uuid REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE conversation_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid REFERENCES conversations(id),user_id uuid REFERENCES users(id),UNIQUE(conversation_id,user_id));
 CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,sender_id uuid REFERENCES users(id) ON DELETE CASCADE,content text);
 CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),actor_id uuid REFERENCES users(id),message text);
 CREATE TABLE user_mobile_app_status(user_id uuid PRIMARY KEY REFERENCES users(id),platform text);
 CREATE TABLE push_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),endpoint text UNIQUE,auth text,p256dh text);
 CREATE FUNCTION reconcile_parent_zalo_identity(p uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN INSERT INTO zalo_verified_links SELECT p,true,zalo_uid FROM zalo_parent_contacts WHERE parent_id=p;END$$;
 INSERT INTO auth.users(id,email,last_sign_in_at) VALUES('${id(1)}','main@example.test',now()),('${id(2)}','old@example.test',now()),('${id(3)}','student@example.test',NULL),('${id(4)}','student2@example.test',NULL),('${id(5)}','other@example.test',NULL);
 INSERT INTO users VALUES('${id(1)}','Parent','parent','0912345678','main@example.test','private'),('${id(2)}','Parent alias','parent','912345678','old@example.test','private'),('${id(3)}','Child','student',NULL,'student@example.test',NULL),('${id(4)}','Child 2','student',NULL,'student2@example.test',NULL),('${id(5)}','Other','parent','0987654321','other@example.test',NULL);
 INSERT INTO parent_students(parent_id,student_id,revoked_at) VALUES('${id(1)}','${id(3)}',NULL),('${id(1)}','${id(4)}',NULL),('${id(2)}','${id(3)}',now());
 INSERT INTO zalo_parent_contacts VALUES('${id(1)}','123456');
 INSERT INTO conversations VALUES('${id(10)}','mindup:audience:${id(2)}','${id(2)}');
 INSERT INTO conversation_members(conversation_id,user_id) VALUES('${id(10)}','${id(1)}'),('${id(10)}','${id(2)}');
 INSERT INTO messages(conversation_id,sender_id,content) VALUES('${id(10)}','${id(1)}','Keep this history');
 INSERT INTO notifications(user_id,actor_id,message) VALUES('${id(2)}','${id(1)}','Keep notification');
 INSERT INTO user_mobile_app_status VALUES('${id(1)}','current'),('${id(2)}','old');
 INSERT INTO push_subscriptions(user_id,endpoint,auth,p256dh) VALUES('${id(2)}','https://push.example.test/device','secret','key');
 SELECT set_config('app.parent_cleanup.approved_fingerprint',md5('${id(2)}=>${id(1)}'),false);`);return db;
}
test('reviewed merge preserves conversations, messages, notifications and sibling links while deleting duplicate Auth identity',async t=>{
 const db=await fixture(t);await db.exec(preview);assert.equal((await db.query('SELECT count(*) n FROM users')).rows[0].n,5);await db.exec(migration);await db.exec(migration);
 assert.equal((await db.query('SELECT count(*) n FROM users')).rows[0].n,4);
 assert.equal((await db.query('SELECT count(*) n FROM auth.users')).rows[0].n,4);
 assert.equal((await db.query('SELECT count(*) n FROM parent_students WHERE revoked_at IS NULL')).rows[0].n,2);
 assert.equal((await db.query('SELECT count(*) n FROM messages')).rows[0].n,1);
 const conversation=(await db.query('SELECT * FROM conversations')).rows[0];assert.equal(conversation.id,id(10));assert.equal(conversation.audience_user_id,id(1));assert.match(conversation.direct_key,new RegExp(id(1)));
 assert.equal((await db.query('SELECT user_id FROM notifications')).rows[0].user_id,id(1));
 assert.equal((await db.query('SELECT count(*) n FROM conversation_members')).rows[0].n,1);
 assert.equal((await db.query('SELECT user_id FROM push_subscriptions')).rows[0].user_id,id(1));
 assert.equal((await db.query("SELECT row_data->>'auth' secret FROM parent_cleanup_private.merged_rows WHERE table_name='public.push_subscriptions'")).rows[0].secret,null);
 const archived=(await db.query('SELECT * FROM parent_cleanup_private.removed_profiles')).rows[0];assert.ok(archived.login_summary.last_sign_in_at);assert.equal(archived.profile.account_password,undefined);
 assert.ok((await db.query('SELECT count(*) n FROM parent_cleanup_private.merged_rows')).rows[0].n>=5);
 await assert.rejects(db.exec(`UPDATE users SET phone='84912345678' WHERE id='${id(5)}'`),/unique/);
 await assert.rejects(db.exec(`INSERT INTO parent_students(parent_id,student_id) VALUES('${id(5)}','${id(3)}')`),/unique/);
 await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT * FROM parent_cleanup_private.merged_rows'),/permission denied/);
});
test('import reuses an existing canonical phone instead of creating a second parent login',async t=>{
 const db=await fixture(t);
 await db.exec("ALTER TYPE app_role ADD VALUE 'admin'");
 await db.exec(`ALTER TABLE parent_students ADD COLUMN relationship text,ADD COLUMN created_by uuid,ADD COLUMN updated_at timestamptz;
 INSERT INTO auth.users(id,email) VALUES('${id(99)}','admin@example.test');
 INSERT INTO users(id,full_name,role,email) VALUES('${id(99)}','Admin','admin','admin@example.test');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${id(99)}'::uuid$$;`);
 const source=fs.readFileSync('SQL enforce one active parent per student.sql','utf8');
 await db.exec(source.slice(source.indexOf('CREATE OR REPLACE FUNCTION public.admin_import_parents_batch')));
 await db.exec(migration);
 const result=(await db.query('SELECT admin_import_parents_batch($1) data',[JSON.stringify([{email:'new-alias@example.test',full_name:'New alias',phone:'+84 912 345 678',student_id:id(4)}])])).rows[0].data;
 assert.equal(result.inserted,0);assert.equal(result.linked,1);
 assert.equal((await db.query("SELECT count(*) n FROM users WHERE role='parent'")).rows[0].n,2);
 assert.equal((await db.query('SELECT full_name FROM users WHERE id=$1',[id(1)])).rows[0].full_name,'Parent');
 assert.equal((await db.query("SELECT count(*) n FROM auth.users WHERE email='new-alias@example.test'")).rows[0].n,0);
});
for(const [name,setup,reason] of [
 ['unreviewed message ownership',`INSERT INTO messages(conversation_id,sender_id,content) VALUES('${id(10)}','${id(2)}','Do not discard')`,'kế hoạch gộp thêm'],
 ['conversation-key collision',`INSERT INTO conversations VALUES('${id(11)}','mindup:audience:${id(1)}','${id(1)}')`,'hội thoại cần gộp riêng'],
 ['competing Zalo identity',`INSERT INTO zalo_parent_contacts VALUES('${id(2)}','999999')`,'chưa xác định'],
 ['unrelated same-phone person',`DELETE FROM parent_students WHERE parent_id='${id(2)}'`,'chưa xác định']
 ,['changed approved plan',"SELECT set_config('app.parent_cleanup.approved_fingerprint','wrong',false)",'chưa được phê duyệt']
])test('merge refuses '+name,async t=>{
 const db=await fixture(t);await db.exec(setup);await assert.rejects(db.exec(migration),new RegExp(reason));await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT count(*) n FROM users')).rows[0].n,5);assert.equal((await db.query('SELECT count(*) n FROM auth.users')).rows[0].n,5);
});
