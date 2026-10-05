const { test, expect } = require('@playwright/test');
const { GatewayQueue, HistorySync, validateMessage } = require('../services/zalo-bot/message-sync');
const { writeJsonAtomic } = require('../services/zalo-bot/sync-store');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const message = (id, overrides = {}) => ({ action: 'syncMessage', externalId: `parent:${id}`,
  zaloUid: 'parent', content: 'Hello', isSelf: false, isHistory: false,
  sentAt: '2026-10-01T00:00:00Z', ...overrides });

function makeQueue(items, request) {
  const pending = new Map(items.map(p => [p.externalId || `ack:${p.jobId}`, p]));
  const rejected = [];
  const results = [];
  const saved = [];
  let clock = 0;
  const queue = new GatewayQueue({ pending, request, now: () => clock,
    persist: () => saved.push(JSON.parse(JSON.stringify([...pending.values()]))),
    quarantine: (payload, error) => rejected.push({ payload, error }),
    onResult: (payload, result) => results.push({ payload, result }) });
  return { queue, pending, rejected, results, saved, advance: ms => { clock += ms; } };
}

test('invalid incoming message is isolated and the next message uploads', async () => {
  const called = [];
  const q = makeQueue([message('bad', { content: 'x'.repeat(10001) }), message('good')], async p => {
    called.push(p.externalId); return { result: 'received' };
  });
  await q.queue.flush();
  expect(called).toEqual(['parent:good']);
  expect(q.rejected).toHaveLength(1);
  expect(q.pending.size).toBe(0);
  expect(q.saved.at(-1)).toEqual([]);
});

test('a transient failure does not block later messages and retries with backoff', async () => {
  const called = [];
  let fail = true;
  const q = makeQueue([message('first'), message('second')], async p => {
    called.push(p.externalId);
    if (p.externalId === 'parent:first' && fail) throw new Error('network offline');
    return { result: 'received' };
  });
  await q.queue.flush();
  await q.queue.flush();
  expect(called).toEqual(['parent:first', 'parent:second']);
  fail = false; q.advance(2000);
  await q.queue.flush();
  expect(q.pending.size).toBe(0);
});

test('expired gateway credentials retain all messages instead of discarding them', async () => {
  const q = makeQueue([message('one'), message('two')], async () => {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  });
  await q.queue.flush();
  expect(q.pending.size).toBe(2);
  expect(q.rejected).toHaveLength(0);
});

test('deferred self echo is retried after the original outgoing message is acknowledged', async () => {
  let deferred = true;
  const q = makeQueue([message('echo', { isSelf: true })], async () => ({ result: deferred ? 'deferred' : 'duplicate' }));
  await q.queue.flush();
  expect(q.pending.size).toBe(1);
  deferred = false; q.advance(2000);
  await q.queue.flush();
  expect(q.pending.size).toBe(0);
  expect(q.results[0].result).toBe('duplicate');
});

test('an outgoing acknowledgement survives restart and retries without sending Zalo again', async () => {
  const ack = { action: 'finish', jobId: 'job', externalId: 'parent:123', status: 'sent' };
  const q = makeQueue([ack], async () => { throw new Error('timeout'); });
  await q.queue.flush();
  const restored = q.saved.at(-1);
  const calls = [];
  const restarted = makeQueue(restored, async p => { calls.push(p); return { ok: true }; });
  restarted.advance(3000);
  await restarted.queue.flush();
  expect(calls).toEqual([{ action: 'finish', jobId: 'job', externalId: 'parent:123', status: 'sent' }]);
  expect(restarted.pending.size).toBe(0);
});

test('400 response is quarantined without blocking the queue', async () => {
  const q = makeQueue([message('bad'), message('good')], async p => {
    if (p.externalId === 'parent:bad') throw Object.assign(new Error('invalid'), { status: 400 });
    return { result: 'received' };
  });
  await q.queue.flush();
  expect(q.rejected).toHaveLength(1);
  expect(q.results.map(r => r.result)).toEqual(['rejected', 'received']);
});

