function requireSendAcknowledgement(response, attachmentCount = 0) {
  const valid = value => value != null && /^\d+$/.test(String(value)) && Number(value) > 0;
  const attachments = response?.attachment;
  if (attachmentCount > 0) {
    if (Array.isArray(attachments) && attachments.length === attachmentCount &&
        attachments.every(item => valid(item?.msgId))) return String(attachments[0].msgId);
  } else if (valid(response?.message?.msgId)) {
    return String(response.message.msgId);
  }
  const error = new Error('Zalo returned no message id; verify delivery before retrying');
  error.deliveryUncertain = true;
  throw error;
}

module.exports = { requireSendAcknowledgement };
