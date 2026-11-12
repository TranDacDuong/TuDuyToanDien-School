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
test('batch tab shows recipient progress and only retries the selected row', async t => {
 const { chromium } = require('@playwright/test');
 const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
 t.after(() => browser.close());
 const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
 const css = source.slice(source.indexOf('.zalo-dispatch-dialog {'), source.indexOf('.zalo-dispatch-controls select {') + '.zalo-dispatch-controls select { font:inherit; padding:6px; max-width:100%; }'.length);
 await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><button id="zaloBatchesEntry" hidden onclick="ZaloSendBatches.open()">Batch tab</button>`);
 await page.addScriptTag({ path: 'zalo-send-batches.js' });
 await page.evaluate(() => {
   window.calls = [];
   window.client = { async rpc(name, args) {
     calls.push([name, args]);
     if (name === 'list_zalo_send_batches') return { data: [{ batch_key: 'offline_test_score:test', category: 'score', title: 'Motion test', recipients: 2, total: 2, waiting: 0, processing: 0, sent: 0, errors: 2, skipped: 0, paused: 0 }] };
     if (name === 'list_zalo_send_batch_items') return { data: [
       { id: 'job-one', queue: 'web', category: 'score', title: 'Motion test', parent_name: 'First parent', status: 'failed', body: '<img src=x>', total_parts: 2, completed_parts: 1, error_message: 'Image rejected' },
       { id: 'job-two', queue: 'web', category: 'score', title: 'Motion test', parent_name: 'Second parent', status: 'uncertain', total_parts: 2, completed_parts: 0 }
     ] };
     if (name === 'control_zalo_send_batch') return { data: 1 };
     return { data: { paused: false } };
   } };
   ZaloSendBatches.configure(client, { role: 'teacher' });
 });
 assert.equal(await page.getByRole('button', { name: 'Batch tab' }).count(), 0);
 await page.evaluate(() => ZaloSendBatches.configure(client, { role: 'admin' }));
 await page.getByRole('button', { name: 'Batch tab' }).click();
 await page.locator('tbody button[data-command=open]').click();
 await page.getByText('Image rejected', { exact: true }).waitFor();
 assert.equal(await page.locator('tbody img').count(), 0);
 assert.equal(await page.locator('tbody button[data-command=retry]').count(), 1);
 await page.locator('tbody button[data-command=retry]').click();
 await page.waitForFunction(() => calls.some(([name]) => name === 'control_zalo_send_batch'));
 const action = await page.evaluate(() => calls.find(([name]) => name === 'control_zalo_send_batch')[1]);
 assert.deepEqual(action, { p_batch: 'offline_test_score:test', p_action: 'retry', p_job: 'job-one', p_checked: false });
 const box = await page.getByRole('dialog').boundingBox();
 assert.ok(box.x >= 0 && box.x + box.width <= 391);
});
