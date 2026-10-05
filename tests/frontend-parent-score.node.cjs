'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const quiet = { warn() {}, error() {}, log() {} };
function load(file, window = {}, extras = {}) {
  const ctx = vm.createContext({ window, console: quiet, ...extras });
  vm.runInContext(source(file), ctx);
  return window;
}
function database({ links = [{ parent_id: 'p1' }, { parent_id: 'p1' }, { parent_id: 'p2' }], linkError, role = 'parent', rpcError } = {}) {
  const calls = [];
  return { calls, from(table) {
    const q = { select() { return q; }, eq() { return q; }, is: async () => ({ data: links, error: linkError }),
      maybeSingle: async () => ({ data: table === 'users' ? role && { role } : null }) };
    // is() supports both awaited fanout and targeted maybeSingle().
    q.is = () => Object.assign(Promise.resolve({ data: links, error: linkError }), {
      maybeSingle: async () => ({ data: links[0] || null, error: linkError })
    });
    return q;
  }, async rpc(name, args) { calls.push({ name, args }); return { data: 2, error: rpcError?.(name) }; } };
}

test('fanout and missing-upsert fallback remain active-parent-only', async () => {
  const sb = database({ rpcError: name => name.startsWith('upsert') ? { code: 'PGRST202', message: 'PGRST202' } : null });
  const api = load('learning_messages.js', { sb }).LearningMessages;
  await api.sendToAllAudiences({ studentId: 'child', content: 'score', messageKey: 'key' });
  assert.equal(sb.calls.length, 2);
  for (const call of sb.calls) assert.deepEqual(Array.from(call.args.p_audience_user_ids), ['p1', 'p2']);
  for (const config of [{ links: [] }, { linkError: { message: 'denied' } }]) {
    const blocked = database(config);
    await load('learning_messages.js', { sb: blocked }).LearningMessages.sendToAllAudiences({ studentId: 'child', content: 'score' });
    assert.equal(blocked.calls.length, 0);
  }
});

test('targeted messages require an active parent link', async () => {
  for (const links of [[], [{ parent_id: 'p1' }]]) {
    const sb = database({ links });
    await load('learning_messages.js', { sb }).LearningMessages.sendToAudience({ studentId: 'child', audienceUserId: 'p1', content: 'notice' });
    assert.equal(sb.calls.length, links.length);
  }
});

test('retained templates work; removed templates stay disabled', async () => {
  const sb = database();
  const api = load('learning_messages.js', { sb }).LearningMessages;
  for (const id of ['session_score_notice', 'offline_test_score_notice', 'exam_score_notice', 'session_evaluation', 'tuition_reminder', 'absent_notification']) {
    assert.equal(await api.getTemplate(id, 'retained'), 'retained');
  }
  for (const id of ['course_created', 'birthday_wish', 'welcome_new_student']) assert.equal(await api.getTemplate(id, 'removed'), null);
});

test('bot sends directly only to parents; students fan out; missing roles fail closed', async () => {
  for (const role of ['parent', 'student', 'teacher', null]) {
    const sb = database({ role });
    const mirrored = [];
    const api = load('mindup_bot.js', { sb, LearningMessages: { sendToAllAudiences: async args => { mirrored.push(args); return { count: 1 }; } } }).MindUpBot;
    await api.sendBotMessage('recipient', 'notice');
    assert.equal(sb.calls.length, role === 'parent' ? 2 : 0);
    assert.equal(mirrored.length, role === 'student' ? 1 : 0);
    await api.sendWelcomeMessage('recipient', { studentName: 'Name' });
    assert.equal(sb.calls.length, role === 'parent' ? 2 : 0);
  }
});

function messageRenderer() {
  const html = source('messages.html');
  const functions = html.slice(html.indexOf('function parseMessageContent('), html.indexOf('// === MindUp Bot Helpers ==='));
  const ctx = vm.createContext({ CHAT_IMAGE_PREFIX: '__IMAGE__', renderMarkdown: value => value });
  vm.runInContext(functions, ctx);
  vm.runInContext(html.slice(html.indexOf('function renderMarkdown('), html.indexOf('// Handle evaluation widget click')), ctx);
  return ctx;
}

