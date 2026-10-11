const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
test('class list hides completed supplementary sessions and counts visible sessions only', () => {
  const source = read('class_list.js');
  const context = { esc: String, jsArg: String, Intl };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function renderSupplementarySessions('), source.indexOf('  function renderClasses(')), context);
  const sessions = [{ id: 'done', status: 'completed', topic: 'Completed topic' }, { id: 'next', status: 'scheduled', topic: 'Upcoming topic' }];
  const html = context.renderSupplementarySessions(sessions, 'admin');
  assert.ok(!html.includes('Completed topic'));
  assert.ok(html.includes('Upcoming topic'));
  assert.ok(html.includes('1 buổi'));
  assert.equal(sessions.length, 2);
  assert.equal(context.renderSupplementarySessions([sessions[0]], 'teacher'), '');
  assert.equal(context.renderSupplementarySessions(null, 'admin'), '');
});
test('class detail filters display list without deleting source sessions', () => {
  const source = read('class_manage.js');
  const section = source.slice(source.indexOf('    const visibleSuppSessions ='), source.indexOf('    const actionsHtml =', source.indexOf('    const visibleSuppSessions =')));
  assert.match(section, /filter\(session => session.status !== "completed"\)/);
  assert.ok(section.includes('visibleSuppSessions.map'));
  assert.match(section, /visibleSuppSessions\.length\+' buổi/);
  new vm.Script(source);
  new vm.Script(read('class_list.js'));
});
