-- Facebook posting calendar for MindUp
-- Run this file in Supabase SQL editor once before using facebook_posting.html.

create table if not exists public.facebook_pages (
  id uuid primary key default gen_random_uuid(),
  page_id text not null unique,
  page_name text not null,
  page_url text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.facebook_pages
add column if not exists page_access_token text;

create table if not exists public.facebook_post_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  color text not null default '#c8962a',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.facebook_post_schedule_templates (
  id uuid primary key default gen_random_uuid(),
  page_id text not null references public.facebook_pages(page_id) on delete cascade,
  post_type_id uuid references public.facebook_post_types(id) on delete set null,
  weekday smallint not null check (weekday between 0 and 6),
  publish_time time not null,
  note text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.facebook_scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  page_id text not null references public.facebook_pages(page_id) on delete cascade,
  post_type_id uuid references public.facebook_post_types(id) on delete set null,
  template_id uuid references public.facebook_post_schedule_templates(id) on delete set null,
  scheduled_at timestamptz not null,
  scheduled_date date not null,
  content text,
  link_url text,
  image_url text,
  internal_note text,
  status text not null default 'missing_content'
    check (status in ('missing_content','draft','scheduled','published','error','cancelled')),
  facebook_post_id text,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists facebook_scheduled_posts_template_week_uidx
  on public.facebook_scheduled_posts(page_id, template_id, scheduled_at)
  where template_id is not null;

create unique index if not exists facebook_scheduled_posts_template_uidx
  on public.facebook_scheduled_posts(page_id, template_id, scheduled_at);

create index if not exists facebook_scheduled_posts_page_date_idx
  on public.facebook_scheduled_posts(page_id, scheduled_date, scheduled_at);

create index if not exists facebook_post_schedule_templates_page_weekday_idx
  on public.facebook_post_schedule_templates(page_id, weekday, publish_time);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_facebook_pages_touch on public.facebook_pages;
create trigger trg_facebook_pages_touch
before update on public.facebook_pages
for each row execute function public.touch_updated_at();

drop trigger if exists trg_facebook_post_types_touch on public.facebook_post_types;
create trigger trg_facebook_post_types_touch
before update on public.facebook_post_types
for each row execute function public.touch_updated_at();

drop trigger if exists trg_facebook_post_schedule_templates_touch on public.facebook_post_schedule_templates;
create trigger trg_facebook_post_schedule_templates_touch
before update on public.facebook_post_schedule_templates
for each row execute function public.touch_updated_at();

drop trigger if exists trg_facebook_scheduled_posts_touch on public.facebook_scheduled_posts;
create trigger trg_facebook_scheduled_posts_touch
before update on public.facebook_scheduled_posts
for each row execute function public.touch_updated_at();

insert into public.facebook_pages(page_id, page_name, page_url, display_order, is_active)
values
  ('1175117009018831', 'MindUp - Tư Duy Toàn Diện', 'https://www.facebook.com/1175117009018831', 1, true),
  ('1101405623057989', 'MindUp - Tư duy Toán học', 'https://www.facebook.com/1101405623057989', 2, true),
  ('112570576892295', 'MindUp - Tư Duy Vật Lý', 'https://www.facebook.com/112570576892295', 3, true),
  ('480597338474296', 'MindUp - Tư duy Hóa Học', 'https://www.facebook.com/480597338474296', 4, true),
  ('1163066643562080', 'MindUp - Tư Duy Sinh Học', 'https://www.facebook.com/1163066643562080', 5, true)
on conflict (page_id) do update
set page_name = excluded.page_name,
    page_url = excluded.page_url,
    display_order = excluded.display_order,
    is_active = excluded.is_active;

insert into public.facebook_post_types(name, description, color, is_active)
values
  ('Learning Method', 'Phương pháp học tập, tư duy học hiệu quả.', '#2563eb', true),
  ('Monday Mindset', 'Bài truyền cảm hứng đầu tuần.', '#c8962a', true),
  ('Hard Quiz with Prize', 'Câu hỏi khó có thưởng để kéo tương tác.', '#dc2626', true),
  ('Q&A', 'Hỏi đáp kiến thức hoặc tư vấn học tập.', '#16a34a', true),
  ('Meme', 'Nội dung vui, gần gũi học sinh.', '#9333ea', true),
  ('Teaching Philosophy', 'Triết lý giảng dạy, quan điểm giáo dục.', '#0f766e', true),
  ('Enrollment', 'Tuyển sinh/lịch khai giảng/lời mời đăng ký.', '#ea580c', true),
  ('Quiz', 'Câu hỏi nhanh, bài tập tương tác.', '#0891b2', true),
  ('Bài hay', 'Bài viết chuyên môn hoặc bài giải thú vị.', '#4f46e5', true),
  ('Lỗi sai thường gặp', 'Những lỗi học sinh hay mắc và cách sửa.', '#be123c', true)
on conflict (name) do update
set description = excluded.description,
    color = excluded.color,
    is_active = true;

alter table public.facebook_pages enable row level security;
alter table public.facebook_post_types enable row level security;
alter table public.facebook_post_schedule_templates enable row level security;
alter table public.facebook_scheduled_posts enable row level security;

drop policy if exists facebook_pages_select_staff on public.facebook_pages;
create policy facebook_pages_select_staff on public.facebook_pages
for select using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant')
  )
);

drop policy if exists facebook_pages_admin_all on public.facebook_pages;
create policy facebook_pages_admin_all on public.facebook_pages
for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role::text = 'admin')
) with check (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role::text = 'admin')
);

drop policy if exists facebook_post_types_select_staff on public.facebook_post_types;
create policy facebook_post_types_select_staff on public.facebook_post_types
for select using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant')
  )
);

drop policy if exists facebook_post_types_staff_write on public.facebook_post_types;
create policy facebook_post_types_staff_write on public.facebook_post_types
for all using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant')
  )
) with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant')
  )
);

drop policy if exists facebook_templates_select_staff on public.facebook_post_schedule_templates;
create policy facebook_templates_select_staff on public.facebook_post_schedule_templates
for select using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant')
  )
);

drop policy if exists facebook_templates_staff_write on public.facebook_post_schedule_templates;
create policy facebook_templates_staff_write on public.facebook_post_schedule_templates
for all using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant')
  )
) with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant')
  )
);

drop policy if exists facebook_posts_select_staff on public.facebook_scheduled_posts;
create policy facebook_posts_select_staff on public.facebook_scheduled_posts
for select using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant')
  )
);

drop policy if exists facebook_posts_staff_write on public.facebook_scheduled_posts;
create policy facebook_posts_staff_write on public.facebook_scheduled_posts
for all using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant')
  )
) with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant')
  )
);
