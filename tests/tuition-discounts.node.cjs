const { test } = require('node:test');
const assert = require('node:assert/strict');
const { apply } = require('../tuition-discounts.js');
const row = { studentId: 's', classId: 'c', ym: '2026-10', amount: 120000 };
const rule = { student_id: 's', percent: 25, starts_month: '2026-10-01', ends_month: null, class_ids: null };
test('discount retains gross amount and is not applied twice', () => {
  const result = apply([row], [rule])[0];
  assert.equal(result.grossAmount, 120000);
  assert.equal(result.discountAmount, 30000);
  assert.equal(result.amount, 90000);
  assert.equal(apply([result], [rule])[0].amount, 90000);
});
test('student, class, dates and cancellation restrict discount', () => {
  for (const change of [{ student_id: 'other' }, { class_ids: ['other'] }, { starts_month: '2026-11-01' }, { ends_month: '2026-09-01' }, { cancelled: true }]) {
    assert.equal(apply([row], [{ ...rule, ...change }])[0].amount, 120000);
  }
  assert.equal(apply([row], [{ ...rule, ends_month: '2026-10-01' }])[0].amount, 90000);
});
test('full exemption, integer rounding and locked rate', () => {
  assert.equal(apply([row], [{ ...rule, percent: 100 }])[0].amount, 0);
  assert.equal(apply([{ ...row, amount: 101 }], [{ ...rule, percent: 50 }])[0].amount, 50);
  assert.equal(apply([{ ...row, frozenPercent: 0 }], [rule])[0].amount, 120000);
  assert.equal(apply([{ ...row, frozenPercent: 10 }], [rule])[0].amount, 108000);
});
