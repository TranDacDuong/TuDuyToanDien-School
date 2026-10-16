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
    MESSAGE_PAGE_SIZE: 10, hasOlderMessages: true, renders: 0, extras: 0,
    document: { getElementById: () => wrap }, sb: { from: () => query },
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

test('opening uses known inbox conversation and does not await Zalo link lookup', () => {
  const open = html.slice(html.indexOf('window.openConversation = async'), html.indexOf('window.openLearningConversation = async'));
  assert.match(open, /ensureConversation\(friendId, friendRole, inboxItem\?\.conversationId\)/);
  assert.doesNotMatch(open, /await refreshZaloSendMode/);
  assert.match(open, /activeFriend !== openingFriend/);
});
