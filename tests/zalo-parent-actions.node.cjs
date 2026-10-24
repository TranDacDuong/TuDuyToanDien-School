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
