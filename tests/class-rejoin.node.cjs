const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('class_manage.js','utf8');
const take=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const helpers=take('  function classEnrollmentPeriods(', '  function esc(');
const old={id:'old',student_id:'s',joined_at:'2026-09-01',left_at:'2026-09-10',user:{full_name:'Student'}};
const current={id:'new',student_id:'s',joined_at:'2026-11-20',left_at:null,user:{full_name:'Student'}};
function ctx(extra={}){const c={...extra};vm.createContext(c);vm.runInContext(helpers,c);return c;}
test('stopped and rejoined memberships produce one row, retain periods and leave source history unchanged',()=>{
 const c=ctx(),rows=[old,current],before=JSON.stringify(rows),merged=c.mergeClassStudentRows(rows);
 assert.equal(merged.length,1);assert.equal(merged[0].id,'new');assert.equal(merged[0].joined_at,'2026-09-01');assert.equal(merged[0].left_at,null);
 assert.equal(merged[0].enrollment_periods.length,2);assert.equal(JSON.stringify(rows),before);
 assert.equal(c.mergeClassStudentRows(merged)[0].enrollment_periods.length,2);
 assert.equal(c.mergeClassStudentRows([old,current,current]).length,1);
});
test('inactive gaps are not treated as continuous membership and historical months remain available',()=>{
 const c=ctx(),s=c.mergeClassStudentRows([old,current])[0];
 for(const [day,expected] of [['2026-09-05',true],['2026-10-05',false],['2026-11-15',false],['2026-11-25',true]])assert.equal(c.isClassStudentEnrolledOn(s,day),expected);
 assert.equal(c.classStudentOverlapsMonth(s,'2026-10-01','2026-10-31'),false);
 assert.equal(c.classStudentOverlapsMonth(s,'2026-09-01','2026-09-30'),true);
});
test('same-day rejoin, repeated stops, trial metadata and different students keep one correct row each',()=>{
 const c=ctx(),closed={...current,left_at:'2026-11-25'},again={...current,id:'latest',joined_at:'2026-11-25'};
 const rows=c.mergeClassStudentRows([{...old,is_trial:true},closed,again,{...again,student_id:'other',id:'other-id'}]);
 assert.equal(rows.length,2);assert.equal(rows[0].enrollment_periods.length,3);assert.equal(rows[0].id,'latest');
 assert.equal(c.isClassStudentEnrolledOn(rows[0],'2026-11-25'),true);
 const stopped=c.mergeClassStudentRows([old,closed])[0];assert.equal(stopped.left_at,'2026-11-25');
});
test('stopping again updates only open memberships and reloads without overwriting an old departure date',async()=>{
 const periods=structuredClone([old,current]);let reloaded=0;const filters=[];
 const c=ctx({window:{AppAdminTools:{recordAudit:async()=>{}}},_currentMonth:10,_currentYear:2026,_cachedClass:{students:[],class_schedules:[]},confirm:()=>true,alert:()=>{},todayStr:()=> '2026-11-30',getSchedulesForMonth:()=>[],generateStudentOccurrences:()=>[],
  getSb:()=>({from:()=>{const q={update:value=>{q.value=value;return q;},eq:()=>q,is:(column,value)=>{filters.push([column,value]);return q;},then:resolve=>{periods.filter(p=>!p.left_at).forEach(p=>p.left_at=q.value.left_at);return Promise.resolve({error:null}).then(resolve);}};return q;}}),
  loadAndRender:async()=>{reloaded++;}});
 c._cachedClass.students=c.mergeClassStudentRows(periods);
 vm.runInContext(take('  window.cvStopStudent =','  window.cvClassOff ='),c);
 await c.window.cvStopStudent('c','s');assert.deepEqual(filters,[['left_at',null]]);assert.equal(periods[0].left_at,old.left_at);assert.ok(periods[1].left_at);assert.equal(reloaded,1);
});
test('rejoin double-click inserts once, preserves existing attendance and keeps one cached row',async()=>{
 let inserts=0,release,reloaded=0,options;const pending=new Promise(r=>release=r),attendance={status:'makeup'};
 const c=ctx({window:{AppAdminTools:{recordAudit:async()=>{}}},_classId:'c',_currentMonth:10,_currentYear:2026,_studentScheduleHistory:{},_studentScheduleMap:{},_cachedClass:{students:[{...old,left_at:'2026-11-10'}],class_schedules:[]},
  todayStr:()=> '2026-11-30',document:{getElementById:()=>({value:'2026-11-01'})},alert:()=>{},getSchedulesForMonth:()=>[],chooseSchedulesForStudent:()=>[],
  generateOccurrences:()=>[{date:'2026-11-05',schedule_id:1,session_no:1}],uniqueAttendanceRows:rows=>rows,cvCloseAddStudent:()=>{},loadAndRender:async()=>{reloaded++;},
  getSb:()=>({from:table=>{
   const q={insert:()=>{inserts++;return q;},select:()=>q,eq:()=>q,neq:()=>q,update:()=>q,
    single:()=>table==='class_students'?pending:Promise.resolve({data:{id:'s',full_name:'Student'}}),
    upsert:(rows,opts)=>{options=opts;if(!opts.ignoreDuplicates)attendance.status=rows[0].status;return Promise.resolve({error:null});},then:resolve=>Promise.resolve({error:null}).then(resolve)};return q;
  }})});
 vm.runInContext(take('  const pendingClassStudentAdds=', '  function getExamAccessMeta('),c);
 const a=c.window.cvConfirmAddStudent('s','Student'),b=c.window.cvConfirmAddStudent('s','Student');assert.equal(inserts,1);
 release({data:{id:'new',joined_at:'2026-11-01'},error:null});await Promise.all([a,b]);
 assert.equal(c._cachedClass.students.length,1);assert.equal(c._cachedClass.students[0].enrollment_periods.length,2);
 assert.equal(attendance.status,'makeup');assert.equal(options.ignoreDuplicates,true);assert.equal(reloaded,1);
});

