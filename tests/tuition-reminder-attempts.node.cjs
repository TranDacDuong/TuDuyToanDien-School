const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('manual reminder audit sequence and readonly waiting reasons',async t=>{
 const db=new PGlite();
 const admin='00000000-0000-0000-0000-000000000001',a='00000000-0000-0000-0000-000000000002',b='00000000-0000-0000-0000-000000000003';
 const p='00000000-0000-0000-0000-000000000004',p2='00000000-0000-0000-0000-000000000005',p3='00000000-0000-0000-0000-000000000006';
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('test.uid',true),''),'${admin}')::uuid$$;
 CREATE FUNCTION has_app_permission(text) RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.deny',true) IS DISTINCT FROM 'yes'$$;
 CREATE TABLE users(id uuid PRIMARY KEY,role text,full_name text,phone text);
 INSERT INTO users VALUES('${admin}','admin','Admin',null),('${a}','student','A',null),('${b}','student','B',null),
 ('${p}','parent','Parent 1','0900000001'),('${p2}','parent','Parent 2','0900000002'),('${p3}','parent','Parent 3','0900000003');
 CREATE TABLE parent_students(student_id uuid,parent_id uuid,revoked_at timestamptz);
 INSERT INTO parent_students VALUES('${a}','${p}',null),('${b}','${p2}',null);
 CREATE TABLE tuition_payments(id uuid DEFAULT gen_random_uuid(),student_id uuid,month date,amount_due numeric,amount_paid numeric,UNIQUE(student_id,month));
 INSERT INTO tuition_payments(student_id,month,amount_due,amount_paid) VALUES('${a}','2026-10-01',100,0),('${b}','2026-10-01',100,0);
 CREATE TABLE zalo_tuition_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_key uuid UNIQUE,batch_id uuid,student_id uuid,parent_id uuid,month date,
 attempt_no smallint NOT NULL CHECK(attempt_no BETWEEN 1 AND 3),remaining_snapshot numeric,content text,qr_url text,status text DEFAULT 'queued',
 created_by uuid,debt_snapshot jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),error_message text,UNIQUE(student_id,parent_id,month,attempt_no));
 INSERT INTO zalo_tuition_deliveries(request_key,student_id,parent_id,month,attempt_no,status) SELECT gen_random_uuid(),'${a}','${p}','2026-10-01',n,'sent' FROM generate_series(1,3)n;
 CREATE FUNCTION tuition_debt_snapshot(uuid,date) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_agg(jsonb_build_object('payment_id',id,'month',month,'remaining',amount_due-amount_paid) ORDER BY month) FROM tuition_payments WHERE student_id=$1 AND month<=$2 AND amount_due>amount_paid$$;
 CREATE FUNCTION register_tuition_bundle(uuid,jsonb) RETURNS text LANGUAGE sql AS $$SELECT 'SEVQR HP1026 Test '||right($1::text,4)$$;
 CREATE TABLE zalo_parent_contacts(parent_id uuid PRIMARY KEY,status text,zalo_uid text,greeting_sent_at timestamptz,last_error text);
 CREATE TABLE automatic_tuition_reminders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),parent_id uuid,month date,phone text,slot integer DEFAULT 15,due_date date DEFAULT '2026-10-15',status text DEFAULT 'queued',
 acknowledgements jsonb DEFAULT '[]',payload jsonb DEFAULT '{"parts":[{"kind":"text"},{"kind":"qr"}],"children":[{"student_name":"Test child"}]}',
 error_message text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
 const original=fs.readFileSync('SQL grouped tuition arrears.sql','utf8');
 await db.exec(original.slice(original.indexOf('CREATE OR REPLACE FUNCTION public.queue_grouped_tuition('),original.indexOf('CREATE OR REPLACE FUNCTION public.save_tuition_notice_amounts(')));
 const item=async(student,parent)=>{
  const debts=(await db.query('select tuition_debt_snapshot($1,$2) as debts',[student,'2026-10-01'])).rows[0].debts;
  const memo='SEVQR HP1026 Test '+student.slice(-4),encoded=memo.replaceAll(' ','%20');
  return {request_key:randomUUID(),batch_id:randomUUID(),student_id:student,parent_id:parent,debts,remaining:100,memo,encoded_memo:encoded,content:'Test '+memo,qr_url:'https://img.vietqr.io/image/vietinbank-104888332556-compact2.png?amount=100&addInfo='+encoded};
 };
 const first=await item(a,p),second=await item(b,p2),batch=[second,first];
 const queue=items=>db.query("select queue_grouped_tuition('2026-10-01',$1,true) as result",[JSON.stringify(items)]);
 await t.test('reproduces whole-batch rollback at the stale three-attempt constraint',async()=>{
  await assert.rejects(queue(batch),/zalo_tuition_deliveries_attempt_no_check/);
  assert.equal((await db.query('select count(*)::integer as n from zalo_tuition_deliveries')).rows[0].n,3);
 });
 const migration=fs.readFileSync('SQL tuition reminder attempts and waiting reasons.sql','utf8');await db.exec(migration);
 await t.test('fourth reminder queues with the other student and retries remain idempotent',async()=>{
  assert.equal((await queue(batch)).rows[0].result.queued,2);
  assert.equal((await db.query("select max(attempt_no) as n from zalo_tuition_deliveries where student_id=$1",[a])).rows[0].n,4);
  assert.equal((await queue(batch)).rows[0].result.queued,0);
  assert.equal((await db.query('select count(*)::integer as n from zalo_tuition_deliveries')).rows[0].n,5);
 });
 await t.test('positive sequence validation, authorization and debt-change checks stay enforced',async()=>{
  await assert.rejects(db.exec('UPDATE zalo_tuition_deliveries SET attempt_no=0 WHERE attempt_no=4'),/attempt_no_check/);
  await db.exec("SET test.deny='yes'");await assert.rejects(queue([await item(a,p)]),/permission/);await db.exec("SET test.deny='no'");
  const changed=await item(a,p);changed.remaining=99;await assert.rejects(queue([changed]),/Debt changed/);
  await db.exec("UPDATE zalo_tuition_deliveries SET attempt_no=32767,status='sent' WHERE student_id='"+a+"' AND attempt_no=4");
  assert.equal((await queue([await item(a,p)])).rows[0].result.queued,1);
  assert.equal((await db.query('select max(attempt_no) as n from zalo_tuition_deliveries')).rows[0].n,32768);
 });
 await t.test('migration leaves pending and uncertain records untouched',async()=>{
  await db.exec("UPDATE zalo_tuition_deliveries SET status='uncertain',error_message='Keep uncertain' WHERE student_id='"+a+"' AND attempt_no=1");
  const before=(await db.query('select * from zalo_tuition_deliveries order by id')).rows;
  await db.exec(migration);assert.deepEqual((await db.query('select * from zalo_tuition_deliveries order by id')).rows,before);
 });
 await t.test('admin detail report explains missing Zalo, invitations and uncertain blockers without altering status',async()=>{
  await db.exec(`UPDATE zalo_tuition_deliveries SET status='sent';
   INSERT INTO zalo_parent_contacts VALUES('${p}','not_found',null,null,null),('${p2}','invited','uid2',null,null),('${p3}','friend','uid3',null,null);
   INSERT INTO automatic_tuition_reminders(parent_id,phone,month) VALUES('${p}','0900000001','2026-10-01'),('${p2}','0900000002','2026-10-01'),('${p3}','0900000003','2026-10-01');
   INSERT INTO automatic_tuition_reminders(parent_id,phone,month,status) VALUES('${p3}','0900000003','2026-10-01','uncertain');`);
  const rows=(await db.query("select list_automatic_tuition_reminders('2026-10-01') as rows")).rows[0].rows;
  assert.match(rows.find(r=>r.parent_name==='Parent 1').waiting_reason,/chưa tìm thấy/);
  assert.match(rows.find(r=>r.parent_name==='Parent 2').waiting_reason,/chờ xác nhận kết bạn/);
  assert.match(rows.find(r=>r.parent_name==='Parent 3'&&r.status==='queued').waiting_reason,/tránh gửi trùng/);
  assert.equal(rows.filter(r=>r.status==='queued').length,3);
  assert.ok(rows.every(r=>!('token'in r)&&!('payload'in r)));
  await db.exec("SET test.uid='"+p+"'");await assert.rejects(db.query("select list_automatic_tuition_reminders('2026-10-01')"),/Not authorized/);
 });
 }finally{await db.close();}
});
test('delivery detail text preserves uncertainty rather than claiming failure or success',()=>{
 const source=fs.readFileSync('tuition.js','utf8'),start=source.indexOf('  function automaticTuitionDeliveryNote('),end=source.indexOf('  function renderAutomaticTuitionDetails()',start),ctx={};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 assert.match(ctx.automaticTuitionDeliveryNote({status:'uncertain',error_message:'Zalo returned no message id'}),/Tin có thể đã đến/);
 assert.equal(ctx.automaticTuitionDeliveryNote({status:'queued',waiting_reason:'Waiting for friendship'}),'Waiting for friendship');
 assert.match(ctx.automaticTuitionDeliveryNote({status:'cancelled',error_message:'Saved calculation changed'}),/công nợ thay đổi/);
 assert.equal(ctx.automaticTuitionDeliveryNote({status:'uncertain',error_message:'Không thể nhận tin nhắn từ bạn.'}),'Không thể nhận tin nhắn từ bạn.');
});
test('manual queue confirmation warns about uncertain automatic sends once per parent and makes no RPC when declined',async()=>{
 const source=fs.readFileSync('tuition.js','utf8'),start=source.indexOf('  async function queueZaloTuitionItems('),end=source.indexOf('  window.pauseZaloCampaignAction',start);
 let prompt;
 const ctx={zaloQueueBusy:false,monthPicker:{value:'2026-10'},isZaloTuitionItemBaseEligible:()=>true,isZaloTuitionItemEligible:()=>true,
  zaloTuitionHistory:new Map(),automaticTuitionRows:[{parent_id:'p',status:'uncertain'}],confirm:text=>{prompt=text;return false;},alert:()=>assert.fail('Unexpected alert')};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 await ctx.queueZaloTuitionItems([{studentId:'s1',parentId:'p'},{studentId:'s2',parentId:'p'}],true);
 assert.match(prompt,/1 phụ huynh có lượt gửi chưa xác nhận/);assert.match(prompt,/Tin có thể đã đến/);
});
