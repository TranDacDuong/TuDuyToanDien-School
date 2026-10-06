function requireSendAcknowledgement(response, attachmentCount = 0) {
  const valid = value => value != null && /^\d+$/.test(String(value)) && Number(value) > 0;
  const attachments = response?.attachment;
  if (attachmentCount > 0) {
    if (Array.isArray(attachments) && attachments.length === attachmentCount &&
        attachments.every(item => valid(item?.msgId))) return String(attachments[0].msgId);
  } else if (valid(response?.message?.msgId)) {
    return String(response.message.msgId);
  }
  // Record response shape, never message text or the full Zalo response.
  const shape = response?.message && typeof response.message === 'object'
    ? Object.keys(response.message).filter(key => /^[a-zA-Z0-9_]{1,30}$/.test(key)).slice(0, 8).join(',')
    : String(response?.message === null ? 'null' : typeof response?.message);
  const error = new Error(`Zalo returned no message id; verify delivery before retrying (message fields: ${shape}; attachments: ${Array.isArray(attachments) ? attachments.length : 0})`);
  error.deliveryUncertain = true;
  throw error;
}

module.exports = { requireSendAcknowledgement };
