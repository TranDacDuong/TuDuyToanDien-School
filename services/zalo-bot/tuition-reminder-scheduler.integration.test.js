'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { createScheduler, buildPayload } = require('./tuition-reminder-scheduler');
const root = path.resolve(__dirname, '../..');

function gatewayHarness() {
  let handler;
  const calls = [];
  const source = fs.readFileSync(path.join(root, 'supabase/functions/zalo-gateway/index.ts'), 'utf8');
  vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'transform' }), {
    Deno: { env: { get: name => ({ ZALO_GATEWAY_TOKEN: 'test-token', SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'service' })[name] },
      serve: fn => { handler = fn; } },
    Response, AbortSignal, console,
    fetch: async (url, options) => { calls.push({ name: url.split('/').at(-1), args: JSON.parse(options.body) });
      return new Response(JSON.stringify({ test: true })); }
  });
  return { calls, request: (body, token = 'test-token') => handler(new Request('https://test.invalid', {
    method: 'POST', headers: { 'x-zalo-gateway-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })) };
}

test('gateway authenticates scheduler actions and allowlists RPCs/arguments', async () => {
  const g = gatewayHarness();
  assert.equal((await g.request({ action: 'automaticTuitionCandidates' }, 'wrong')).status, 401);
  assert.equal(g.calls.length, 0);
  await g.request({ action: 'automaticTuitionCandidates' });
  assert.equal(g.calls.at(-1).name, 'automatic_tuition_candidates');
  await g.request({ action: 'automaticTuitionConfig' });
  assert.equal(g.calls.at(-1).name, 'automatic_tuition_config');
  const args = { p_id: '00000000-0000-0000-0000-000000000011', p_token: '00000000-0000-0000-0000-000000000012', p_index: 0,
    p_today: '2026-10-06', p_allowed: true, p_slot: 5, unexpected: 'never forward' };
  assert.equal((await g.request({ action: 'beginAutomaticTuitionPart', args })).status, 200);
  assert.equal(g.calls.at(-1).name, 'begin_automatic_tuition_part');
  assert.equal('unexpected' in g.calls.at(-1).args, false);
  assert.equal((await g.request({ action: 'beginAutomaticTuitionPart', args: { ...args, p_token: 'bad' } })).status, 400);
});

test('gateway uses one combined claim and token-bound shared reservation', async () => {
  const g = gatewayHarness();
  const pacing = { spacingSeconds: 0, batchSize: 50, batchPauseSeconds: 0 };
  await g.request({ action: 'claimDispatch', pacing,
    automaticSchedule: { today: '2026-10-06', allowed: true, due: { slot: 5 } } });
  assert.equal(g.calls.at(-1).name, 'claim_next_mindup_zalo_dispatch_with_automatic');
  assert.equal(g.calls.at(-1).args.p_slot, 5);
  await g.request({ action: 'claimDispatch', pacing });
  assert.equal(g.calls.at(-1).args.p_allowed, false); // Old bot cannot claim automatic jobs.
  await g.request({ action: 'reserveAutomaticTuitionSlot', jobId: 'job', token: 'token', pacing });
  assert.equal(g.calls.at(-1).name, 'reserve_automatic_tuition_dispatch_slot');
  assert.equal(g.calls.at(-1).args.p_token, 'token');
});

test('claimed dispatch downloads/reserves before final check and always cleans up', async () => {
  const order = [];
  const candidate = { children: [{ student_id: 'c', student_name: 'Nguyễn Gia Linh', remaining: 100000, payment_phone: '0912422333' }] };
  const bank = { code: 'vietinbank', account: '104888332556' };
  const job = { id: 'job', token: 'token', zalo_uid: 'uid', payload: buildPayload(candidate, '2026-10', bank) };
  const scheduler = createScheduler({ bank, clock: () => new Date('2026-10-06T03:00:00Z'), rpc: async name => {
    order.push(name); return { data: name === 'begin_automatic_tuition_part' }; }
  });
  const result = await scheduler.dispatchClaimed(job,
    async () => { order.push('send'); return 'uid:id'; },
    async () => { order.push('prepare'); return { cleanup: async () => { order.push('cleanup'); } }; });
  assert.equal(result.status, 'sent');
  assert.deepEqual(order.slice(0, 5), ['prepare', 'begin_automatic_tuition_part', 'send', 'finish_automatic_tuition_part', 'cleanup']);
  assert.equal(order.filter(item => item === 'send').length, 2);
});

test('memo exactly matches current tuition.js builder with student payment phone', () => {
  const source = fs.readFileSync(path.join(root, 'tuition.js'), 'utf8');
  const helpers = source.slice(source.indexOf('  function toAscii('), source.indexOf('  const STATIC_BANK_INFO'));
  const canonical = vm.runInNewContext(`${helpers}; buildTransferContent`);
  for (const name of ['Nguyễn Gia Linh', 'Trần Bảo Hân', 'Đặng Mai-Anh']) {
    const c = { children: [{ student_id: 'c', student_name: name, remaining: 100000, payment_phone: '0912422333' }] };
    const payload = buildPayload(c, '2026-10', { code: 'vietinbank', account: '104888332556' });
    assert.equal(new URL(payload.parts[1].url).searchParams.get('addInfo'), canonical(name, '2026-10', 'c', 'payment', '0912422333'));
  }
  assert.throws(() => buildPayload({ children: [{ student_id: 'c', student_name: 'Child', remaining: 100000, payment_phone: '' }] },
    '2026-10', { code: 'vietinbank', account: '104888332556' }), /payment phone/);
});
