const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'tuition.js'), 'utf8');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

test('main selection table hides paid students and keeps original checkbox indexes', () => {
  const container = {};
  const context = {
    document: { getElementById: () => container }, esc, fmt: String,
    DEFAULT_ZALO_TEMPLATE: '', monthPicker: { value: '2026-10' },
    isZaloTuitionItemBaseEligible: item => item.due,
    currentZaloCampaignItems: [
      { studentName: 'Paid student', due: false, remaining: 0 },
      { studentName: 'Outstanding student', due: true, remaining: 100, selected: true }
    ]
  };
  vm.createContext(context);
  const start = source.indexOf('  function renderZaloInitialLayout()');
  const end = source.indexOf('  // Cập nhật ĐỘNG', start);
  vm.runInContext(source.slice(start, end) + '\nrenderZaloInitialLayout();', context);
  assert.ok(!container.innerHTML.includes('Paid student'));
  assert.ok(container.innerHTML.includes('Outstanding student'));
  assert.ok(container.innerHTML.includes('data-index="1"'));
  assert.ok(!container.innerHTML.includes('Mã CK SePay'));
  assert.ok(!container.innerHTML.includes('Trạng thái / Thao tác'));
});

test('detail filters separate successful, pending and error deliveries and escape errors', () => {
  const target = {};
  const select = { value: 'error' };
  const context = {
    document: { getElementById: id => id === 'zaloDetailRows' ? target : select }, esc,
    currentZaloCampaignItems: [{ studentId: 's', parentId: 'p', studentName: 'Student', parentName: 'Parent' }],
    zaloParentContactStatus: new Map(),
    zaloDurableProgress: { rows: [
      { student_id: 's', parent_id: 'p', status: 'sent', qr_sent_at: '2026-10-07', attempt_no: 1 },
      { student_id: 's', parent_id: 'p', status: 'failed', error_message: '<script>alert(1)</script>', attempt_no: 2 },
      { student_id: 's', parent_id: 'p', status: 'queued', attempt_no: 3 }
    ] },
    pendingZaloTuitionLabel: () => 'Waiting', zaloTuitionStatusLabel: status => status
  };
  vm.createContext(context);
  const start = source.indexOf('  function renderZaloTuitionDetails()');
  const end = source.indexOf('  window.renderZaloTuitionDetails', start);
  vm.runInContext(source.slice(start, end), context);
  for (const [filter, expected] of [['error', 'failed'], ['pending', 'Waiting'], ['sent', 'sent']]) {
    select.value = filter;
    context.renderZaloTuitionDetails();
    assert.ok(target.innerHTML.includes(expected));
    assert.ok(target.innerHTML.includes('1 lượt gửi'));
    assert.ok(!target.innerHTML.includes('<script>'));
  }
});

test('a failed tuition message does not pause peers and the following job succeeds', async () => {
  const server = fs.readFileSync(path.join(root, 'services/zalo-bot/server.js'), 'utf8');
  const start = server.indexOf('async function sendQueuedTuition(job)');
  const end = server.indexOf('async function sendQueuedTuitionReceipt', start);
  const acknowledgements = [];
  const context = {
    zaloApi: { sendMessage: async text => { if (text === 'bad') throw Error('Recipient unavailable'); return 'id'; } },
    requireSendAcknowledgement: value => value,
    isZaloLimitError: () => false, isUncertainSendError: () => false,
    acknowledgeDispatch: async value => acknowledgements.push(value),
    gatewayRequest: async () => { throw Error('Must not pause automation for a recipient error'); }
  };
  vm.createContext(context);
  vm.runInContext(server.slice(start, end), context);
  await context.sendQueuedTuition({ job_id: 'first', content: 'bad', zalo_uid: 'uid1' });
  await context.sendQueuedTuition({ job_id: 'next', content: 'good', zalo_uid: 'uid2' });
  assert.equal(acknowledgements[0].status, 'failed');
  assert.equal(acknowledgements[1].status, 'sent');
  assert.equal(acknowledgements[1].externalId, 'uid2:id');
});
