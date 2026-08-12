-- SQL Script to allow Teacher role (and admin, assistant, marketing, accountant) full CRUD permissions on Facebook posting tables.
-- Run this script in your Supabase SQL Editor.

-- 1. Table facebook_pages
drop policy if exists facebook_pages_select_staff on public.facebook_pages;
create policy facebook_pages_select_staff on public.facebook_pages
for select using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant','teacher','marketing','accountant')
  )
);

drop policy if exists facebook_pages_write_staff on public.facebook_pages;
create policy facebook_pages_write_staff on public.facebook_pages
for all using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant','teacher','marketing','accountant')
  )
) with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant','teacher','marketing','accountant')
  )
);

-- 2. Table facebook_post_types
drop policy if exists facebook_post_types_select_staff on public.facebook_post_types;
create policy facebook_post_types_select_staff on public.facebook_post_types
for select using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant','teacher','marketing','accountant')
  )
);

drop policy if exists facebook_post_types_write_staff on public.facebook_post_types;
create policy facebook_post_types_write_staff on public.facebook_post_types
for all using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant','teacher','marketing','accountant')
  )
) with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant','teacher','marketing','accountant')
  )
);

-- 3. Table facebook_post_schedule_templates
drop policy if exists facebook_templates_select_staff on public.facebook_post_schedule_templates;
create policy facebook_templates_select_staff on public.facebook_post_schedule_templates
for select using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant','teacher','marketing','accountant')
  )
);

drop policy if exists facebook_templates_write_staff on public.facebook_post_schedule_templates;
create policy facebook_templates_write_staff on public.facebook_post_schedule_templates
for all using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant','teacher','marketing','accountant')
  )
) with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant','teacher','marketing','accountant')
  )
);

-- 4. Table facebook_scheduled_posts
drop policy if exists facebook_posts_select_staff on public.facebook_scheduled_posts;
create policy facebook_posts_select_staff on public.facebook_scheduled_posts
for select using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant','teacher','marketing','accountant')
  )
);

drop policy if exists facebook_posts_staff_write on public.facebook_scheduled_posts;
create policy facebook_posts_staff_write on public.facebook_scheduled_posts
for all using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant','teacher','marketing','accountant')
  )
) with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin','assistant','teacher','marketing','accountant')
  )
);
