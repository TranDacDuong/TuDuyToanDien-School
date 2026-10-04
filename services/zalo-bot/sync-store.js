const fs = require('fs');
const { randomUUID } = require('crypto');

function writeJsonAtomic(file, value, { io = fs, wait = ms => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
} } = {}) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  io.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  for (let attempt = 0; ; attempt++) {
    try {
      io.renameSync(temp, file);
      return;
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 3) throw error;
      // Windows scanners can temporarily hold the destination open during replace.
      wait([20, 60, 150][attempt]);
    }
  }
}

module.exports = { writeJsonAtomic };
