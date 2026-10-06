'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '..', 'class_evaluations.js'), 'utf8');

function harness(handler) {
  const calls = [];
  const timers = new Map();
  let counter = 0;
  let timerId = 0;
  let openings = 0;
  const elements = new Map();
  const editor = { classList: { add: () => openings++ } };
  const textarea = { value: '' };
  elements.set('se-editor-student', editor);
  elements.set('se-message-student', textarea);
  elements.set('se-state-student', {});
  const window = { crypto: webcrypto, sb: {
    from() { assert.fail('draft save must never use non-atomic table writes'); },
    rpc: async (name, args) => {
      assert.equal(name, 'save_session_evaluation_draft');
      calls.push(JSON.parse(JSON.stringify(args)));
      if (handler) return handler(args, calls.length);
      return { data: saved(args, ++counter) };
    }
  } };
  const ctx = vm.createContext({ window, console: { error() {}, warn() {} }, alert() {}, confirm: () => true,
    document: { getElementById: id => elements.get(id) },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) });
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, 'window.testing = {state, persist, updateProgress};})();'), ctx);
  const { state, persist } = window.testing;
  Object.assign(state, { sessionId: 'session', session: { class_id: 'class', session_date: '2026-10-06' }, evaluator: { id: 'teacher' },
    classInfo: { subjects: { name: 'Toán' } }, students: [{ id: 'student', full_name: 'Minh' }],
    statuses: [{ id: 'positive', name: 'hiểu bài nhanh', category: 'positive' }, { id: 'attention', name: 'cần tập trung', category: 'needs_attention' }] });
  const evaluation = { id: null, state: 'draft', message: '', statusIds: new Set(), template_selection: {}, localRevision: 0 };
  state.evaluations.set('student', evaluation);
  const card = { html: '', querySelectorAll: () => [], set outerHTML(value) { this.html = value; textarea.value = evaluation.message; } };
  elements.set('se-card-student', card);
  return { window, state, evaluation, persist, calls, timers, editor, textarea, card, elements,
    get openings() { return openings; }, async flush() {
      const pending = [...timers.values()]; timers.clear();
      for (const callback of pending) await callback();
    } };
}
function saved(args, version = 1) {
  return { id: 'evaluation', state: 'draft', updated_at: `2026-10-06T00:00:0${version}.000Z`,
    final_message: args.p_message, generated_message: null, template_selection: args.p_template_selection };
}

test('status toggles save selected statuses only without generating or opening composer', async () => {
  const h = harness();
  h.window.toggleSessionEvaluationStatus('student', 'positive');
  assert.equal(h.openings, 0);
  assert.equal(h.evaluation.message, '');
  assert.doesNotMatch(h.card.html, /class="se-editor open"/);
  await h.flush();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].p_status_ids, ['positive']);
  assert.equal(h.calls[0].p_message, null);
  assert.deepEqual(h.calls[0].p_template_selection, {});
  assert.equal(h.calls[0].p_expected_updated_at, null);
  assert.match(h.calls[0].p_request_id, /^[a-f0-9-]{36}$/);
  assert.match(h.elements.get('se-state-student').textContent, /tan học 30p/);
  assert.doesNotMatch(h.elements.get('se-state-student').textContent, /2 tuần/);
});

test('manual preview and edits persist, but any new status change clears stale text', async () => {
  const h = harness();
  h.window.toggleSessionEvaluationStatus('student', 'positive');
  h.window.generateSessionEvaluationMessage('student');
  assert.equal(h.openings, 1);
  assert.match(h.evaluation.message, /hiểu bài nhanh/);
  await h.flush();
  assert.match(h.calls[0].p_message, /Minh/);
  h.window.updateSessionEvaluationMessage('student', 'Manual edited text');
  h.textarea.value = 'Manual edited text';
  await h.flush();
  assert.equal(h.calls[1].p_message, 'Manual edited text');
  h.window.toggleSessionEvaluationStatus('student', 'attention');
  assert.equal(h.evaluation.message, '');
  assert.equal(h.openings, 1);
  assert.doesNotMatch(h.card.html, /class="se-editor open"/);
  await h.flush();
  assert.equal(h.calls[2].p_message, null);
  assert.deepEqual(h.calls[2].p_template_selection, {});
  assert.deepEqual(h.calls[2].p_status_ids, ['positive', 'attention']);
  assert.match(h.elements.get('se-state-student').textContent, /tan học 30p/);
});

test('deselecting the last status atomically clears statuses and stale content', async () => {
  const h = harness();
  h.window.toggleSessionEvaluationStatus('student', 'positive');
  await h.flush();
  h.window.toggleSessionEvaluationStatus('student', 'positive');
  await h.flush();
  assert.deepEqual(h.calls[1].p_status_ids, []);
  assert.equal(h.calls[1].p_message, null);
  assert.equal(h.elements.get('se-state-student').textContent, 'Không gửi (Bình thường)');
});

test('failed RPC shows error without table fallback; retry reuses request ID and revision', async () => {
  const h = harness(async (args, count) => count === 1 ? { error: { message: 'PGRST202' } } : { data: saved(args) });
  h.window.toggleSessionEvaluationStatus('student', 'positive');
  await h.flush();
  assert.equal(h.elements.get('se-state-student').textContent, 'Lỗi lưu nháp');
  assert.equal(h.evaluation.id, null);
  await h.persist('student', 'draft');
  assert.deepEqual(h.calls[0], h.calls[1]);
});

