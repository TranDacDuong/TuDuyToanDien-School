const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'server.js'), 'utf8');

test('QR relogin starts a listener for the new API and ignores old connection events', () => {
  const makeApi = () => {
    const events = {};
    const counts = { starts: 0, stops: 0 };
    return { events, counts, listener: {
      on(name, fn) { events[name] = fn; },
      start() { counts.starts++; }, stop() { counts.stops++; }
    } };
  };
  const first = makeApi();
  const second = makeApi();
  const context = vm.createContext({ console, first, second, historyController: { connection() {} },
    refreshSyncLinks: async () => {}, GATEWAY_URL: 'gateway', GATEWAY_TOKEN: 'test' });
  const body = source.slice(source.indexOf('function startGatewayListener()'), source.indexOf('function messageTimestamp('));
  vm.runInContext(`let zaloApi=first, gatewayListening=false, gatewayListenerApi=null, listenerConnected=false, botStatus='disconnected'; ${body}
    startGatewayListener(); first.events.connected(); startGatewayListener();
    zaloApi=second; startGatewayListener();`, context);
  assert.equal(first.counts.starts, 1);
  assert.equal(first.counts.stops, 1);
  assert.equal(second.counts.starts, 1);
  assert.equal(vm.runInContext('listenerConnected', context), false);
  first.events.connected();
  assert.equal(vm.runInContext('listenerConnected', context), false);
  second.events.connected();
  assert.equal(vm.runInContext('listenerConnected', context), true);
  first.events.disconnected();
  assert.equal(vm.runInContext('listenerConnected', context), true);
});
