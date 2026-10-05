const {test,expect}=require('@playwright/test');
const fs=require('fs');
const vm=require('vm');
async function run(aliasJob,cooldown=0){
  const calls=[];
  const ctx={gatewayBusy:false,zaloApi:{},listenerConnected:true,GATEWAY_URL:'url',GATEWAY_TOKEN:'token',
    campaignStatus:'idle',nextParentPollAt:0,nextAliasSyncAt:cooldown,nextGatewaySendAt:0,console,
    gatewayRequest:async p=>{calls.push(p.action);return {job:p.action==='claimParentAlias'?aliasJob:{id:'parent'}};},
    syncQueuedParentAlias:async()=>calls.push('alias'),checkQueuedParent:async()=>calls.push('parent'),
    scheduleNextGatewayAction:()=>{ctx.nextGatewaySendAt=Date.now()+60000;}};
  vm.createContext(ctx);
  const source=fs.readFileSync('services/zalo-bot/server.js','utf8');
  vm.runInContext(source.slice(source.indexOf('async function syncParentTuition()'),source.indexOf('async function flushIncoming()')),ctx);
  await ctx.syncParentTuition();return calls;
}
test('pending alias runs before a parent check',async()=>{
  expect(await run({id:'alias'})).toEqual(['claimParentAlias','alias']);
});
test('empty alias queue allows parent checks',async()=>{
  expect(await run(null)).toEqual(['claimParentAlias','claimParent','parent']);
});
test('alias rate-limit cooldown allows parent checks without bypassing cooldown',async()=>{
  expect(await run({id:'alias'},Date.now()+60000)).toEqual(['claimParent','parent']);
});
