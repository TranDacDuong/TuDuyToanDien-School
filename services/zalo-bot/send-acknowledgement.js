function requireSendAcknowledgement(response, attachmentCount = 0) {
  const valid = value => value != null && /^\d+$/.test(String(value)) && Number(value) > 0;
  const attachments = response?.attachment;
  if (attachmentCount > 0) {
    if (Array.isArray(attachments) && attachments.length === attachmentCount &&
        attachments.every(item => valid(item?.msgId))) return String(attachments[0].msgId);
  } else if (valid(response?.message?.msgId)) {
    return String(response.message.msgId);
  }
  // Keep the rejection string/code returned by Zalo, without dumping payloads.
  const detail = typeof response?.message === 'string' ? response.message.slice(0, 280) : '';
  const code = response?.error_code ?? response?.errorCode;
  const shape = response?.message && typeof response.message === 'object'
    ? Object.keys(response.message).filter(key => /^[a-zA-Z0-9_]{1,30}$/.test(key)).slice(0, 8).join(',')
    : String(response?.message === null ? 'null' : typeof response?.message);
  const error = new Error(`Zalo returned no message id; verify delivery before retrying (message fields: ${shape}; attachments: ${Array.isArray(attachments) ? attachments.length : 0})${code != null ? `; Zalo code: ${String(code).slice(0, 30)}` : ''}${detail ? `; Zalo response: ${detail}` : ''}`);
  error.deliveryUncertain = true;
  throw error;
}

function sendErrorMessage(error) {
  const message = String(error?.message || error);
  return `${error?.code != null ? `[${String(error.code).slice(0, 50)}] ` : ''}${message}`.slice(0, 500);
}

module.exports = { requireSendAcknowledgement, sendErrorMessage };
