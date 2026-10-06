const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'tuition.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'tuition.js'), 'utf8');

test('one tuition notification button opens the existing guarded Zalo modal', () => {
  assert.equal((html.match(/id="zaloReminderBtn"/g) || []).length, 1);
  assert.doesNotMatch(html, /id="notifyTuitionBtn"|Nhắc Zalo Tự Động/);
  assert.match(html, /id="zaloReminderBtn"[^>]*data-permission="tuition\.zalo_queue\.manage"[^>]*onclick="openZaloReminderModal\(\)"[^>]*>Thông báo học phí<\/button>/);
  assert.match(html, />Thông báo học phí qua Zalo<\/h3>/);
  assert.match(html, /tuition\.js\?v=20261006-tuition-qr-repair1/);
});

test('legacy entry point delegates without notifying students', async () => {
  const start = source.indexOf('  window.notifyPendingTuition =');
  const end = source.indexOf('  /* Cập nhật tiêu đề nút chốt', start);
  const handler = source.slice(start, end);
  let calls = 0;
  const context = { window: { openZaloReminderModal: async () => { calls++; return 'opened'; } } };
  vm.runInNewContext(handler, context);
  assert.equal(await context.window.notifyPendingTuition(), 'opened');
  assert.equal(calls, 1);
  assert.doesNotMatch(handler, /createBulkNotifications|studentId|tuition_due/);
});

test('modal retains queue permission checks; denied users cannot open or load data', async () => {
  const start = source.indexOf('  window.openZaloReminderModal =');
  const end = source.indexOf('  function prepareZaloCampaignList()', start);
  const alerts = [];
  const context = {
    window: {},
    hasTuitionPermission: permission => { assert.equal(permission, 'tuition.zalo_queue.manage'); return false; },
    alert: message => alerts.push(message),
    document: { getElementById: () => { throw new Error('Denied modal accessed'); } },
  };
  vm.runInNewContext(source.slice(start, end), context);
  await context.window.openZaloReminderModal();
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /không có quyền/);
  assert.match(source, /zaloReminderBtn\.style\.display = hasTuitionPermission\("tuition\.zalo_queue\.manage", false\)/);
  assert.match(source, /currentRole === "student" \|\| currentRole === "parent"/);
});
