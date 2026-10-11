const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../services/zalo-bot/server.js'), 'utf8');
function harness(busy = false) {
  let handler, saved = 0, exited = false;
  const context = { app: { post: (_, fn) => handler = fn }, gatewayBusy: busy, shuttingDown: false,
    Date, sleep: async () => { context.gatewayBusy = false; }, persistIncoming: () => saved++,
    setTimeout: fn => fn(), process: { exit: () => exited = true } };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("app.post('/api/shutdown'"), source.indexOf('app.listen(PORT')), context);
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  return { context, res, run: headers => handler({ headers }, res), state: () => ({ saved, exited }) };
}
test('local restart waits for active dispatch and persists pending messages', async () => {
  const h = harness(true); await h.run({});
  assert.equal(h.context.gatewayBusy, false);
  assert.equal(h.res.body.success, true);
  assert.deepEqual(h.state(), { saved: 1, exited: true });
});
test('web pages cannot request shutdown', async () => {
  for (const headers of [{ origin: 'https://tuduytoandien.vercel.app' }, { 'sec-fetch-site': 'cross-site' }]) {
    const h = harness(); await h.run(headers);
    assert.equal(h.res.code, 403);
    assert.deepEqual(h.state(), { saved: 0, exited: false });
  }
});
test('launcher validates process and port without killing all node processes', () => {
  const ps = fs.readFileSync(path.join(__dirname, '../services/zalo-bot/restart-bot.ps1'), 'utf8');
  assert.match(ps, /CreationDate -eq \$owner.CreationDate/);
  assert.match(ps, /CommandLine -notmatch/);
  assert.match(ps, /Invoke-RestMethod -Method Post/);
  assert.ok(!/Stop-Process -Name|taskkill/i.test(ps));
});