test('generated tables focus the actual child and remove other names/IDs', () => {
  const api = load('learning_messages.js').LearningMessages;
  const token = api.scoreTableToken({ studentId: 'own', studentName: 'Minh', rows: [
    { student_id: 'other-private-id', full_name: 'Other Secret', score: '8', max_score: 10 },
    { student_id: 'own', score: 0, max_score: 10 },
    { student_id: 'invalid', score: 99, max_score: 10 }
  ] });
  assert.doesNotMatch(token, /Other Secret|other-private-id|invalid/);
  const html = messageRenderer().renderMessageBody(token);
  assert.match(html, /score-table-focus/);
  assert.match(html, /Minh/);
  assert.match(html, /0\/10/);
  assert.match(html, /Học sinh 1/);
  assert.equal(api.scoreTableToken({ rows: [{ score: -1 }] }), '');
});

test('web renders both chart tokens, strips previews, escapes names and malformed JSON', () => {
  const ctx = messageRenderer();
  const distribution = '__CHART__' + JSON.stringify({ type: 'score_distribution', title: 'Distribution', buckets: [{ label: '0-5', count: 0 }] });
  const table = '__CHART__' + JSON.stringify({ type: 'score_table', focusStudentId: 'own', rows: [
    { studentId: 'own', label: '<img onerror=alert(1)>', score: 0, maxScore: 10 },
    { studentId: 'other', label: 'Secret', score: 8, maxScore: 10 }
  ] });
  const text = `Before\n${distribution}\n${table}\nAfter`;
  const html = ctx.renderMessageBody(text);
  assert.match(html, /score-chart-bars/);
  assert.match(html, /score-table-focus/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /__CHART__|Secret|<img onerror/);
  assert.match(html, />0<\/div>/);
  assert.doesNotMatch(ctx.getMessagePreview(text), /__CHART__|studentId|buckets/);
  assert.equal(ctx.getMessagePreview('Before __CHART__{"name":"Secret"'), 'Before');
});

test('evaluation publishing does not claim success for unlinked students', async () => {
  const cards = new Map();
  const alerts = [];
  const writes = [];
  const document = { getElementById(id) {
    if (!cards.has(id)) cards.set(id, { value: '', classList: { add() {} }, querySelectorAll: () => [] });
    return cards.get(id);
  } };
  const window = { sb: { from: table => ({ update: data => ({ eq: async () => { writes.push({ table, data }); return {}; } }) }) } };
  const ctx = vm.createContext({ window, document, console: quiet, confirm: () => true, alert: value => alerts.push(value) });
  vm.runInContext(source('class_evaluations.js').replace(/\}\)\(\);\s*$/, 'window.testState = state; window.testStudentCard = studentCard;})();'), ctx);
  const state = window.testState;
  state.session = { class_id: 'class' };
  state.students = [{ id: 'child', full_name: 'Minh' }];
  state.evaluations.set('child', { state: 'draft', message: 'Review', statusIds: new Set(['status']) });
  await window.sendEvaluatedDraftsNow();
  assert.equal(state.evaluations.get('child').state, 'failed');
  assert.equal(writes.length, 0);
  assert.match(alerts.at(-1), /0\/1/);
  state.evaluations.get('child').state = 'sent';
  state.evaluations.get('child').sent_at = new Date().toISOString();
  assert.match(window.testStudentCard(state.students[0]), /Đã công bố thông báo/);
  assert.doesNotMatch(source('class_evaluations.js'), /stateLabel =[^;]*Đã gửi|Nhận xét này đã được gửi/);
});

