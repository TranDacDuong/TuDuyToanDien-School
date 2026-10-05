const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('database migration enforces the three supported messaging flows', () => {
  const sql = read('SQL complete Zalo web messaging.sql');

  expect(sql).toContain('ensure_student_direct_conversation');
  expect(sql).toContain('send_student_direct_message');
  expect(sql).toContain('can_message_parent_for_student');
  expect(sql).toContain('teacher_manages_student');
  expect(sql).toContain('send_mindup_parent_message');
  expect(sql).toContain('list_mindup_parent_inbox');
  expect(sql).toContain('context_student_id');
});

test('parent message is saved and queued for Zalo atomically', () => {
  const sql = read('SQL complete Zalo web messaging.sql');
  const functionBody = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.send_mindup_parent_message'),
    sql.indexOf('-- Teachers may read a family thread')
  );

  expect(functionBody).toContain('INSERT INTO public.messages');
  expect(functionBody).toContain('INSERT INTO public.zalo_outbox');
  expect(functionBody).toContain('public.can_message_parent_for_student');
  expect(functionBody).toContain('p_student_id');
  expect(functionBody).toContain("RAISE EXCEPTION 'Parent Zalo is not linked'");
});

test('message UI uses scoped parent inbox and automatic Zalo delivery', () => {
  const html = read('messages.html');

  expect(html).toContain("sb.rpc('list_mindup_parent_inbox')");
  expect(html).toContain("sb.rpc('send_mindup_parent_message'");
  expect(html).toContain("sb.rpc('send_student_direct_message'");
  expect(html).toContain('Web + Zalo tự động');
  expect(html).toContain('messageContextStudent');
  expect(html).toContain("setupParentMessageContext(parentInboxById.get(activeFriend?.id)");
  expect(html).not.toContain("document.getElementById('zaloSendMode').value === 'both'");
});

test('user search is restricted to students for direct web chat', () => {
  const html = read('messages.html');
  const searchSection = html.slice(
    html.indexOf('async function searchUsersForConversation'),
    html.indexOf('function rememberConversationUser')
  );

  expect(searchSection).toContain('.eq("role", "student")');
});

test('local Zalo bot acknowledges failed outbox jobs with the claimed job id', () => {
  const server = read(path.join('services', 'zalo-bot', 'server.js'));
  expect(server).toContain("action: 'finish', jobId: job.job_id");
  expect(server).not.toContain("jobId: job.job, status: 'uncertain'");
});

test('Zalo history sync imports both directions without leaking unlinked chats', () => {
  const sql = read('SQL Zalo message history sync.sql');
  const gateway = read(path.join('supabase', 'functions', 'zalo-gateway', 'index.ts'));
  const server = read(path.join('services', 'zalo-bot', 'server.js'));

  expect(sql).toContain('sync_mindup_zalo_message');
  expect(sql).toContain("RETURN 'ignored_unlinked'");
  expect(sql).toContain('WHEN p_is_self');
  expect(sql).toContain("'zalo'");
  expect(sql).toContain('p_is_history');
  expect(gateway).toContain('payload.action === "syncMessage"');
  expect(server).toContain("listener.on('old_messages'");
  expect(server).toContain("app.post('/api/sync-zalo-history'");
  expect(server).toContain('isSelf: message.isSelf === true');
});