test('real attendance renderer shows one row across rejoin history and clicking writes one attendance record',async()=>{
 const {chromium}=require('@playwright/test');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<div id="cvTabContent"></div>');
  await page.evaluate(({helpers,render,statuses,toggle,rows})=>{
   Object.assign(window,{
    _cachedClass:{students:rows,class_schedules:[{id:1}]},_role:'teacher',_classId:'c',_className:'Test',_currentMonth:10,_currentYear:2026,
    _studentScheduleLoadError:null,_attendanceMap:{},__writes:[],
    monthStart:()=> '2026-11-01',monthEnd:()=> '2026-11-30',todayStr:()=> '2026-11-30',
    canEvaluateClassSession:()=>false,canTakeAttendance:()=>true,getSchedulesForMonth:()=>[{id:1}],getStudentSchedules:()=>[{id:1}],
    collectDatesForStudents:()=>['2026-11-05','2026-11-15','2026-11-25'].map(date=>({date,schedule_id:1,session_no:1})),
    buildSessionMapByDate:()=>new Map(),renderAttendanceDateHeader:item=>'<th>'+item.date+'</th>',attendanceSessionStyle:()=>'',
    esc:s=>s,jsArg:s=>s,loadAndRender:async()=>{},
    getSb:()=>({from:table=>{
     const q={select:()=>q,eq:()=>q,gte:()=>q,lte:()=>q,
      then:resolve=>Promise.resolve({data:table==='attendance'?[{student_id:'s',date:'2026-11-05',status:'makeup',schedule_id:1}]:[]}).then(resolve),
      upsert:async rows=>{window.__writes.push(...rows);return {error:null};}};return q;
    }})
   });
   // Execute the production renderer and toggle handler together, with synthetic data only.
   window.__render=new Function(helpers+statuses+render+toggle+';return renderAttendanceTab;')();
  },{helpers,render:take('  async function renderAttendanceTab(){','  function getSessionScoreStudents('),
    statuses:take('  const statusCycle =','  const attendanceSessionColors ='),
    toggle:take('  window.cvToggleAtt =','  window.cvStopStudent ='),
    rows:[{...old,joined_at:'2026-11-01',left_at:'2026-11-10'},current]});
  await page.evaluate(()=>window.__render());
  assert.equal(await page.locator('button[onclick^="cvOpenEditStudentSchedule"]').count(),1);
  assert.equal(await page.locator('button[id^="cvatt_"]').count(),3);
  const statuses=await page.locator('button[id^="cvatt_"]').evaluateAll(buttons=>buttons.map(b=>b.getAttribute('onclick')));
  assert.match(statuses[0],/'makeup'/);assert.match(statuses[1],/'absent'/);assert.match(statuses[2],/'present'/);
  await page.locator('#cvatt_s_2026-11-25_1').click();
  await page.waitForFunction(()=>window.__writes.length===1);
  assert.equal(await page.evaluate(()=>window.__writes[0].student_id),'s');
  assert.match(await page.locator('#cvatt_s_2026-11-25_1').getAttribute('onclick'),/'absent'/);
 }finally{await browser.close();}
});
