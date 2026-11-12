'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'class_evaluations.js'), 'utf8');

test('evaluation delivery opens the exact session batch in Messages', () => {
  const context = vm.createContext({ window: {}, URLSearchParams });
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, 'window.testing = {evaluationBatchLink};})();'), context);
  const url = new URL(context.window.testing.evaluationBatchLink('test-session'), 'https://example.test/');
  const batch = new URL(url.searchParams.get('page'), url.origin);
  assert.equal(batch.pathname, '/messages.html');
  assert.equal(batch.searchParams.get('zaloBatches'), '1');
  assert.equal(batch.searchParams.get('batch'), 'session_evaluation:test-session');
});
