const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('@playwright/test');
const source=fs.readFileSync('sourcedata.html','utf8');
const take=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
test('concurrent directory loads render one name/email, one Zalo control pair and one PH status per student',async t=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1600,height:950}});await page.route('**/*',r=>r.abort());
 const styles=[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>'+styles+'</style></head><body><h2>Kiểm thử tải đồng thời — dữ liệu mẫu</h2><section id="students" class="section active"><span id="sStatShow"></span><table><thead><tr><th>STT</th><th>Học sinh</th><th>SĐT</th><th>Phụ huynh</th><th>Zalo PH</th><th>App / Thông báo</th><th>Năm sinh</th><th>Tỉnh</th><th>Trường</th><th>Thao tác</th></tr></thead><tbody id="sTable"></tbody></table></section></body></html>');
 await page.addScriptTag({content:take('async function sLoadLinkedParentsForStudents(','async function sLoadMobileStatusesForStudents(')+take('function sZaloParentStatusHtml(','const _sParentZaloBusy')+take('function sMobileStatusPill(','function sMatchesZaloStatus(')+take('function sRender(){','function sPgRender(){')});
 await page.evaluate(async()=>{
  window._sLinkedParents={};window._sParentDirectoryVersion=0;window._sParentDirectoryError=false;window._sZaloContactsError=false;window._sParentZaloBusy=new Set();window._sMobileStatus={};window._sPage=1;window.S_PAGE=20;
  window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.sIni=()=> 'HS';window.sPgRender=()=>{};window.AppPermissions={has:()=>true};
  const parents=[{id:'p1',full_name:'Phụ huynh mẫu A',email:'parent-a@example.test',phone:'0900000001',role:'parent'},{id:'p2',full_name:'Phụ huynh mẫu B',email:'parent-b@example.test',phone:'0900000002',role:'parent'}];
  const students=[{id:'s1',full_name:'Học sinh mẫu A'},{id:'s2',full_name:'Học sinh mẫu B'}];
  window._sZaloContacts={p1:{status:'friend',zalo_uid:'123'},p2:{status:'friend',zalo_uid:'456'}};
  const responses=[];let n=0;
  const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};responses.push(deferred(),deferred());
  const chain=result=>{const q={select:()=>q,in:()=>q,is:()=>q,then:(...args)=>Promise.resolve(result).then(...args)};return q;};
  window.sb={from:table=>chain(table==='parent_students'?{data:[{parent_id:'p1',student_id:'s1'},{parent_id:'p2',student_id:'s2'}]}:responses[n++].promise)};
  const a=sLoadLinkedParentsForStudents(students);await new Promise(r=>setTimeout(r,0));const b=sLoadLinkedParentsForStudents(students);await new Promise(r=>setTimeout(r,0));
  responses[1].resolve({data:parents});await b;responses[0].resolve({data:parents});await a;
  window._sFilt=students;sRender();
 });
 const rows=page.locator('#sTable tr');assert.equal(await rows.count(),2);
 for(let i=0;i<2;i++){
  assert.equal(await rows.nth(i).getByRole('button',{name:'Kiểm tra & Kết nối Zalo',exact:true}).count(),1);
  assert.equal(await rows.nth(i).getByRole('button',{name:'Đồng bộ biệt danh',exact:true}).count(),1);
  assert.equal(await rows.nth(i).locator('.mobile-status-role').filter({hasText:/^PH$/}).count(),1);
  const text=await rows.nth(i).innerText();assert.equal(text.split(i?'parent-b@example.test':'parent-a@example.test').length-1,1);
 }
 await page.screenshot({path:'scratch/student-parent-directory-fixed.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.mobile-status-role').filter({hasText:/^PH$/}).count(),2);
});
