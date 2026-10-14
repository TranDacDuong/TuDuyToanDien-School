const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { apply } = require('../tuition-discounts.js');
const source = fs.readFileSync('tuition-calculation.js','utf8');
function setup() {
  const rules = [{student_id:'s1',starts_month:'2026-10-01',percent:50,class_ids:['c1']}];
  const context = { window: { TuitionDiscounts: {apply: rows => apply(rows,rules)} } };
  vm.createContext(context); vm.runInContext(source, context);
  const input = { ym:'2026-10', classes:[{id:'c1',class_name:'Math',tuition_type:'per_session',tuition_fee:100,
    class_schedules:[{id:1,session_no:1,weekday:4,start_time:'18:00',end_time:'19:00',effective_from:'2026-01-01'}]}],
    classStudents:[{student_id:'s1',class_id:'c1',joined_at:'2026-10-01'}],
    attData:[{student_id:'s1',class_id:'c1',date:'2026-10-08',schedule_id:1,status:'absent'}],
    trialReqs:[{student_id:'s1',trial_class_id:'c1',trial_session_1_at:'2026-10-01'}],
    suppSessions:[{parent_class_id:'c1',session_date:'2026-10-09',topic:'Extra',fee_per_student:50,
      students:[{student_id:'s1',attendance_status:'present'},{student_id:'s2',attendance_status:'present',tuition_fee:80}]}] };
  return { input, build: context.window.TuitionCalculation.buildRowsForMonth };
}
test('shared calculation includes trial, absence, discounts and supplementary-only students', () => {
  const {input,build} = setup(); const rows=build(input);
  assert.equal(rows[0].grossAmount,350); assert.equal(rows[0].amount,175);
  assert.equal(rows[1].amount,80);
  assert.equal(rows.reduce((sum,r)=>sum+r.amount,0),255);
});
test('explicit attendance override and locked discount use tuition page rules', () => {
  const {input,build} = setup();
  input.attData.push({student_id:'s1',class_id:'c1',date:'2026-10-01',schedule_id:1,status:'present',status_overridden:true});
  assert.equal(build(input)[0].amount,225);
  input.payments={s1:{month:'2026-10-01',locked_at:'2026-10-01',gross_components:[{class_id:'c1',percent:20}]}};
  assert.equal(build(input)[0].amount,360);
});
test('parent scope is preserved when using shared calculator', () => {
  const {input,build}=setup();
  assert.equal(build(input,{currentRole:'parent',parentStudentIds:new Set(['s1'])}).length,1);
});
test('both pages use same module and dashboard reads complete inputs without persisting', () => {
  const ops=fs.readFileSync('dashboard_ops.js','utf8'); const tuition=fs.readFileSync('tuition.js','utf8');
  assert.match(ops,/TuitionCalculation.buildRowsForMonth/);
  assert.match(tuition,/TuitionCalculation.buildRowsForMonth/);
  assert.match(ops,/TuitionDiscounts.load\("admin"\)/);
  assert.match(ops,/status_overridden/); assert.match(ops,/gross_components/);
  assert.doesNotMatch(ops,/TuitionDiscounts.persist/);
  for(const file of ['tuition.html','dashboard.html']) assert.match(fs.readFileSync(file,'utf8'),/tuition-calculation.js/);
});
