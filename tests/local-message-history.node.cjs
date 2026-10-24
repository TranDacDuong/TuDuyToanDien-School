const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function fixture(responses){let now=0;const calls=[];const context={window:{},Map,Set,Date:{now:()=>now},setTimeout:fn=>{now+=1500;fn();}};
 vm.runInNewContext(fs.readFileSync('local-message-history.js','utf8'),context);
 const client={rpc:async(name,args)=>{calls.push({name,args});return responses(name,args,calls.length);}};
 return {hydrate:rows=>context.window.LocalMessageHistory.hydrate(client,rows),calls};
}
test('recent cloud messages never wait for the laptop',async()=>{
 const f=fixture(()=>{throw Error('Must not contact worker');});const rows=[{content:'Hello'}];
 assert.equal(await f.hydrate(rows),rows);assert.equal(f.calls.length,0);
});
test('archive reads are batched, identity-scoped by RPC and keep message IDs/cursors intact',async()=>{
 const f=fixture(name=>name==='request_local_zalo_history'?{data:'request'}:{data:{status:'ready',items:[{key:'m:one',content:'Full text'}]}});
 const rows=[{id:'one',created_at:'stamp',content:'__MINDUP_LOCAL_V1__:m:one'},{id:'two',content:'New text'}];
 const hydrated=await f.hydrate(rows);assert.equal(hydrated[0].id,'one');assert.equal(hydrated[0].created_at,'stamp');assert.equal(hydrated[0].content,'Full text');
 assert.equal(hydrated[1].content,'New text');assert.equal(f.calls.length,2);
 await f.hydrate(rows);assert.equal(f.calls.length,2);
});
test('offline laptop and missing disk record are explicit errors, not silently empty conversations',async()=>{
 for(const result of [{status:'pending'},{status:'ready',items:[]}]){
  const f=fixture(name=>name==='request_local_zalo_history'?{data:'request'}:{data:result});
  await assert.rejects(()=>f.hydrate([{content:'__MINDUP_LOCAL_V1__:m:one'}]),error=>error.code==='LOCAL_HISTORY_UNAVAILABLE');
 }
});
test('revoked permission stops history retrieval and does not accept caller-supplied body',async()=>{
 const f=fixture(()=>({error:{code:'42501',message:'Denied'}}));
 await assert.rejects(()=>f.hydrate([{content:'__MINDUP_LOCAL_V1__:m:one'}]),error=>error.code==='42501');assert.equal(f.calls.length,1);
});
