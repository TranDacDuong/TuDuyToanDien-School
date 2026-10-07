const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'SQL tuition single pass.sql'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'tuition.js'), 'utf8');

test('single-pass sweep preserves success, active leases, manual pauses and uncertainty', () => {
  assert.ok(sql.includes("pending.sent_at IS NULL"));
  assert.ok(sql.includes('NOT pending.dispatch_paused'));
  assert.ok(sql.includes('c.lease_until<=now()'));
  assert.ok(sql.includes("pending.status IN ('queued','not_found','not_friend','invited','greeted')"));
  assert.ok(sql.includes("interval '5 minutes'"));
  assert.ok(sql.includes("SET status='failed'"));
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION"));
  assert.ok(!sql.includes("SET status='queued'"));
});

test('completion includes failed, uncertain and cancelled notices', () => {
  assert.ok(ui.includes('const finalized = counts.sent + counts.failed + counts.uncertain + counts.cancelled'));
  assert.ok(ui.includes('const active = durable.finalized < durable.total'));
  assert.ok(!ui.includes('const active = c.sent + c.cancelled < durable.total'));
});
