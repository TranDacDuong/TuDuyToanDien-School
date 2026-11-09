'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { installReadOnly } = require('./zalo-read-only');

test('read-only mode blocks real mutations and preserves reads and listener', async () => {
  let mutations = 0;
  const api = { value: 3, listener: {}, getFriends() { return this.value; } };
  for (const name of ['sendMessage', 'sendFriendRequest', 'uploadAttachment', 'createGroup', 'changeFriendAlias', 'addUserToGroup']) {
    api[name] = async () => { mutations++; };
  }
  const guarded = installReadOnly(api, true);
  for (const name of Object.keys(api).filter(name => typeof api[name] === 'function' && name !== 'getFriends')) {
    await assert.rejects(guarded[name](), { code: 'ZALO_READ_ONLY' });
  }
  assert.equal(mutations, 0);
  assert.equal(guarded.getFriends(), 3);
  assert.equal(guarded.listener, api.listener);
});

test('existing installations keep the original API when read-only is off', () => {
  const api = {};
  assert.equal(installReadOnly(api), api);
  assert.equal(installReadOnly(api, false), api);
});
