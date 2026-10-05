'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Balanced scanning handles braces and escaped quotes inside JSON strings.
function extractCharts(text) {
  const charts = [];
  const errors = [];
  const marker = /__CHART__/ig;
  let cursor = 0;
  let output = '';
  let match;
  while ((match = marker.exec(text))) {
    output += text.slice(cursor, match.index);
    let start = marker.lastIndex;
    while (/\s/.test(text[start] || '') && start < text.length) start++;
    let end = -1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    if (text[start] === '{') {
      for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
          if (escaped) escaped = false;
          else if (c === '\\') escaped = true;
          else if (c === '"') quoted = false;
        } else if (c === '"') quoted = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) { end = i + 1; break; }
      }
    }
    // Fail closed: never send malformed JSON (possibly containing student names).
    if (end < 0) {
      errors.push({ code: 'INVALID_CHART' });
      output += '[Score chart unavailable]';
      cursor = text.length;
      break;
    }
    try { charts.push(JSON.parse(text.slice(start, end))); }
    catch { errors.push({ code: 'INVALID_CHART' }); output += '[Score chart unavailable]'; }
    cursor = end;
    marker.lastIndex = end;
  }
  return { text: (output + text.slice(cursor)).trim(), charts, errors };
}

function normalizeChart(chart, studentId) {
  if (chart.type === 'score_distribution') {
    if (!Array.isArray(chart.buckets) || !chart.buckets.length || chart.buckets.length > 30) throw new Error('INVALID_CHART');
    const buckets = chart.buckets.map(row => {
      // Only numeric intervals are accepted: a name must never become an axis label.
      const label = String(row?.label ?? '').trim();
      if (!/^\d+(?:[.,]\d+)?\s*(?:[-\u2013]|\u2014)\s*\d+(?:[.,]\d+)?$/.test(label) ||
          typeof row.count !== 'number' || !Number.isSafeInteger(row.count) || row.count < 0) throw new Error('INVALID_CHART');
      return { label, count: row.count };
    });
    return { type: chart.type, title: 'Score distribution', buckets };
  }
  if (chart.type === 'score_table') {
    if (!Array.isArray(chart.rows) || !chart.rows.length || chart.rows.length > 100) throw new Error('INVALID_CHART');
    const rows = chart.rows.map((row, index) => {
      if (!row || typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0 ||
          typeof row.maxScore !== 'number' || !Number.isFinite(row.maxScore) || row.maxScore <= 0 || row.score > row.maxScore) throw new Error('INVALID_CHART');
      const own = studentId != null && row.studentId != null && String(row.studentId) === String(studentId);
      return { label: own ? 'Your child' : `Student ${index + 1}`, score: row.score, maxScore: row.maxScore };
    });
    return { type: chart.type, title: 'Class scores', rows };
  }
  throw new Error('UNSUPPORTED_CHART');
}

function chartHtml(chart) {
  let body;
  if (chart.type === 'score_distribution') {
    const max = Math.max(1, ...chart.buckets.map(b => b.count));
    body = `<div class="bars">${chart.buckets.map(b => `<div class="column"><b>${b.count}</b><div class="bar" style="height:${240 * b.count / max}px"></div><span>${escapeHtml(b.label)}</span></div>`).join('')}</div>`;
  } else {
    body = `<table><thead><tr><th>Student</th><th>Score</th></tr></thead><tbody>${chart.rows.map(r => `<tr><td>${escapeHtml(r.label)}</td><td>${r.score} / ${r.maxScore}</td></tr>`).join('')}</tbody></table>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:white;color:#17252a;font:18px Arial}main{padding:32px;width:960px;box-sizing:border-box}h1{font-size:26px;margin:0 0 30px}.bars{display:flex;align-items:flex-end;gap:8px;height:300px}.column{flex:1;min-width:0;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px}.bar{background:#16877b;width:80%}span{font-size:14px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #cbd5d1}th{background:#eef4f2}</style></head><body><main><h1>${chart.title}</h1>${body}</main></body></html>`;
}

async function renderPng(html, file, { browserChannel } = {}) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, ...(browserChannel ? { channel: browserChannel } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort());
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    await page.locator('main').screenshot({ path: file, type: 'png', timeout: 15000 });
  } finally { await browser.close(); }
}

/**
 * Pure preparation only; caller must authorize the parent/child relationship.
 * Input: {text, audience:'parent', studentId}. Existing notifications are retained.
 * Return: {text, attachments:string[], errors:{code,index?}[], skipped, cleanup}.
 * Await cleanup in the send's finally block, after attachment upload completes.
 * score_table is a new opt-in schema: rows:[{studentId,score,maxScore}].
 * Requires Playwright + installed Chromium, or options.browserChannel:'msedge'.
 * options.render(html,path) may inject a trusted raster backend for tests/hosting.
 */
async function prepareScoreMessageMedia(input, options = {}) {
  const attachments = [];
  let directory;
  const cleanup = async () => {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  };
  if (input?.audience !== 'parent') return { text: '', attachments, errors: [], skipped: true, cleanup };
  if (typeof input.text !== 'string') throw new TypeError('text must be a string');
  const result = extractCharts(input.text);
  const errors = result.errors;
  let text = result.text;
  for (const [index, raw] of result.charts.entries()) {
    let chart;
    try {
      if (index >= 5) throw new Error('CHART_LIMIT');
      chart = normalizeChart(raw, input.studentId);
      directory ||= await fs.mkdtemp(path.join(options.tempRoot || os.tmpdir(), 'zalo-score-'));
      const file = path.join(directory, `score-${index}.png`);
      await (options.render || renderPng)(chartHtml(chart), file, options);
      const bytes = await fs.readFile(file);
      if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('INVALID_BITMAP');
      attachments.push(file);
    } catch (error) {
      const code = ['INVALID_CHART', 'UNSUPPORTED_CHART', 'CHART_LIMIT', 'INVALID_BITMAP'].includes(error.message) ? error.message : 'RENDER_FAILED';
      errors.push({ code, index });
      // Only the allowlisted, anonymized model may enter a fallback message.
      const fallback = chart ? chart.type === 'score_distribution'
        ? chart.buckets.map(b => `${b.label}: ${b.count}`).join('; ')
        : chart.rows.map(r => `${r.label}: ${r.score}/${r.maxScore}`).join('; ') : '[Score chart unavailable]';
      text = `${text}\n\n${fallback}`.trim();
    }
  }
  return { text, attachments, errors, skipped: false, cleanup };
}

module.exports = { prepareScoreMessageMedia };
