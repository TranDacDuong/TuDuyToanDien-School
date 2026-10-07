'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { vnDate, lunarDay, plan, buildPayload, createScheduler } = require('./tuition-reminder-scheduler');
const bank = { code: 'vietinbank', account: '104888332556' };
const child = (id = 'child-1', remaining = 500000) => ({
  student_id: id, student_name: 'Nguyen Gia Linh', remaining, payment_phone: '0912422333'
});
const candidate = { parent_id: 'parent-1', phone: '0912422333', children: [child(), child('child-2', 300000)] };
const clock = () => new Date('2026-10-06T03:00:00Z');

test('Vietnam clock crosses day and month at UTC 17:00', () => {
  assert.equal(vnDate(new Date('2026-09-30T16:59:59Z')), '2026-09-30');
  assert.equal(vnDate(new Date('2026-09-30T17:00:00Z')), '2026-10-01');
  assert.throws(() => vnDate(new Date('bad')), /clock/);
});
test('real Vietnamese library: Tet and actual October two-day postponement', () => {
  assert.equal(lunarDay('2026-02-17'), 1);
  assert.equal(lunarDay('2026-02-18'), 2);
  assert.equal(lunarDay('2026-02-19'), 3);
  assert.equal(plan(clock()).slots[1].date, '2026-10-12');
  assert.equal(plan(new Date('2026-10-10T03:00:00Z')).allowed, false);
  assert.equal(plan(new Date('2026-10-11T03:00:00Z')).allowed, false);
});
test('all three slots shift through lunar 1/2 and latest-only catchup stays current month', () => {
  const convert = date => ({ 5: 1, 6: 2, 10: 2, 15: 1, 16: 2 })[Number(date.slice(-2))] || 3;
  const p = plan(new Date('2026-10-20T00:00:00Z'), convert);
  assert.deepEqual(p.slots, [{ slot: 5, date: '2026-10-07' }, { slot: 10, date: '2026-10-11' }, { slot: 15, date: '2026-10-17' }]);
  assert.equal(p.due.slot, 15);
  assert.equal(plan(new Date('2026-11-01T00:00:00Z'), () => 3).due, null);
  assert.throws(() => plan(clock(), () => undefined), /conversion/);
});
test('group contains both names, separate exact-amount QRs and established SEVQR memo', () => {
  const payload = buildPayload(candidate, '2026-10', bank);
  assert.equal(payload.parts.length, 3);
  assert.match(payload.parts[0].content, /500\.000 VNĐ/);
  assert.match(payload.parts[0].content, /tháng 10\/2026/);
  assert.equal(new URL(payload.parts[1].url).searchParams.get('addInfo'), 'SEVQR HP1026 Gia Linh 2333');
  assert.equal(new URL(payload.parts[2].url).searchParams.get('amount'), '300000');
  const [text, attachments] = payload.grouped_content.split('\n__TUITION_QRS__');
  assert.equal(text, payload.content);
  assert.deepEqual(JSON.parse(attachments), payload.parts.slice(1).map(p => ({ student_id: p.student_id, qr_url: p.url })));
  assert.equal(payload.children, candidate.children);
  for (const amount of [0, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildPayload({ children: [child('x', amount)] }, '2026-10', bank), /balance/);
  }
  assert.throws(() => buildPayload({ children: [child(), child()] }, '2026-10', bank), /duplicate/);
  assert.throws(() => buildPayload(candidate, '2026-10', { code: '../bad', account: '1' }), /bank/);
});
test('arrears QR preserves registered multi-month memo and itemized balances', () => {
  const debts = [
    { month: '2026-08-01', remaining: 240000 },
    { month: '2026-09-01', remaining: 360000 },
    { month: '2026-10-01', remaining: 960000 }
  ];
  const transfer_memo = 'SEVQR HP0826 0926 1026 Gia Linh 2333';
  const payload = buildPayload({ children: [{ ...child('x', 1560000), debts, transfer_memo }] }, '2026-10', bank);
  const qr = new URL(payload.parts[1].url);
  assert.equal(qr.searchParams.get('addInfo'), transfer_memo);
  assert.equal(qr.searchParams.get('amount'), '1560000');
  for (const month of ['08', '09', '10']) assert.ok(payload.content.includes(`Tháng ${month}/2026`));
});

