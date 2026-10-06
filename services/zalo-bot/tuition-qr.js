const { requireSendAcknowledgement } = require('./send-acknowledgement');

async function retryPreparation(operation, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (attempt >= 2 || !/fetch failed|timeout|econn|socket|network|reset/i.test(String(error?.message))) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }
}

// Uploading a file does not publish a chat message. Retrying publication itself
// is unsafe because a lost response can hide a successful send.
async function sendTuitionQr(api, uid, file, sleep) {
  const original = api.uploadAttachment;
  if (typeof original !== 'function') throw new Error('Zalo uploadAttachment unavailable');
  api.uploadAttachment = async function (...args) {
    try { return await retryPreparation(() => original.apply(api, args), sleep); }
    catch (error) { error.qrStage = 'Tải ảnh lên Zalo'; throw error; }
  };
  try {
    const response = await api.sendMessage({ msg: 'Mã QR thanh toán học phí MindUp', attachments: [file] }, uid);
    return requireSendAcknowledgement(response, 1);
  } catch (error) {
    error.qrStage ||= 'Gửi ảnh QR qua Zalo';
    throw error;
  } finally { api.uploadAttachment = original; }
}

module.exports = { retryPreparation, sendTuitionQr };
