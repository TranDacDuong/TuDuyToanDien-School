'use strict';
const IDLE_CHECK_MS = 60 * 60 * 1000;

// Realtime carries hints only. Existing authenticated claim RPCs remain authoritative.
class WorkWakeup {
  constructor({ request, wake, createClient, clock = Date.now }) {
    Object.assign(this, { request, wake, createClient, clock });
    this.client = null;
    this.connecting = false;
    this.nextConnectAt = 0;
    this.status = 'disconnected';
    this.lastError = null;
  }
  async connect() {
    if (this.client || this.connecting || this.clock() < this.nextConnectAt) return;
    this.connecting = true;
    this.nextConnectAt = this.clock() + IDLE_CHECK_MS;
    try {
      const config = await this.request({ action: 'workWakeupConfig' });
      if (!/^https:\/\//.test(config.url || '') || !config.anonKey || !/^zalo-work:[a-f0-9]{64}$/.test(config.topic || '')) {
        throw new Error('Invalid work notification configuration');
      }
      const client = this.createClient(`${config.url}/realtime/v1`, { params: { apikey: config.anonKey } });
      this.client = client;
      client.channel(config.topic, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'work' }, ({ payload }) => {
          if (['dispatch', 'parents', 'groups', 'storage', 'links', 'all'].includes(payload?.kind)) this.wake(payload.kind);
        }).subscribe(status => {
          this.status = status;
          if (status === 'SUBSCRIBED') { this.lastError = null; this.wake('all'); }
          else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) this.lastError = 'Work notification connection interrupted; hourly recovery remains enabled';
        });
    } catch (error) {
      this.lastError = String(error.message || error);
      this.status = 'disconnected';
      if (this.client) { this.client.disconnect(); this.client = null; }
    } finally { this.connecting = false; }
  }
  close() { this.client?.disconnect(); this.client = null; }
}

class GatewayCooldown {
  constructor(clock = Date.now) { this.clock = clock; this.until = 0; this.status = null; }
  check() {
    if (this.clock() < this.until) {
      const error = new Error('Gateway temporarily paused after a quota/authentication error');
      error.status = this.status; throw error;
    }
  }
  reject(status) {
    if ([401, 402, 403, 429].includes(status)) {
      this.status = status;
      this.until = this.clock() + IDLE_CHECK_MS;
    }
  }
}
module.exports = { WorkWakeup, GatewayCooldown, IDLE_CHECK_MS };
