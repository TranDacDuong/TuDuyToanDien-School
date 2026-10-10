const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'home.html'), 'utf8');

test('homepage scripts parse and existing form/admin hooks remain', () => {
  for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (match[1].trim()) new vm.Script(match[1]);
  }
  for (const id of ['trialLessonForm', 'trialName', 'trialPhone', 'trialGrade', 'trialSubject', 'overviewAdminCard', 'overviewIntroAdminBlock', 'studentReportCard']) {
    assert.equal((source.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  assert.match(source, /onsubmit="submitTrialLessonRequest\(event\)"/);
  assert.match(source, /home-overview\.css/);
});

test('optimized homepage images exist and stay below one megabyte', () => {
  const names = ['banner', 'welcome', 'teacher-duong', 'teacher-huong', 'teacher-thai', 'class-session', 'teaching', 'classroom'];
  let bytes = 0;
  for (const name of names) {
    const buffer = fs.readFileSync(path.join(root, 'assets/home', `${name}.webp`));
    assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
    bytes += buffer.length;
  }
  assert.ok(bytes < 1000000);
});

test('teacher rendering uses marketing portraits while preserving profile identity and escaping attributes', () => {
  const wrapper = { innerHTML: '' };
  const escape = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const context = { document: { getElementById: () => wrapper }, homeTeachers: [
    { user_id: 'duong', user: { full_name: 'Thầy Đắc Dương' } },
    { user_id: 'huong', user: { full_name: 'Cô Ngô Hương' } },
    { user_id: 'thai', user: { full_name: 'Thầy Hồng Thái' } },
    { user_id: 'other', user: { full_name: '<Other>', avatar_url: 'image".png' } }
  ], allTeachers: [], esc: escape, escAttr: escape };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function renderHomeTeachers()'), source.indexOf('function renderHomeTeacherAdminList()')), context);
  context.renderHomeTeachers();
  for (const name of ['duong', 'huong', 'thai']) {
    assert.ok(wrapper.innerHTML.includes(`teacher-${name}.webp`));
    assert.ok(wrapper.innerHTML.includes(`profile.html?id=${name}`));
  }
  assert.ok(wrapper.innerHTML.includes('image&quot;.png'));
  assert.ok(wrapper.innerHTML.includes('&lt;Other>'));
  assert.match(wrapper.innerHTML, /this.onerror=null/);
});

test('carousel navigation and pause respect hover, focus and reduced motion', () => {
  const events = {}, docEvents = {};
  const slides = [{}, {}], tabs = [{ setAttribute(k, v) { this[k] = v; } }, { setAttribute(k, v) { this[k] = v; } }];
  const banner = { querySelectorAll: selector => selector === '.home-banner-slide' ? slides : tabs, addEventListener: (name, fn) => events[name] = fn, contains: () => false };
  const reduced = { matches: false, addEventListener() {} };
  let running = false;
  const context = { document: { querySelector: () => banner, hidden: false, addEventListener: (name, fn) => docEvents[name] = fn }, window: { matchMedia: () => reduced }, clearInterval: () => running = false, setInterval: () => { running = true; return 1; } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'home-overview.js'), 'utf8'), context);
  const click = button => events.click({ target: { closest: () => button } });
  assert.equal(slides[0].hidden, false);
  assert.equal(running, true);
  events.mouseenter();
  click({ dataset: { direction: '1' } });
  assert.equal(slides[1].hidden, false);
  assert.equal(running, false);
  events.mouseleave();
  events.focusin();
  click({ dataset: { slide: '0' } });
  assert.equal(running, false);
  events.focusout({ relatedTarget: null });
  const pause = { dataset: {}, id: 'homeBannerPause', setAttribute(k, v) { this[k] = v; } };
  click(pause);
  assert.equal(pause['aria-pressed'], 'true');
  assert.equal(running, false);
  click(pause);
  assert.equal(running, true);
  reduced.matches = true;
  docEvents.visibilitychange();
  assert.equal(running, false);
});
