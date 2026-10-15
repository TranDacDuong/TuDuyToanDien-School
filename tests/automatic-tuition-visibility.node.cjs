const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('tuition.js', 'utf8');
test('automatic progress separates latest parent batch and escapes errors', () => {
  const start = source.indexOf('  function automaticTuitionProgressHtml()');
  const end = source.indexOf('  function renderAutomaticTuitionDetails()', start);
  const context = { currentRole: 'admin', hasTuitionPermission: () => true,
    monthPicker: { value: '2026-10' }, automaticTuitionError: '',
    automaticTuitionControl: { paused: false }, automaticTuitionControlBusy: false,
    automaticLabels: { sent: 'Sent', queued: 'Queued' },
    esc: value => String(value).replaceAll('<', '&lt;'),
    automaticTuitionRows: [
      { due_date: '2026-10-12', status: 'sent' },
      { due_date: '2026-10-12', status: 'queued' },
      { due_date: '2026-10-05', status: 'sent' }
    ] };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  assert.match(context.automaticTuitionProgressHtml(), /1\/2 phụ huynh/);
  assert.match(context.automaticTuitionProgressHtml(), /controlAutomaticTuition\('pause'\)/);
  context.automaticTuitionControl.paused = true;
  assert.match(context.automaticTuitionProgressHtml(), /controlAutomaticTuition\('resume'\)/);
  context.automaticTuitionError = '<unsafe>';
  assert.match(context.automaticTuitionProgressHtml(), /&lt;unsafe>/);
  context.currentRole = 'teacher';
  assert.equal(context.automaticTuitionProgressHtml(), '');
});
test('pause gates automatic claims only and preserves all delivery records', () => {
  const sql = fs.readFileSync('SQL automatic tuition pause.sql', 'utf8');
  assert.match(sql, /role::text='admin'/);
  assert.match(sql, /has_app_permission/);
  assert.match(sql, /claim_automatic_tuition_reminder/);
  assert.match(sql, /AND pause_control.paused\) THEN RETURN/);
  assert.doesNotMatch(sql, /UPDATE public\.(automatic_tuition_reminders|zalo_outbox)|DELETE FROM/);
});
test('read RPC is admin scoped and does not return dispatch credentials', () => {
  const sql = fs.readFileSync('SQL automatic tuition visibility.sql', 'utf8');
  assert.match(sql, /auth.uid\(\) IS NULL/);
  assert.match(sql, /role::text='admin'/);
  assert.match(sql, /has_app_permission/);
  assert.doesNotMatch(sql, /'token'|'dispatch_uid'|'payload'/);
  assert.match(source, /await loadAutomaticTuitionProgress\(\)/);
});