test('in-flight saves serialize and cannot replace newer local statuses or edited text', async () => {
  let resolveFirst;
  const h = harness(async (args, count) => count === 1 ? new Promise(resolve => { resolveFirst = () => resolve({ data: saved(args) }); }) : { data: saved(args, 2) });
  h.window.toggleSessionEvaluationStatus('student', 'positive');
  const first = h.persist('student', 'draft');
  await Promise.resolve(); await Promise.resolve();
  h.window.toggleSessionEvaluationStatus('student', 'attention');
  h.window.updateSessionEvaluationMessage('student', 'New manual text');
  h.textarea.value = 'New manual text';
  const second = h.persist('student', 'draft');
  assert.equal(h.calls.length, 1);
  resolveFirst();
  await first;
  assert.equal(h.evaluation.message, 'New manual text');
  assert.deepEqual([...h.evaluation.statusIds], ['positive', 'attention']);
  await second;
  assert.equal(h.calls[1].p_expected_updated_at, '2026-10-06T00:00:01.000Z');
  assert.equal(h.calls[1].p_message, 'New manual text');
});

test('published evaluations cannot be toggled, edited or saved as drafts', async () => {
  const h = harness();
  h.evaluation.state = 'sent';
  h.evaluation.message = 'Published';
  h.window.toggleSessionEvaluationStatus('student', 'positive');
  h.window.updateSessionEvaluationMessage('student', 'Overwrite');
  await assert.rejects(h.persist('student', 'draft'), /đã được công bố/);
  assert.equal(h.evaluation.message, 'Published');
  assert.equal(h.calls.length, 0);
  assert.equal(h.timers.size, 0);
});

test('manual send still explicitly generates a preview or preserves edited content', async () => {
  for (const edited of [false, true]) {
    const h = harness();
    const notifications = [];
    h.window.sb.from = table => table === 'evaluation_zalo_publications'
      ? { select: () => ({ in: async () => ({ data: [] }) }) }
      : { update: () => ({ eq: async () => ({}) }) };
    h.window.NotificationHelper = { createBulkNotifications: async rows => { notifications.push(...rows); return { count: rows.length }; } };
    h.state.parentIds.set('student', ['parent']);
    h.window.toggleSessionEvaluationStatus('student', 'positive');
    if (edited) {
      h.window.updateSessionEvaluationMessage('student', 'Manual content');
      h.textarea.value = 'Manual content';
    }
    await h.window.sendSessionEvaluation('student');
    assert.equal(h.evaluation.state, 'sent');
    assert.equal(h.timers.size, 0);
    assert.equal(notifications.length, 1);
    assert.equal(h.openings, edited ? 0 : 1);
    if (edited) assert.equal(notifications[0].message, 'Manual content');
    else assert.match(notifications[0].message, /hiểu bài nhanh/);
  }
});

test('server sent-row rejection cannot update the local draft or trigger fallback', async () => {
  const h = harness(async () => ({ error: { code: '40001', message: 'already sent or stale revision' } }));
  h.window.toggleSessionEvaluationStatus('student', 'positive');
  await h.flush();
  assert.equal(h.evaluation.id, null);
  assert.equal(h.elements.get('se-state-student').textContent, 'Lỗi lưu nháp');
  assert.deepEqual([...h.evaluation.statusIds], ['positive']);
});

test('all selected categories, including positive-only, use the per-session 30-minute label', async () => {
  for (const category of ['positive', 'neutral', 'needs_attention']) {
    const h = harness();
    h.state.statuses[0].category = category;
    h.elements.set('sessionEvaluationProgress', {});
    h.window.toggleSessionEvaluationStatus('student', 'positive');
    await h.flush();
    h.window.testing.updateProgress();
    assert.match(h.elements.get('se-state-student').textContent, /tan học 30p/);
    assert.match(h.elements.get('sessionEvaluationProgress').textContent, /1 sẽ công bố sau tan học 30p/);
    assert.doesNotMatch(h.card.html + h.elements.get('sessionEvaluationProgress').textContent, /2 tuần/);
  }
});

test('manual notification failure reads its new revision and retries draft with that exact token', async () => {
  const failedRevision = '2026-10-06T00:00:02.123456Z';
  const h = harness(async (args, count) => {
    assert.equal(args.p_expected_updated_at, count === 1 ? null : failedRevision);
    return { data: saved(args, count) };
  });
  let notifications = 0;
  h.window.NotificationHelper = { createBulkNotifications: async rows => {
    if (++notifications === 1) throw new Error('notification insert failed');
    return { count: rows.length };
  } };
  h.window.sb.from = table => table === 'evaluation_zalo_publications'
    ? { select: () => ({ in: async () => ({ data: [] }) }) }
    : { update: payload => ({ eq: (field, id) => {
      assert.equal(field, 'id'); assert.equal(id, 'evaluation');
      if (payload.state === 'sent') return Promise.resolve({});
      assert.equal(payload.state, 'failed');
      return { select: fields => {
        assert.equal(fields, 'updated_at');
        return { single: async () => ({ data: { updated_at: failedRevision } }) };
      } };
    } }) };
  h.state.parentIds.set('student', ['parent']);
  h.window.toggleSessionEvaluationStatus('student', 'positive');
  h.window.updateSessionEvaluationMessage('student', 'Manual content');
  h.textarea.value = 'Manual content';
  await h.window.sendSessionEvaluation('student');
  assert.equal(h.evaluation.state, 'failed');
  assert.equal(h.evaluation.updated_at, failedRevision);
  await h.window.sendSessionEvaluation('student');
  assert.equal(h.calls.length, 2);
  assert.equal(h.evaluation.state, 'sent');
  assert.notEqual(h.calls[0].p_request_id, h.calls[1].p_request_id);
});