test('concurrent flushes do not upload a message twice', async () => {
  let release;
  let calls = 0;
  const q = makeQueue([message('one')], () => { calls++; return new Promise(resolve => { release = resolve; }); });
  const first = q.queue.flush();
  await q.queue.flush();
  release({ result: 'received' }); await first;
  expect(calls).toBe(1);
});

test('failed disk acknowledgement retains an uploaded item for safe deduplicated retry', async () => {
  const q = makeQueue([message('one')], async () => ({ result: 'received' }));
  let writes = 0;
  q.queue.persist = () => { if (++writes === 1) throw new Error('Disk full'); };
  await q.queue.flush();
  expect(q.pending.size).toBe(1);
  q.advance(2000); await q.queue.flush();
  expect(q.pending.size).toBe(0);
});

function makeHistory({ pending = 0, enqueue = () => true, request = () => {} } = {}) {
  let serial = 0;
  const timers = new Map();
  const history = new HistorySync({ requestPage: request, enqueue, pendingCount: () => pending,
    setTimer: (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimer: id => timers.delete(id) });
  return { history, timers, setPending: n => { pending = n; }, tick: () => {
    const [id, timer] = timers.entries().next().value;
    timers.delete(id); timer.fn();
  } };
}

test('missing history response times out with bounded retries and can be restarted', () => {
  let requests = 0;
  const h = makeHistory({ request: () => { requests++; } });
  h.history.connection(true);
  for (let i = 0; i < 8; i++) h.tick();
  expect(requests).toBe(4);
  expect(h.history.state.status).toBe('failed');
  expect(h.timers.size).toBe(0);
  h.history.start(); h.tick();
  expect(h.history.state.status).toBe('running');
  expect(requests).toBe(5);
});

test('history is not completed until uploads drain, and page caps are partial', () => {
  const h = makeHistory({ pending: 1 });
  h.history.connected = true; h.history.start(1); h.tick();
  h.history.receive([{ data: { msgId: '123' } }], 0);
  expect(h.history.state.status).toBe('uploading');
  h.setPending(0); h.history.result({ isHistory: true }, 'history_imported');
  expect(h.history.state.status).toBe('partial');
  expect(h.history.state.uploaded).toBe(1);
});

test('disconnect cancels timers and reconnect automatically starts catchup', () => {
  const h = makeHistory();
  h.history.connection(true); h.tick();
  h.history.connection(false);
  expect(h.history.state.status).toBe('failed');
  expect(h.timers.size).toBe(0);
  h.history.connection(true); h.tick();
  expect(h.history.state.status).toBe('running');
  h.history.receive([], 0);
  expect(h.history.state.status).toBe('completed');
});

test('reconnect during upload starts another catchup after the old queue drains', () => {
  const h = makeHistory({ pending: 1 }); h.history.connection(true); h.tick();
  h.history.receive([], 0);
  expect(h.history.state.status).toBe('uploading');
  h.history.connection(false); h.history.connection(true);
  h.setPending(0); h.history.refresh();
  expect(h.history.state.status).toBe('running');
  expect(h.timers.size).toBe(1);
});

test('a newly verified parent triggers another history run after the current run drains', () => {
  const h = makeHistory(); h.history.connection(true); h.tick();
  h.history.requestCatchup(); h.history.receive([], 0);
  expect(h.history.state.status).toBe('running');
  h.tick(); h.history.receive([], 0);
  expect(h.history.state.status).toBe('completed');
});

test('unsolicited group history is ignored and repeated cursors fail visibly', () => {
  const h = makeHistory(); h.history.connection(true); h.tick();
  h.history.receive([{ data: { msgId: '1' } }], 1);
  expect(h.history.state.received).toBe(0);
  h.history.receive([{ data: { msgId: '1' } }], 0); h.tick();
  h.history.receive([{ data: { msgId: '1' } }], 0);
  expect(h.history.state.status).toBe('failed');
});

test('unlinked and duplicate messages are counted separately from successful uploads', () => {
  const h = makeHistory(); h.history.connection(true);
  h.history.result({ isHistory: true }, 'ignored_unlinked');
  h.history.result({ isHistory: true }, 'duplicate');
  expect(h.history.state.ignored).toBe(2);
  expect(h.history.state.uploaded).toBe(0);
});

test('validation rejects empty identifiers and malformed timestamps', () => {
  expect(validateMessage(message('ok'))).toBe(true);
  expect(validateMessage(message('bad', { sentAt: 'not a date' }))).toBe(false);
  expect(validateMessage(message('bad', { zaloUid: '' }))).toBe(false);
});

test('parent lookup retains a resolved UID when relationship lookup fails', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/zalo-bot/server.js'), 'utf8');
  const reports = [];
  const context = vm.createContext({ friendPhoneMap: new Map(),
    console: { warn() {} }, isZaloLimitError: () => false,
    zaloApi: { async findUser() { return { uid: 'resolved-parent' }; },
      async getFriendRequestStatus() { throw new Error('relationship unavailable'); } },
    async gatewayRequest(payload) { reports.push(payload); }
  });
  vm.runInContext(source.slice(source.indexOf('async function checkQueuedParent(job)'),
    source.indexOf('async function sendQueuedTuition(job)')), context);
  await context.checkQueuedParent({ parent_id: 'parent', phone: '0912422333', status: 'pending' });
  expect(reports).toHaveLength(1);
  expect(reports[0].uid).toBe('resolved-parent');
  expect(reports[0].status).toBe('error');
  expect(reports[0].invited).toBe(false);
  expect(reports[0].greeted).toBe(false);
});

