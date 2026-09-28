'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildParentAlias, parseParentLinkCommand } = require('./link-command');

test('parses only a link command on the final line', () => {
  assert.deepEqual(parseParentLinkCommand('#lienket_0912422333'), { phone: '0912422333' });
  assert.deepEqual(parseParentLinkCommand('Xin chào\n#LIENKET_84912422333'), { phone: '84912422333' });
  assert.equal(parseParentLinkCommand('Nội dung #lienket_0912422333 không phải lệnh'), null);
  assert.equal(parseParentLinkCommand('#lienket_09123'), null);
});

test('builds aliases using the last two student-name words and parent phone', () => {
  assert.equal(buildParentAlias(['Nguyễn Nguyễn Gia Linh'], '0912422333'), 'PH Gia Linh 2333');
  assert.equal(
    buildParentAlias(['Nguyễn Nguyễn Gia Linh', 'Trần Minh Bảo Hân'], '0912422333'),
    'PH Gia Linh - Bảo Hân 2333'
  );
});

test('shortens a long multi-child alias without cutting a word', () => {
  const alias = buildParentAlias([
    'Nguyễn Hoàng Minh Anh',
    'Trần Nguyễn Phương Thảo',
    'Lê Hoàng Tuấn Kiệt'
  ], '0912422333', 24);
  assert.equal(alias, 'PH Minh Anh +2 2333');
  assert.ok(Array.from(alias).length <= 24);
});

test('does not add +0 when one student name must be shortened', () => {
  const alias = buildParentAlias(['Nguyễn TênHọcSinhRấtDài KhôngThểHiểnThịHết'], '0912422333', 24);
  assert.equal(alias, 'PH TênHọcSinhRấtDài 2333');
  assert.doesNotMatch(alias, /\+0/);
});
