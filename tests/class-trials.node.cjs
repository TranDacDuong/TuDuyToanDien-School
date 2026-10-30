const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {finished,sessions}=require('../class-trials.js');
function fixture(type='per_session'){
  const context={window:{TuitionDiscounts:{apply:rows=>rows}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('tuition-calculation.js','utf8'),context);
  return {build:context.window.TuitionCalculation.buildRowsForMonth,input:{ym:'2026-10',
    classes:[{id:'c1',tuition_type:type,tuition_fee:100,class_schedules:[{id:1,session_no:1,weekday:4,start_time:'18:00',end_time:'19:00',effective_from:'2026-01-01'}]}],
    classStudents:[{student_id:'s1',class_id:'c1',joined_at:'2026-10-01'}],attData:[],trialReqs:[],suppSessions:[]}};
}
for(const type of ['per_session','per_month','per_course'])test(`active trial never bills ${type}, including supplements and overridden attendance`,()=>{
  const {build,input}=fixture(type);input.classStudents[0].is_trial=true;
  input.attData=[{student_id:'s1',class_id:'c1',date:'2026-10-08',schedule_id:1,status:'present',status_overridden:true}];
  input.suppSessions=[{parent_class_id:'c1',session_date:'2026-10-09',fee_per_student:80,students:[{student_id:'s1',attendance_status:'present'}]}];
  assert.equal(build(input).length,0);
});
test('official billing starts after trial, including attendance-only and supplementary rows',()=>{
  const {build,input}=fixture();input.classStudents[0].tuition_starts_on='2026-10-16';
  input.attData=[{student_id:'s1',class_id:'c1',date:'2026-10-02',schedule_id:1,status:'present',status_overridden:true}];
  input.suppSessions=[{parent_class_id:'c1',session_date:'2026-10-09',fee_per_student:80,students:[{student_id:'s1'}]}];
  assert.equal(build(input)[0].amount,200);
  input.classStudents[0].tuition_starts_on='2026-11-01';assert.equal(build(input).length,0);
});
test('managed trial dates do not waive another class for the same student',()=>{
  const {build,input}=fixture();input.trialReqs=[{student_id:'s1',trial_class_id:'other',trial_session_1_at:'2026-10-01',trial_sessions:[{date:'2026-10-01'}]}];
  assert.equal(build(input)[0].amount,500);
});
test('trial completion uses final session end, including extensions',()=>{
  const request={trial_sessions:[{ends_at:'2026-10-01T12:00:00Z'},{ends_at:'2026-10-08T12:00:00Z'}]};
  assert.equal(finished(request,Date.parse('2026-10-08T11:59:59Z')),false);
  assert.equal(finished(request,Date.parse('2026-10-08T12:00:00Z')),true);
  request.trial_sessions.push({ends_at:'2026-10-15T12:00:00Z'});
  assert.equal(finished(request,Date.parse('2026-10-08T12:00:00Z')),false);
  assert.deepEqual(sessions(null),[]);assert.deepEqual(sessions({trial_sessions:{}}),[]);
});
test('modified JS and inline scripts parse',()=>{
  for(const file of ['class_manage.js','class-trials.js','tuition.js','tuition-calculation.js','dashboard_ops.js'])new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
  for(const file of ['trial_requests.html','income.html']){
    for(const match of fs.readFileSync(file,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1],{filename:file});
  }
});
