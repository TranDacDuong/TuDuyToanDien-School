const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { PGlite } = createRequire(path.resolve('services/zalo-bot/package.json'))('@electric-sql/pglite');
const { buildRowsForMonth } = require('../tuition-calculation');
const { buildTrialTuitionBasis, createScheduler } = require('../services/zalo-bot/tuition-reminder-scheduler');

const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
const student = id(1), trialClass = id(2), otherClass = id(3);

test('several trial sessions cost zero, then the ordinary sessions use the original month', () => {
  const context = {
    classes: [{
      id: trialClass, tuition_type: 'per_month', tuition_fee: 500,
      class_schedules: [{ id: 1, weekday: 6, start_time: '18:00', end_time: '19:30' }]
    }],
    classStudents: [{ student_id: student, class_id: trialClass, joined_at: '2026-10-10', left_at: '2026-10-17' }],
    attData: ['2026-10-10', '2026-10-17'].map(date => ({
      student_id: student, class_id: trialClass, date, schedule_id: 1, status: 'trial', status_overridden: true
    }))
  };
  const [onlyTrial] = buildRowsForMonth({ ...context, ym: '2026-10' });
  assert.equal(onlyTrial.amount, 0);
  assert.equal(onlyTrial.trialCount, 2);
  context.classStudents[0].left_at = null;
  context.classes[0].tuition_type = 'per_session';
  assert.deepEqual(buildTrialTuitionBasis(context, '2026-10'), [{
    student_id: student,
    components: [{ class_id: trialClass, amount: 1000, first_regular_on: '2026-10-24' }]
  }]);
});

test('automatic scheduler refreshes saved basis before enumerating the first send of the day', async () => {
  const calls = [];
  const scheduler = createScheduler({
    clock: () => new Date('2026-11-05T00:00:00Z'), convert: () => 8,
    refreshTrialBasis: async () => calls.push('refresh'),
    rpc: async (name) => { calls.push(name); return { data: [] }; }
  });
  await scheduler.tick();
  await scheduler.tick();
  assert.deepEqual(calls, ['refresh', 'automatic_tuition_candidates', 'automatic_tuition_candidates']);
});

test('SQL holds only the new class, after discounts, until the next month day 5', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role' $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE tuition_payments(id uuid DEFAULT gen_random_uuid(), student_id uuid, month date,
      amount_due numeric, amount_paid numeric, locked_at timestamptz, gross_components jsonb,
      gross_amount numeric, discount_amount numeric, updated_at timestamptz, UNIQUE(student_id,month));
    CREATE TABLE tuition_discounts(student_id uuid, cancelled boolean, starts_month date,
      ends_month date, class_ids uuid[], percent numeric, created_at timestamptz);
    CREATE TABLE attendance(student_id uuid, class_id uuid, date date, status text, status_overridden boolean);
    CREATE TABLE class_students(student_id uuid, class_id uuid, joined_at timestamptz, left_at timestamptz,
      is_trial boolean, tuition_starts_on date);
    CREATE TABLE classes(id uuid, hidden boolean);
    CREATE TABLE class_schedules(class_id uuid);
    CREATE TABLE class_student_schedules(student_id uuid);
    CREATE TABLE trial_lesson_requests(student_id uuid);
    CREATE TABLE supplementary_sessions(id uuid,status text,session_date date);
    CREATE TABLE supplementary_session_students(student_id uuid,session_id uuid);
    CREATE FUNCTION reconcile_tuition_bundle(uuid) RETURNS numeric LANGUAGE plpgsql AS $$
      DECLARE remaining numeric:=0; allocated numeric; payment tuition_payments;
      BEGIN allocated:=least(remaining,greatest(0,payment.amount_due-payment.amount_paid)); RETURN allocated; END;
    $$;
    INSERT INTO class_students VALUES ('${student}','${trialClass}','2026-10-10',NULL,false,NULL);
    INSERT INTO attendance VALUES ('${student}','${trialClass}','2026-10-10','trial',true),
      ('${student}','${trialClass}','2026-10-17','trial',true);
    INSERT INTO tuition_discounts VALUES ('${student}',false,'2026-10-01',NULL,ARRAY['${trialClass}'::uuid],20,now());
  `);
  const migration = fs.readFileSync('SQL defer tuition after trial.sql', 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  assert.equal((await db.query("SELECT jsonb_array_length(tuition_trial_billing_context()->'months') AS n")).rows[0].n, 2);
  await db.query(`INSERT INTO tuition_payments(student_id,month,amount_due,amount_paid,gross_components)
    SELECT $1,'2026-10-01',900,100,tuition_discount_totals($1,'2026-10-01',$2)->'components'`,
    [student, JSON.stringify([{ class_id: trialClass, amount: 500, first_regular_on: '2026-10-24' }, { class_id: otherClass, amount: 500 }])]);
  const hold = async date => (await db.query(`
    SELECT h.class_id,h.amount FROM tuition_payments p
    CROSS JOIN LATERAL tuition_trial_hold(p,$1) h WHERE month='2026-10-01'`, [date])).rows;
  assert.deepEqual(await hold('2026-11-04'), [{ class_id: trialClass, amount: '400' }]);
  assert.deepEqual(await hold('2026-11-05'), []);
  await db.exec(`UPDATE tuition_payments SET gross_components=jsonb_set(gross_components,'{0,first_regular_on}','"2026-10-09"')`);
  assert.deepEqual(await hold('2026-10-20'), []);
  await db.exec(`DELETE FROM tuition_payments;
    INSERT INTO tuition_payments(student_id,month,amount_due,amount_paid,gross_components)
    VALUES ('${student}','2026-11-01',400,0,'[{"class_id":"${trialClass}","amount":500,"percent":20,"first_regular_on":"2026-11-07"}]')`);
  assert.equal((await db.query(`SELECT h.amount FROM tuition_payments p CROSS JOIN LATERAL tuition_trial_hold(p,'2026-12-04') h`)).rows[0].amount, '400');
  assert.deepEqual((await db.query(`SELECT * FROM tuition_payments p CROSS JOIN LATERAL tuition_trial_hold(p,'2026-12-05') h`)).rows, []);
});
