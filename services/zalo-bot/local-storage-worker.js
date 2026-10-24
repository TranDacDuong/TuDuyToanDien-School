'use strict';
class LocalStorageWorker {
  constructor({ store, request, clock = Date.now }) {
    Object.assign(this, { store, request, clock });
    this.busy = false;
    this.nextAt = 0;
    this.results = [];
    this.lastError = null;
  }
  async tick() {
    if (this.busy || this.clock() < this.nextAt) return;
    this.busy = true;
    this.nextAt = this.clock() + 15000;
    try {
      const receipts = this.store.receipts();
      const sentResults = this.results;
      const response = await this.request({ action: 'localStorageCycle', storageId: this.store.id,
        receipts, results: sentResults });
      if (!response?.data) throw new Error('Invalid local storage response');
      this.store.confirmReceipts(receipts);
      this.results = [];
      this.store.saveArchive(response.data.exports || []);
      for (const job of response.data.reads || []) {
        this.results.push({ id: job.id, token: job.token, items: this.store.readArchive(job.keys) });
      }
      this.lastError = null;
      if (receipts.length || response.data.exports?.length || this.results.length) this.nextAt = this.clock() + 500;
    } catch (error) {
      this.lastError = String(error.message || error);
      this.nextAt = this.clock() + 30000;
    } finally { this.busy = false; }
  }
}
module.exports = { LocalStorageWorker };
