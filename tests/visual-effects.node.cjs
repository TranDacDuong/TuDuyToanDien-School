const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('visual-effects.js', 'utf8');

test('shared effects never create a floating settings button on top-level pages', () => {
  for (const page of ['dashboard.html','home.html','messages.html','tuition.html','course_practice.html']) {
    const created = [];
    const element = () => {
      const node = { className: '', dataset: {}, style: { setProperty() {} }, setAttribute() {}, appendChild() {}, remove() {} };
      created.push(node); return node;
    };
    const storage = new Map();
    const window = { addEventListener() {}, matchMedia: () => ({ matches: false }),
      sb: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } };
    window.top = window;
    const ctx = { window, location: { pathname: '/' + page },
      localStorage: { getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value) },
      document: { readyState: 'complete', body: { appendChild() {} },
        documentElement: { dataset: {}, classList: { toggle() {} } }, createElement: element }
    };
    vm.runInNewContext(source, ctx);
    assert.ok(window.MindupEffects);
    window.MindupEffects.applyTheme('winter');
    window.MindupEffects.setExamMode(true);
    assert.equal(ctx.document.documentElement.dataset.mindupTheme, 'winter');
    assert.ok(!created.some(node => /mindup-effect-(settings|trigger|panel)/.test(node.className)), page);
    assert.equal(created.some(node => node.className === 'mindup-petal-layer'), page !== 'course_practice.html');
  }
});

test('all HTML entry points use the updated shared effects asset', () => {
  for (const file of fs.readdirSync('.').filter(name => name.endsWith('.html'))) {
    const html = fs.readFileSync(file,'utf8');
    if (!html.includes('src="visual-effects.js')) continue;
    assert.ok(html.includes('visual-effects.js?v=20261016-no-settings'),file);
    assert.ok(!html.includes('mindup-effect-trigger'),file);
  }
});
