const test = require('node:test');
const assert = require('node:assert/strict');
const { requireSendAcknowledgement: ack } = require('./send-acknowledgement');

test('text acknowledgements require a real message ID', () => {
  assert.equal(ack({ message: { msgId: 123 }, attachment: [] }), '123');
  for (const response of [null, {}, { message: null }, { message: { msgId: 0 } }]) {
    assert.throws(() => ack(response), error => error.deliveryUncertain === true);
  }
});

test('single PNG uses SDK attachment acknowledgement even when message is null', () => {
  assert.equal(ack({ message: null, attachment: [{ msgId: 321 }] }, 1), '321');
  assert.throws(() => ack({ message: { msgId: 123 }, attachment: [] }, 1));
  assert.throws(() => ack({ attachment: [{ msgId: 321 }] }, 2));
  assert.throws(() => ack({ attachment: [{ msgId: 321 }, {}] }, 2));
});
