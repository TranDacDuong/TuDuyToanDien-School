const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('SQL remove empty duplicate parent profiles.sql','utf8');
const audit=fs.readFileSync('SQL audit duplicate parent cleanup.sql','utf8');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz DEFAULT now(),last_sign_in_at timestamptz);
 CREATE TYPE app_role AS ENUM('parent','student');
 CREATE TABLE users(id uuid PRIMARY KEY REFERENCES auth.users(id),full_name text,role app_role,phone text,email text,account_password text);
 CREATE TABLE parent_students(id uuid DEFAULT gen_random_uuid(),parent_id uuid REFERENCES users(id),student_id uuid REFERENCES users(id),revoked_at timestamptz);
 CREATE TABLE zalo_parent_contacts(parent_id uuid REFERENCES users(id),zalo_uid text);
 CREATE TABLE zalo_verified_links(audience_user_id uuid REFERENCES users(id),enabled boolean,zalo_uid text);
 CREATE TABLE messages(sender_id uuid REFERENCES users(id) ON DELETE CASCADE,content text);
 CREATE FUNCTION canonical_parent_zalo_phone(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT CASE WHEN d~'^0[0-9]{9}$' THEN '84'||substr(d,2) WHEN d~'^84[0-9]{9}$' THEN d END FROM (SELECT regexp_replace(coalesce($1,''),'[^0-9]','','g')d)x$$;
 CREATE FUNCTION reconcile_parent_zalo_identity(p uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN INSERT INTO zalo_verified_links SELECT p,true,zalo_uid FROM zalo_parent_contacts WHERE parent_id=p; END$$;
 INSERT INTO auth.users(id,email) VALUES('${id(1)}','parent@example.test'),('${id(2)}','duplicate@example.test'),('${id(3)}','student@example.test'),('${id(4)}','student2@example.test'),('${id(5)}','parent2@example.test');
 INSERT INTO users VALUES('${id(1)}','Parent','parent','0912345678','parent@example.test','private'),('${id(2)}','Parent','parent','+84 912345678','duplicate@example.test','private'),('${id(3)}','Child','student',NULL,'student@example.test',NULL),('${id(4)}','Child 2','student',NULL,'student2@example.test',NULL),('${id(5)}','Other parent','parent','0987654321','parent2@example.test',NULL);
 INSERT INTO parent_students(parent_id,student_id) VALUES('${id(1)}','${id(3)}'),('${id(1)}','${id(4)}');
 INSERT INTO zalo_parent_contacts VALUES('${id(1)}','123456');`);
 return db;
}
test('cleanup removes only the unused duplicate, preserves siblings and identity, and prevents duplicate parents/active links',async t=>{
 const db=await fixture(t);await db.exec(audit);assert.equal((await db.query('SELECT count(*) n FROM users')).rows[0].n,5);await db.exec(migration);await db.exec(migration);
 assert.equal((await db.query('SELECT count(*) n FROM users')).rows[0].n,4);
 assert.equal((await db.query('SELECT count(*) n FROM auth.users')).rows[0].n,4);
 assert.equal((await db.query('SELECT count(*) n FROM parent_students WHERE revoked_at IS NULL')).rows[0].n,2);
 const backup=(await db.query('SELECT * FROM parent_cleanup_private.removed_profiles')).rows[0];
 assert.equal(backup.removed_id,id(2));assert.equal(backup.retained_id,id(1));assert.equal(backup.profile.account_password,undefined);
 assert.equal((await db.query('SELECT audience_user_id FROM zalo_verified_links')).rows[0].audience_user_id,id(1));
 await assert.rejects(db.exec(`UPDATE users SET phone='84912345678' WHERE id='${id(5)}'`),/unique/);
 await assert.rejects(db.exec(`INSERT INTO parent_students(parent_id,student_id) VALUES('${id(5)}','${id(3)}')`),/unique/);
 await db.exec(`INSERT INTO parent_students(parent_id,student_id,revoked_at) VALUES('${id(5)}','${id(3)}',now())`);
 await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT * FROM parent_cleanup_private.removed_profiles'),/permission denied/);
});
for(const [name,setup,reason] of [
 ['past login',`UPDATE auth.users SET last_sign_in_at=now() WHERE id='${id(2)}'`,'lịch sử đăng nhập'],
 ['message history',`INSERT INTO messages VALUES('${id(2)}','preserve this message')`,'dòng phụ thuộc'],
 ['revoked family history',`INSERT INTO parent_students(parent_id,student_id,revoked_at) VALUES('${id(2)}','${id(3)}',now())`,'dòng phụ thuộc'],
 ['other profile references',`ALTER TABLE users ADD COLUMN created_by uuid REFERENCES users(id) ON DELETE CASCADE;UPDATE users SET created_by='${id(2)}' WHERE id='${id(5)}'`,'dòng phụ thuộc'],
 ['ambiguous identity',`INSERT INTO zalo_parent_contacts VALUES('${id(2)}','99999')`,'chưa xác định'],
 ['different names',`UPDATE users SET full_name='Different person' WHERE id='${id(2)}'`,'chưa xác định']
])test('cleanup rolls back for '+name,async t=>{
 const db=await fixture(t);await db.exec(setup);await assert.rejects(db.exec(migration),new RegExp(reason));await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT count(*) n FROM users')).rows[0].n,5);
 assert.equal((await db.query('SELECT count(*) n FROM auth.users')).rows[0].n,5);
});
