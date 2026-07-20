-- Seed mẫu tin nhắn tự động cho điểm đề kiểm tra offline.
-- Dán vào Supabase SQL Editor nếu muốn mẫu này xuất hiện/có thể chỉnh trong Hệ thống > Tin nhắn tự động.

create table if not exists public.message_templates (
  id text primary key,
  name text not null,
  content text not null,
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.message_templates (id, name, content, is_enabled, updated_at)
values (
  'offline_test_score_notice',
  'Điểm đề kiểm tra offline trong lớp học',
  '📊 Điểm đề kiểm tra lớp **{{class_name}}**

Học sinh: **{{student_name}}**
Đề kiểm tra: **{{test_title}}**
Ngày kiểm tra: **{{test_date}}**
Điểm: **{{score}}/{{max_score}}**
{{note}}',
  true,
  now()
)
on conflict (id) do update
set
  name = excluded.name,
  content = coalesce(nullif(public.message_templates.content, ''), excluded.content),
  is_enabled = coalesce(public.message_templates.is_enabled, excluded.is_enabled),
  updated_at = now();
