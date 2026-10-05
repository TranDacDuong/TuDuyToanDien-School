const { test, expect } = require('@playwright/test');
const fs = require('fs');
const vm = require('vm');

function render(contact, allowed = true) {
  const src = fs.readFileSync('sourcedata.html', 'utf8');
  const ctx = { _sParentDirectoryError:false, _sZaloContactsError:false, _sZaloContacts: { parent: contact }, _sParentZaloBusy: new Set(),
    window: { AppPermissions: { has: () => allowed } }, esc: s => String(s || '') };
  vm.createContext(ctx);
  vm.runInContext(src.slice(src.indexOf('function sZaloParentStatusHtml'), src.indexOf('const _sParentZaloBusy')), ctx);
  return ctx.sZaloParentStatusHtml([{ id: 'parent', full_name: 'Parent', phone: '0912422333' }]);
}
test('linked friend has both individual controls', () => {
  const html = render({status:'friend',zalo_uid:'123'});
  expect(html).toContain("sRequestParentZalo('parent','check')");
  expect(html).toContain("sRequestParentZalo('parent','alias')");
  expect(html).not.toContain('disabled');
});
test('alias control is disabled before friendship', () => {
  expect(render({status:'invited',zalo_uid:'123'})).toMatch(/'alias'\)[^>]*disabled/);
});
test('users without permission see no controls', () => {
  expect(render({status:'friend',zalo_uid:'123'},false)).not.toContain('sRequestParentZalo');
});
test('pending contact and alias controls are disabled', () => {
  const html=render({status:'friend',zalo_uid:'123',manual_check_requested_at:'2999-01-01',alias_pending:true});
  expect(html).toContain('Đang chờ kiểm tra');
  expect(html).toContain('Đang đồng bộ biệt danh');
  expect(html.match(/disabled/g)).toHaveLength(2);
});