test('single and batch evaluation publications target parents and recover failed notifications', async () => {
  for (const batch of [false, true]) {
    for (const fail of [false, true]) {
      const cards = new Map();
      const notifications = [];
      const updates = [];
      const document = { getElementById(id) {
        if (!cards.has(id)) cards.set(id, { value: '', classList: { add() {} }, querySelectorAll: () => [] });
        return cards.get(id);
      } };
      const window = { sb: { from: () => ({ update: value => ({ eq: async () => { updates.push(value); return {}; } }) }) },
        NotificationHelper: { createBulkNotifications: async (rows, options) => {
          assert.equal(options.requireInsert, true);
          notifications.push(...rows);
          if (fail) throw new Error('publication failed');
          return { count: rows.length };
        } }, testPersist: async (_, nextState) => {
          assert.equal(nextState, 'draft');
          const evaluation = window.testState.evaluations.get('child');
          Object.assign(evaluation, { id: 'evaluation', state: nextState, sent_at: null });
          return evaluation;
        } };
      const ctx = vm.createContext({ window, document, console: quiet, confirm: () => true, alert() {} });
      vm.runInContext(source('class_evaluations.js').replace(/\}\)\(\);\s*$/, 'window.testState = state; persist = window.testPersist;})();'), ctx);
      const state = window.testState;
      state.session = { class_id: 'class' };
      state.students = [{ id: 'child', full_name: 'Minh' }];
      state.parentIds.set('child', ['p1', 'p1', 'p2']);
      state.evaluations.set('child', { state: 'draft', message: 'Review', statusIds: new Set(['status']) });
      if (batch) await window.sendEvaluatedDraftsNow();
      else await window.sendSessionEvaluation('child');
      assert.deepEqual(notifications.map(row => row.userId), ['p1', 'p2']);
      assert.equal(state.evaluations.get('child').state, fail ? 'failed' : 'sent');
      if (fail) {
        assert.equal(state.evaluations.get('child').sent_at, null);
        assert.equal(updates[0].state, 'failed');
      }
    }
  }
});

test('actual helper and manual persistence never save sent when insert fails or all recipients are skipped', async () => {
  for (const scenario of ['success', 'insert-error', 'rls-error', 'self-skipped', 'rollback-error', 'publish-state-error']) {
    const stored = {};
    const writes = [];
    const alerts = [];
    const cards = new Map();
    const document = { getElementById(id) {
      if (!cards.has(id)) cards.set(id, { value: '', classList: { add() {} }, querySelectorAll: () => [] });
      return cards.get(id);
    } };
    const sb = { auth: { getUser: async () => ({ data: { user: { id: scenario === 'self-skipped' ? 'p1' : 'teacher' } } }) }, from(table) {
      let payload;
      const q = {
        select() { return q; }, in() { return q; }, is: async () => ({ data: [] }),
        upsert(data) { payload = data; return q; },
        single: async () => { Object.assign(stored, payload, { id: 'evaluation' }); writes.push({ ...payload }); return { data: { ...stored } }; },
        delete() { return q; },
        update(data) { payload = data; return q; },
        eq: async () => {
          if (payload) {
            if (scenario === 'rollback-error') throw new Error('rollback offline');
            if (scenario === 'publish-state-error' && payload.state === 'sent') return { error: new Error('state write failed') };
            Object.assign(stored, payload); writes.push({ ...payload });
          }
          return {};
        },
        insert: async () => ({ error: table === 'notifications' && ['insert-error', 'rls-error', 'rollback-error'].includes(scenario)
          ? { code: scenario === 'rls-error' ? '42501' : 'DB_ERROR', message: 'notification insert failed' } : null })
      };
      return q;
    } };
    const window = load('notification_helper.js', { sb });
    const ctx = vm.createContext({ window, document, console: quiet, confirm: () => true, alert: value => alerts.push(value) });
    vm.runInContext(source('class_evaluations.js').replace(/\}\)\(\);\s*$/, 'window.testState = state;})();'), ctx);
    const state = window.testState;
    Object.assign(state, { sessionId: 'session', session: { class_id: 'class' }, evaluator: { id: 'teacher' }, students: [{ id: 'child', full_name: 'Minh' }] });
    state.parentIds.set('child', ['p1']);
    state.evaluations.set('child', { state: 'draft', message: 'Review', statusIds: new Set() });
    await window.sendSessionEvaluation('child');
    assert.equal(state.evaluations.get('child').state, scenario === 'success' ? 'sent' : 'failed');
    if (scenario === 'success') {
      assert.equal(stored.state, 'sent');
      assert.match(alerts.at(-1), /^Đã công bố/);
      await window.sendSessionEvaluation('child');
      assert.equal(stored.state, 'sent');
    } else {
      assert.notEqual(stored.state, 'sent');
      assert.ok(writes.every(write => write.state !== 'sent'));
      assert.doesNotMatch(cards.get('se-card-child').outerHTML, /Đã công bố thông báo/);
      assert.match(alerts.at(-1), /^Chưa công bố/);
    }
  }
});

