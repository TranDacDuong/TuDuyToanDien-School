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
  context.automaticTuitionError = '<unsafe>';
  assert.match(context.automaticTuitionProgressHtml(), /&lt;unsafe>/);
  context.currentRole = 'teacher';
  assert.equal(context.automaticTuitionProgressHtml(), '');
});
test('read RPC is admin scoped and does not return dispatch credentials', () => {
  const sql = fs.readFileSync('SQL automatic tuition visibility.sql', 'utf8');
  assert.match(sql, /auth.uid\(\) IS NULL/);
  assert.match(sql, /role::text='admin'/);
  assert.match(sql, /has_app_permission/);
  assert.doesNotMatch(sql, /'token'|'dispatch_uid'|'payload'/);
  assert.match(source, /await loadAutomaticTuitionProgress\(\)/);
});
