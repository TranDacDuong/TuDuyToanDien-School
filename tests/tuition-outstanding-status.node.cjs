const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'tuition.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'tuition.html'), 'utf8');
const start = source.indexOf('  function getStatus(');
const end = source.indexOf('  const statusLabel', start);
const context = {};
vm.runInNewContext(source.slice(start, end), context);

test('unpaid and partial amounts have one outstanding status', () => {
  for (const paid of [0, null, undefined, 1, 500000, '500000']) {
    assert.equal(context.getStatus(1000000, paid), 'outstanding');
  }
  assert.equal(context.getStatus(1000000, 1000000), 'paid');
  assert.equal(context.getStatus(1000000, 1200000), 'overpaid');
  assert.equal(context.getStatus(0, 0), 'paid');
});

test('filters, totals, remaining amount and Zalo selection share the status', () => {
  assert.match(html, /<option value="outstanding">Còn thiếu<\/option>/);
  assert.doesNotMatch(html, /<option value="(?:unpaid|partial)">/);
  assert.doesNotMatch(source, /status === "(?:unpaid|partial)"/);
  assert.match(source, /outstanding: "Còn thiếu"/);
  assert.match(source, /status === "outstanding"[^\n]*fmt\(remaining\)/);
  assert.match(source, /status === "outstanding"\) deficit \+= \(g.amount - paid\)/);
  assert.match(source, /due: status === "outstanding"/);
});
