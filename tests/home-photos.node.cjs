const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../home.html'), 'utf8');
function setup(role = 'admin', fail = false) {
  const elements = { homePhotoStrip: {}, homePhotoAdmin: {}, homePhotoStatus: {} };
  const writes = [];
  const context = { role, centerIntro: { title: 'Intro', content: 'Existing content', photos: [] }, currentUser: { id: 'admin' },
    document: { getElementById: id => elements[id] }, window: {}, esc: String, escAttr: String,
    confirm: () => true, console, sb: { from: () => ({ upsert: async payload => { writes.push(payload); return { error: fail ? new Error('denied') : null }; } }) } };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const defaultHomePhotos ='), source.indexOf('function renderHomeTeachers()')), context);
  return { context, elements, writes };
}
test('saving photos preserves introduction and empty list does not restore deleted defaults', async () => {
  const h = setup();
  await h.context.saveHomePhotos([{ url: 'image.webp', caption: 'Class' }]);
  assert.equal(JSON.parse(h.writes[0].setting_value).content, 'Existing content');
  await h.context.window.deleteHomePhoto(0);
  assert.equal(h.context.getHomePhotos().length, 0);
  assert.equal(h.elements.homePhotoStrip.innerHTML, '');
});
test('non-admin cannot upload or delete and has no image management controls', async () => {
  const h = setup('teacher');
  h.context.renderHomePhotos();
  await h.context.window.uploadHomePhotos({ files: [] });
  await h.context.window.deleteHomePhoto(0);
  assert.equal(h.elements.homePhotoAdmin.hidden, true);
  assert.equal(h.writes.length, 0);
});
test('failed save keeps old images and reports failure', async () => {
  const h = setup('admin', true);
  h.context.centerIntro.photos = [{ url: 'image.webp' }];
  await h.context.window.deleteHomePhoto(0);
  assert.equal(h.context.getHomePhotos().length, 1);
  assert.match(h.elements.homePhotoStatus.textContent, /denied/);
});
test('photo frames have explicit equal height instead of intrinsic HTML height', () => {
  const css = fs.readFileSync(path.join(__dirname, '../home-overview.css'), 'utf8');
  assert.match(css, /\.home-photo-strip img\s*\{[^}]*height: 190px/);
});
