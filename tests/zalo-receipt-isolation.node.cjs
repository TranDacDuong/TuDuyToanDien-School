const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { requireSendAcknowledgement } = require('../services/zalo-bot/send-acknowledgement');
const source = fs.readFileSync(require.resolve('../services/zalo-bot/server.js'), 'utf8');

test('uncertain receipt is isolated and next receipt is sent without pausing automation', async () => {
  const calls = [];
  let sends = 0;
  const context = {
    zaloApi: { sendMessage: async () => ++sends === 1 ? { message: 'unconfirmed' } : { message: { msgId: '123' } } },
    requireSendAcknowledgement, isZaloLimitError: () => false, isUncertainSendError: () => false,
    gatewayRequest: async p => calls.push(p), acknowledgeDispatch: async p => calls.push(p)
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function sendQueuedTuitionReceipt('), source.indexOf('async function syncQueuedParentAlias(')), context);
  await context.sendQueuedTuitionReceipt({ job_id: 'first', content: 'receipt', zalo_uid: 'parent' });
  await context.sendQueuedTuitionReceipt({ job_id: 'second', content: 'receipt', zalo_uid: 'parent2' });
  assert.equal(calls[0].status, 'uncertain');
  assert.equal(calls[1].status, 'sent');
  assert.equal(calls[1].externalId, 'parent2:123');
  assert.ok(!calls.some(p => p.action === 'pauseAutomation'));
  assert.equal(sends, 2);
});

test('actual Zalo rate limit still pauses automation for account safety', async () => {
  const calls = [];
  const context = {
    zaloApi: { sendMessage: async () => { throw new Error('429 rate limit'); } },
    requireSendAcknowledgement, isZaloLimitError: () => true, isUncertainSendError: () => false,
    gatewayRequest: async p => calls.push(p), acknowledgeDispatch: async p => calls.push(p)
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function sendQueuedTuitionReceipt('), source.indexOf('async function syncQueuedParentAlias(')), context);
  await context.sendQueuedTuitionReceipt({ job_id: 'first', content: 'receipt', zalo_uid: 'parent' });
  assert.equal(calls[0].action, 'pauseAutomation');
  assert.equal(calls[1].status, 'failed');
});

test('all unified send paths avoid a global pause solely for missing acknowledgement', () => {
  assert.ok(!source.includes('isZaloLimitError(error) || error.deliveryUncertain'));
  assert.ok(source.includes("? 'uncertain' : 'failed'"));
});
