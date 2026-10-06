const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'tuition.js'), 'utf8');

test('durable queue distinguishes delivery progress from reviewed profiles', () => {
  assert.match(source, /deliveryPercent = Math.round\(durable.finalized \* 100 \/ durable.total\)/);
  assert.match(source, /Đã xử lý \$\{durable.finalized\}\/\$\{durable.total\}/);
  assert.match(source, /Đã kiểm tra hồ sơ: \$\{durable.reviewed\}/);
  assert.match(source, /aria-valuenow="\$\{deliveryPercent\}"/);
});

test('disconnected or paused workers show a blocked queue and no time estimate', () => {
  assert.match(source, /blocked = active && \(!isConnected \|\| zaloAutomationState\?\.paused\)/);
  assert.match(source, /Chưa kết nối Zalo\. Hàng chờ được giữ nguyên/);
  assert.match(source, /c.checking && !blocked/);
});

test('unconfirmed sends remain distinct from definite failures', () => {
  assert.match(source, /Lỗi: <b>\$\{c.failed\}/);
  assert.match(source, /Chưa xác nhận: <b>\$\{c.uncertain\}/);
  assert.match(source, /trước khi gửi lại để tránh trùng/);
});
