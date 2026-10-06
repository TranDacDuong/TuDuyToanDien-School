const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'tuition.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'SQL tuition batch controls.sql'), 'utf8');

test('batch controls require permission, serialize clicks and require uncertain-send review', () => {
  const control = ui.slice(ui.indexOf('window.controlZaloTuitionBatch ='), ui.indexOf('window.resumeZaloParentAutomation ='));
  assert.match(control, /hasTuitionPermission\("tuition.zalo_queue.manage", false\)/);
  assert.match(control, /batchControlBusy = true/);
  assert.match(control, /finally \{ batchControlBusy = false/);
  assert.match(control, /p_batch_id: batchId/);
  assert.match(control, /p_confirm_uncertain: action === "retry" && uncertain/);
  assert.match(ui, /controlZaloTuitionBatch\('pause'\)/);
  assert.match(ui, /controlZaloTuitionBatch\('retry'\)/);
});

test('retry preserves successes, active sends and changed balances', () => {
  assert.match(sql, /has_app_permission\('tuition.zalo_queue.manage'\)/);
  assert.match(sql, /status='processing'/);
  assert.match(sql, /AND d.sent_at IS NULL/);
  assert.match(sql, /sent.status='sent' OR sent.sent_at IS NOT NULL/);
  assert.match(sql, /m.external_message_id IS NOT NULL/);
  assert.match(sql, /tp.amount_due-tp.amount_paid=d.remaining_snapshot/);
  assert.match(sql, /d.retry_count<5/);
  assert.doesNotMatch(sql, /DELETE FROM/);
});

test('tuition-only pause and pacing preserve immediate teacher messaging', () => {
  assert.match(sql, /WHERE NOT d.dispatch_paused AND d.status IN/);
  assert.match(sql, /next_tuition_at=now\(\)\+interval ''45 seconds''/);
  assert.match(sql, /NEW.status='uncertain' AND OLD.status IS DISTINCT FROM NEW.status/);
  assert.doesNotMatch(sql, /UPDATE public.zalo_outbox|SET paused=true/);
});