function makeSender({ failAck = false, noId = false } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../services/zalo-bot/server.js'), 'utf8');
  const functionSource = source.slice(source.indexOf('async function syncGatewayOutbox()'),
    source.indexOf('function scheduleNextGatewayAction()'));
  const requests = [];
  const sends = [];
  const saved = [];
  const context = vm.createContext({ gatewayBusy: false, listenerConnected: true,
    GATEWAY_URL: 'configured', GATEWAY_TOKEN: 'configured', campaignStatus: 'idle',
    botConfig: { minDelaySeconds: 45, maxDelaySeconds: 90, batchSize: 50, batchPauseMinutes: 30 },
    getRandomDelay: () => 45,
    isZaloLimitError: () => false,
    isUncertainSendError: () => false,
    nextGatewaySendAt: 0, Date, console: { error() {}, warn() {} }, pendingIncoming: new Map(),
    scheduleNextGatewayAction() {},
    persistIncoming() { saved.push([...context.pendingIncoming.values()]); },
    zaloApi: { async sendMessage(content, uid) { sends.push({ content, uid });
      return { message: noId ? null : { msgId: '123' } }; } },
    async gatewayRequest(payload) {
      requests.push(payload);
      if (payload.action === 'claimDispatch') return { job: { kind: 'web', job_id: 'job', zalo_uid: 'parent', content: 'Hello' } };
      if (failAck && payload.status === 'sent') throw new Error('network timeout');
      return { ok: true };
    }
  });
  vm.runInContext(functionSource, context);
  return { context, requests, sends, saved };
}

test('real sender stores the Zalo id and acknowledges the original web job', async () => {
  const s = makeSender(); await s.context.syncGatewayOutbox();
  expect(s.requests.at(-1)).toEqual({ action: 'finish', jobId: 'job', status: 'sent', externalId: 'parent:123' });
  expect(s.saved[0][0].externalId).toBe('parent:123');
  expect(s.context.pendingIncoming.size).toBe(0);
});

