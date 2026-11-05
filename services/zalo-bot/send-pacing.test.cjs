const test = require('node:test');
const assert = require('node:assert/strict');
const { createSendPacer, installSendPacing } = require('./send-pacing');

test('all SDK sends share ten seconds after completion, even across failures and restart', async () => {
  let now = 100, deadline = 0;
  const starts = [];
  const config = { clock: () => now, readDeadline: () => deadline,
    writeDeadline: value => { deadline = value; }, sleep: async ms => { now += ms; } };
  const api = installSendPacing({ sendMessage: async text => {
    starts.push(now); now += 2000;
    if (text === 'failure') throw Error('recipient unavailable');
    return text;
  } }, createSendPacer(config));
  const results = await Promise.allSettled([api.sendMessage('text'), api.sendMessage('failure'), api.sendMessage('QR')]);
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected', 'fulfilled']);
  assert.deepEqual(starts, [100, 12100, 24100]);
  const restarted = createSendPacer(config);
  await restarted(() => { starts.push(now); });
  assert.equal(starts[3], 36100);
});

test('final send guard runs after waiting, so automatic quiet hours are respected', async () => {
  let now = 0, sends = 0;
  const api = installSendPacing({ sendMessage: () => { sends++; } }, createSendPacer({
    readDeadline: () => 10000, writeDeadline: () => {}, clock: () => now, sleep: async ms => { now += ms; }
  }));
  await assert.rejects(api.sendMessage('text', 'uid', 0, () => { assert.equal(now, 10000); throw Error('quiet hours'); }), /quiet hours/);
  assert.equal(sends, 0);
});
