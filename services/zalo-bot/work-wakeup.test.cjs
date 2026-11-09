'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WorkWakeup, isAllowedRealtimeUrl } = require('./work-wakeup');

test('plaintext Realtime is accepted only on loopback', () => {
  for (const url of ['http://127.0.0.1:18000', 'http://localhost:18000', 'http://[::1]:18000', 'https://example.supabase.co']) assert.equal(isAllowedRealtimeUrl(url), true, url);
  for (const url of ['http://192.168.1.2', 'http://127.0.0.1.evil.test', 'http://127.0.0.1@evil.test', 'http://evil.test@127.0.0.1', 'file:///tmp/key', 'not a URL']) assert.equal(isAllowedRealtimeUrl(url), false, url);
});

test('a local restored gateway subscribes to its public loopback endpoint', async () => {
  let connected;
  const client = { channel() { return { on() { return this; }, subscribe(callback) { callback('SUBSCRIBED'); } }; } };
  const wakeup = new WorkWakeup({ request: async () => ({ url: 'http://127.0.0.1:18000', anonKey: 'test', topic: 'zalo-work:' + 'a'.repeat(64) }), createClient(url) { connected = url; return client; }, wake() {} });
  await wakeup.connect();
  assert.equal(connected, 'http://127.0.0.1:18000/realtime/v1');
  assert.equal(wakeup.status, 'SUBSCRIBED');
});
