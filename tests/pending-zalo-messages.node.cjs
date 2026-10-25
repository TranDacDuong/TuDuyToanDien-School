const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const {PGlite}=createRequire(path.resolve('services/zalo-bot/package.json'))('@electric-sql/pglite');
const source=fs.readFileSync('messages.html','utf8');
test('admin queue includes automatic tuition and prioritizes waiting messages without exposing dispatch tokens',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE FUNCTION is_admin_actor() RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.admin',true)='true'$$;
  CREATE TABLE users(id uuid,full_name text); CREATE TABLE messages(id uuid,context_student_id uuid);
  CREATE TABLE zalo_parent_contacts(parent_id uuid,zalo_alias text);
  CREATE TABLE zalo_outbox(id uuid,audience_user_id uuid,message_id uuid,content text,status text,error_message text,created_at timestamptz);
  CREATE TABLE zalo_tuition_receipts(id uuid,parent_id uuid,student_id uuid,content text,status text,error_message text,created_at timestamptz);
  CREATE TABLE zalo_tuition_deliveries(LIKE zalo_tuition_receipts);
  CREATE TABLE automatic_tuition_reminders(id uuid,parent_id uuid,payload jsonb,status text,error_message text,created_at timestamptz);
  INSERT INTO users VALUES('00000000-0000-0000-0000-000000000001','Test parent');
  INSERT INTO messages VALUES('00000000-0000-0000-0000-000000000002',null);
  INSERT INTO zalo_outbox VALUES('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Sent','sent',null,now());
  INSERT INTO automatic_tuition_reminders VALUES('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','{"content":"Automatic notice","token":"secret"}','queued',null,now()-interval '10 days');`);
  const sql=fs.readFileSync('SQL pending Zalo messages.sql','utf8');await db.exec(sql);await db.exec(sql);
  await assert.rejects(()=>db.query('SELECT * FROM list_mindup_zalo_dispatch_jobs()'),/Admin required/);
  await db.exec("SET ROLE authenticated;SELECT set_config('test.admin','true',false)");
  const rows=(await db.query('SELECT * FROM list_mindup_zalo_dispatch_jobs()')).rows;
  assert.equal(rows[0].kind,'automatic_tuition');assert.equal(rows[0].content,'Automatic notice');
  assert.equal(rows[1].status,'sent');assert.ok(!JSON.stringify(rows).includes('secret'));
  await db.exec("SELECT set_config('test.admin','false',false)");
  await assert.rejects(()=>db.query('SELECT * FROM list_mindup_zalo_dispatch_jobs()'),/Admin required/);
  await db.exec('RESET ROLE;SET ROLE anon');
  await assert.rejects(()=>db.query('SELECT * FROM list_mindup_zalo_dispatch_jobs()'),/permission denied/);
 } finally {await db.close();}
});
test('existing Zalo queue opens waiting messages, handles pause/filter/reload/errors and fits mobile',async t=>{
 const {chromium}=require('@playwright/test');
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.route('**/*',route=>route.abort());
 const fn=source.slice(source.indexOf("let zaloDispatchView ="),source.indexOf('window.cancelQueuedZaloMessage'));
 const css=source.slice(source.indexOf('.zalo-dispatch-dialog {'),source.indexOf('.zalo-link-panel',source.indexOf('.zalo-dispatch-dialog {')));
 const cssEnd=css.includes('</style>')?css.indexOf('</style>'):css.length;
 const disclosure=source.slice(source.indexOf('<details class="dispatch-disclosure">'),source.indexOf('</details>',source.indexOf('<details class="dispatch-disclosure">'))+10).replace('class="zalo-dispatch-bar" hidden','class="zalo-dispatch-bar"');
 await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px Arial;--border:#dbe2eb;--ink:#172c48;--navy:#173b67} ${css.slice(0,cssEnd)}</style>${disclosure}<script>
 let currentProfile={role:'admin'};let rows=[
 {id:'1',kind:'web',parent_name:'Test parent',content:'<img src=x onerror=alert(1)>',status:'pending'},
 {id:'2',kind:'automatic_tuition',parent_name:'Parent two',content:'Automatic tuition',status:'queued'},
 {id:'3',kind:'receipt',parent_name:'Parent three',content:'Receipt',status:'processing'},
 {id:'4',kind:'web',content:'Already delivered',status:'sent'}].map(row=>({...row,created_at:'2026-10-25T03:00:00Z'}));
 window.calls=[];window.fail=false;
 const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const sb={rpc:async name=>{calls.push(name);return name==='list_mindup_zalo_dispatch_jobs'?{data:rows,error:window.fail?{message:'Network unavailable'}:null}:{data:{paused:true,reason:'429 test'}};}};
 ${fn}
 </script>`);
 await page.getByText('Hàng gửi Zalo',{exact:true}).click();
 await page.getByRole('button',{name:'Xem chi tiết',exact:true}).click();
 await page.getByText('3 tin hiển thị',{exact:true}).waitFor();
 assert.equal(await page.locator('tbody tr').count(),3);
 assert.equal(await page.getByText('Already delivered',{exact:true}).count(),0);
 assert.equal(await page.locator('tbody img').count(),0);
 assert.match(await page.locator('.zalo-dispatch-pause').innerText(),/429 test/);
 assert.equal(await page.locator('tbody button').count(),1);
 assert.equal(await page.evaluate(()=>calls.some(name=>/cancel|retry/.test(name))),false);
 await page.getByLabel('Lọc hàng gửi').selectOption('all');await page.getByText('4 tin hiển thị',{exact:true}).waitFor();
 await page.screenshot({path:'scratch/pending-zalo-messages-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 const box=await page.getByRole('dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=391);
 await page.screenshot({path:'scratch/pending-zalo-messages-mobile.png'});
 await page.evaluate(()=>{rows=[];});await page.getByLabel('Lọc hàng gửi').selectOption('waiting');
 await page.getByText('Không có tin nhắn đang chờ gửi.',{exact:true}).waitFor();
 await page.evaluate(()=>{window.fail=true;});await page.getByLabel('Tải lại hàng gửi').click();
 await page.getByText('Không tải được hàng gửi: Network unavailable',{exact:true}).waitFor();
 await page.getByLabel('Đóng',{exact:true}).click();assert.equal(await page.getByRole('dialog').isVisible(),false);
 const before=await page.evaluate(()=>calls.length);await page.evaluate(()=>{currentProfile={role:'teacher'};openZaloDispatchDetails('waiting');});
 assert.equal(await page.evaluate(()=>calls.length),before);
 assert.ok(!source.includes('pendingZaloMessagesEntry'));
});
