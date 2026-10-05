'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'class_evaluations.js'), 'utf8');

function harness(read = async () => ({ data: [] })) {
  const queries = [];
  const elements = new Map();
  const window = { sb: { from(table) {
    assert.equal(table, 'evaluation_zalo_publications');
    return { select(fields) { return { in: async (field, ids) => {
      queries.push({ fields, field, ids: Array.from(ids) });
      return read(ids);
    } }; } };
  } } };
  const ctx = vm.createContext({ window, console: { warn() {} }, document: { getElementById: id => elements.get(id) } });
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, 'window.testing = {state, loadZaloPublications, zaloDeliveryHtml, studentCard};})();'), ctx);
  const state = window.testing.state;
  state.sessionId = 'session';
  state.students = [{ id: 'student', full_name: 'Minh' }];
  state.evaluations.set('student', { id: 'evaluation', state: 'sent', message: 'Review', statusIds: new Set() });
  return { ...window.testing, window, queries, elements };
}

test('per-parent ledger labels are distinct from notification publication', async () => {
  const expected = { pending: 'Chờ gửi', processing: 'Đang gửi', sent: 'Đã gửi', failed: 'Gửi lỗi',
    uncertain: 'Chưa xác nhận, cần kiểm tra', cancelled: 'Đã hủy', not_queued: 'Chưa vào hàng đợi', unknown: 'Chưa xác định' };
  const rows = Object.keys(expected).map((status, i) => ({ evaluation_id: 'evaluation', parent_id: `p${i}`,
    zalo_delivery_status: status, zalo_delivered_at: '2026-10-06T01:00:00Z', delivery_error: status === 'failed' ? '<img onerror=alert(1)>' : null }));
  const h = harness(async () => ({ data: rows }));
  h.state.parentIds.set('student', rows.map(row => row.parent_id));
  h.state.parentNames.set('p2', 'Parent <Name>');
  await h.loadZaloPublications();
  const html = h.studentCard(h.state.students[0]);
  assert.match(html, /Đã công bố thông báo/);
  for (const [status, label] of Object.entries(expected)) {
    assert.ok(html.includes(`data-zalo-status="${status}"`));
    assert.ok(html.includes(`Zalo: ${label}`));
  }
  assert.match(html, /Parent &lt;Name&gt;/);
  assert.match(html, /&lt;img onerror/);
  assert.doesNotMatch(html, /<img onerror/);
  assert.equal((html.match(/06\/10\/2026|6\/10\/2026/g) || []).length, 1);
  assert.deepEqual(h.queries[0].ids, ['evaluation']);
  assert.equal(h.queries[0].field, 'evaluation_id');
  assert.match(h.queries[0].fields, /outbox_id/);
});

test('missing legacy ledger, missing parent rows and unsupported statuses remain unknown', async () => {
  for (const read of [async () => ({ data: [] }), async () => ({ error: { code: '42P01' } }), async () => { throw new Error('RLS/network'); },
    async () => ({ data: [{ evaluation_id: 'evaluation', parent_id: 'p1', zalo_delivery_status: 'unexpected', zalo_delivered_at: '2026-10-06' }] })]) {
    const h = harness(read);
    h.state.parentIds.set('student', ['p1', 'p2']);
    await h.loadZaloPublications();
    const html = h.studentCard(h.state.students[0]);
    assert.equal((html.match(/data-zalo-status="unknown"/g) || []).length, 2);
    assert.doesNotMatch(html, /Zalo: Đã gửi/);
    assert.match(html, /Đã công bố thông báo/);
  }
});

test('refresh replaces stale delivery data but leaves the draft editor untouched', async () => {
  let status = 'pending';
  const h = harness(async () => ({ data: [{ evaluation_id: 'evaluation', parent_id: 'p1', zalo_delivery_status: status }] }));
  const delivery = { innerHTML: '' };
  const editor = { value: 'Unsaved draft' };
  h.elements.set('se-zalo-student', delivery);
  h.elements.set('se-message-student', editor);
  await h.window.refreshSessionEvaluationDelivery();
  assert.match(delivery.innerHTML, /Zalo: Chờ gửi/);
  status = 'sent';
  await h.window.refreshSessionEvaluationDelivery();
  assert.match(delivery.innerHTML, /Zalo: Đã gửi/);
  assert.equal(editor.value, 'Unsaved draft');
  assert.equal(h.state.evaluations.get('student').message, 'Review');
});

test('empty evaluations avoid reads; ledger failures discard stale sent status', async () => {
  let fail = false;
  const h = harness(async () => fail ? { error: new Error('offline') } : { data: [{ evaluation_id: 'evaluation', parent_id: 'p1', zalo_delivery_status: 'sent' }] });
  await h.loadZaloPublications();
  assert.match(h.zaloDeliveryHtml('student'), /Zalo: Đã gửi/);
  fail = true;
  await h.loadZaloPublications();
  assert.doesNotMatch(h.zaloDeliveryHtml('student'), /Zalo: Đã gửi/);
  h.state.evaluations.clear();
  const count = h.queries.length;
  await h.loadZaloPublications();
  assert.equal(h.queries.length, count);
});

test('ledger reads ignore unrelated evaluations and batch more than 100 IDs', async () => {
  const h = harness(async () => ({ data: [{ evaluation_id: 'unrelated', parent_id: 'p1', zalo_delivery_status: 'sent' }] }));
  for (let i = 0; i < 100; i++) h.state.evaluations.set(`s${i}`, { id: `e${i}` });
  await h.loadZaloPublications();
  assert.equal(h.queries.length, 2);
  assert.equal(h.queries[0].ids.length, 100);
  assert.equal(h.queries[1].ids.length, 1);
  assert.equal(h.state.zaloPublications.size, 0);
});

test('a slower old refresh cannot replace newer delivery status', async () => {
  let resolveOld;
  let calls = 0;
  const h = harness(async () => ++calls === 1 ? new Promise(resolve => { resolveOld = resolve; })
    : { data: [{ evaluation_id: 'evaluation', parent_id: 'p1', zalo_delivery_status: 'sent' }] });
  const old = h.loadZaloPublications();
  await h.loadZaloPublications();
  resolveOld({ data: [{ evaluation_id: 'evaluation', parent_id: 'p1', zalo_delivery_status: 'pending' }] });
  await old;
  assert.match(h.zaloDeliveryHtml('student'), /Zalo: Đã gửi/);
});
