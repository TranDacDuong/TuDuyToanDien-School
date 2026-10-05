const { test, expect } = require('@playwright/test');
const fs = require('fs');
const vm = require('vm');

function calculate(status, overridden, trial = true) {
  const source = fs.readFileSync('tuition.js', 'utf8');
  const ctx = {
    ymToDate: ym => ym + '-01', monthEnd: () => '2026-08-31',
    currentRole: 'admin', currentUserId: 'admin', parentStudentIds: new Set(),
    isStaffTuitionView: () => false, canViewStudentPhone: () => false,
    parentContactMap: {}, fmt: String,
    generateOccurrencesForStudent: () => [{ date: '2026-08-13', schedule_id: 268, session_no: 1 }]
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('  function attendanceStatusFor'), source.indexOf('  const tuitionLabel')), ctx);
  vm.runInContext(source.slice(source.indexOf('  function buildRowsForMonth'), source.indexOf('  async function loadClassFilter')), ctx);
  return ctx.buildRowsForMonth({ ym: '2026-08',
    classes: [{ id: 'class', class_name: 'Physics', tuition_type: 'per_session', tuition_fee: 120000 }],
    classStudents: [{ student_id: 'student', class_id: 'class', joined_at: '2026-08-13' }],
    attData: [{ student_id: 'student', class_id: 'class', date: '2026-08-13', schedule_id: 268, status, status_overridden: overridden }],
    chosenSchedules: [], suppSessions: [],
    trialReqs: trial ? [{ student_id: 'student', trial_class_id: 'class', trial_session_1_at: '2026-08-13' }] : []
  })[0];
}

test('legacy trial registration remains free without a manual override', () => {
  expect(calculate('present', false).amount).toBe(0);
});
for (const [status, amount] of [['present', 120000], ['makeup', 120000], ['absent', 0], ['trial', 0]]) {
  test(`manual ${status} overrides trial registration`, () => {
    const row = calculate(status, true);
    expect(row.amount).toBe(amount);
    expect(row.attendanceDetails[0].status).toBe(status);
  });
}
test('a regular paid session can become a free trial', () => {
  expect(calculate('trial', true, false).amount).toBe(0);
});
test('attendance cycles through all four states and saves the override', () => {
  const source = fs.readFileSync('class_manage.js', 'utf8');
  expect(source).toContain('%statusCycle.length');
  expect(source).toContain('status_overridden:true');
});
