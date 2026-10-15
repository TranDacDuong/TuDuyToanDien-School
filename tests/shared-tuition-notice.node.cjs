const test=require('node:test');
const assert=require('node:assert/strict');
const Notice=require('../tuition-notice');
const {buildPayload}=require('../services/zalo-bot/tuition-reminder-scheduler');
const bank={code:'vietinbank',bankName:'VietinBank',account:'104888332556',parent_names:{p:'Nguyễn Thu Trang'},billing_context:{
  classes:[{id:'c',class_name:'Toán 10',tuition_type:'per_session',tuition_fee:100000,class_schedules:[{id:1,session_no:1,weekday:4,start_time:'18:00',end_time:'19:00'}]}],
  classStudents:[{student_id:'s',class_id:'c',joined_at:'2026-10-01'}],attData:[]}};
const child={student_id:'s',student_name:'Dương Gia Huy',remaining:500000,payment_phone:'0912345678',transfer_memo:'SEVQR HP1026 Gia Huy 5678',debts:[{month:'2026-10-01',remaining:500000}]};
test('automatic notice exactly matches manual renderer including classes, sessions and bank',()=>{
  const item={studentName:child.student_name,parentName:'Nguyễn Thu Trang',className:'Toán 10',sessionsCount:5,remaining:child.remaining,transferMemo:child.transfer_memo,debts:child.debts};
  assert.equal(buildPayload({parent_id:'p',children:[child]},'2026-10',bank).content,Notice.render(item,'2026-10',bank));
});
test('shared saved template and arrears renderer keep payment memo and balances',()=>{
  const custom={...bank,notice_template:'{TenPH}: {TenHS} - {SoTien} - {NoiDungCK}'};
  assert.equal(buildPayload({parent_id:'p',children:[child]},'2026-10',custom).content,
    'Nguyễn Thu Trang: Dương Gia Huy - 500.000 - SEVQR HP1026 Gia Huy 5678');
  const debts=[{month:'2026-09-01',remaining:200000},{month:'2026-10-01',remaining:500000}];
  const c={...child,remaining:700000,debts,transfer_memo:'SEVQR HP0926 1026 Gia Huy 5678'};
  const payload=buildPayload({parent_id:'p',children:[c]},'2026-10',bank);
  assert.equal(payload.content,Notice.render({studentName:c.student_name,parentName:'Nguyễn Thu Trang',remaining:700000,debts,transferMemo:c.transfer_memo},'2026-10',bank));
  assert.equal(new URL(payload.parts[1].url).searchParams.get('amount'),'700000');
  assert.equal(new URL(payload.parts[1].url).searchParams.get('addInfo'),c.transfer_memo);
});
