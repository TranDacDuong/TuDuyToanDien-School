const { test } = require('node:test');
const assert = require('node:assert/strict');
const { memo, total } = require('../tuition-arrears.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('readable memo includes unpaid months, unaccented student and phone suffix', () => {
  const debts = [{ month: '2026-10-01', remaining: 960000 }, { month: '2026-08-01', remaining: 240000 }, { month: '2026-09-01', remaining: 360000 }];
  assert.equal(memo('Trần Ngọc Nhật Minh', '0987655826', debts), 'SEVQR HP0826 0926 1026 Nhat Minh 5826');
  assert.equal(total(debts), 1560000);
  debts[2].remaining = 0;
  assert.equal(memo('Trần Ngọc Nhật Minh', '0987655826', debts), 'SEVQR HP0826 1026 Nhat Minh 5826');
});
test('campaign includes old-only students without changing the current-month tuition amount', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'tuition.js'), 'utf8');
  const context = {
    window: { TuitionArrears: { memo, total } }, monthPicker: { value: '2026-10' },
    STATIC_BANK_INFO: { bankCode: 'vietinbank', account: '104888332556' },
    currentRows: [{ studentId: 's', studentName: 'Nhật Minh', phone: '0987655826', amount: 960000, ym: '2026-10', parentContacts: [{ id: 'p', phone: '0987654321', full_name: 'Parent' }] }],
    paymentMap: { s: { amount_paid: 0 } },
    zaloArrears: new Map([
      ['s', { student_id: 's', debts: [{ month: '2026-08-01', remaining: 240000 }, { month: '2026-09-01', remaining: 360000 }] }],
      ['old', { student_id: 'old', student_name: 'Minh Anh', phone: '0987655827', current_amount_due: 0, parents: [{ id: 'p', phone: '0987654321' }], debts: [{ month: '2026-08-01', remaining: 100000 }] }]
    ]),
    currentZaloCampaignItems: [], getStatus: (due, paid) => due > paid ? 'outstanding' : 'paid',
    buildTransferContent: () => '', buildPaymentQrUrl: () => '', ymToDate: ym => ym + '-01'
  };
  vm.createContext(context);
  let start = source.indexOf('  function applyZaloDebts(');
  let end = source.indexOf('  const DEFAULT_ZALO_TEMPLATE', start);
  // Extract just the helper, independent of the surrounding initialization.
  end = source.indexOf('\n  }', start) + 4;
  vm.runInContext(source.slice(start, end), context);
  start = source.indexOf('  function prepareZaloCampaignList()');
  end = source.indexOf('  function isZaloTuitionItemBaseEligible', start);
  vm.runInContext(source.slice(start, end), context);
  context.prepareZaloCampaignList();
  assert.equal(context.currentZaloCampaignItems[0].remaining, 1560000);
  assert.equal(context.currentZaloCampaignItems[0].amount, 960000);
  assert.equal(context.currentZaloCampaignItems[1].remaining, 100000);
  assert.equal(context.currentZaloCampaignItems[1].selected, true);
});
test('cross-year, old-only balances and invalid input', () => {
  assert.equal(memo('Đặng Minh', '84987655826', [{ month: '2025-12-01', remaining: 100 }, { month: '2026-01-01', remaining: 100 }]), 'SEVQR HP1225 0126 Dang Minh 5826');
  assert.equal(memo('Nhật Minh', '0987655826', [{ month: '2026-08-01', remaining: 100 }]), 'SEVQR HP0826 Nhat Minh 5826');
  assert.throws(() => memo('Minh', '', [{ month: '2026-08-01', remaining: 100 }]));
  assert.throws(() => total([{ remaining: -1 }]));
});
