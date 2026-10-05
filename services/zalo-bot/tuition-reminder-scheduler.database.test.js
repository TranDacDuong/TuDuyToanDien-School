'use strict';
// Local PostgreSQL/WASM verification only; never connects to the school database.
// Requires @electric-sql/pglite for this test runner, not for the scheduler runtime.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { buildPayload } = require('./tuition-reminder-scheduler');
const PARENT = '00000000-0000-0000-0000-000000000011';
const CHILD1 = '00000000-0000-0000-0000-000000000002';
const CHILD2 = '00000000-0000-0000-0000-000000000003';

test('migration and persisted grouped queue against local PostgreSQL', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS
      $$ SELECT current_setting('test.auth_role',true) $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${PARENT}'::uuid $$;
    SELECT set_config('test.auth_role','service_role',false);
    CREATE TABLE users(id uuid PRIMARY KEY,role text,phone text,full_name text);
    CREATE TABLE parent_students(parent_id uuid,student_id uuid,revoked_at timestamptz);
    CREATE TABLE tuition_payments(id uuid PRIMARY KEY,student_id uuid,month date,
      amount_due numeric,amount_paid numeric,locked_at timestamptz,UNIQUE(student_id,month));
    CREATE TABLE zalo_automation_state(id integer,paused boolean,reason text);
    CREATE TABLE zalo_parent_contacts(parent_id uuid PRIMARY KEY,phone text,zalo_uid text,status text,greeting_sent_at timestamptz);
    CREATE TABLE zalo_tuition_deliveries(id uuid DEFAULT gen_random_uuid(),student_id uuid,parent_id uuid,month date,status text,
      lease_until timestamptz,error_message text,updated_at timestamptz);
    CREATE TABLE zalo_tuition_receipts(id uuid DEFAULT gen_random_uuid(),student_id uuid,parent_id uuid,month date,status text,
      created_at timestamptz DEFAULT now(),lease_until timestamptz,error_message text,updated_at timestamptz);
    CREATE TABLE zalo_outbox(id uuid DEFAULT gen_random_uuid(),audience_user_id uuid,zalo_uid text,status text,
      content text DEFAULT 'Web message',attempts integer DEFAULT 0,
      dispatch_priority integer DEFAULT 0,created_at timestamptz DEFAULT now(),locked_until timestamptz,error_message text,updated_at timestamptz);
    CREATE TABLE zalo_verified_links(audience_user_id uuid,zalo_uid text,enabled boolean);
    CREATE TABLE mindup_zalo_dispatch_control(id integer PRIMARY KEY,paused boolean,next_send_at timestamptz,
      urgent_streak integer,batch_count integer,updated_at timestamptz);
    INSERT INTO mindup_zalo_dispatch_control VALUES(1,false,now(),0,0,now());
    CREATE TABLE zalo_bot_config(id text,bank_name text,bank_account_no text,is_active boolean);
    INSERT INTO zalo_bot_config VALUES('default','VietinBank','104888332556',true);
    CREATE TABLE message_templates(id text PRIMARY KEY,is_enabled boolean);
    INSERT INTO message_templates VALUES('tuition_reminder',true);
    CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid,sender_id uuid,
      content text,transport text,zalo_dispatch_source text,external_message_id text UNIQUE);
    CREATE FUNCTION ensure_mindup_official_audience_conversation(p_parent uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT p_parent $$;
    CREATE FUNCTION test_outbox_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.transport='web' AND NEW.zalo_dispatch_source='automatic' THEN
        INSERT INTO zalo_outbox(audience_user_id,status) VALUES(NEW.conversation_id,'pending');
      END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_outbox AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION test_outbox_trigger();
    CREATE FUNCTION sync_mindup_zalo_message(p_external_id text,p_zalo_uid text,p_content text,p_display_name text,
      p_is_self boolean,p_sent_at timestamptz,p_is_history boolean) RETURNS text LANGUAGE plpgsql AS $$
    DECLARE v_conversation_id uuid; v_parent_id uuid := '${PARENT}'; BEGIN
      IF EXISTS(SELECT 1 FROM messages WHERE external_message_id=p_external_id) THEN RETURN 'duplicate'; END IF;
      v_conversation_id := public.ensure_mindup_official_audience_conversation(v_parent_id);
      RETURN 'synced'; END $$;
    CREATE FUNCTION claim_mindup_zalo_message() RETURNS TABLE(job_id uuid,zalo_uid text,content text)
      LANGUAGE plpgsql AS $$ BEGIN RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text WHERE false; END $$;
    CREATE FUNCTION claim_zalo_tuition_delivery() RETURNS TABLE(job_id uuid,zalo_uid text,content text,qr_url text)
      LANGUAGE plpgsql AS $$ BEGIN RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text,NULL::text WHERE false; END $$;
    CREATE FUNCTION claim_zalo_tuition_receipt() RETURNS TABLE(job_id uuid,zalo_uid text,content text)
      LANGUAGE plpgsql AS $$ BEGIN RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text WHERE false; END $$;
    INSERT INTO zalo_automation_state VALUES(1,false,NULL);
    INSERT INTO users VALUES('${PARENT}','parent','0912422333','Parent'),
      ('${CHILD1}','student','0912422333','Nguyen Gia Linh'),
      ('${CHILD2}','student','0912422444','Tran Bao Han');
    INSERT INTO parent_students VALUES('${PARENT}','${CHILD1}',NULL),('${PARENT}','${CHILD2}',NULL);
    INSERT INTO tuition_payments VALUES(gen_random_uuid(),'${CHILD1}',date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,500000,0,now()),
      (gen_random_uuid(),'${CHILD2}',date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,400000,100000,now());
    INSERT INTO zalo_parent_contacts VALUES('${PARENT}','0912422333','uid','friend',NULL);
    INSERT INTO zalo_verified_links VALUES('${PARENT}','uid',true);
  `);
  const unified = fs.readFileSync(path.resolve(__dirname, '../../SQL unified Zalo dispatch.sql'), 'utf8');
  for (const name of ['claim_mindup_zalo_message', 'claim_next_mindup_zalo_dispatch', 'reserve_mindup_zalo_dispatch_slot', 'get_mindup_zalo_dispatch_status']) {
    const start = unified.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    const end = unified.indexOf('$$;', start) + 3;
    await db.exec(unified.slice(start, end));
  }
  const sql = fs.readFileSync(path.resolve(__dirname, '../../SQL parent automatic tuition reminders.sql'), 'utf8');
  const patchedFunctions = [
    'claim_next_mindup_zalo_dispatch(integer,integer,integer)',
    'claim_mindup_zalo_message()', 'claim_zalo_tuition_delivery()', 'claim_zalo_tuition_receipt()',
    'get_mindup_zalo_dispatch_status()',
    'sync_mindup_zalo_message(text,text,text,text,boolean,timestamptz,boolean)'
  ];
  // Reproduce live definitions containing Windows newlines, including BEGIN\r\n.
  for (const signature of patchedFunctions) {
    const { rows: [row] } = await db.query('SELECT pg_get_functiondef($1::regprocedure) definition', [`public.${signature}`]);
    await db.exec(row.definition.replace(/\r\n|\r|\n/g, '\r\n'));
  }
  await db.exec(sql);
  for (const signature of patchedFunctions) {
    const { rows: [row] } = await db.query('SELECT pg_get_functiondef($1::regprocedure) definition', [`public.${signature}`]);
    assert.equal(row.definition.includes('\r'), false, `Migration must normalize ${signature}`);
  }
  await db.exec(sql); // Migration is safe to reapply to its own schema.
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const [{ today, month, day }] = await query(`SELECT
    (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text today,
    to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM') AS "month",
    extract(day FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer AS "day"`);
  const candidates = () => query('SELECT * FROM automatic_tuition_candidates()');
  assert.equal((await candidates())[0].children.length, 2);
  if (day < 5) { t.skip('Enqueue integration requires server calendar day >=5'); return; }
  const slot = day >= 15 ? 15 : day >= 10 ? 10 : 5;
  const due = `${month}-${String(slot).padStart(2, '0')}`;
  const payload = buildPayload((await candidates())[0], month, { code: 'vietinbank', account: '104888332556' });
  const enqueue = async (value = payload, chosenSlot = slot, chosenDue = due) => (await query(
    'SELECT enqueue_automatic_tuition_reminder($1,$2,$3,$4,$5,$6,$7) ok',
    [PARENT, `${month}-01`, chosenSlot, chosenDue, today, '0912422333', JSON.stringify(value)]))[0].ok;
  const claim = () => query('SELECT * FROM claim_automatic_tuition_reminder($1,$2)', [today, slot]);
  const begin = (job, index) => query('SELECT begin_automatic_tuition_part($1,$2,$3,$4,true,$5) ok', [job.id, job.token, index, today, slot]);

  await t.test('service-only, immutable tuition and persisted idempotence', async () => {
    await db.exec("SELECT set_config('test.auth_role','authenticated',false)");
    await assert.rejects(candidates(), /Service role/);
    await db.exec("SELECT set_config('test.auth_role','service_role',false)");
    const before = await query('SELECT * FROM tuition_payments ORDER BY student_id');
    assert.equal(await enqueue(), true);
    assert.equal(await enqueue(), false);
    assert.deepEqual(await query('SELECT * FROM tuition_payments ORDER BY student_id'), before);
    assert.equal((await query('SELECT count(*)::integer n FROM automatic_tuition_reminders'))[0].n, 1);
    assert.equal((await query('SELECT count(*)::integer n FROM zalo_outbox'))[0].n, 0);
    const [mirror] = await query('SELECT m.* FROM messages m JOIN automatic_tuition_reminders r ON r.message_id=m.id');
    assert.equal(mirror.conversation_id, PARENT);
    assert.equal(mirror.zalo_dispatch_source, 'tuition');
    assert.match(mirror.content, /Mã QR Nguyen Gia Linh:/);
    assert.equal(mirror.content.includes('__TUITION_QRS__'), false);
  });
  await t.test('paid or changed child prevents stale claim without overwriting amounts', async () => {
    await db.exec(`UPDATE tuition_payments SET amount_paid=500000 WHERE student_id='${CHILD1}'`);
    assert.equal((await claim()).length, 0);
    assert.equal(await enqueue(), false);
    await db.exec(`UPDATE tuition_payments SET amount_paid=0 WHERE student_id='${CHILD1}'`);
    await db.exec('DELETE FROM automatic_tuition_reminders');
    assert.equal(await enqueue(), true);
  });
  let job;
  await t.test('one lease wins, wrong token cannot send, changed UID stops next part', async () => {
    [job] = await claim(); assert.ok(job);
    assert.equal((await claim()).length, 0);
    await assert.rejects(begin({ ...job, token: PARENT }, 0), /lease/);
    await db.exec("UPDATE zalo_parent_contacts SET zalo_uid='different'");
    assert.equal((await begin(job, 0))[0].ok, false);
    assert.equal((await query('SELECT status FROM automatic_tuition_reminders'))[0].status, 'cancelled');
    await db.exec("UPDATE zalo_parent_contacts SET zalo_uid='uid'; DELETE FROM automatic_tuition_reminders");
  });
  await t.test('payment between grouped text and QR cancels remaining parts', async () => {
    assert.equal(await enqueue(), true); [job] = await claim();
    assert.equal((await begin(job, 0))[0].ok, true);
    await query('SELECT finish_automatic_tuition_part($1,$2,0,$3)', [job.id, job.token, 'uid:message-1']);
    await db.exec(`UPDATE tuition_payments SET amount_paid=1 WHERE student_id='${CHILD2}'`);
    assert.equal((await begin(job, 1))[0].ok, false);
    const [r] = await query('SELECT * FROM automatic_tuition_reminders');
    assert.equal(r.acknowledgements.length, 1); assert.equal(r.status, 'cancelled');
    await db.exec(`UPDATE tuition_payments SET amount_paid=100000 WHERE student_id='${CHILD2}'; DELETE FROM automatic_tuition_reminders`);
  });
  await t.test('interrupted send becomes uncertain and cannot be auto-retried', async () => {
    assert.equal(await enqueue(), true); [job] = await claim();
    await begin(job, 0);
    await db.exec("UPDATE automatic_tuition_reminders SET lease_until=now()-interval '1 second'");
    assert.equal((await claim()).length, 0);
    assert.equal((await query('SELECT status FROM automatic_tuition_reminders'))[0].status, 'uncertain');
    assert.equal(await enqueue(), false);
    await db.exec('DELETE FROM automatic_tuition_reminders');
  });
  await t.test('all parts acknowledged exactly once produces sent grouped job', async () => {
    await enqueue(); [job] = await claim();
    for (let index = 0; index < payload.parts.length; index++) {
      assert.equal((await begin(job, index))[0].ok, true);
      await query('SELECT finish_automatic_tuition_part($1,$2,$3,$4)', [job.id, job.token, index, `uid:message-${index}`]);
      await query('SELECT finish_automatic_tuition_part($1,$2,$3,$4)', [job.id, job.token, index, `uid:message-${index}`]);
      await assert.rejects(query('SELECT finish_automatic_tuition_part($1,$2,$3,$4)', [job.id, job.token, index, 'uid:duplicate']), /lease/);
    }
    const [r] = await query('SELECT * FROM automatic_tuition_reminders');
    assert.equal(r.status, 'sent'); assert.equal(r.acknowledgements.length, 3);
    assert.equal(await enqueue(), false);
  });
  await t.test('shared dispatcher mutually blocks automatic, web and receipt processing', async () => {
    await db.exec('DELETE FROM automatic_tuition_reminders');
    await enqueue();
    await db.exec(`INSERT INTO zalo_outbox(audience_user_id,zalo_uid,status,locked_until) VALUES('${PARENT}','uid','processing',now()+interval '5 minutes')`);
    assert.equal((await claim()).length, 0);
    await db.exec('DELETE FROM zalo_outbox');
    await db.exec(`INSERT INTO zalo_tuition_receipts(parent_id,status,lease_until) VALUES('${PARENT}','processing',now()+interval '5 minutes')`);
    assert.equal((await claim()).length, 0);
    await db.exec('DELETE FROM zalo_tuition_receipts');
    const [automatic] = await query('SELECT claim_next_mindup_zalo_dispatch_with_automatic(0,50,0,$1,$2,true) job', [today, slot]);
    assert.equal(automatic.job.kind, 'automatic_tuition');
    await db.exec(`INSERT INTO zalo_outbox(audience_user_id,zalo_uid,status) VALUES('${PARENT}','uid','pending')`);
    assert.equal((await query('SELECT * FROM claim_next_mindup_zalo_dispatch(0,50,0)')).length, 0);
    assert.equal((await query('SELECT * FROM claim_mindup_zalo_message()')).length, 0);
    assert.equal((await query("SELECT status FROM zalo_outbox"))[0].status, 'pending');
    await db.exec("UPDATE automatic_tuition_reminders SET lease_until=now()-interval '1 second'");
    assert.equal((await query('SELECT * FROM claim_next_mindup_zalo_dispatch(0,50,0)'))[0].kind, 'web');
    await db.exec('DELETE FROM zalo_outbox; DELETE FROM automatic_tuition_reminders');
  });
  await t.test('template and shared pause gates plus live bank changes cancel safely', async () => {
    await db.exec("UPDATE message_templates SET is_enabled=false WHERE id='tuition_reminder'");
    assert.equal((await candidates()).length, 0); assert.equal(await enqueue(), false);
    await db.exec("UPDATE message_templates SET is_enabled=true WHERE id='tuition_reminder'");
    await enqueue();
    await db.exec('UPDATE mindup_zalo_dispatch_control SET paused=true');
    assert.equal((await candidates()).length, 0); assert.equal((await claim()).length, 0);
    await db.exec('UPDATE mindup_zalo_dispatch_control SET paused=false');
    [job] = await claim();
    await db.exec("UPDATE message_templates SET is_enabled=false WHERE id='tuition_reminder'");
    assert.equal((await begin(job, 0))[0].ok, false);
    await db.exec("UPDATE message_templates SET is_enabled=true; DELETE FROM automatic_tuition_reminders");
    await enqueue(); [job] = await claim();
    await db.exec("UPDATE zalo_bot_config SET bank_account_no='999999999999'");
    assert.equal((await begin(job, 0))[0].ok, false);
    await db.exec("UPDATE zalo_bot_config SET bank_account_no='104888332556'; DELETE FROM automatic_tuition_reminders");
  });
  await t.test('web mirror attaches authoritative text ID and self echoes defer then deduplicate', async () => {
    await enqueue(); [job] = await claim();
    const echo = () => query('SELECT sync_mindup_zalo_message($1,$2,$3,NULL,true,NULL,false) result', ['uid:echo-test', 'uid', payload.content]);
    assert.equal((await echo())[0].result, 'deferred');
    await begin(job, 0);
    await query('SELECT finish_automatic_tuition_part($1,$2,0,$3)', [job.id, job.token, 'uid:echo-test']);
    assert.equal((await echo())[0].result, 'duplicate');
    assert.equal((await query("SELECT count(*)::integer n FROM messages WHERE external_message_id='uid:echo-test'"))[0].n, 1);
    await db.exec("UPDATE users SET role='admin' WHERE id='" + PARENT + "'");
    const [status] = await query('SELECT get_mindup_zalo_dispatch_status() result');
    assert.equal(status.result.processingAutomatic, 1); assert.equal(status.result.processing, 1);
    assert.equal(status.result.waitingAutomatic, 0);
    await db.exec("UPDATE users SET role='parent' WHERE id='" + PARENT + "'; DELETE FROM automatic_tuition_reminders");
  });
  await t.test('student phone is required; parent phone is never substituted', async () => {
    await db.exec(`UPDATE users SET phone=NULL WHERE id='${CHILD1}'`);
    const [c] = await candidates();
    assert.deepEqual(c.children.map(child => child.student_id), [CHILD2]);
    assert.equal(await enqueue(), false);
    await db.exec(`UPDATE users SET phone='0912422333' WHERE id='${CHILD1}'`);
  });
  await t.test('paused state, revoked links, unlocked balances and shared phone aliases excluded', async () => {
    await db.exec('UPDATE zalo_automation_state SET paused=true'); assert.equal((await candidates()).length, 0);
    await db.exec(`UPDATE zalo_automation_state SET paused=false; UPDATE parent_students SET revoked_at=now()`);
    assert.equal((await candidates()).length, 0);
    await db.exec('UPDATE parent_students SET revoked_at=NULL; UPDATE tuition_payments SET locked_at=NULL');
    assert.equal((await candidates()).length, 0);
    await db.exec(`UPDATE tuition_payments SET locked_at=now(); INSERT INTO users VALUES
      ('00000000-0000-0000-0000-000000000004','parent','84912422333','Alias')`);
    assert.equal((await candidates()).length, 1); // No active links: ignore the alias.
    await db.exec(`INSERT INTO parent_students VALUES('00000000-0000-0000-0000-000000000004','${CHILD1}',NULL)`);
    assert.equal((await candidates()).length, 0);
  });
});
