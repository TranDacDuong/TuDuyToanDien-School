const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('./server.js'), 'utf8');
const recovery = source.slice(source.indexOf('async function recoverSavedSession()'),
  source.indexOf('\n}', source.indexOf('async function recoverSavedSession()')) + 2);

test('session recovery waits, backs off, and respects logout and active work', async () => {
  let now = 1000;
  let calls = 0;
  const context = vm.createContext({ automaticLoginEnabled: true, isLoggingIn: false,
    gatewayBusy: false, listenerConnected: false, botStatus: 'disconnected',
    disconnectedSince: 0, nextSessionRetryAt: 0, sessionRetryCount: 0,
    SESSION_FILE: 'unused', fs: { existsSync: () => true }, Date: { now: () => now },
    console: { log() {} }, initZaloClient: async () => { calls++; } });
  vm.runInContext(recovery, context);
  await context.recoverSavedSession();
  assert.equal(calls, 0);
  now += 60000;
  await context.recoverSavedSession();
  assert.equal(calls, 1);
  await context.recoverSavedSession();
  assert.equal(calls, 1);
  now += 30000;
  context.gatewayBusy = true;
  await context.recoverSavedSession();
  assert.equal(calls, 1);
  context.gatewayBusy = false;
  context.automaticLoginEnabled = false;
  await context.recoverSavedSession();
  assert.equal(calls, 1);
  context.automaticLoginEnabled = true;
  context.listenerConnected = true;
  await context.recoverSavedSession();
  assert.equal(context.sessionRetryCount, 0);
  assert.equal(context.disconnectedSince, 0);
});
