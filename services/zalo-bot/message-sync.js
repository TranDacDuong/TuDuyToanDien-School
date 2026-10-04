const MAX_CONTENT = 10000;

function validateMessage(payload) {
  return typeof payload.externalId === 'string' && payload.externalId.length > 0 && payload.externalId.length <= 220
    && typeof payload.zaloUid === 'string' && payload.zaloUid.length > 0 && payload.zaloUid.length <= 100
    && typeof payload.content === 'string' && payload.content.trim().length > 0 && payload.content.length <= MAX_CONTENT
    && typeof payload.isSelf === 'boolean' && typeof payload.isHistory === 'boolean'
    && (payload.sentAt == null || Number.isFinite(Date.parse(payload.sentAt)));
}

class GatewayQueue {
  constructor({ pending, request, persist, quarantine, onResult = () => {}, now = Date.now }) {
    Object.assign(this, { pending, request, persist, quarantine, onResult, now });
    this.busy = false;
    this.lastError = null;
  }

  async flush() {
    if (this.busy) return;
    this.busy = true;
    try {
      const batch = [...this.pending].sort((a, b) => Number(b[1].action === 'finish') - Number(a[1].action === 'finish'));
      let processed = 0;
      for (const [key, payload] of batch) {
        if (payload.retryAt > this.now()) continue;
        if (processed++ >= 50) break;
        try {
          if (payload.action === 'syncMessage' && !validateMessage(payload)) {
            const error = new Error('Invalid synchronized message');
            error.status = 400;
            throw error;
          }
          const { retryAt, attempts, ...body } = payload;
          const result = await this.request(body);
          if (result?.result === 'deferred') {
            const error = new Error('Waiting for outgoing message acknowledgement');
            error.status = 409;
            throw error;
          }
          this.pending.delete(key);
          this.persist();
          this.lastError = null;
          this.onResult(payload, result?.result || 'acknowledged');
        } catch (error) {
          // A failed disk acknowledgement must retain the item in memory as well.
          if (!this.pending.has(key)) this.pending.set(key, payload);
          this.lastError = String(error?.message || error);
          // Authentication/configuration faults are global, not bad individual messages.
          if ([401, 403].includes(error.status)) break;
          if ([400, 404, 413, 422].includes(error.status)) {
            this.quarantine(payload, this.lastError);
            this.pending.delete(key);
            this.persist();
            this.onResult(payload, 'rejected');
          } else {
            payload.attempts = (payload.attempts || 0) + 1;
            payload.retryAt = this.now() + Math.min(300000, 1000 * 2 ** Math.min(payload.attempts, 8));
            this.persist();
          }
        }
      }
    } finally {
      this.busy = false;
    }
  }
}

class HistorySync {
  constructor({ requestPage, enqueue, pendingCount, onChange = () => {},
    setTimer = setTimeout, clearTimer = clearTimeout, now = () => new Date().toISOString(),
    responseTimeout = 20000, maxRetries = 3 }) {
    Object.assign(this, { requestPage, enqueue, pendingCount, onChange, setTimer, clearTimer, now,
      responseTimeout, maxRetries });
    this.timer = null;
    this.connected = false;
    this.catchupAfterUpload = false;
    this.awaitingPage = false;
    this.cursor = null;
    this.retries = 0;
    this.state = { status: 'idle', requestedPages: 0, received: 0, queued: 0,
      uploaded: 0, ignored: 0, rejected: 0, maxPages: 0, startedAt: null,
      finishedAt: null, error: null, limited: false };
  }

  start(maxPages = 200) {
    if (!this.connected) throw new Error('Zalo listener is disconnected');
    if (['running', 'uploading'].includes(this.state.status)) return this.state;
    this.cancelTimer();
    this.cursor = null;
    this.retries = 0;
    this.state = { status: 'running', requestedPages: 0, received: 0, queued: 0,
      uploaded: 0, ignored: 0, rejected: 0, maxPages: Math.max(1, Math.min(200, Math.floor(maxPages))),
      startedAt: this.now(), finishedAt: null, error: null, limited: false };
    this.schedule();
    return this.state;
  }

  requestCatchup() {
    if (!this.connected) return;
    if (['running', 'uploading'].includes(this.state.status)) {
      this.catchupAfterUpload = true;
    } else {
      this.start();
    }
  }

  cancelTimer() {
    if (this.timer != null) this.clearTimer(this.timer);
    this.timer = null;
    this.awaitingPage = false;
  }

  schedule() {
    this.cancelTimer();
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (!this.connected || this.state.status !== 'running') return;
      if (this.pendingCount() > 800) return this.schedule();
      this.awaitingPage = true;
      this.timer = this.setTimer(() => {
        this.timer = null;
        this.awaitingPage = false;
        if (++this.retries > this.maxRetries) {
          this.fail('Zalo history response timed out');
        } else {
          this.schedule();
        }
      }, this.responseTimeout);
      try {
        this.requestPage(this.cursor);
        this.onChange(this.state);
      } catch (error) {
        this.fail(String(error?.message || error));
      }
    }, 1200);
  }

  receive(messages, type) {
    if (type !== 0 || this.state.status !== 'running' || !this.awaitingPage) return;
    this.cancelTimer();
    this.retries = 0;
    const page = Array.isArray(messages) ? messages : [];
    this.state.requestedPages++;
    this.state.received += page.length;
    for (const message of page) {
      if (this.enqueue(message, true)) this.state.queued++;
    }
    const next = String(page.at(-1)?.data?.msgId || '');
    if (!page.length) return this.finishReading(false);
    if (!next || next === this.cursor) return this.fail('Zalo returned an invalid or repeated history cursor');
    this.cursor = next;
    if (this.state.requestedPages >= this.state.maxPages) return this.finishReading(true);
    this.schedule();
  }

  finishReading(limited) {
    this.cancelTimer();
    this.state.limited = limited;
    this.state.status = 'uploading';
    this.refresh();
  }

  result(payload, result) {
    if (payload.isHistory && this.state.startedAt) {
      if (result === 'rejected') this.state.rejected++;
      else if (['unmatched', 'ignored_unlinked', 'duplicate'].includes(result)) this.state.ignored++;
      else this.state.uploaded++;
    }
    this.refresh();
  }

  refresh() {
    if (this.state.status === 'uploading' && this.pendingCount() === 0) {
      this.state.status = this.state.limited || this.state.rejected ? 'partial' : 'completed';
      this.state.finishedAt = this.now();
      if (this.catchupAfterUpload && this.connected) {
        this.catchupAfterUpload = false;
        this.start();
        return;
      }
    }
    this.onChange(this.state);
  }

  fail(error) {
    this.cancelTimer();
    this.state.status = 'failed';
    this.state.finishedAt = this.now();
    this.state.error = error;
    this.onChange(this.state);
  }

  connection(connected) {
    const wasConnected = this.connected;
    this.connected = connected;
    if (connected && !wasConnected && this.state.status === 'uploading') this.catchupAfterUpload = true;
    if (!connected && this.state.status === 'running') this.fail('Zalo listener disconnected; history will restart on reconnect');
    if (connected && !['running', 'uploading'].includes(this.state.status)) this.start();
  }
}

module.exports = { GatewayQueue, HistorySync, validateMessage };
