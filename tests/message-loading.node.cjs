const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('messages.html', 'utf8');
const source = html.slice(html.indexOf('async function loadMessages('), html.indexOf('async function loadOlderMessages('));

function fixture() {
  let resolve;
  const result = new Promise(done => { resolve = done; });
  const wrap = { scrollTop: 0, scrollHeight: 500, clientHeight: 300, innerHTML: '' };
  const query = {};
  for (const key of ['select', 'eq', 'order']) query[key] = () => query;
  query.limit = () => result;
  const ctx = {
    currentConversationId: 'first', activeFriend: { id: 'first' }, loadedMessages: [],
    messageReadGeneration: 0,
    MESSAGE_PAGE_SIZE: 10, hasOlderMessages: true, renders: 0, extras: 0,
    document: { getElementById: () => wrap }, sb: { from: () => query },
    queryConversationMessages: () => result,
    renderLoadedMessages() { ctx.renders++; },
    refreshConversationExtras() { ctx.extras++; }, loadOlderMessages() {}
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return { ctx, resolve, wrap };
}

test('conversation content renders without awaiting Zalo supplementary requests', async () => {
  const { ctx, resolve, wrap } = fixture();
  const pending = ctx.loadMessages({ reset: true, scrollToBottom: true });
  assert.equal(ctx.renders, 0);
  resolve({ data: [{ id: 'm1', content: 'hello', created_at: '2026-10-16' }], error: null });
  await pending;
  assert.equal(ctx.renders, 1);
  assert.equal(ctx.extras, 1);
  assert.equal(ctx.loadedMessages[0].content, 'hello');
  assert.equal(wrap.scrollTop, 500);
  assert.doesNotMatch(source, /await refreshZalo(?:DeliveryStatus|MessageStates)/);
});

test('a late message response cannot replace a different conversation', async () => {
  const { ctx, resolve } = fixture();
  const pending = ctx.loadMessages({ reset: true });
  ctx.currentConversationId = 'second';
  ctx.activeFriend = { id: 'second' };
  resolve({ data: [{ id: 'old', content: 'wrong conversation' }], error: null });
  await pending;
  assert.equal(ctx.renders, 0);
  assert.equal(ctx.loadedMessages.length, 0);
});

test('an older request for the same conversation cannot overwrite a fresher read',async()=>{
  const {ctx}=fixture();let oldResolve,newResolve;
  let calls=0;ctx.queryConversationMessages=()=>new Promise(resolve=>{if(calls++===0)oldResolve=resolve;else newResolve=resolve;});
  const old=ctx.loadMessages({reset:true}),fresh=ctx.loadMessages({reset:true});
  newResolve({data:[{id:'new',created_at:'2026-10-17',content:'New outgoing reply'}]});await fresh;
  oldResolve({data:[{id:'old',created_at:'2026-10-16',content:'Old snapshot'}]});await old;
  assert.equal(ctx.loadedMessages[0].id,'new');assert.equal(ctx.renders,1);
});

test('missed realtime window loads every intervening page instead of hiding replies',async()=>{
  const {ctx,wrap}=fixture();
  const rows=Array.from({length:26},(_,i)=>({id:'m'+i,created_at:new Date(Date.UTC(2026,9,17,0,i)).toISOString(),content:'Message '+i})).reverse();
  ctx.loadedMessages=[rows[25]];let calls=0;
  ctx.queryConversationMessages=async(id,before,beforeId)=>{
    calls++;const start=beforeId?rows.findIndex(row=>row.id===beforeId)+1:0;
    return {data:rows.slice(start,start+10)};
  };
  wrap.scrollTop=30;
  await ctx.loadMessages();
  assert.equal(calls,3);assert.equal(ctx.loadedMessages.length,26);
  assert.equal(ctx.loadedMessages.map(row=>row.id).join(','),rows.slice().reverse().map(row=>row.id).join(','));
  assert.equal(wrap.scrollTop,30);
});

test('sidebar newer than open chat triggers one catch-up, without needing another click',async()=>{
  let resolve,calls=0;
  const ctx={activeFriend:{id:'parent'},currentConversationId:'conversation',
    friendMap:new Map([['parent',{conversationId:'conversation',lastActivity:'2026-10-17T13:53:40Z'}]]),
    loadedMessages:[{id:'old',created_at:'2026-10-16T13:34:00Z'}],
    loadMessages:()=>{calls++;return new Promise(done=>resolve=done);},console};
  vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('const activeConversationRefreshes'),html.indexOf('let zaloMessageStates')),ctx);
  ctx.reconcileActiveConversationFromInbox();ctx.reconcileActiveConversationFromInbox();
  assert.equal(calls,1);resolve();await ctx.refreshActiveConversation();
  ctx.friendMap.set('parent',{conversationId:'different',lastActivity:'2026-10-17T13:53:40Z'});
  ctx.reconcileActiveConversationFromInbox();assert.equal(calls,1);
});

test('opening uses known inbox conversation and does not await Zalo link lookup', () => {
  const open = html.slice(html.indexOf('window.openConversation = async'), html.indexOf('window.openLearningConversation = async'));
  assert.match(open, /ensureConversation\(friendId, friendRole, inboxItem\?\.conversationId\)/);
  assert.doesNotMatch(open, /await refreshZaloSendMode/);
  assert.match(open, /activeFriend !== openingFriend/);
});
