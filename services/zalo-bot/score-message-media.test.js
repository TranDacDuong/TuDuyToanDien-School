'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { prepareScoreMessageMedia: prepare } = require('./score-message-media');

const chart = { type: 'score_distribution', buckets: [{ label: '0-5', count: 0 }, { label: '5-10', count: 8 }] };
const token = value => `__CHART__${JSON.stringify(value)}`;
const input = text => ({ text, audience: 'parent', studentId: 'child' });
const failing = { render: async () => { throw new Error('secret student name'); } };

test('retains ordinary parent notifications; rejects other audiences', async () => {
  const result = await prepare(input('Tuition reminder'));
  assert.equal(result.text, 'Tuition reminder');
  assert.deepEqual(result.attachments, []);
  await result.cleanup();
  for (const audience of [undefined, 'student', 'teacher']) {
    const denied = await prepare({ text: token(chart), audience });
    assert.equal(denied.skipped, true);
    assert.equal(denied.text, '');
  }
  await assert.rejects(prepare({ audience: 'parent' }), TypeError);
});

test('balanced parser removes multiple tokens and preserves surrounding actions', async () => {
  const result = await prepare(input(`Before ${token({ ...chart, title: 'A } "quote"' })}\nAfter ${token(chart)}\n__ACTION__{"type":"reply"}`), failing);
  assert.equal(result.errors.length, 2);
  assert.match(result.text, /Before \nAfter/);
  assert.match(result.text, /__ACTION__/);
  assert.doesNotMatch(result.text, /__CHART__|quote|secret/);
  assert.match(result.text, /0-5: 0; 5-10: 8/);
  await result.cleanup();
});

test('anonymizes every other student, ignores names and arbitrary fields', async () => {
  let html;
  const result = await prepare(input(token({ type: 'score_table', title: 'Private name', rows: [
    { studentId: 'child', name: 'Child Name', score: 7, maxScore: 10 },
    { studentId: 'other', name: 'Other Secret', phone: '0900000000', score: 9, maxScore: 10 }
  ] })), { render: async value => { html = value; throw new Error('failure'); } });
  assert.match(html, /Your child/);
  assert.match(html, /Student 2/);
  assert.match(result.text, /Student 2: 9\/10/);
  assert.doesNotMatch(html + result.text, /Private name|Child Name|Other Secret|0900000000|studentId/);
  await result.cleanup();
});

test('malformed and unsupported payloads fail closed without leaking raw JSON', async () => {
  for (const text of ['Hello __CHART__{"name":"Secret"', '__CHART__{"name":"Secret",}', token({ type: 'unknown', name: 'Secret' }), token({ ...chart, buckets: [{ label: 'Secret', count: 1 }] }), token({ ...chart, buckets: [{ label: '0-5', count: -1 }] }), token({ type: 'score_table', rows: [{ score: 11, maxScore: 10 }] })]) {
    const result = await prepare(input(text), failing);
    assert.equal(result.errors.length, 1);
    assert.doesNotMatch(result.text, /Secret|__CHART__/);
    assert.deepEqual(result.attachments, []);
    await result.cleanup();
  }
});

test('render failures, invalid bitmap and missing temp root produce safe fallbacks', async () => {
  for (const options of [failing, { render: async (_, file) => fs.writeFile(file, 'not a bitmap') }, { tempRoot: 'Z:/nonexistent-score-test-root' }]) {
    const result = await prepare(input(token(chart)), options);
    assert.equal(result.attachments.length, 0);
    assert.equal(result.errors.length, 1);
    assert.match(result.text, /5-10: 8/);
    await result.cleanup();
    await result.cleanup();
  }
});

test('limits chart count without exposing excess payloads', async () => {
  const result = await prepare(input(Array(7).fill(token(chart)).join('\n')), failing);
  assert.equal(result.errors.filter(e => e.code === 'CHART_LIMIT').length, 2);
  await result.cleanup();
});

test('real raster backend creates PNGs with visible bars and isolated cleanup', async () => {
  const options = { browserChannel: process.platform === 'win32' ? 'msedge' : undefined };
  const a = await prepare(input(`Score: 8/10\n${token(chart)}`), options);
  const b = await prepare(input(token(chart)), options);
  try {
    assert.deepEqual(a.errors, []);
    assert.deepEqual(b.errors, []);
    assert.equal(a.text, 'Score: 8/10');
    assert.notEqual(a.attachments[0], b.attachments[0]);
    const bytes = await fs.readFile(a.attachments[0]);
    assert.equal(bytes.readUInt32BE(16), 960);
    assert.ok(bytes.readUInt32BE(20) > 300);
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true, ...(options.browserChannel ? { channel: options.browserChannel } : {}) });
    try {
      const page = await browser.newPage();
      const pixels = await page.evaluate(async data => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        return Array.from(ctx.getImageData(700, 150, 1, 1).data);
      }, bytes.toString('base64'));
      assert.deepEqual(pixels, [22, 135, 123, 255]);
    } finally { await browser.close(); }
    await a.cleanup();
    await assert.rejects(fs.access(a.attachments[0]), { code: 'ENOENT' });
    await fs.access(b.attachments[0]);
  } finally { await a.cleanup(); await b.cleanup(); }
});
