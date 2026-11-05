const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { PGlite } = createRequire(path.resolve('services/zalo-bot/package.json'))('@electric-sql/pglite');

test('retry RPC is authorized, atomic, preserves partial progress and excludes successful or changed jobs', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-0000-0000-000000000001'::uuid$$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'service_role'::text$$;
    CREATE TABLE users(id uuid,role text,phone text);
    INSERT INTO users VALUES(auth.uid(),'admin',NULL),('00000000-0000-0000-0000-000000000002','parent','0912345678');
    CREATE FUNCTION has_app_permission(text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
    CREATE TABLE mindup_zalo_dispatch_control(id int,paused boolean,next_send_at timestamptz,batch_count int,updated_at timestamptz);
    INSERT INTO mindup_zalo_dispatch_control VALUES(1,false,now(),0,now());
    CREATE TABLE zalo_automation_state(id int,paused boolean);
    INSERT INTO zalo_automation_state VALUES(1,false);
    CREATE TABLE zalo_parent_contacts(parent_id uuid,zalo_uid text,phone text,status text,greeting_sent_at timestamptz);
    INSERT INTO zalo_parent_contacts VALUES('00000000-0000-0000-0000-000000000002','uid','0912345678','friend',NULL);
    CREATE TABLE zalo_tuition_deliveries(parent_id uuid,month date,status text);
    CREATE TABLE automatic_tuition_reminders(id uuid DEFAULT gen_random_uuid(),parent_id uuid DEFAULT '00000000-0000-0000-0000-000000000002',phone text DEFAULT '0912345678',month date DEFAULT date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh'),due_date date DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,slot int DEFAULT 5,
      payload jsonb DEFAULT '{"parts":[{},{}],"children":[{}]}',status text,token uuid,lease_until timestamptz,part_started boolean DEFAULT true,
      next_part int DEFAULT 0,dispatch_uid text DEFAULT 'uid',acknowledgements jsonb DEFAULT '[]',error_message text DEFAULT 'Zalo error 429',updated_at timestamptz);
    CREATE FUNCTION automatic_tuition_snapshot(uuid,date) RETURNS jsonb LANGUAGE sql AS $$SELECT '[{}]'::jsonb$$;
    CREATE FUNCTION claim_automatic_tuition_reminder(date,integer) RETURNS SETOF jsonb LANGUAGE sql AS $$SELECT x.payload||jsonb_build_object('next_part',x.next_part) FROM automatic_tuition_reminders x WHERE x.status='queued'$$;
    CREATE FUNCTION claim_next_mindup_zalo_dispatch(p_spacing_seconds integer,p_batch_size integer,p_batch_pause_seconds integer) RETURNS SETOF text LANGUAGE plpgsql AS $$
    DECLARE ctl mindup_zalo_dispatch_control; BEGIN
      SELECT * INTO ctl FROM mindup_zalo_dispatch_control WHERE id=1;
      IF ctl.paused OR (SELECT paused FROM public.zalo_automation_state WHERE id=1) THEN RETURN; END IF;
      UPDATE mindup_zalo_dispatch_control SET next_send_at = now();
      RETURN NEXT 'claimed'; END; $$;
  `);
  const migration = fs.readFileSync('SQL Zalo send pacing and automatic tuition retry.sql','utf8');
  await db.exec(migration); await db.exec(migration);
  const q = async (sql, args=[]) => (await db.query(sql,args)).rows;
  const retry = () => q("SELECT retry_failed_automatic_tuition(date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,true) n");
  await db.exec(`INSERT INTO automatic_tuition_reminders(status,next_part,acknowledgements) VALUES('uncertain',1,'[{"index":0,"external_id":"uid:123"}]'),('sent',2,'[]'),('cancelled',0,'[]');
    INSERT INTO automatic_tuition_reminders(status,payload) VALUES('uncertain','{"parts":[{},{}],"children":[]}');`);
  assert.equal((await retry())[0].n,1);
  const [queued] = await q("SELECT * FROM automatic_tuition_reminders WHERE status='queued'");
  assert.equal(queued.next_part,1); assert.equal(queued.acknowledgements.length,1);
  assert.equal(queued.retry_count,1); assert.equal(queued.part_started,false);
  assert.equal(queued.retry_history[0].error,'Zalo error 429');
  const [claim] = await q('SELECT claim_automatic_tuition_reminder(current_date,5) payload');
  assert.equal(claim.payload.retry_attempt,1); assert.equal(claim.payload.next_part,1);
  await assert.rejects(retry(), /chờ đợt hiện tại/);
  await db.exec("UPDATE automatic_tuition_reminders SET status='sent' WHERE status='queued'");
  assert.equal((await retry())[0].n,0);
  await db.exec("UPDATE users SET role='parent'");
  await assert.rejects(retry(),/Not authorized/);
  const [slots] = await q(`SELECT reserve_mindup_zalo_dispatch_slot(0,50,0) slot_one,reserve_mindup_zalo_dispatch_slot(0,50,0) slot_two`);
  assert.ok(new Date(slots.slot_two)-new Date(slots.slot_one)>=10000);
  assert.equal((await q('SELECT * FROM claim_next_mindup_zalo_dispatch(0,50,0)')).length,0);
});
