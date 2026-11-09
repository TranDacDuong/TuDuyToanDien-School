const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const { WorkWakeup, GatewayCooldown, IDLE_CHECK_MS }=require('../services/zalo-bot/work-wakeup');
const { LocalStorageWorker }=require('../services/zalo-bot/local-storage-worker');
const { PGlite }=require('@electric-sql/pglite');
const source=fs.readFileSync('services/zalo-bot/server.js','utf8');
const take=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('one bootstrap connects once; valid hints and reconnect wake work without another Edge invocation',async()=>{
 let calls=0,status,receive,disconnects=0;const wakes=[];
 const worker=new WorkWakeup({request:async()=>{calls++;return {url:'https://example.supabase.co',anonKey:'public-key',topic:'zalo-work:'+'a'.repeat(64)};},
  wake:kind=>wakes.push(kind),createClient:()=>({disconnect:()=>disconnects++,channel:()=>({on:(type,filter,cb)=>{receive=cb;return {subscribe:cb=>{status=cb;}};}})})});
 await worker.connect();await worker.connect();assert.equal(calls,1);
 status('SUBSCRIBED');receive({payload:{kind:'parents',job:{content:'untrusted'}}});receive({payload:{kind:'unknown'}});
 status('CHANNEL_ERROR');status('SUBSCRIBED');assert.deepEqual(wakes,['all','parents','all']);assert.equal(calls,1);worker.close();assert.equal(disconnects,1);
});
test('failed bootstrap and global quota errors do not hammer the Edge Function',async()=>{
 let now=0,calls=0;const worker=new WorkWakeup({clock:()=>now,wake:()=>{},createClient:()=>{},request:async()=>{calls++;throw Error('402');}});
 await worker.connect();for(now=1000;now<3600000;now+=1000)await worker.connect();assert.equal(calls,1);
 await worker.connect();assert.equal(calls,2);
 const gate=new GatewayCooldown(()=>now);gate.reject(402);assert.throws(()=>gate.check(),e=>e.status===402);now+=IDLE_CHECK_MS;assert.doesNotThrow(()=>gate.check());
 gate.reject(500);assert.doesNotThrow(()=>gate.check());
});
test('local storage stays quiet for an hour when idle, wakeups resume immediately and active reads drain promptly',async()=>{
 let now=0,calls=0;const worker=new LocalStorageWorker({clock:()=>now,store:{id:'id',receipts:()=>[],confirmReceipts:()=>{},saveArchive:()=>{},readArchive:()=>[]},
 request:async()=>{calls++;return {data:{exports:[],reads:calls===2?[{id:'j',token:'t',keys:[]}]:[]}};}});
 await worker.tick();now=3599999;await worker.tick();assert.equal(calls,1);
 worker.nextAt=0;await worker.tick();assert.equal(calls,2);now+=500;await worker.tick();assert.equal(calls,3);assert.equal(worker.results.length,0);
});
test('production idle workers call once per hour; pending wake survives another sender lock and resets relevant queues only',async()=>{
 let now=1000;const calls=[];
 const ctx={Date:{now:()=>now},Set,IDLE_CHECK_MS,console,WorkWakeup:class{},GatewayCooldown,
  gatewayBusy:false,listenerConnected:true,zaloApi:{},GATEWAY_URL:'configured',GATEWAY_TOKEN:'configured',campaignStatus:'idle',
  nextGatewaySendAt:0,nextManualParentPollAt:0,nextParentPollAt:0,nextAliasSyncAt:0,nextDispatchPollAt:99,nextClassGroupPoll:88,nextClassGroupState:77,nextSyncLinksAt:66,nextAutomaticTuitionTickAt:55,
  gatewayRequest:async body=>{calls.push(body.action);return {};},localStorageWorker:{nextAt:44},
  scheduleNextGatewayAction:()=>{},checkQueuedParent:async()=>{},syncQueuedParentAlias:async()=>{}};
 vm.createContext(ctx);
 vm.runInContext('const gatewayCooldown={until:0};const pendingWorkWakeups=new Set();'+take('function applyWorkWakeups()','let verifiedParentCount ='),ctx);
 // The function ends before the next class-group declaration in production.
 vm.runInContext(take('async function syncParentTuition()','async function flushIncoming()')+';globalThis.runParent=syncParentTuition;',ctx);
 await ctx.runParent();assert.deepEqual(calls,['claimManualParentAction','claimParentAlias','claimParent']);
 now+=5000;await ctx.runParent();assert.equal(calls.length,3);
 ctx.gatewayBusy=true;vm.runInContext("pendingWorkWakeups.add('parents');applyWorkWakeups();",ctx);assert.notEqual(ctx.nextManualParentPollAt,0);
 ctx.gatewayBusy=false;vm.runInContext('applyWorkWakeups();',ctx);assert.equal(ctx.nextManualParentPollAt,0);assert.equal(ctx.nextDispatchPollAt,99);
 await ctx.runParent();assert.equal(calls.length,6);now+=IDLE_CHECK_MS;await ctx.runParent();assert.equal(calls.length,9);
});
test('database broadcasts no personal data, skips claim acknowledgements, preserves durable jobs on notification failure and restricts topic access',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA realtime;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
 CREATE TABLE broadcasts(payload jsonb,event text,topic text,private boolean);
 CREATE FUNCTION realtime.send(jsonb,text,text,boolean) RETURNS void LANGUAGE sql AS $$INSERT INTO public.broadcasts VALUES($1,$2,$3,$4)$$;
 CREATE TABLE zalo_outbox(id int,status text,content text,lease_until timestamptz,updated_at timestamptz);
 CREATE TABLE zalo_parent_contacts(id int,status text,manual_check_requested_at timestamptz);
 CREATE TABLE zalo_local_reads(id int,status text);
 CREATE TABLE zalo_verified_links(id int);
 CREATE TABLE tuition_notice_jobs(id int,paused boolean,status text,scan_pass int,scan_attempts int,source text,request_key text);
 CREATE TABLE automatic_tuition_control(id int,paused boolean);
 CREATE TABLE mindup_zalo_dispatch_control(id int,paused boolean);
 CREATE TABLE zalo_automation_state(id int,paused boolean);
 CREATE TABLE message_templates(id text,is_enabled boolean);
 CREATE FUNCTION claim_tuition_notification_v1(boolean,int) RETURNS jsonb LANGUAGE sql AS $$SELECT NULL::jsonb$$;
 SET request.jwt.claim.role='service_role';`);
 const migration=fs.readFileSync('SQL Zalo realtime work wakeup.sql','utf8');await db.exec(migration);await db.exec(migration);
 await db.query('SELECT configure_zalo_work_wakeup($1)',['zalo-work:'+'a'.repeat(64)]);
 await db.exec("INSERT INTO zalo_outbox VALUES(1,'pending','private tuition',null,now());UPDATE zalo_outbox SET status='processing';UPDATE zalo_outbox SET status='sent';");
 assert.equal((await db.query('SELECT * FROM broadcasts')).rows.length,1);
 assert.deepEqual((await db.query('SELECT payload FROM broadcasts')).rows[0].payload,{kind:'dispatch'});
 await db.exec("INSERT INTO zalo_parent_contacts VALUES(1,'friend',null);UPDATE zalo_parent_contacts SET manual_check_requested_at=now();INSERT INTO zalo_local_reads VALUES(1,'pending');INSERT INTO zalo_verified_links VALUES(1);DELETE FROM zalo_verified_links;");
 assert.equal((await db.query('SELECT * FROM broadcasts')).rows.length,6);
 await db.exec("CREATE OR REPLACE FUNCTION realtime.send(jsonb,text,text,boolean) RETURNS void LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'offline';END$$;INSERT INTO zalo_outbox VALUES(2,'pending','still saved',null,now());");
 assert.equal((await db.query('SELECT count(*) n FROM zalo_outbox')).rows[0].n,2);
 const hint=async allowed=>(await db.query('SELECT claim_tuition_notification_wakeup($1,0) value',[allowed])).rows[0].value;
 assert.equal((await hint(false)).retryAfterMs,IDLE_CHECK_MS);
 await db.exec("INSERT INTO tuition_notice_jobs VALUES(1,false,'queued',1,0,'manual','manual:one')");
 assert.equal((await hint(false)).retryAfterMs,10000,'pacing NULL must not strand a queued parent for an hour');
 await db.exec("UPDATE tuition_notice_jobs SET status='uncertain',scan_attempts=1");
 assert.equal((await hint(false)).retryAfterMs,10000,'keep draining until the second sweep is finished');
 await db.exec('UPDATE tuition_notice_jobs SET scan_pass=2,scan_attempts=2');
 assert.equal((await hint(false)).retryAfterMs,IDLE_CHECK_MS,'two failed attempts stop until an explicit retry');
 await db.exec("UPDATE tuition_notice_jobs SET status='queued',source='automatic'");
 assert.equal((await hint(false)).retryAfterMs,IDLE_CHECK_MS,'quiet-hour automatic jobs must not cause rapid polling');
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM zalo_work_wakeup_config'),/permission denied/);
 await assert.rejects(db.query("SELECT configure_zalo_work_wakeup('zalo-work:'||repeat('b',64))"),/permission denied/);
 }finally{await db.close();}
});

test('production dispatcher waits an hour only when empty, continues delayed/failed sweeps and revisits tuition after its fairness turn',async()=>{
 let now=1000,retry=IDLE_CHECK_MS;const calls=[];
 const context=vm.createContext({Date:{now:()=>now},console,IDLE_CHECK_MS,Math,Number,
 gatewayBusy:false,zaloApi:{},listenerConnected:true,GATEWAY_URL:'yes',GATEWAY_TOKEN:'yes',campaignStatus:'idle',gatewayCooldown:{until:0},pendingIncoming:new Map(),
 nextDispatchPollAt:0,nextAutomaticTuitionTickAt:Infinity,unifiedTuitionStreak:0,
 automaticTuitionScheduler:{schedule:()=>({allowed:false}),tick:async()=>({})},dispatchPacing:()=>({}),
 gatewayRequest:async body=>{calls.push(body.action);return body.action==='claimTuitionNotice'?{data:null,retryAfterMs:retry}:{job:null};}});
 vm.runInContext(take('async function syncGatewayOutbox()', 'async function sendQueuedAutomaticTuition('),context);
 await context.syncGatewayOutbox();assert.equal(context.nextDispatchPollAt,now+IDLE_CHECK_MS);
 now+=10000;await context.syncGatewayOutbox();assert.equal(calls.length,2);
 context.nextDispatchPollAt=0;retry=10000;await context.syncGatewayOutbox();assert.equal(context.nextDispatchPollAt,now+10000);
 context.nextDispatchPollAt=0;context.unifiedTuitionStreak=5;await context.syncGatewayOutbox();assert.equal(context.nextDispatchPollAt,now+500);assert.equal(context.unifiedTuitionStreak,0);
});

test('gateway bootstrap authenticates, never returns service credentials and preserves the claim response contract',async()=>{
 const {stripTypeScriptTypes}=require('node:module');let handler;const requests=[];
 const env={ZALO_GATEWAY_TOKEN:'existing-bot-token',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-anon',SUPABASE_SERVICE_ROLE_KEY:'private-service'};
 const context=vm.createContext({crypto:require('node:crypto').webcrypto,TextEncoder,Uint8Array,Response,AbortSignal,
  Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn},fetch:async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});return new Response(JSON.stringify(url.endsWith('/claim_tuition_notification_wakeup')?{data:null,retryAfterMs:10000}:null));}});
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/zalo-gateway/index.ts','utf8')),context);
 const req=(action,token='existing-bot-token',args)=>new Request('https://example.test',{method:'POST',headers:{'x-zalo-gateway-token':token},body:JSON.stringify({action,args})});
 assert.equal((await handler(req('workWakeupConfig','wrong'))).status,401);assert.equal(requests.length,0);
 const response=await handler(req('workWakeupConfig'));const config=await response.json();assert.equal(config.anonKey,'public-anon');assert.match(config.topic,/^zalo-work:[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(config).includes('private-service'));assert.deepEqual(requests[0].body,{p_topic:config.topic});
 const claimed=await handler(req('claimTuitionNotice',undefined,{p_allowed:false,p_slot:0}));assert.deepEqual(await claimed.json(),{data:null,retryAfterMs:10000});
});
