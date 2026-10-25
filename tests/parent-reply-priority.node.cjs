const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PGlite } = createRequire(path.join(__dirname, '../services/zalo-bot/package.json'))('@electric-sql/pglite');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const parent = '00000000-0000-0000-0000-000000000011';
const staff = '00000000-0000-0000-0000-000000000012';
const bot = '00000000-0000-0000-0000-000000000001';
test('database: automatic notices cannot clear waiting; manual replies can', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${staff}'::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY, role text);
    INSERT INTO users VALUES('${parent}','parent'),('${staff}','admin');
    CREATE TABLE messages(id uuid DEFAULT gen_random_uuid(),conversation_id uuid,sender_id uuid,real_sender_id uuid,
      content text,created_at timestamptz DEFAULT now(),context_student_id uuid,transport text DEFAULT 'web',message_key text,zalo_dispatch_source text DEFAULT 'automatic');
    CREATE TABLE zalo_outbox(message_id uuid,dispatch_purpose text);
    CREATE FUNCTION teacher_manages_student(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION list_mindup_parent_inbox() RETURNS TABLE(parent_id uuid,conversation_id uuid) LANGUAGE sql AS
      $$ SELECT '${parent}'::uuid,'${parent}'::uuid WHERE EXISTS(SELECT 1 FROM users WHERE id=auth.uid() AND role IN ('admin','teacher')) $$;
    CREATE FUNCTION send_mindup_parent_message(uuid,uuid,text) RETURNS uuid LANGUAGE plpgsql AS $$
      DECLARE v_id uuid; BEGIN
      IF NOT EXISTS(SELECT 1 FROM users WHERE id=auth.uid() AND role IN ('admin','teacher')) THEN RAISE EXCEPTION 'Denied'; END IF;
      INSERT INTO messages(conversation_id,sender_id,real_sender_id,content,context_student_id) VALUES($1,'${bot}',auth.uid(),$3,$2) RETURNING id INTO v_id; RETURN v_id; END $$;`);
  await db.exec(read('SQL parent inbox reply priority.sql'));
  const waiting = async () => (await db.query('SELECT * FROM list_mindup_parent_reply_priority()')).rows[0].waiting_reply;
  await db.exec(`INSERT INTO messages(conversation_id,sender_id,created_at) VALUES('${parent}','${parent}',now()-interval '3 minutes');`);
  assert.equal(await waiting(), true);
  await db.exec(`INSERT INTO messages(conversation_id,sender_id,real_sender_id,created_at,zalo_dispatch_source) VALUES('${parent}','${bot}','${staff}',now()-interval '1 minute','receipt');`);
  assert.equal(await waiting(), true);
  await db.query('SELECT send_mindup_parent_reply($1,NULL,$2)', [parent, 'Manual reply']);
  assert.equal(await waiting(), false);
  await db.exec(`INSERT INTO messages(conversation_id,sender_id,created_at) VALUES('${parent}','${parent}',now()+interval '1 second');`);
  assert.equal(await waiting(), true);
  await db.exec(`INSERT INTO messages(conversation_id,sender_id,transport,created_at,zalo_dispatch_source)
    VALUES('${parent}','${bot}','zalo',now()+interval '2 seconds','receipt');`);
  assert.equal(await waiting(), true, 'automatic Zalo receipt cannot clear waiting');
  await db.exec(`INSERT INTO messages(conversation_id,sender_id,transport,created_at)
    VALUES('${parent}','${bot}','zalo',now()+interval '3 seconds');`);
  assert.equal(await waiting(), false, 'direct reply on Zalo clears waiting without staff real_sender_id');
  await db.exec(`INSERT INTO messages(conversation_id,sender_id,created_at) VALUES('${parent}','${parent}',now()+interval '4 seconds');`);
  assert.equal(await waiting(), true, 'new parent message reopens waiting');
  await db.exec(`UPDATE users SET role='teacher' WHERE id='${staff}';
    DELETE FROM messages WHERE sender_id='${parent}';
    INSERT INTO messages(conversation_id,sender_id,context_student_id,created_at) VALUES('${parent}','${parent}','${bot}',now()+interval '1 second');`);
  assert.equal(await waiting(), false, 'teacher cannot count messages for unmanaged student');
  await db.exec(`UPDATE users SET role='student' WHERE id='${staff}'`);
  assert.equal((await db.query('SELECT * FROM list_mindup_parent_reply_priority()')).rows.length, 0);
});
test('UI orders conversations by latest activity regardless of waiting or unread', () => {
  const html = read('messages.html');
  const context = { shouldRenderOfficialAudienceItem: () => false, officialFamilySortWeight: () => 0 };
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('function sortConversationsByFamily('), html.indexOf('function getUniqueGradeLabel(')), context);
  const list = [
    { friend_id: 'auto', lastActivity: '2026-10-12T12:00:00Z', users: {} },
    { friend_id: 'unread', unreadCount: 2, lastActivity: '2026-10-11T12:00:00Z', users: {} },
    { friend_id: 'waiting', waitingReply: true, lastParentAt: '2026-10-10T12:00:00Z', users: {} }
  ];
  assert.equal(context.sortConversationsByFamily(list).map(item => item.friend_id).join(','), 'auto,unread,waiting');
  assert.doesNotMatch(html, /waiting-reply-label/);
  assert.match(html, /send_mindup_parent_reply/);
});
test('successful reply removes only its parent from waiting, preserving a newer incoming message', () => {
  const html = read('messages.html');
  let refreshes = 0;
  const context = { allFriends: [
    { friend_id: 'answered', users: { role: 'parent' }, waitingReply: true, lastParentAt: '2026-10-12T01:00:00Z' },
    { friend_id: 'other', users: { role: 'parent' }, waitingReply: true },
    { friend_id: 'newer', users: { role: 'parent' }, waitingReply: true, lastParentAt: '2026-10-12T03:00:00Z' }
  ], getFilteredFriendList: () => [], renderFriendList: () => refreshes++ };
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('function markParentConversationReplied('), html.indexOf('function removeOptimisticMessage(')), context);
  context.markParentConversationReplied('answered', '2026-10-12T02:00:00Z');
  assert.equal(context.allFriends[0].waitingReply, false);
  assert.equal(context.allFriends[1].waitingReply, true);
  context.markParentConversationReplied('newer', '2026-10-12T02:00:00Z');
  assert.equal(context.allFriends[2].waitingReply, true);
  assert.equal(refreshes, 2);
});
