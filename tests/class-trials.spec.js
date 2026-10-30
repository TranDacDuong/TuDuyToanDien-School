const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
for(const width of [1280,390])test(`class-specific trial form remains inside viewport at ${width}px`,async({page})=>{
 const html=read('trial_requests.html');const main=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('const DAYS'));
 const cid='00000000-0000-0000-0000-000000000003';
 await page.setViewportSize({width,height:800});
 await page.route('https://trial-fixture.invalid/**',route=>{
  if(route.request().resourceType()==='document')return route.fulfill({contentType:'text/html',body:html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')});
  if(route.request().url().includes('theme.css'))return route.fulfill({contentType:'text/css',body:read('theme.css')});
  return route.abort();
 });
 await page.goto('https://trial-fixture.invalid/trial_requests.html?classTrial='+cid);
 await page.evaluate(()=>window.AppPermissions={has:()=>true});
 await page.addScriptTag({content:main.slice(0,main.lastIndexOf('(async()=>{'))});
 await page.evaluate(cid=>{
  S.grades=[{id:'g1',name:'10'}];S.subjects=[{id:'m1',grade_id:'g1',name:'Math'}];
  const schedule={id:1,weekday:1,session_no:1,start_time:'18:00',end_time:'19:30',effective_from:'2020-01-01'};
  S.classes=[{id:cid,class_name:'Math 10',grades:{name:'10'},subjects:{name:'Math'},class_schedules:[schedule]}];
  S.classMap={[cid]:S.classes[0]};S.scheduleMap={1:schedule};openTrialModal();
 },cid);
 await expect(page.locator('#classId')).toHaveValue(cid);await expect(page.locator('#classId')).toBeDisabled();
 await expect(page.locator('#gradeText')).toBeDisabled();await expect(page.locator('#subjectText')).toBeDisabled();
 await expect(page.locator('#schedule1Id')).toHaveValue('1');await expect(page.locator('#session1At')).not.toHaveValue('');
 const box=await page.locator('.modal-card').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y+box.height).toBeLessThanOrEqual(800);
 await page.locator('.modal-card').evaluate(el=>el.scrollTop=el.scrollHeight);
 await expect(page.getByRole('button',{name:'Lưu học thử',exact:true})).toBeVisible();
 await page.screenshot({path:`test-results/class-trial-form-${width}.png`});
});
test('attendance keeps pre-join absences and ordinary students, shows alternate trial appointment',async({page})=>{
 await page.setContent('<div id="cvTabContent"></div>');
 await page.evaluate(()=>{
  window.AppPermissions={has:()=>true};
  window.__requests=[{id:'r1',student_id:'trial',managed_in_class:true,status:'scheduled',trial_sessions:[{date:'2026-10-15',schedule_id:1,session_no:1,ends_at:'2026-10-15T12:00:00Z'},{date:'2026-10-17',schedule_id:2,session_no:1,ends_at:'2026-10-17T12:00:00Z'}]}];
  window.sb={from:table=>{const q={select(){return q},eq(){return q},gte(){return q},lte(){return q},order(){return q},then(resolve){return Promise.resolve({data:table==='trial_lesson_requests'?window.__requests:[],error:null}).then(resolve)}};return q}};
 });
 await page.addScriptTag({path:path.join(root,'class-trials.js')});
 const expose=`window.__renderTrialAttendance=async()=>{
  _classId='c1';_className='Math';_role='admin';_currentMonth=9;_currentYear=2026;
  _cachedClass={class_schedules:[{id:1,session_no:1,weekday:4,start_time:'18:00',end_time:'19:30',effective_from:'2026-01-01'},{id:2,session_no:1,weekday:6,start_time:'18:00',end_time:'19:30',effective_from:'2026-01-01'}],students:[{student_id:'trial',joined_at:'2026-10-15',is_trial:true,user:{full_name:'Trial student'}},{student_id:'regular',joined_at:'2026-10-01',user:{full_name:'Regular student'}}]};
  _studentScheduleHistory={trial:[{schedule_id:1,session_no:1,effective_from:'2026-01-01'}],regular:[{schedule_id:1,session_no:1,effective_from:'2026-01-01'}]};
  await renderAttendanceTab();
 };})();`;
 await page.addScriptTag({content:read('class_manage.js').replace(/\}\)\(\);\s*$/,expose)});
 await page.evaluate(()=>window.__renderTrialAttendance());
 await expect(page.locator('[id="cvatt_trial_2026-10-01_1"]')).toHaveText('Vắng');
 await expect(page.locator('[id="cvatt_trial_2026-10-15_1"]')).toHaveText('Học thử');
 await expect(page.locator('[id="cvatt_trial_2026-10-17_2"]')).toHaveText('Học thử');
 await expect(page.locator('[id="cvatt_regular_2026-10-01_1"]')).toHaveText('Có');
 await expect(page.getByRole('button',{name:'+ Học sinh học thử',exact:true})).toBeVisible();
 await expect(page.getByText('Chưa tham gia',{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>ClassTrials.studentActions({student_id:'regular',is_trial:false,tuition_starts_on:'2026-10-18'}))).toBe('');
});
for(const width of [1280,390])test(`automatic promotion dialog fits ${width}px and can extend trial`,async({page})=>{
 await page.setViewportSize({width,height:800});await page.setContent('<main></main>');
 await page.addStyleTag({path:path.join(root,'class-trials.css')});
 await page.evaluate(()=>{window.AppPermissions={has:()=>true};window.__calls=[];window.sb={rpc:async(name,args)=>{window.__calls.push({name,args});return {error:null}}};});
 await page.addScriptTag({path:path.join(root,'class-trials.js')});
 await page.evaluate(()=>{ClassTrials.setContext({requests:[{id:'r1',trial_sessions:[{date:'2020-01-13',ends_at:'2020-01-13T12:00:00Z'}]}],schedules:[{id:1,weekday:1,start_time:'18:00',end_time:'19:30'}]});ClassTrials.decide('r1');});
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByText('Tự chuyển chính thức sau buổi học thử cuối · Thu phí từ 2020-01-14')).toBeVisible();
 await expect(page.getByRole('button',{name:'Chuyển học chính thức',exact:true})).toHaveCount(0);
 const box=await page.getByRole('dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.height).toBeLessThanOrEqual(800);
 await page.screenshot({path:`test-results/class-trial-decision-${width}.png`});
 await page.getByLabel('Ngày học thử bổ sung').fill('2020-01-20');
 await page.getByRole('combobox').selectOption('1');
 await page.getByRole('button',{name:'Gia hạn học thử',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__calls)).toEqual([{name:'control_class_trial',args:{p_id:'r1',p_action:'extend',p_date:'2020-01-20',p_schedule:1}}]);
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('trial form requires schedules before account creation and debounces saving',async({page})=>{
 const html=read('trial_requests.html');const main=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('const DAYS'));
 await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
 await page.evaluate(()=>{window.AppPermissions={has:()=>true};window.__alerts=[];window.alert=m=>window.__alerts.push(m);window.__accountCalls=0;window.__calls=[];window.sb={rpc:async(name,args)=>{window.__calls.push({name,args});return {error:null}}};});
 await page.addScriptTag({content:main.slice(0,main.lastIndexOf('(async()=>{'))});
 await page.evaluate(()=>{
  for(const [id,value] of Object.entries({studentName:'Test student',studentPhone:'000',studentSchool:'School',parentName:'Test parent',parentPhone:'001'}))document.getElementById(id).value=value;
  for(const [id,value] of Object.entries({gradeText:'10',subjectText:'Math',classId:'c1'}))document.getElementById(id).innerHTML=`<option value="${value}">${value}</option>`;
  ensureTrialAccounts=async()=>{window.__accountCalls++;await new Promise(r=>setTimeout(r,30));document.getElementById('studentId').value='s1';document.getElementById('parentId').value='p1';return {student:{id:'s1'}}};
  loadTrialRequests=async()=>{};toast=()=>{};
 });
 await page.evaluate(()=>saveTrialRequest());expect(await page.evaluate(()=>window.__accountCalls)).toBe(0);
 expect(await page.evaluate(()=>window.__alerts.at(-1))).toContain('2 buổi');
 await page.evaluate(()=>{
  S.scheduleMap={1:{id:1,weekday:1,start_time:'18:00',end_time:'19:30'}};
  for(const id of ['schedule1Id','schedule2Id'])document.getElementById(id).innerHTML='<option value="1">Monday</option>';
  document.getElementById('session1At').innerHTML='<option value="2026-11-02">2026-11-02</option>';
  document.getElementById('session2At').innerHTML='<option value="2026-11-09">2026-11-09</option>';
 });
 await page.evaluate(()=>Promise.all([saveTrialRequest(),saveTrialRequest()]));
 expect(await page.evaluate(()=>window.__accountCalls)).toBe(1);
 const calls=await page.evaluate(()=>window.__calls);expect(calls).toHaveLength(1);expect(calls[0].name).toBe('save_class_trial');expect(calls[0].args.p_payload.student_id).toBe('s1');
});