test('class score integrations attach focused tables for both score sources', async () => {
  const code = source('class_manage.js');
  const rows = [{ student_id: 'own', score: 0, max_score: 10 }, { student_id: 'other', score: 9, max_score: 10 }];
  const calls = [];
  const api = load('learning_messages.js').LearningMessages;
  api.sendToAllAudiences = async args => { calls.push(args); return { count: 1 }; };
  const sb = { from(table) {
    const data = table === 'users' ? [{ id: 'own', full_name: 'Minh' }] : table === 'class_offline_test_scores' ? rows : { id: 'test', title: 'Math', max_score: 10 };
    const q = { select() { return q; }, eq() { return q; }, in() { return q; }, maybeSingle: async () => ({ data }), then: resolve => Promise.resolve({ data }).then(resolve) };
    return q;
  } };
  const ctx = vm.createContext({ window: { LearningMessages: api }, getSb: () => sb, _className: 'Class', _cachedClass: null,
    normalizeScoreToTen: score => score, buildSessionScoreStats: () => ({ rankByStudentId: new Map(), totalRanked: 2, distribution: [] }),
    loadSessionScoreGroupInfo: async () => ({ scoreRows: rows, messageGroupKey: 'group' }) });
  vm.runInContext(code.slice(code.indexOf('  async function mirrorOfflineTestScoresToLearningThreads('), code.indexOf('  window.cvCloseSessionScoreModal')), ctx);
  vm.runInContext(code.slice(code.indexOf('  async function mirrorSessionScoresToLearningThreads('), code.indexOf('  async function loadSessionScoreGroupInfo(')), ctx);
  await ctx.mirrorOfflineTestScoresToLearningThreads('test', [rows[0]]);
  await ctx.mirrorSessionScoresToLearningThreads('session', [rows[0]]);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.studentId, 'own');
    assert.match(call.content, /focusStudentId/);
    assert.match(call.content, /Minh/);
    assert.doesNotMatch(call.content, /"other"/);
    assert.match(messageRenderer().renderMessageBody(call.content), /score-table-focus/);
  }
});

test('browser renders focused table alongside distribution at desktop and mobile widths', async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  try {
    const page = await browser.newPage();
    const api = load('learning_messages.js').LearningMessages;
    const token = api.scoreTableToken({ studentId: 'own', studentName: 'Minh', rows: [{ student_id: 'own', score: 0, max_score: 10 }, { student_id: 'other', score: 9, max_score: 10 }] });
    const content = messageRenderer().renderMessageBody(api.sessionScoreContent({ score: 0, distribution: [{ label: '0-5', count: 0 }, { label: '5-10', count: 2 }] }) + '\n' + token);
    const css = source('messages.html').match(/<style>([\s\S]*?)<\/style>/)[1];
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.setContent(`<style>${css}body{margin:0;padding:12px}.test-bubble{max-width:600px;overflow-wrap:anywhere}</style><div class="test-bubble">${content}</div>`);
      assert.equal(await page.locator('.score-table-focus').count(), 1);
      assert.equal(await page.locator('.score-chart-bars').count(), 1);
      assert.equal(await page.locator('.score-table-focus').innerText(), 'Minh\t0/10');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      fs.mkdirSync(path.join(root, 'scratch'), { recursive: true });
      await page.screenshot({ path: path.join(root, 'scratch', `parent-score-${width}.png`) });
    }
  } finally { await browser.close(); }
});

test('global dispatch adds automatic waiting only, retaining existing delivery aggregates', async () => {
  const html = source('messages.html');
  const fn = html.slice(html.indexOf('async function refreshZaloDispatchStatus()'), html.indexOf('window.toggleZaloDispatch'));
  for (const automatic of [undefined, 4, '4']) {
    const elements = new Map(['zaloDispatchBar', 'zaloDispatchSummary', 'zaloDispatchToggle'].map(id => [id, { dataset: {} }]));
    const ctx = vm.createContext({ currentProfile: { role: 'admin' }, document: { hidden: false, getElementById: id => elements.get(id) },
      sb: { rpc: async name => {
        assert.equal(name, 'get_mindup_zalo_dispatch_status');
        return { data: { waitingWeb: 1, waitingReceipts: 2, waitingTuition: 3, waitingAutomatic: automatic,
          processing: 7, sent: 8, failed: 9 } };
      } } });
    vm.runInContext(fn, ctx);
    await ctx.refreshZaloDispatchStatus();
    assert.equal(elements.get('zaloDispatchSummary').textContent, `Zalo: ${automatic === undefined ? 6 : 10} chờ · 7 đang gửi · 8 đã gửi · 9 lỗi`);
  }
});
