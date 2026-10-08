const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('tuition overlays are outside the animated and clipped page container', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'tuition.html'), 'utf8');
  const body = html.slice(html.indexOf('<body>'), html.indexOf('<script src="./tuition-arrears'));
  const stack = [];
  const modals = [];
  for (const [tag] of body.matchAll(/<\/?div\b[^>]*>/g)) {
    if (tag.startsWith('</')) { stack.pop(); continue; }
    const id = tag.match(/\bid="([^"]*)"/)?.[1];
    if (['tuitionDetailModal', 'zaloReminderModal', 'unmatchedBankModal'].includes(id)) {
      assert.equal(stack.length, 0, `${id} must be a direct body child`);
      modals.push(id);
    }
    stack.push(tag);
  }
  assert.equal(modals.length, 3);
  assert.equal(stack.length, 0);
  assert.match(html, /#tuitionDetailModal \.modal-card\s*\{[^}]*max-height: calc\(100dvh - 40px\)/);
  assert.match(html, /#tuitionDetailModal \.modal-body\s*\{[^}]*min-height: 0;[^}]*overflow-y: auto/);
});
