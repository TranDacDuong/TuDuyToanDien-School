const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'messages.html'), 'utf8');
const start = html.indexOf('function normalizeConversationSearch');
const end = html.indexOf('function parseMessageContent', start);
assert.ok(start >= 0 && end > start);
const context = {
  document: { getElementById: () => ({ value: context.keyword }) },
  allFriends: [
    { friend_id: '1', users: { id: 'p1', full_name: 'Nguyễn Lan Phương', zalo_alias: 'PH Bảo Hân 2222', role: 'parent' } },
    { friend_id: '2', users: { id: 'p2', full_name: 'Nguyễn Thị Lan Anh', role: 'parent' } }
  ],
  userSearchResults: [],
  _parentChildrenLabels: new Map([['p1', ['Hoàng Bảo Hân']]]),
  formatRole: () => 'Phụ huynh'
};
vm.createContext(context);
vm.runInContext(html.slice(start, end), context);
for (const keyword of ['lan phuong', 'PH Bao Han 2222', 'Hoang Bao Han', 'Nguyễn Lan Phương']) {
  context.keyword = keyword;
  assert.equal(context.getFilteredFriendList().length, 1);
  assert.equal(context.getFilteredFriendList()[0].friend_id, '1');
}
context.keyword = 'khong ton tai';
assert.equal(context.getFilteredFriendList().length, 0);
context.keyword = '';
assert.equal(context.getFilteredFriendList().length, 2);
context.userSearchResults = [context.allFriends[0]];
assert.equal(context.getFilteredFriendList().length, 2, 'Merged results must not duplicate existing conversations');
console.log('Message search: seven cases passed');