test('real sender retains failed acknowledgement and does not claim another job', async () => {
  const s = makeSender({ failAck: true });
  await s.context.syncGatewayOutbox(); await s.context.syncGatewayOutbox();
  expect(s.sends).toHaveLength(1);
  expect(s.requests.filter(r => r.action === 'claimDispatch')).toHaveLength(1);
  expect(s.context.pendingIncoming.get('ack:finish:job').externalId).toBe('parent:123');
});

test('real sender marks missing Zalo delivery id uncertain instead of reporting success', async () => {
  const s = makeSender({ noId: true }); await s.context.syncGatewayOutbox();
  expect(s.requests.at(-1).status).toBe('uncertain');
  expect(s.requests.at(-1).jobId).toBe('job');
});

test('sender requests immediate dispatch regardless of old anti-ban configuration', async () => {
  const s = makeSender();
  await s.context.syncGatewayOutbox();
  expect(s.requests[0].pacing).toEqual({ spacingSeconds:0, batchSize:50, batchPauseSeconds:0 });
});

test('all outgoing acknowledgements are replayed before incoming message echoes', async () => {
  const calls = [];
  const q = makeQueue([message('echo'), { action:'finishTuitionReceipt',jobId:'receipt',status:'sent',externalId:'parent:receipt' },
    { action:'finishTuition',jobId:'tuition',status:'sent',externalId:'parent:tuition' }], async p => { calls.push(p.action); return {ok:true}; });
  await q.queue.flush();
  expect(calls).toEqual(['finishTuitionReceipt','finishTuition','syncMessage']);
});

test('receipt acknowledgement failure retains success without sending again', async () => {
  const source = fs.readFileSync(path.join(__dirname,'../services/zalo-bot/server.js'),'utf8');
  const pending = new Map();
  let sends=0;
  const context = vm.createContext({ pendingIncoming:pending,persistIncoming(){},
    console:{error(){}},isZaloLimitError:()=>false,isUncertainSendError:()=>false,
    zaloApi:{async sendMessage(){ sends++; return {message:{msgId:'receipt-id'}}; }},
    async gatewayRequest(){throw new Error('Gateway unavailable');} });
  vm.runInContext(source.slice(source.indexOf('async function acknowledgeDispatch('),source.indexOf('function scheduleNextGatewayAction()')),context);
  vm.runInContext(source.slice(source.indexOf('async function sendQueuedTuitionReceipt('),source.indexOf('async function syncQueuedParentAlias(')),context);
  await context.sendQueuedTuitionReceipt({job_id:'receipt',zalo_uid:'parent',content:'Received'});
  expect(sends).toBe(1);
  expect([...pending.values()]).toEqual([{action:'finishTuitionReceipt',jobId:'receipt',status:'sent',externalId:'parent:receipt-id'}]);
});

test('simultaneous sender polls cannot send two jobs', async () => {
  const s=makeSender();
  await Promise.all([s.context.syncGatewayOutbox(),s.context.syncGatewayOutbox()]);
  expect(s.sends).toHaveLength(1);
});

test('queue prioritizes acknowledgements and limits each flush batch', async () => {
  const items = Array.from({ length: 60 }, (_, i) => message(String(i)));
  items.push({ action: 'finish', jobId: 'job', externalId: 'parent:123', status: 'sent' });
  const calls = [];
  const q = makeQueue(items, async p => { calls.push(p); return { result: 'received' }; });
  await q.queue.flush();
  expect(calls[0].action).toBe('finish');
  expect(calls).toHaveLength(50);
  expect(q.pending.size).toBe(11);
});

