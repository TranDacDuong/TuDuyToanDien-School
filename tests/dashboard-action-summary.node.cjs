const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const context = { window: {}, console, Intl, Date, Set };
vm.runInNewContext(fs.readFileSync(path.join(root, 'dashboard-action-summary.js'), 'utf8'), context);
const summary = context.window.DashboardActionSummary;
function client(role, failure) {
  const calls = [];
  const data = {
    task_assignments: [{ id: 'a', status: 'open', task: { task_type: 'manual', due_at: '2026-10-01T00:00:00Z' } }],
    class_teachers: [],
  };
  const sb = {
    rpc(name) { calls.push(['rpc', name]); return Promise.resolve({ data: [{ waiting_reply: true }, { waiting_reply: false }] }); },
    from(table) {
      calls.push(['from', table]);
      const q = {};
      for (const method of ['select', 'eq', 'not', 'neq', 'or', 'in', 'order', 'range']) q[method] = (...args) => { calls.push([table, method, ...args]); return q; };
      q.then = (resolve, reject) => Promise.resolve(table === failure ? { error: new Error('offline') } : { data: data[table] || [], count: 2 }).then(resolve, reject);
      return q;
    }
  };
  return { sb, calls };
}
test('counts use Bangkok date and exclude completed, cancelled and reminders', () => {
  assert.equal(summary.todayText(new Date('2026-10-11T18:00:00Z')), '2026-10-12');
  const make = (status, due_at, extra = {}) => ({ status, task: { due_at, ...extra } });
  const counts = summary.taskCounts([
    make('open', '2026-10-01'), make('open', '2026-10-20'), make('open', null),
    make('completed', '2026-10-01'), make('cancelled', null),
    make('open', null, { progress: { total: 3, current: 3 } }),
    make('open', '2026-10-01', { task_type: 'attendance' }),
  ], new Date('2026-10-12T08:00:00+07:00'));
  assert.equal(counts.overdue, 1);
  assert.equal(counts.current, 2);
});
test('admin counts messages from authorized inbox RPC and tasks only assigned to self', async () => {
  const { sb, calls } = client('admin');
  const result = await summary.load(sb, { id: 'self', role: 'admin' }, () => true);
  assert.equal(result.items.find(x => x.key === 'messages').count, 2);
  assert.ok(calls.some(c => c[0] === 'rpc' && c[1] === 'list_zalo_external_inbox'));
  assert.ok(calls.some(c => c[0] === 'rpc' && c[1] === 'list_mindup_parent_reply_priority'));
  assert.ok(calls.some(c => c[0] === 'task_assignments' && c[1] === 'eq' && c[2] === 'user_id' && c[3] === 'self'));
  assert.ok(result.items.some(x => x.key === 'bank'));
});
test('teacher cannot see admin banking; failed source does not hide other work', async () => {
  const { sb, calls } = client('teacher', 'facebook_scheduled_posts');
  const result = await summary.load(sb, { id: 'teacher', role: 'teacher' }, () => true);
  assert.ok(!result.items.some(x => x.key === 'bank'));
  assert.ok(result.items.some(x => x.key === 'messages'));
  assert.ok(result.items.some(x => x.key === 'overdue'));
  assert.ok(result.failures.includes('facebook'));
  assert.ok(!calls.some(c => c[0] === 'rpc' && c[1] === 'list_zalo_external_inbox'));
});
test('denied permissions and student role do not request staff work', async () => {
  const { sb, calls } = client('student');
  const result = await summary.load(sb, { id: 'student', role: 'student' }, () => false);
  assert.equal(result.items.length, 0);
  assert.equal(calls.length, 0);
});
test('edited JavaScript and HTML inline scripts parse', () => {
  for (const name of ['tasks.js', 'tuition.js']) new vm.Script(fs.readFileSync(path.join(root, name), 'utf8'));
  for (const name of ['dashboard.html', 'trial_requests.html', 'facebook_posting.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=/.test(match[1]) && !/application\//.test(match[1])) new vm.Script(match[2], { filename: name });
    }
  }
});
