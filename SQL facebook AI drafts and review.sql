-- Facebook AI drafts + review workflow for MindUp.
-- Safe to run repeatedly in Supabase SQL editor.

alter table public.facebook_post_types
add column if not exists ai_prompt text;

alter table public.facebook_scheduled_posts
add column if not exists metadata jsonb not null default '{}'::jsonb,
add column if not exists ai_status text not null default 'idle'
  check (ai_status in ('idle','generating','drafted','error')),
add column if not exists ai_generated_at timestamptz,
add column if not exists ai_model text,
add column if not exists ai_prompt text,
add column if not exists ai_image_prompt text,
add column if not exists ai_image_url text,
add column if not exists ai_error text,
add column if not exists reviewed_by uuid references public.users(id) on delete set null,
add column if not exists reviewed_at timestamptz;

create index if not exists facebook_scheduled_posts_ai_status_idx
  on public.facebook_scheduled_posts(ai_status);

create or replace function public.materialize_facebook_marketing_tasks(
  p_from date default null,
  p_to date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_task_id uuid;
  v_user_id uuid;
  v_due_date date;
  v_due_at timestamptz;
  v_source_key text;
  v_count integer := 0;
  v_assignee_ids uuid[];
begin
  for r in
    select
      p.id as post_id,
      p.page_id,
      p.post_type_id,
      p.scheduled_at,
      p.scheduled_date,
      p.task_id,
      p.created_by,
      pg.page_name,
      pt.name as post_type_name,
      t.id as template_id,
      t.note,
      t.task_assignee_ids,
      t.task_due_week_offset,
      t.task_due_weekday,
      t.task_due_time
    from public.facebook_scheduled_posts p
    join public.facebook_post_schedule_templates t
      on t.id = p.template_id
    left join public.facebook_pages pg
      on pg.page_id = p.page_id
    left join public.facebook_post_types pt
      on pt.id = p.post_type_id
    where t.auto_create_task = true
      and p.status not in ('cancelled', 'published')
      and p.scheduled_date between coalesce(p_from, p.scheduled_date) and coalesce(p_to, p.scheduled_date)
  loop
    v_assignee_ids := case
      when coalesce(array_length(r.task_assignee_ids, 1), 0) > 0 then r.task_assignee_ids
      else public.facebook_marketing_default_assignees(r.post_type_name)
    end;

    if coalesce(array_length(v_assignee_ids, 1), 0) = 0 then
      continue;
    end if;

    v_due_date :=
      date_trunc('week', r.scheduled_date::timestamp)::date
      + (coalesce(r.task_due_week_offset, -1) * 7)
      + (least(greatest(coalesce(r.task_due_weekday, 5), 1), 7) - 1);

    v_due_at := (v_due_date::timestamp + coalesce(r.task_due_time, '21:00'::time)) at time zone 'Asia/Ho_Chi_Minh';
    v_source_key := 'facebook_marketing:' || r.post_id::text;

    insert into public.daily_tasks (
      title, description, task_type, source_type, source_id, source_key,
      priority, available_on, due_at, action_url, auto_generated,
      verification_mode, created_by, metadata
    ) values (
      'Kiểm tra bài đăng ' || coalesce(r.post_type_name, 'Facebook') || ' - ' || coalesce(r.page_name, r.page_id),
      'Kiểm tra lại nội dung, hashtag và ảnh AI đã tạo cho bài đăng dự kiến lúc '
        || to_char(r.scheduled_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
        || '. Nếu bài viết đã ổn, mở lịch bài đăng và bấm "Xác nhận bài ổn".'
        || case when nullif(coalesce(r.note, ''), '') is not null then E'\nGhi chú: ' || r.note else '' end,
      'manual',
      'facebook_marketing',
      r.post_id::text,
      v_source_key,
      'normal',
      v_due_date,
      v_due_at,
      'facebook_posting.html',
      true,
      'facebook_schedule',
      coalesce(r.created_by, auth.uid()),
      jsonb_build_object(
        'requires_result', false,
        'requirements', '[]'::jsonb,
        'facebook_post_id', r.post_id,
        'facebook_page_id', r.page_id,
        'facebook_page_name', r.page_name,
        'facebook_post_type_id', r.post_type_id,
        'facebook_post_type_name', r.post_type_name,
        'facebook_scheduled_at', r.scheduled_at,
        'facebook_template_id', r.template_id,
        'facebook_review_required', true,
        'require_approval', true
      )
    )
    on conflict (source_key) do update
      set title = excluded.title,
          description = excluded.description,
          priority = excluded.priority,
          available_on = excluded.available_on,
          due_at = excluded.due_at,
          action_url = excluded.action_url,
          verification_mode = excluded.verification_mode,
          metadata = excluded.metadata,
          updated_at = now()
    returning id into v_task_id;

    update public.facebook_scheduled_posts
      set task_id = v_task_id,
          updated_at = now()
      where id = r.post_id
        and task_id is distinct from v_task_id;

    foreach v_user_id in array v_assignee_ids loop
      insert into public.task_assignments (task_id, user_id, assigned_by)
      values (v_task_id, v_user_id, coalesce(r.created_by, auth.uid()))
      on conflict (task_id, user_id) do nothing;

      insert into public.task_preferences (user_id)
      values (v_user_id)
      on conflict (user_id) do nothing;
    end loop;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.sync_facebook_marketing_task_statuses(
  p_from date default null,
  p_to date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  with target as (
    select
      a.id as assignment_id,
      case
        when p.approval_status = 'approved' or p.status in ('scheduled', 'published') then 'completed'
        when p.status = 'cancelled' then 'cancelled'
        else 'open'
      end as next_status
    from public.task_assignments a
    join public.daily_tasks t on t.id = a.task_id
    join public.facebook_scheduled_posts p on p.task_id = t.id
    where t.source_type = 'facebook_marketing'
      and (p_from is null or p.scheduled_date >= p_from)
      and (p_to is null or p.scheduled_date <= p_to)
  ),
  updated as (
    update public.task_assignments a
      set status = target.next_status,
          completed_at = case when target.next_status = 'completed' then coalesce(a.completed_at, now()) else null end
    from target
    where a.id = target.assignment_id
      and a.status is distinct from target.next_status
    returning a.id
  )
  select count(*) into v_updated from updated;

  return v_updated;
end;
$$;

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

  v_allowed := v_role in ('admin', 'assistant')
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
      and (user_id = auth.uid() or v_role in ('admin', 'assistant'));
  end if;

  return v_post;
end;
$$;

grant execute on function public.approve_facebook_scheduled_post(uuid) to authenticated, service_role;
grant execute on function public.materialize_facebook_marketing_tasks(date, date) to authenticated, service_role;
grant execute on function public.sync_facebook_marketing_task_statuses(date, date) to authenticated, service_role;

select public.materialize_facebook_marketing_tasks(null, null);
select public.sync_facebook_marketing_task_statuses(null, null);