function makeLinkDialog() {
  const html = fs.readFileSync(path.join(__dirname, '../messages.html'), 'utf8');
  const source = html.slice(html.indexOf('window.openZaloLinkDialog ='), html.indexOf('window.openConversation ='));
  const dialog = { dataset: {}, shown: false, closed: false,
    showModal() { this.shown = true; }, close() { this.closed = true; } };
  const select = { options: [], value: 'parent-zalo',
    replaceChildren() { this.options = []; }, appendChild(option) { this.options.push(option); } };
  const checkbox = { checked: false };
  const target = { textContent: '' };
  const elements = { zaloLinkDialog: dialog, zaloPendingSelect: select,
    zaloIdentityConfirmed: checkbox, zaloLinkTarget: target };
  const calls = [];
  const context = vm.createContext({ window: {}, currentProfile: { role: 'admin' },
    activeFriend: { id: 'parent', name: 'Parent' },
    document: { getElementById: id => elements[id], createElement: () => ({}) },
    alert() {}, async refreshZaloSendMode() {},
    sb: { async rpc(name, args) { calls.push({ name, args });
      return { data: [{ zalo_uid: 'parent-zalo', display_name: 'Parent', source: 'contact' }] }; } }
  });
  vm.runInContext(source, context);
  return { context, dialog, select, checkbox, calls };
}

test('admin can link an existing friend contact without requiring a new incoming message', async () => {
  const d = makeLinkDialog(); await d.context.window.openZaloLinkDialog();
  expect(d.calls[0]).toEqual({ name: 'list_mindup_zalo_link_candidates', args: { p_parent_id: 'parent' } });
  expect(d.select.options[0].value).toBe('parent-zalo');
  expect(d.dialog.shown).toBe(true);
  d.checkbox.checked = true; await d.context.window.confirmZaloLink();
  expect(d.calls[1]).toEqual({ name: 'verify_mindup_zalo_link',
    args: { p_audience_user_id: 'parent', p_zalo_uid: 'parent-zalo' } });
});

test('switching conversation while link dialog is open cannot link the wrong parent', async () => {
  const d = makeLinkDialog(); await d.context.window.openZaloLinkDialog();
  d.context.activeFriend = { id: 'another-parent' }; d.checkbox.checked = true;
  await d.context.window.confirmZaloLink();
  expect(d.calls).toHaveLength(1);
  expect(d.dialog.closed).toBe(true);
});

test('teacher cannot use admin link dialog', async () => {
  const d = makeLinkDialog(); d.context.currentProfile.role = 'teacher';
  await d.context.window.openZaloLinkDialog();
  expect(d.calls).toHaveLength(0);
  expect(d.dialog.shown).toBe(false);
});

test('Windows destination sharing locks retry the atomic rename without rewriting the destination', () => {
  const writes = []; const waits = []; let renames = 0;
  writeJsonAtomic('queue.json', [{ id: 'saved' }], {
    io: { writeFileSync: (...args) => writes.push(args), renameSync: () => {
      if (++renames < 3) throw Object.assign(new Error('sharing lock'), { code: 'EPERM' });
    } }, wait: ms => waits.push(ms)
  });
  expect(renames).toBe(3); expect(waits).toEqual([20, 60]);
  expect(writes).toHaveLength(1);
  expect(writes[0][0]).not.toBe('queue.json');
  expect(writes[0][1]).toBe('[{"id":"saved"}]');
  expect(writes[0][2].mode).toBe(0o600);
});

test('permanent disk errors fail explicitly without replacing the previous queue', () => {
  let renames = 0; let destinationWrites = 0;
  expect(() => writeJsonAtomic('queue.json', [], { io: {
    writeFileSync: file => { if (file === 'queue.json') destinationWrites++; },
    renameSync: () => { renames++; throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' }); }
  }, wait() {} })).toThrow('Disk full');
  expect(renames).toBe(1); expect(destinationWrites).toBe(0);
});

test('persistent Windows locks have bounded retries rather than hanging the bot', () => {
  let attempts = 0;
  expect(() => writeJsonAtomic('queue.json', [], { io: { writeFileSync() {},
    renameSync: () => { attempts++; throw Object.assign(new Error('Locked'), { code: 'EBUSY' }); }
  }, wait() {} })).toThrow('Locked');
  expect(attempts).toBe(4);
});
