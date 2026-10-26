const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'messages.html'), 'utf8');
test('conversation rows cannot shrink and overlap the load-more control', () => {
  const css = fs.readFileSync(path.join(root, 'messages-workspace.css'), 'utf8');
  assert.match(css, /\.friend-list > \*\s*\{\s*flex-shrink:\s*0;/);
  assert.match(css, /\.friend-list-actions\s*\{\s*padding:\s*0 12px 8px;/);
});
function element() {
  return { children: [], hidden: true, textContent: '', attrs: {}, classList: { toggle() {} },
    append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; },
    setAttribute(k, v) { this.attrs[k] = v; } };
}
function harness() {
  const ids = Object.fromEntries(['conversationInfo', 'conversationInfoToggle', 'conversationInfoBody', 'chatAvatar', 'chatTitle', 'zaloSendModeLabel'].map(id => [id, element()]));
  const tabs = [element(),element()];tabs[0].dataset={inbox:'all'};tabs[1].dataset={inbox:'groups'};
  let filters = 0;
  const context = { window: {}, URL, activeFriend: null, friendMap: new Map(), parentInboxById: new Map(), loadedMessages: [],
    document: { baseURI: 'https://example.com/', getElementById: id => ids[id], createElement: element,
      querySelector: element, querySelectorAll: () => tabs, addEventListener() {} },
    filterFriends: () => filters++, parseMessageContent: text => ({ type: 'image', url: text }) };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'messages-workspace.js'), 'utf8'), context);
  return { context, ids, tabs, filters: () => filters };
}
test('private chats and class groups have independent tabs and keep the existing search', () => {
  const h = harness();
  assert.equal(h.context.window.inboxWaitingOnly, false);
  h.context.window.setInboxFilter(false);
  assert.equal(h.context.window.inboxWaitingOnly, false);
  assert.equal(h.tabs[0].attrs['aria-pressed'], 'true');
  assert.equal(h.filters(), 1);
  h.context.window.setInboxFilter('reply');
  assert.equal(h.tabs[0].attrs['aria-pressed'], 'true');
  assert.equal(h.context.window.inboxWaitingOnly, false);
  assert.doesNotMatch(html, />Chưa đọc<\/button>/);
  h.context.window.setInboxFilter('groups');assert.equal(h.context.window.inboxClassGroupsOnly,true);
  assert.equal(h.tabs[0].attrs['aria-pressed'],'false');assert.equal(h.tabs[1].attrs['aria-pressed'],'true');
  h.context.window.setInboxFilter(false);assert.equal(h.context.window.inboxClassGroupsOnly,false);
});

test('obsolete reply-filter requests do not hide conversations or start priority queries', () => {
  const h = harness(); let retries = 0;
  h.context.window.parentPriorityLoadFailed = true;
  h.context.window.retryParentReplyPriority = () => retries++;
  h.context.window.setInboxFilter(false);
  h.context.window.setInboxFilter('reply');
  assert.equal(h.context.window.inboxWaitingOnly, false);
  assert.equal(retries, 0);
  assert.match(html, /priorityButton.disabled = false/);
  assert.doesNotMatch(html, /priorityButton.disabled = !!priorityError/);
  assert.doesNotMatch(html, /waiting-reply-label/);
});

test('parent context is automatic and restricted to authorized children', () => {
  const ctx = { activeFriend: {id:'parent',children:[{id:'allowed-a'},{id:'allowed-b'}]},
    parentInboxById:new Map(), friendMap:new Map(),
    loadedMessages:[{context_student_id:'allowed-b'},{context_student_id:'unmanaged'}] };
  vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('function resolveParentMessageStudentId('),html.indexOf('async function refreshZaloDeliveryStatus(')),ctx);
  assert.equal(ctx.resolveParentMessageStudentId(),'allowed-b');
  ctx.loadedMessages=[];
  assert.equal(ctx.resolveParentMessageStudentId(),'allowed-a');
  ctx.activeFriend.children=[];
  assert.equal(ctx.resolveParentMessageStudentId(),null);
});
test('info panel opens/closes and clears stale conversation data', () => {
  const h = harness(); h.context.activeFriend = { id: 'parent', name: '<Parent>', avatar: 'favicon.png', role: 'parent', children: [{ name: 'Student' }] };
  h.context.loadedMessages = [{ content: 'https://example.com/qr.png' }, { content: 'https://example.com/qr.png' }];
  h.context.window.toggleConversationInfo(true);
  assert.equal(h.ids.conversationInfo.hidden, false);
  assert.equal(h.ids.conversationInfoToggle.attrs['aria-expanded'], 'true');
  assert.equal(h.ids.chatAvatar.src, 'https://example.com/favicon.png');
  const identity = h.ids.conversationInfoBody.children[0];
  assert.equal(identity.children[1].textContent, '<Parent>');
  const media = h.ids.conversationInfoBody.children[2];
  assert.equal(media.children[1].children.length, 1);
  h.context.activeFriend = null;
  h.context.window.refreshMessageWorkspace();
  assert.equal(h.ids.conversationInfoBody.children.length, 1);
  h.context.window.toggleConversationInfo(false);
  assert.equal(h.ids.conversationInfo.hidden, true);
});
test('media links cannot navigate to javascript URLs', () => {
  const h = harness();
  h.context.activeFriend = { id: 'parent', avatar: 'javascript:alert(1)' };
  h.context.window.refreshMessageWorkspace();
  assert.equal(h.ids.chatAvatar.src, '');
});
test('existing composer hooks and Zalo delivery states remain intact', () => {
  for (const id of ['messageInput', 'sendBtn', 'attachBtn', 'zaloDispatchToggle', 'chatTitle', 'chatSub']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  assert.doesNotMatch(html, /id="messageContextStudent"|id="messageContextWrap"/);
  for (const state of ['sent', 'failed', 'uncertain', 'cancelled', 'processing']) assert.ok(html.includes(`zaloDelivery === '${state}'`));
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new vm.Script(match[1]);
});
