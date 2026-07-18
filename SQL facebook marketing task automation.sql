-- Facebook Marketing -> Task automation for MindUp.
-- Safe to run repeatedly.

alter table public.facebook_post_schedule_templates
add column if not exists auto_create_task boolean not null default true,
add column if not exists task_assignee_ids uuid[] not null default '{}'::uuid[],
add column if not exists task_due_week_offset integer not null default -1,
add column if not exists task_due_weekday integer not null default 5 check (task_due_weekday between 1 and 7),
add column if not exists task_due_time time not null default '21:00',
add column if not exists task_requirements jsonb not null default '[]'::jsonb,
add column if not exists require_task_approval boolean not null default true;

alter table public.facebook_scheduled_posts
add column if not exists task_id uuid references public.daily_tasks(id) on delete set null,
add column if not exists content_status text not null default 'missing_content'
  check (content_status in ('missing_content','submitted','needs_revision','approved')),
add column if not exists approval_status text not null default 'pending'
  check (approval_status in ('pending','approved','rejected'));

create index if not exists facebook_scheduled_posts_task_id_idx
  on public.facebook_scheduled_posts(task_id);

create or replace function public.facebook_marketing_default_assignees(p_post_type_name text)
returns uuid[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(id order by full_name nulls last, email), '{}'::uuid[])
  from public.users
  where role = case
    when lower(coalesce(p_post_type_name, '')) like '%quiz%' then 'teacher'::user_role
    else 'assistant'::user_role
  end
$$;

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
  v_requirements jsonb;
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
      t.task_due_time,
      t.task_requirements,
      t.require_task_approval
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
    v_requirements := case
      when jsonb_typeof(coalesce(r.task_requirements, '[]'::jsonb)) = 'array'
        and jsonb_array_length(coalesce(r.task_requirements, '[]'::jsonb)) > 0
      then r.task_requirements
      else jsonb_build_array(
        jsonb_build_object('key','content','title','Nội dung bài đăng'),
        jsonb_build_object('key','image','title','Ảnh/video'),
        jsonb_build_object('key','note','title','Ghi chú/CTA')
      )
    end;

    insert into public.daily_tasks (
      title, description, task_type, source_type, source_id, source_key,
      priority, available_on, due_at, action_url, auto_generated,
      verification_mode, created_by, metadata
    ) values (
      'Chuẩn bị bài ' || coalesce(r.post_type_name, 'Facebook') || ' - ' || coalesce(r.page_name, r.page_id),
      'Soạn nội dung cho bài đăng dự kiến lúc '
        || to_char(r.scheduled_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
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
      'manual',
      coalesce(r.created_by, auth.uid()),
      jsonb_build_object(
        'requires_result', true,
        'requirements', v_requirements,
        'facebook_post_id', r.post_id,
        'facebook_page_id', r.page_id,
        'facebook_page_name', r.page_name,
        'facebook_post_type_id', r.post_type_id,
        'facebook_post_type_name', r.post_type_name,
        'facebook_scheduled_at', r.scheduled_at,
        'facebook_template_id', r.template_id,
        'require_approval', coalesce(r.require_task_approval, true)
      )
    )
    on conflict (source_key) do update
      set title = excluded.title,
          description = excluded.description,
          priority = excluded.priority,
          available_on = excluded.available_on,
          due_at = excluded.due_at,
          action_url = excluded.action_url,
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

update public.facebook_post_schedule_templates t
set task_assignee_ids = public.facebook_marketing_default_assignees(pt.name),
    updated_at = now()
from public.facebook_post_types pt
where t.post_type_id = pt.id
  and t.auto_create_task = true
  and coalesce(array_length(t.task_assignee_ids, 1), 0) = 0
  and coalesce(array_length(public.facebook_marketing_default_assignees(pt.name), 1), 0) > 0;

create or replace function public.trigger_materialize_facebook_marketing_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.materialize_facebook_marketing_tasks(new.scheduled_date, new.scheduled_date);
  return new;
end;
$$;

drop trigger if exists trg_facebook_scheduled_posts_materialize_task on public.facebook_scheduled_posts;
create trigger trg_facebook_scheduled_posts_materialize_task
after insert or update of template_id, scheduled_at, scheduled_date, status
on public.facebook_scheduled_posts
for each row
when (new.template_id is not null)
execute function public.trigger_materialize_facebook_marketing_task();

revoke all on function public.materialize_facebook_marketing_tasks(date, date) from public;
grant execute on function public.materialize_facebook_marketing_tasks(date, date) to authenticated, service_role;