test('tick retries use same persisted month/slot; lunar excluded day makes zero RPCs', async () => {
  const calls = [];
  let inserted = false;
  const rpc = async (name, args) => {
    calls.push([name, args]);
    if (name === 'automatic_tuition_candidates') return { data: [candidate] };
    const result = !inserted; inserted = true; return { data: result };
  };
  const scheduler = createScheduler({ rpc, bank, clock });
  assert.deepEqual(await scheduler.tick(), { queued: 1 });
  assert.deepEqual(await scheduler.tick(), { queued: 0 });
  assert.deepEqual(calls[1][1], calls[3][1]);
  calls.length = 0;
  await createScheduler({ rpc, bank, clock, convert: () => 1 }).tick().catch(() => {});
  assert.equal(calls.length, 0);
});
test('RPC errors surface and local overlap guard releases', async () => {
  let fail = true;
  const scheduler = createScheduler({ bank, clock, rpc: async () => fail ? { error: { message: 'offline' } } : { data: [] } });
  await assert.rejects(scheduler.tick(), /offline/);
  fail = false;
  assert.deepEqual(await scheduler.tick(), { queued: 0 });
});
test('overlapping ticks do not duplicate enumeration and excluded days do not dispatch', async () => {
  let release;
  const scheduler = createScheduler({ bank, clock, rpc: async () => new Promise(resolve => { release = resolve; }) });
  const pending = scheduler.tick();
  assert.deepEqual(await scheduler.tick(), { skipped: 'busy' });
  release({ data: [] }); await pending;
  let calls = 0;
  const excluded = createScheduler({ bank, clock: () => new Date('2026-10-10T00:00:00Z'), rpc: async () => { calls++; } });
  assert.equal(await excluded.dispatchOne(async () => { throw new Error('must not send'); }), null);
  assert.equal(calls, 0);
});
test('dispatch persists begin and acknowledgement for every part; revalidation can stop QRs', async () => {
  const calls = [], sent = [];
  const payload = buildPayload(candidate, '2026-10', bank);
  const scheduler = createScheduler({ bank, clock, rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === 'claim_automatic_tuition_reminder') return { data: [{ id: 'j', token: 't', zalo_uid: 'uid', payload }] };
    if (name === 'begin_automatic_tuition_part') return { data: args.p_index === 0 };
    return { data: null };
  } });
  assert.deepEqual(await scheduler.dispatchOne(async data => { sent.push(data); return 'external'; }), { id: 'j', status: 'cancelled' });
  assert.equal(sent.length, 1);
  assert.deepEqual(calls.map(c => c[0]), ['claim_automatic_tuition_reminder', 'begin_automatic_tuition_part', 'finish_automatic_tuition_part', 'begin_automatic_tuition_part']);
});
test('ambiguous transport and lost ACK quarantine instead of retrying', async () => {
  for (const ackFailure of [false, true]) {
    const calls = [];
    const scheduler = createScheduler({ bank, clock, rpc: async (name) => {
      calls.push(name);
      if (name === 'claim_automatic_tuition_reminder') return { data: [{ id: 'j', token: 't', zalo_uid: 'uid', payload: buildPayload(candidate, '2026-10', bank) }] };
      if (name === 'begin_automatic_tuition_part') return { data: true };
      if (name === 'finish_automatic_tuition_part' && ackFailure) return { error: { message: 'ACK lost' } };
      return { data: null };
    } });
    let sends = 0;
    const result = await scheduler.dispatchOne(async () => { sends++; if (!ackFailure) throw new Error('timeout'); return 'id'; });
    assert.equal(result.status, 'uncertain'); assert.equal(sends, 1);
    assert.equal(calls.at(-1), 'uncertain_automatic_tuition_reminder');
  }
});
