'use strict';

// One lane for every SDK message, including text, QR, receipts and group jobs.
// Save the deadline on disk so reconnects/restarts cannot reset the interval.
function createSendPacer({ readDeadline, writeDeadline, clock = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let tail = Promise.resolve();
  return function pace(operation) {
    const result = tail.then(async () => {
      let remaining;
      while ((remaining = Number(readDeadline() || 0) - clock()) > 0) await sleep(remaining);
      writeDeadline(clock() + 10000);
      try { return await operation(); }
      finally { writeDeadline(clock() + 10000); }
    });
    tail = result.catch(() => {});
    return result;
  };
}

function installSendPacing(api, pace) {
  if(typeof api.uploadAttachment==='function') {
    const upload=api.uploadAttachment;
    api.uploadAttachment=async function(...args) {
      let timer;
      try {return await Promise.race([upload.apply(api,args),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Timeout khi tải ảnh lên Zalo; chưa phát tin')),45000);})]);}
      finally {clearTimeout(timer);}
    };
  }
  const original = api.sendMessage;
  api.sendMessage = function (message, threadId, type, beforeSend) {
    return pace(async () => {
      if (beforeSend) await beforeSend();
      return original.call(api, message, threadId, type);
    });
  };
  return api;
}

function fetchWithDeadline(url,options={}) {
  return fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000)});
}
module.exports = { createSendPacer, installSendPacing, fetchWithDeadline };
