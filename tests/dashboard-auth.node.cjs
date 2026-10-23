const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {}, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync('dashboard-auth.js', 'utf8'), context);
const { loadProfile } = context.window.DashboardAuth;
const profile = { id: 'user', role: 'admin' };
const fast = { wait: async () => {}, timeoutMs: 30 };
function clientFor(results, refresh) {
  let calls = 0, refreshes = 0;
  const client = {
    from(table) {
      assert.equal(table, 'users');
      return {
        select() { return this; },
        eq(key, value) { assert.equal(key, 'id'); assert.equal(value, 'user'); return this; },
        abortSignal() { return this; },
        maybeSingle() { const value = results[Math.min(calls++, results.length - 1)]; return typeof value === 'function' ? value() : Promise.resolve(value); },
      };
    },
    auth: {
      refreshSession: async () => { refreshes++; return refresh ? refresh() : { data: { session: { user: { id: 'user' } } } }; },
      signOut: () => { throw new Error('Must not sign out'); },
    },
  };
  return { client, calls: () => calls, refreshes: () => refreshes };
}
test('loads only the authenticated matching profile', async () => {
  const c = clientFor([{ data: profile }]);
  assert.equal((await loadProfile(c.client, 'user', fast)).profile, profile);
  const wrong = clientFor([{ data: { ...profile, id: 'other' } }]);
  assert.equal((await loadProfile(wrong.client, 'user', fast)).kind, 'missing');
});
test('retries transient errors and succeeds without ending the session', async () => {
  const c = clientFor([{ status: 503, error: { code: 'UNAVAILABLE' } }, { data: profile }]);
  assert.equal((await loadProfile(c.client, 'user', fast)).profile, profile);
  assert.equal(c.calls(), 2);
});
test('refreshes a rejected token once and retries the profile', async () => {
  const c = clientFor([{ status: 401, error: { code: 'PGRST301' } }, { data: profile }]);
  assert.equal((await loadProfile(c.client, 'user', fast)).profile, profile);
  assert.equal(c.refreshes(), 1);
});
test('persistent 401 is reported, not converted into a missing account', async () => {
  const c = clientFor([{ status: 401, error: { code: 'PGRST301' } }]);
  const result = await loadProfile(c.client, 'user', fast);
  assert.equal(result.kind, 'session');
  assert.equal(result.code, 'PGRST301');
  assert.equal(c.refreshes(), 1);
});
test('missing profile and denied access are not retried or bypassed', async () => {
  for (const [response, kind] of [[{ data: null }, 'missing'], [{ status: 403, error: { code: '42501' } }, 'unavailable']]) {
    const c = clientFor([response]);
    assert.equal((await loadProfile(c.client, 'user', fast)).kind, kind);
    assert.equal(c.calls(), 1);
  }
});
test('hung requests and refreshes have bounded waiting', async () => {
  const never = () => new Promise(() => {});
  const c = clientFor([never]);
  assert.equal((await loadProfile(c.client, 'user', fast)).code, 'PROFILE_TIMEOUT');
  assert.equal(c.calls(), 3);
  const expired = clientFor([{ status: 401, error: {} }], never);
  assert.equal((await loadProfile(expired.client, 'user', fast)).kind, 'session');
});
test('dashboard no longer signs out on a failed profile read and guards navigation', () => {
  const html = fs.readFileSync('dashboard.html', 'utf8');
  assert.ok(!html.includes('Hệ thống sẽ đăng xuất.'));
  assert.ok(html.includes('if(currentDashboardUser && !currentDashboardProfile) return;'));
  assert.ok(html.includes('if(await initDashboard(data?.user || null))'));
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!match[1].includes('src=')) new vm.Script(match[2]);
  }
});
