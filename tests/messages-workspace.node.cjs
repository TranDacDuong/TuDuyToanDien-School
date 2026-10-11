const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'messages.html'), 'utf8');
function element() {
  return { children: [], hidden: true, textContent: '', attrs: {}, classList: { toggle() {} },
    append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; },
    setAttribute(k, v) { this.attrs[k] = v; } };
}
function harness() {
  const ids = Object.fromEntries(['conversationInfo', 'conversationInfoToggle', 'conversationInfoBody', 'chatAvatar', 'chatTitle', 'zaloSendModeLabel'].map(id => [id, element()]));
  const tabs = [element(), element()];
  let filters = 0;
  const context = { window: {}, URL, activeFriend: null, friendMap: new Map(), parentInboxById: new Map(), loadedMessages: [],
    document: { baseURI: 'https://example.com/', getElementById: id => ids[id], createElement: element,
      querySelector: element, querySelectorAll: () => tabs, addEventListener() {} },
    filterFriends: () => filters++, parseMessageContent: text => ({ type: 'image', url: text }) };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'messages-workspace.js'), 'utf8'), context);
  return { context, ids, tabs, filters: () => filters };
}
test('unread toggle refreshes existing search and exposes selected state', () => {
  const h = harness(); h.context.window.setInboxFilter(true);
  assert.equal(h.context.window.inboxUnreadOnly, true);
  assert.equal(h.tabs[1].attrs['aria-pressed'], 'true');
  assert.equal(h.filters(), 1);
  assert.match(html, /list = list.filter\(item => Number\(item.unreadCount\) > 0\)/);
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
  for (const id of ['messageInput', 'sendBtn', 'attachBtn', 'messageContextStudent', 'zaloDispatchToggle', 'chatTitle', 'chatSub']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  for (const state of ['sent', 'failed', 'uncertain', 'cancelled', 'processing']) assert.ok(html.includes(`zaloDelivery === '${state}'`));
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new vm.Script(match[1]);
});
