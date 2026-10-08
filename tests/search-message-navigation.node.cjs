const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('messages follow home in menu and home only exposes merged search', () => {
  const dashboard = read('dashboard.html');
  const menu = dashboard.slice(dashboard.indexOf('<ul id="menu">'), dashboard.indexOf('</ul>', dashboard.indexOf('<ul id="menu">')));
  assert.match(menu, /data-page="home\.html"[^\n]*\n\s*<li[^\n]*data-page="messages\.html"/);
  assert.equal((dashboard.match(/id="messageBadge"/g) || []).length, 1);
  assert.ok(!dashboard.includes('data-page="friend_requests.html"'));
  const home = read('home.html');
  const hub = home.slice(home.indexOf('function enhanceHomeHub()'), home.indexOf('function enhanceComposerUI()'));
  assert.ok(hub.includes('homeFriendRequestBadge'));
  assert.ok(!hub.includes("toggleSocialPanel('friend_requests')"));
  assert.ok(!hub.includes("toggleSocialPanel('messages')"));
});

test('incoming-only mode does not query outgoing invitations', async () => {
  const source = read('friend_requests.html');
  let incoming = 0, outgoing = 0;
  const context = { incomingOnly: true, loadIncoming: async () => incoming++, loadOutgoing: async () => outgoing++ };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function refreshRequests()'), source.indexOf('async function loadIncoming()')), context);
  await context.refreshRequests();
  assert.equal(incoming, 1);
  assert.equal(outgoing, 0);
  assert.match(source, /\.eq\("receiver_id", currentUser.id\)\s*\.eq\("status", "pending"\)/);
});

test('search switches between received requests and results, ignoring stale requests', async () => {
  const source = read('search.html');
  const elements = { keywordInput: { value: '' }, resultList: { innerHTML: '' }, incomingRequests: { hidden: true }, searchResults: { hidden: false } };
  const tabs = {};
  let resolveUsers;
  const context = {
    window: {}, document: { getElementById: id => elements[id], querySelector: () => tabs, querySelectorAll: () => [] },
    searchRevision: 0, searchDebounceTimer: null, searchCache: new Map(), activeTab: 'users',
    clearTimeout() {}, searchUsers: () => new Promise(resolve => { resolveUsers = resolve; }),
    renderUserItemFullscreen: u => u.full_name
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function showSearchMode('), source.indexOf('const isHomeSearchTray')), context);
  vm.runInContext(source.slice(source.indexOf('window.resetSearch ='), source.indexOf('window.performRealtimeUserSearch =')), context);
  context.window.resetSearch();
  assert.equal(elements.incomingRequests.hidden, false);
  assert.equal(elements.searchResults.hidden, true);
  elements.keywordInput.value = 'Lan';
  const pending = context.window.performSearch();
  assert.equal(elements.incomingRequests.hidden, true);
  context.window.resetSearch();
  resolveUsers([{ full_name: 'Late result' }]); await pending;
  assert.ok(!elements.resultList.innerHTML.includes('Late result'));
  assert.equal(elements.incomingRequests.hidden, false);
});

test('inline scripts remain syntactically valid', () => {
  for (const name of ['dashboard.html', 'home.html', 'search.html', 'friend_requests.html']) {
    for (const match of read(name).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (!match[1].includes('src=') && !match[1].includes('application/')) new vm.Script(match[2], { filename: name });
    }
  }
});
