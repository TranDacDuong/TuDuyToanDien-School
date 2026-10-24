const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('sourcedata.html','utf8');
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const functions=source.slice(source.indexOf('function sZaloPauseNotice('),source.indexOf('function sZaloDetailDate('));
function harness(state,contacts=[]) {
  const box={innerHTML:''};let queriedContacts=false;
  const context=vm.createContext({esc,Date,_sZaloBulkRunId:null,document:{getElementById:()=>box},sb:{from:table=>{
    const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:state}),then:resolve=>{queriedContacts=true;resolve({data:contacts});}};
    return query;
  }}});
  vm.runInContext(functions,context);
  return {context,box,contactsQueried:()=>queriedContacts};
}
test('global pause is visible even with no bulk run or a completed bulk run',async()=>{
  for(const bulk of [null,'old-run']) {
    const state={paused:true,reason:'429 <blocked>',bulk_run_id:bulk,bulk_total:1};
    const h=harness(state,[{bulk_checked_at:'2026-10-20',status:'friend'}]);
    assert.equal(await h.context.sLoadZaloBulkStatus(),state);
    assert.match(h.box.innerHTML,/Zalo đang tạm dừng gửi và kiểm tra/);
    assert.match(h.box.innerHTML,/429 &lt;blocked&gt;/);
    assert.match(h.box.innerHTML,/Tiếp tục sau khi kiểm tra/);
  }
  const h=harness({paused:false});await h.context.sLoadZaloBulkStatus();
  assert.doesNotMatch(h.box.innerHTML,/role="alert"/);
});
test('manual request feedback checks the current pause and resuming remains a deliberate user action',()=>{
  const action=source.slice(source.indexOf('async function sRequestParentZalo('),source.indexOf('function sMobileStatusPill('));
  assert.ok(action.includes('const automation=await sLoadZaloBulkStatus()'));
  assert.ok(action.includes('automation?.paused?'));
  assert.ok(source.includes("if(!pause&&!confirm("));
});
test('pause notice stays readable on desktop and mobile without contacting Zalo',async t=>{
  const {chromium}=require('@playwright/test');
  const h=harness({paused:true,reason:'Kiểm tra quan hệ Zalo: Request failed with status code 429'});
  await h.context.sLoadZaloBulkStatus();
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();
  await page.setContent(`<html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px Arial;margin:16px;color:#182b49}button{padding:8px;margin-top:8px;cursor:pointer}[role=alert]{line-height:1.6;overflow-wrap:anywhere}</style>${h.box.innerHTML}</html>`);
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:720});
    assert.equal(await page.getByRole('alert').isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`scratch/zalo-pause-${width}.png`});
  }
});
