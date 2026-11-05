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
    CREATE TABLE zalo_parent_contacts(parent_id uuid,zalo_uid text,phone text,status text,greeting_sent_at timestamptz,last_error text);
    INSERT INTO zalo_parent_contacts VALUES('00000000-0000-0000-0000-000000000002','uid','0912345678','friend',NULL,NULL);
    CREATE TABLE zalo_tuition_deliveries(parent_id uuid,month date,status text,lease_until timestamptz);
    CREATE TABLE zalo_tuition_receipts(status text,lease_until timestamptz);
    CREATE TABLE zalo_outbox(status text,locked_until timestamptz);
    CREATE TABLE automatic_tuition_control(id int,paused boolean);
    INSERT INTO automatic_tuition_control VALUES(1,false);
    CREATE TABLE message_templates(id text,is_enabled boolean);
    INSERT INTO message_templates VALUES('tuition_reminder',true);
    CREATE FUNCTION automatic_tuition_sending_time() RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.sending_time',true),'true')::boolean$$;
    CREATE TABLE automatic_tuition_reminders(id uuid DEFAULT gen_random_uuid(),parent_id uuid DEFAULT '00000000-0000-0000-0000-000000000002',phone text DEFAULT '0912345678',month date DEFAULT date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh'),due_date date DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,slot int DEFAULT 5,
      payload jsonb DEFAULT '{"parts":[{},{}],"children":[{}]}',status text,token uuid,lease_until timestamptz,part_started boolean DEFAULT true,
      next_part int DEFAULT 0,dispatch_uid text DEFAULT 'uid',acknowledgements jsonb DEFAULT '[]',error_message text DEFAULT 'Zalo error 429',updated_at timestamptz,created_at timestamptz DEFAULT clock_timestamp());
    CREATE FUNCTION automatic_tuition_snapshot(uuid,date) RETURNS jsonb LANGUAGE sql AS $$SELECT '[{}]'::jsonb$$;
    CREATE FUNCTION automatic_tuition_valid(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
    CREATE FUNCTION claim_automatic_tuition_reminder(date,integer) RETURNS TABLE(id uuid,token uuid,zalo_uid text,payload jsonb) LANGUAGE sql AS $$SELECT x.id,x.token,x.dispatch_uid,x.payload FROM automatic_tuition_reminders x WHERE x.status='queued'$$;
    CREATE FUNCTION list_automatic_tuition_reminders(date) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_agg(jsonb_build_object('status',r.status,'id',r.id)) FROM automatic_tuition_reminders r$$;
    CREATE FUNCTION claim_next_mindup_zalo_dispatch(p_spacing_seconds integer,p_batch_size integer,p_batch_pause_seconds integer) RETURNS SETOF text LANGUAGE plpgsql AS $$
    DECLARE ctl mindup_zalo_dispatch_control; BEGIN
      SELECT * INTO ctl FROM mindup_zalo_dispatch_control WHERE id=1;
      IF ctl.paused OR (SELECT paused FROM public.zalo_automation_state WHERE id=1) THEN RETURN; END IF;
      UPDATE mindup_zalo_dispatch_control SET next_send_at = now();
      RETURN NEXT 'claimed'; END; $$;
  `);
  const migration = fs.readFileSync('SQL Zalo send pacing and automatic tuition retry.sql','utf8');
  await db.exec(migration); await db.exec(migration);
  const baseSql = fs.readFileSync('SQL parent automatic tuition reminders.sql','utf8');
  const uncertainStart = baseSql.indexOf('CREATE OR REPLACE FUNCTION public.uncertain_automatic_tuition_reminder(');
  await db.exec(baseSql.slice(uncertainStart,baseSql.indexOf('$$;',uncertainStart)+3));
  const q = async (sql, args=[]) => (await db.query(sql,args)).rows;
  const retry = () => q("SELECT retry_failed_automatic_tuition(date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,true) n");
  await db.exec(`INSERT INTO automatic_tuition_reminders(status,next_part,acknowledgements,scan_pass,scan_attempts) VALUES('uncertain',1,'[{"index":0,"external_id":"uid:123"}]',2,2),('sent',2,'[]',1,1),('cancelled',0,'[]',1,0);`);
  assert.equal((await retry())[0].n,1);
  const [queued] = await q("SELECT * FROM automatic_tuition_reminders WHERE status='queued'");
  assert.equal(queued.next_part,1); assert.equal(queued.acknowledgements.length,1);
  assert.equal(queued.retry_count,1); assert.equal(queued.part_started,false);
  assert.equal(queued.retry_history[0].error,'Zalo error 429');
  const [claim] = await q("SELECT * FROM claim_automatic_tuition_reminder((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,5)");
  assert.equal(claim.payload.retry_attempt,1); assert.equal(claim.payload.next_part,1);
  await assert.rejects(retry(), /chờ đợt hiện tại/);
  await db.exec("UPDATE automatic_tuition_reminders SET status='sent' WHERE status IN('queued','processing')");
  assert.equal((await retry())[0].n,0);

  await t.test('two complete sweeps include unreachable contacts, preserve order and stop without a third attempt', async () => {
    await db.exec(`DELETE FROM automatic_tuition_reminders;
      UPDATE zalo_parent_contacts SET status='invited';
      INSERT INTO users VALUES('00000000-0000-0000-0000-000000000003','parent','0912345679'),
        ('00000000-0000-0000-0000-000000000004','parent','0912345680'),
        ('00000000-0000-0000-0000-000000000005','parent','0912345681');
      INSERT INTO zalo_parent_contacts(parent_id,zalo_uid,phone,status) VALUES
        ('00000000-0000-0000-0000-000000000003','uid3','0912345679','friend'),
        ('00000000-0000-0000-0000-000000000004','uid4','0912345680','friend');
      INSERT INTO automatic_tuition_reminders(status,parent_id,phone,created_at)
        SELECT 'queued',id,phone,now()+make_interval(secs=>right(id::text,1)::int) FROM users WHERE role='parent' ORDER BY id;`);
    const scan = async () => {
      await db.exec("UPDATE mindup_zalo_dispatch_control SET next_automatic_scan_at='-infinity'");
      return q("SELECT * FROM claim_automatic_tuition_reminder((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,5)");
    };
    await db.exec('UPDATE automatic_tuition_control SET paused=true');
    assert.equal((await scan()).length,0);
    assert.equal((await q('SELECT sum(scan_attempts) n FROM automatic_tuition_reminders'))[0].n,0);
    await db.exec('UPDATE automatic_tuition_control SET paused=false');
    await db.exec("SELECT set_config('test.sending_time','false',false)");
    assert.equal((await scan()).length,0);
    await db.exec("SELECT set_config('test.sending_time','true',false)");
    assert.equal((await scan()).length,0); // invited parent consumes pass 1
    assert.equal((await q("SELECT * FROM claim_automatic_tuition_reminder((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,5)")).length,0); // 10s scan guard
    const [failing] = await scan(); assert.equal(failing.zalo_uid,'uid3');
    await q('SELECT uncertain_automatic_tuition_reminder($1,$2,$3)',[failing.id,failing.token,'[403] Không thể nhận tin nhắn từ bạn']);
    const [success] = await scan(); assert.equal(success.zalo_uid,'uid4');
    await q("UPDATE automatic_tuition_reminders SET status='sent',next_part=2,lease_until=NULL WHERE id=$1",[success.id]);
    assert.equal((await scan()).length,0); // missing contact also finishes pass 1
    assert.equal((await q('SELECT count(*) n FROM automatic_tuition_reminders WHERE scan_pass=2'))[0].n,0);
    assert.equal((await scan()).length,0); // pass 2 starts only now, invited parent
    const [retryJob] = await scan(); assert.equal(retryJob.id,failing.id); assert.equal(retryJob.payload.retry_attempt,1);
    await q('SELECT uncertain_automatic_tuition_reminder($1,$2,$3)',[retryJob.id,retryJob.token,'[403] Không thể nhận tin nhắn từ bạn']);
    assert.equal((await scan()).length,0); // missing contact pass 2
    for(let i=0;i<4;i++) assert.equal((await scan()).length,0);
    const failed = await q("SELECT * FROM automatic_tuition_reminders WHERE status='uncertain'");
    assert.equal(failed.length,3);
    for(const row of failed) { assert.equal(row.scan_pass,2); assert.equal(row.scan_attempts,2); assert.ok(row.error_message); }
    const [successful] = await q("SELECT * FROM automatic_tuition_reminders WHERE status='sent'");
    assert.equal(successful.scan_attempts,1);
    const [details] = await q('SELECT list_automatic_tuition_reminders(current_date) rows');
    assert.ok(details.rows.every(row=>!row.auto_retry_pending));
    await db.exec(migration); // redeployment must never create a third sweep
    assert.equal((await scan()).length,0);
    assert.equal((await retry())[0].n,3); // operator explicitly starts a new cycle
    const fresh = await q("SELECT scan_attempts,scan_pass FROM automatic_tuition_reminders WHERE status='queued'");
    assert.ok(fresh.every(row=>row.scan_attempts===0 && row.scan_pass===1));
  });

  await db.exec("UPDATE users SET role='parent'");
  await assert.rejects(retry(),/Not authorized/);
  const [slots] = await q(`SELECT reserve_mindup_zalo_dispatch_slot(0,50,0) slot_one,reserve_mindup_zalo_dispatch_slot(0,50,0) slot_two`);
  assert.ok(new Date(slots.slot_two)-new Date(slots.slot_one)>=10000);
  assert.equal((await q('SELECT * FROM claim_next_mindup_zalo_dispatch(0,50,0)')).length,0);
});
