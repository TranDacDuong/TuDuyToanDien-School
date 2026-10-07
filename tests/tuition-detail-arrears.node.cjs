const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'tuition.js'), 'utf8');

function detailContext() {
  const context = {
    Intl, paymentMap: {}, getStatus: (due, paid) => due > paid ? 'outstanding' : 'paid',
    fmtDate: () => '-', hasTuitionPermission: () => false,
    statusLabel: { outstanding: 'Còn thiếu', paid: 'Đã nộp' }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function fmt('), source.indexOf('  function todayYM(')), context);
  vm.runInContext(source.slice(source.indexOf('  function buildTuitionDetailHtml('), source.indexOf('  function attendanceSessionClass(')), context);
  return context;
}

test('detail keeps current tuition and shows each unpaid month with total QR', () => {
  const context = detailContext();
  const group = { studentId: 's', studentName: 'Nhật Minh', phone: '0987655826', ym: '2026-10', amount: 960000, classes: [], payment: { amount_paid: 100000 } };
  const bundle = { debts: [{ month: '2026-09-01', remaining: 240000 }, { month: '2026-10-01', remaining: 860000 }], remaining: 1100000, memo: 'SEVQR HP0926 1026 Nhat Minh 5826' };
  const html = context.buildTuitionDetailHtml(group, bundle);
  assert.ok(html.includes('960.000đ'));
  assert.ok(html.includes('Tháng 09/2026'));
  assert.ok(html.includes('Tổng còn thiếu các tháng'));
  assert.ok(html.includes('amount=1100000&amp;') || html.includes('amount=1100000&'));
  assert.ok(html.includes('addInfo=SEVQR%20HP0926%201026%20Nhat%20Minh%205826'));
  assert.ok(!html.includes('amount=860000&'));
});

test('paid current month still gets old debt QR; fully paid gets no QR', () => {
  const context = detailContext();
  const group = { studentId: 's', studentName: 'Minh', phone: '0987655826', ym: '2026-10', amount: 960000, classes: [], payment: { amount_paid: 960000 } };
  const html = context.buildTuitionDetailHtml(group, { debts: [{ month: '2026-09-01', remaining: 240000 }], remaining: 240000, memo: 'SEVQR HP0926 Minh 5826' });
  assert.ok(html.includes('amount=240000&'));
  const paid = context.buildTuitionDetailHtml(group, { debts: [], remaining: 0 });
  assert.ok(!paid.includes('<img'));
});

test('late detail response cannot replace another student or reopen closed popup', async () => {
  const requests = [];
  const body = { innerHTML: '', textContent: '', scrollTop: 0 };
  const modal = { open: false, classList: { add() { modal.open = true; }, remove() { modal.open = false; }, contains() { return modal.open; } }, querySelector() { return null; } };
  const group = id => ({ studentId: id, studentName: id, amount: 100, ym: '2026-10' });
  const context = {
    window: {}, document: { getElementById: id => id === 'tuitionDetailBody' ? body : id === 'tuitionDetailModal' ? modal : {}, body: { classList: { add() {}, remove() {} } } },
    getStudentGroup: group, ymToDate: ym => ym + '-01', paymentMap: {}, esc: value => value,
    buildTuitionDetailHtml: g => g.studentId,
    getSb: () => ({ rpc: () => new Promise(resolve => requests.push(resolve)) })
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  let tuitionDetailRequest'), source.indexOf('  document.addEventListener("keydown"', source.indexOf('  let tuitionDetailRequest'))), context);
  const a = context.window.openTuitionDetail('a');
  const b = context.window.openTuitionDetail('b');
  requests[1]({ data: { debts: [], remaining: 0, payment: {} } }); await b;
  requests[0]({ data: { debts: [], remaining: 0, payment: {} } }); await a;
  assert.equal(body.innerHTML, 'b');
  const c = context.window.openTuitionDetail('c');
  context.window.closeTuitionDetail();
  requests[2]({ data: { debts: [], remaining: 0, payment: {} } }); await c;
  assert.equal(body.innerHTML, 'b');
  assert.equal(modal.open, false);
});
