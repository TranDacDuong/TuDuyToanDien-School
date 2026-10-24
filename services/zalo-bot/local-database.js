'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const digest = value => createHash('md5').update(value, 'utf8').digest('hex');
const eventKey = payload => payload.action?.startsWith('finish') ? `ack:${payload.action}:${payload.jobId}` : payload.externalId;
class LocalDatabase {
  constructor(filename, project) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename, { timeout: 5000 });
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,payload TEXT NOT NULL,recorded_at TEXT NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS archive(key TEXT PRIMARY KEY,content TEXT NOT NULL,hash TEXT NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS effects(key TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,status TEXT NOT NULL,result TEXT,error TEXT,updated_at TEXT NOT NULL);`);
    if (this.db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') { this.db.close(); throw new Error('Local Zalo database failed integrity check'); }
    const savedProject = this.db.prepare("SELECT value FROM settings WHERE key='project'").get()?.value;
    if (savedProject && savedProject !== project) { this.db.close(); throw new Error('Local Zalo database belongs to another project'); }
    this.db.prepare("INSERT OR IGNORE INTO settings VALUES('project',?)").run(project);
    this.db.prepare("INSERT OR IGNORE INTO settings VALUES('storage_id',?)").run(randomUUID());
    this.id = this.db.prepare("SELECT value FROM settings WHERE key='storage_id'").get().value;
  }
  recordEvent(payload) {
    const id = eventKey(payload);
    this.db.prepare('INSERT INTO events(id,payload,recorded_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,recorded_at=excluded.recorded_at,acknowledged=CASE WHEN events.payload=excluded.payload THEN events.acknowledged ELSE 0 END')
      .run(id, JSON.stringify(payload), new Date().toISOString());
  }
  acknowledgeEvent(payload) {
    this.db.prepare('UPDATE events SET acknowledged=1 WHERE id=?').run(eventKey(payload));
  }
  pendingEvents() { return this.db.prepare('SELECT payload FROM events WHERE acknowledged=0 ORDER BY recorded_at LIMIT 100').all().map(row=>JSON.parse(row.payload)); }
  saveArchive(rows) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of rows) {
        if (typeof row.key !== 'string' || typeof row.content !== 'string' || digest(row.content) !== row.hash) throw new Error('Invalid archive checksum');
        this.db.prepare('INSERT INTO archive VALUES(?,?,?,0) ON CONFLICT(key) DO UPDATE SET content=excluded.content,hash=excluded.hash,acknowledged=0')
          .run(row.key, row.content, row.hash);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  receipts() {
    return this.db.prepare('SELECT key,hash,content FROM archive WHERE acknowledged=0 LIMIT 100').all().map(row => {
      if (digest(row.content) !== row.hash) throw new Error('Local archive verification failed');
      return { key: row.key, hash: row.hash };
    });
  }
  confirmReceipts(receipts) {
    for (const row of receipts) this.db.prepare('UPDATE archive SET acknowledged=1 WHERE key=? AND hash=?').run(row.key,row.hash);
  }
  readArchive(keys) {
    return keys.map(key => {
      const row = this.db.prepare('SELECT key,content,hash FROM archive WHERE key=?').get(key);
      if (!row || digest(row.content) !== row.hash) return { key, missing: true };
      return row;
    });
  }
  async send(key, identity, operation) {
    const fingerprint = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    const previous = this.db.prepare('SELECT * FROM effects WHERE key=?').get(key);
    if (previous && previous.status !== 'failed') {
      if (previous.fingerprint !== fingerprint) throw new Error('Uncertain delivery: task payload changed; verify in Zalo');
      if (previous.status === 'sent') return JSON.parse(previous.result);
      throw new Error('Uncertain delivery: interrupted task; verify in Zalo before retrying');
    }
    this.db.prepare("INSERT INTO effects VALUES(?,?,'sending',NULL,NULL,?) ON CONFLICT(key) DO UPDATE SET fingerprint=excluded.fingerprint,status='sending',result=NULL,error=NULL,updated_at=excluded.updated_at")
      .run(key,fingerprint,new Date().toISOString());
    let published=false;
    try {
      const result = await operation();
      published=true;
      this.db.prepare("UPDATE effects SET status='sent',result=?,updated_at=? WHERE key=?")
        .run(JSON.stringify(result),new Date().toISOString(),key);
      return result;
    } catch (error) {
      const message=published ? `Uncertain delivery: cannot persist verified receipt: ${error.message || error}` : String(error.message || error);
      const status=/timeout|timed out|network|fetch failed|econn|socket|connection|abort|reset|no.*message.*id|missing.*message|uncertain/i.test(message) ? 'uncertain' : 'failed';
      try { this.db.prepare('UPDATE effects SET status=?,error=?,updated_at=? WHERE key=?')
        .run(status,message.slice(0,500),new Date().toISOString(),key); } catch (_) { /* An existing 'sending' row still blocks replay. */ }
      if(published) throw new Error(message,{cause:error});
      throw error;
    }
  }
  status() {
    return { storageId: this.id, events: this.db.prepare('SELECT count(*) n FROM events').get().n,
      archived: this.db.prepare('SELECT count(*) n FROM archive').get().n,
      pendingReceipts: this.db.prepare('SELECT count(*) n FROM archive WHERE acknowledged=0').get().n };
  }
  close() { this.db.close(); }
}
module.exports = { LocalDatabase, digest, eventKey };
