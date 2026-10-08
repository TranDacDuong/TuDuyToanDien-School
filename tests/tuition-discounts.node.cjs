const { test } = require('node:test');
const assert = require('node:assert/strict');
const { apply } = require('../tuition-discounts.js');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../tuition-discounts.js'), 'utf8');
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
test('search immediately lists matching students, including unaccented queries', () => {
  const elements = { discountStudent: { value: '', innerHTML: '' }, discountStudentSearch: { value: 'hoang minh' } };
  const context = { catalog: { students: [{ id: 's', name: 'Nguyễn Hoàng Minh', phone: '0987654321' }, { id: 't', name: 'Trần Nam', phone: '' }] }, editing: null,
    esc: value => value, document: { getElementById: id => elements[id] } };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function renderStudents()'), source.indexOf('  function renderList()')), context);
  context.renderStudents();
  assert.match(elements.discountStudent.innerHTML, /Nguyễn Hoàng Minh/);
  assert.doesNotMatch(elements.discountStudent.innerHTML, /Trần Nam/);
  elements.discountStudentSearch.value = 'no match'; context.renderStudents();
  assert.match(elements.discountStudent.innerHTML, /Không tìm thấy học sinh/);
});
test('student list stays visible and class selection uses independent checkboxes', () => {
  assert.match(source, /id="discountStudent" size="5"/);
  assert.match(source, /type="checkbox"/);
  assert.match(source, /#discountClasses input:checked/);
  assert.doesNotMatch(source, /discountStart'\)\.min|ym < currentMonth\(\)/);
});
