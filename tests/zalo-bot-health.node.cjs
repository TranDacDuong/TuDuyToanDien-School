const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('tuition.js', 'utf8');
const statusCheck = source.slice(source.indexOf('  async function checkZaloBotStatus()'), source.indexOf('  window.requestZaloQr'));

test('bot health distinguishes timeouts from unavailable local service and recovers on next response', async () => {
  const context = vm.createContext({ AbortSignal, Date, updates: 0,
    ZALO_BOT_API: 'http://localhost:3456/api', zaloHistoryFetchedAt: Date.now(),
    updateZaloDynamicStatus() { context.updates++; }, loadZaloTuitionHistory: async () => {},
    fetch: async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); }
  });
  vm.runInContext(statusCheck, context);
  await context.checkZaloBotStatus();
  assert.equal(context.zaloBotStatus.botStatus, 'offline');
  assert.equal(context.zaloBotStatus.timedOut, true);
  context.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await context.checkZaloBotStatus();
  assert.equal(context.zaloBotStatus.timedOut, false);
  context.fetch = async () => ({ ok: true, json: async () => ({ botStatus: 'connected' }) });
  await context.checkZaloBotStatus();
  assert.equal(context.zaloBotStatus.botStatus, 'connected');
  assert.equal(context.updates, 3);
  assert.ok(!source.includes('Dịch vụ Zalo Bot chưa khởi động trên máy tính'));
  assert.ok(source.includes('bot.historySync?.lastUploadError || bot.localStorage?.lastError'));
});
