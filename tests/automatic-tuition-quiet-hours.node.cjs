const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {isSendingTime,quietHoursError,plan,createScheduler}=require('../services/zalo-bot/tuition-reminder-scheduler');
test('Vietnam quiet window includes midnight and 05:59:59, but not 06:00 or 23:59:59',()=>{
 for(const day of [5,10,15]){
  const date=`2026-11-${String(day).padStart(2,'0')}`;
  for(const hour of ['00:00:00','00:00:01','01:00:00','05:59:59']){
   const now=new Date(`${date}T${hour}+07:00`);assert.equal(isSendingTime(now),false);assert.equal(plan(now,()=>3).allowed,false);
  }
  for(const hour of ['06:00:00','06:00:01','23:59:59'])assert.equal(isSendingTime(new Date(`${date}T${hour}+07:00`)),true);
 }
 assert.throws(()=>isSendingTime(new Date('invalid')),/clock/);
});
test('restart and catchup do not enumerate or claim during quiet hours; resume at 06:00',async()=>{
 let now=new Date('2026-11-15T05:59:59+07:00');const calls=[];
 const s=createScheduler({clock:()=>now,convert:()=>3,bank:{},rpc:async name=>{calls.push(name);return {data:[]}}});
 assert.deepEqual(await s.tick(),{queued:0});assert.equal(await s.dispatchOne(async()=>{throw Error('must not send')}),null);assert.equal(calls.length,0);
 now=new Date('2026-11-15T06:00:00+07:00');await s.tick();await s.dispatchOne(async()=>{});
 assert.deepEqual(calls,['automatic_tuition_candidates','claim_automatic_tuition_reminder']);
});
test('crossing midnight after preparation defers without sending or quarantining, always cleans up',async()=>{
 let now=new Date('2026-11-05T23:59:59+07:00'),cleaned=0,sends=0;const calls=[];
 const s=createScheduler({clock:()=>now,convert:()=>3,rpc:async(name,args)=>{calls.push({name,args});return {data:false}}});
 const job={id:'job',token:'token',zalo_uid:'uid',payload:{parts:[{kind:'text'}]}};
 const r=await s.dispatchClaimed(job,async()=>{sends++;},async()=>{now=new Date('2026-11-06T00:00:00+07:00');return {cleanup:async()=>cleaned++}});
 assert.equal(r.status,'deferred');assert.equal(sends,0);assert.equal(cleaned,1);assert.equal(calls[0].args.p_allowed,false);
 assert.ok(!calls.some(c=>c.name==='uncertain_automatic_tuition_reminder'));
});
test('resume starts at first unacknowledged part and a last-moment quiet guard is safely deferred',async()=>{
 let now=new Date('2026-11-06T06:00:00+07:00');const begun=[],sent=[];
 const s=createScheduler({clock:()=>now,convert:()=>3,rpc:async(name,args)=>{if(name==='begin_automatic_tuition_part')begun.push(args.p_index);return {data:true}}});
 const job={id:'job',token:'token',zalo_uid:'uid',payload:{next_part:1,parts:[{kind:'text'},{kind:'qr'}]}};
 assert.equal((await s.dispatchClaimed(job,async({index})=>{sent.push(index);return 'uid:id'})).status,'sent');
 assert.deepEqual(begun,[1]);assert.deepEqual(sent,[1]);
 const r=await s.dispatchClaimed(job,async()=>{now=new Date('2026-11-07T00:00:00+07:00');throw quietHoursError()});
 assert.equal(r.status,'deferred');
});
test('last-moment quiet guard keeps local send ledger retryable without publishing a message',async()=>{
 const {LocalDatabase}=require('../services/zalo-bot/local-database');const store=new LocalDatabase(':memory:','quiet-test');let sends=0;
 try{
  await assert.rejects(store.send('automatic:job:0',{part:'text'},async()=>{throw quietHoursError()}),/06:00/);
  assert.equal(store.db.prepare('SELECT status FROM effects').get().status,'failed');
  assert.equal(await store.send('automatic:job:0',{part:'text'},async()=>{sends++;return 'verified-id'}),'verified-id');
  assert.equal(await store.send('automatic:job:0',{part:'text'},async()=>{sends++;return 'duplicate'}),'verified-id');assert.equal(sends,1);
 }finally{store.close();}
 const source=fs.readFileSync('services/zalo-bot/server.js','utf8');
 assert.match(source,/if \(!isSendingTime\(\)\) throw quietHoursError\(\);\s*const sent = await zaloApi.sendMessage/);
});
test('database blocks old bots, defers partial jobs without losing progress, and migration is idempotent',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'service_role'::text$$;
 CREATE TABLE mindup_zalo_dispatch_control(id integer);INSERT INTO mindup_zalo_dispatch_control VALUES(1);
 CREATE TABLE automatic_tuition_reminders(id uuid DEFAULT gen_random_uuid(),token uuid DEFAULT gen_random_uuid(),parent_id uuid,status text DEFAULT 'queued',next_part integer DEFAULT 0,part_started boolean DEFAULT false,lease_until timestamptz DEFAULT now()+interval '1 hour',error_message text,updated_at timestamptz,payload jsonb DEFAULT '{"parts":[{"kind":"text"},{"kind":"qr"}]}',acknowledgements jsonb DEFAULT '[]');
 CREATE TABLE zalo_parent_contacts(parent_id uuid,zalo_uid text);INSERT INTO zalo_parent_contacts VALUES('00000000-0000-0000-0000-000000000001','uid');
 INSERT INTO automatic_tuition_reminders(parent_id)VALUES('00000000-0000-0000-0000-000000000001');
 CREATE FUNCTION claim_automatic_tuition_reminder(p_today date,p_slot integer) RETURNS TABLE(id uuid,token uuid,zalo_uid text,payload jsonb) LANGUAGE plpgsql AS $$
 BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 RETURN QUERY WITH claimed AS (UPDATE automatic_tuition_reminders r SET status='processing' WHERE r.status='queued' RETURNING r.*)
 SELECT x.id,x.token,c.zalo_uid,x.payload FROM claimed x JOIN zalo_parent_contacts c ON c.parent_id=x.parent_id;
 END;$$;
 CREATE FUNCTION begin_automatic_tuition_part(p_id uuid,p_token uuid,p_index integer,p_today date,p_allowed boolean,p_slot integer)RETURNS boolean LANGUAGE plpgsql AS $$
 BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 UPDATE automatic_tuition_reminders SET part_started=true WHERE id=p_id AND token=p_token;RETURN true;
 END;$$;
 CREATE FUNCTION reserve_automatic_tuition_dispatch_slot(p_id uuid,p_token uuid,p_spacing_seconds integer,p_batch_size integer,p_batch_pause_seconds integer)RETURNS timestamptz LANGUAGE plpgsql AS $$
 BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 RETURN now();END;$$;`);
 const sql=fs.readFileSync('SQL automatic tuition quiet hours.sql','utf8');await db.exec(sql);await db.exec(sql);
 for(const [time,expected] of [['00:00:00',false],['05:59:59',false],['06:00:00',true],['23:59:59',true]]){
  assert.equal((await db.query('select automatic_tuition_sending_time($1) as ok',[`2026-11-05T${time}+07:00`])).rows[0].ok,expected);
 }
 const clock=value=>db.exec(`CREATE OR REPLACE FUNCTION automatic_tuition_sending_time(p_at timestamptz DEFAULT clock_timestamp()) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT ${value}$$;`);
 await clock(false);assert.equal((await db.query('select * from claim_automatic_tuition_reminder(current_date,5)')).rows.length,0);
 await clock(true);let job=(await db.query('select * from claim_automatic_tuition_reminder(current_date,5)')).rows[0];assert.equal(job.payload.next_part,0);
 await db.exec("UPDATE automatic_tuition_reminders SET next_part=1,part_started=true,acknowledgements='[{\"index\":0}]'");
 await clock(false);assert.equal((await db.query('select reserve_automatic_tuition_dispatch_slot($1,$2,0,50,0) as slot',[job.id,job.token])).rows[0].slot,null);
 assert.equal((await db.query('select begin_automatic_tuition_part($1,$2,1,current_date,true,5) as ok',[job.id,job.token])).rows[0].ok,false);
 const row=(await db.query('select * from automatic_tuition_reminders')).rows[0];assert.equal(row.status,'queued');assert.equal(row.next_part,1);assert.equal(row.part_started,false);assert.equal(row.acknowledgements.length,1);
 await clock(true);job=(await db.query('select * from claim_automatic_tuition_reminder(current_date,5)')).rows[0];assert.equal(job.payload.next_part,1);
 }finally{await db.close();}
});
