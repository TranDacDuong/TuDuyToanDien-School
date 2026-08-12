-- SQL Script to allow Teacher role (and admin, assistant, marketing, accountant) full CRUD permissions on Facebook posting tables and RPC functions.
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

-- 5. RPC Function approve_facebook_scheduled_post (Allow teacher role)
create or replace function public.approve_facebook_scheduled_post(p_post_id uuid)
returns public.facebook_scheduled_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.facebook_scheduled_posts;
  v_role text;
  v_allowed boolean := false;
begin
  select role::text into v_role
  from public.users
  where id = auth.uid();

  select p.* into v_post
  from public.facebook_scheduled_posts p
  where p.id = p_post_id;

  if not found then
    raise exception 'Không tìm thấy bài đăng Facebook.';
  end if;

  v_allowed := v_role in ('admin', 'assistant', 'teacher', 'marketing', 'accountant')
    or exists (
      select 1
      from public.task_assignments a
      where a.task_id = v_post.task_id
        and a.user_id = auth.uid()
    );

  if not v_allowed then
    raise exception 'Bạn chưa có quyền xác nhận bài đăng này.';
  end if;

  update public.facebook_scheduled_posts
  set approval_status = 'approved',
      content_status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_post_id
  returning * into v_post;

  if v_post.task_id is not null then
    update public.task_assignments
    set status = 'completed',
        completed_at = coalesce(completed_at, now())
    where task_id = v_post.task_id
      and (user_id = auth.uid() or v_role in ('admin', 'assistant', 'teacher', 'marketing', 'accountant'));
  end if;

  return v_post;
end;
$$;

grant execute on function public.approve_facebook_scheduled_post(uuid) to authenticated, service_role;
