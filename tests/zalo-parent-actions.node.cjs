const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { readParentRelationship } = require('../services/zalo-bot/parent-relationship');

test('fresh friends and actual outgoing requests override contradictory relationship flags', async () => {
  const api = {getAllFriends: async () => [{userId:'parent'}], getFriendRequestStatus: async () => {throw Error('stale endpoint');}};
  assert.equal((await readParentRelationship(api,'parent')).is_friend,1);
  api.getAllFriends=async()=>[];
  api.getFriendRequestStatus=async()=>({is_requested:1,is_requesting:0});
  api.getSentFriendRequest=async()=>({parent:{userId:'parent'}});
  api.getFriendRecommendations=async()=>{throw Error('must not accept own invitation');};
  assert.equal((await readParentRelationship(api,'parent')).is_requesting,1);
});
test('only an actual received request is accepted; empty or unavailable lists never fabricate friendship',async()=>{
  const api={getAllFriends:async()=>[],getFriendRequestStatus:async()=>({is_requested:1}),
    getSentFriendRequest:async()=>{throw Object.assign(Error('empty'),{code:112});},
    getFriendRecommendations:async()=>({recommItems:[{dataInfo:{userId:'parent',recommType:1}}]})};
  assert.equal((await readParentRelationship(api,'parent')).is_requested,0);
  api.getFriendRecommendations=async()=>({recommItems:[{dataInfo:{userId:'parent',recommType:2}}]});
  assert.equal((await readParentRelationship(api,'parent')).is_requested,1);
  api.getSentFriendRequest=async()=>{throw Error('network');};
  await assert.rejects(()=>readParentRelationship(api,'parent'),/network/);
});
test('center-wide enumeration never holds the sender or delays a pending dispatch',async()=>{
  const source=fs.readFileSync('services/zalo-bot/server.js','utf8');
  const fn=source.slice(source.indexOf('async function syncGatewayOutbox()'),source.indexOf('async function sendQueuedAutomaticTuition'));
  const calls=[];let release;
  const ctx=vm.createContext({Date,console,gatewayBusy:false,zaloApi:{},listenerConnected:true,GATEWAY_URL:'url',GATEWAY_TOKEN:'token',campaignStatus:'idle',nextDispatchPollAt:0,nextAutomaticTuitionTickAt:0,emptyDispatchPolls:0,pendingIncoming:new Map(),
    automaticTuitionScheduler:{tick:()=>new Promise(resolve=>{release=resolve;}),schedule:()=>({})},
    dispatchPacing:()=>({}), gatewayRequest:async payload=>{calls.push(payload.action);return {job:{kind:'receipt'}};},
    sendQueuedTuitionReceipt:async()=>{calls.push('receipt-sent');}});
  vm.runInContext(fn,ctx);
  await ctx.syncGatewayOutbox();
  assert.deepEqual(calls,['claimDispatch','receipt-sent']);assert.equal(ctx.gatewayBusy,false);release();
});

function parentWorker(api) {
  const source=fs.readFileSync('services/zalo-bot/server.js','utf8');
  const results=[];
  const context=vm.createContext({zaloApi:api,readParentRelationship,friendUserIdSet:new Set(),friendPhoneMap:new Map(),
    gatewayRequest:async payload=>{results.push(payload);return {};},
    isZaloLimitError:error=>/429|rate.?limit/i.test(error.message),
    buildFriendRequestGreeting:()=> 'greeting',buildParentGreeting:()=> 'greeting',console:{warn(){}}});
  vm.runInContext(source.slice(source.indexOf('async function checkQueuedParent(job)'),source.indexOf('async function sendQueuedTuition(job)')),context);
  return {run:context.checkQueuedParent,results};
}
const parentJob={parent_id:'parent',phone:'0900000000',zalo_uid:'uid',status:'invited',invitation_attempted_at:'2026-10-20',greeting_sent_at:'2026-10-20'};
test('actual parent worker records outgoing invitation without accepting it or sending another greeting',async()=>{
  const worker=parentWorker({getFriendRequestStatus:async()=>({is_requested:1}),getSentFriendRequest:async()=>({uid:{userId:'uid'}}),
    acceptFriendRequest:async()=>{throw Error('must not accept');},sendFriendRequest:async()=>{throw Error('must not resend');}});
  await worker.run(parentJob);
  assert.equal(worker.results.length,1);assert.equal(worker.results[0].action,'finishParent');
  assert.equal(worker.results[0].status,'invited');assert.equal(worker.results[0].error,null);
});
test('actual parent worker accepts a verified incoming request exactly once and records friendship',async()=>{
  let accepts=0;
  const worker=parentWorker({getFriendRequestStatus:async()=>({is_requested:1}),getSentFriendRequest:async()=>({}),
    getFriendRecommendations:async()=>({recommItems:[{dataInfo:{userId:'uid',recommType:2}}]}),acceptFriendRequest:async()=>{accepts++;}});
  await worker.run(parentJob);
  assert.equal(accepts,1);assert.equal(worker.results[0].status,'friend');
});
test('actual parent worker preserves a rate-limit result and a not-found result without issuing invitations',async()=>{
  const limited=parentWorker({getFriendRequestStatus:async()=>{throw Error('Request failed with status code 429');}});
  await limited.run(parentJob);
  assert.equal(limited.results[0].status,'rate_limited');assert.match(limited.results[0].error,/429/);
  const missing=parentWorker({findUser:async()=>null});
  await missing.run({...parentJob,zalo_uid:null});
  assert.equal(missing.results.length,1);assert.equal(missing.results[0].status,'not_found');
});
