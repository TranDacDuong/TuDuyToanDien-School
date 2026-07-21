-- Facebook weekly drag/drop schedule workflow.
-- Safe to run repeatedly in Supabase SQL editor.

alter table public.facebook_post_types
add column if not exists auto_create_task boolean not null default true,
add column if not exists task_assignee_ids uuid[] not null default '{}'::uuid[],
add column if not exists task_due_days_before integer not null default 7 check (task_due_days_before between 0 and 30),
add column if not exists task_due_time time not null default '21:00';

update public.facebook_post_types pt
set task_assignee_ids = public.facebook_marketing_default_assignees(pt.name)
where pt.auto_create_task = true
  and coalesce(array_length(pt.task_assignee_ids, 1), 0) = 0
  and coalesce(array_length(public.facebook_marketing_default_assignees(pt.name), 1), 0) > 0;

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
  v_due_days_before integer;
  v_due_time time;
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
      p.template_id,
      p.internal_note,
      pg.page_name,
      pt.name as post_type_name,
      coalesce(t.auto_create_task, pt.auto_create_task, true) as auto_create_task,
      coalesce(t.task_assignee_ids, pt.task_assignee_ids, '{}'::uuid[]) as task_assignee_ids,
      t.task_due_week_offset,
      t.task_due_weekday,
      coalesce(t.task_due_time, pt.task_due_time, '21:00'::time) as task_due_time,
      coalesce(pt.task_due_days_before, 7) as type_due_days_before,
      t.note as template_note
    from public.facebook_scheduled_posts p
    left join public.facebook_post_schedule_templates t
      on t.id = p.template_id
    left join public.facebook_pages pg
      on pg.page_id = p.page_id
    left join public.facebook_post_types pt
      on pt.id = p.post_type_id
    where coalesce(t.auto_create_task, pt.auto_create_task, true) = true
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

    v_due_days_before := greatest(0, least(coalesce(r.type_due_days_before, 7), 30));
    v_due_time := coalesce(r.task_due_time, '21:00'::time);

    if r.template_id is not null and r.task_due_weekday is not null then
      v_due_date :=
        date_trunc('week', r.scheduled_date::timestamp)::date
        + (coalesce(r.task_due_week_offset, -1) * 7)
        + (least(greatest(coalesce(r.task_due_weekday, 5), 1), 7) - 1);
    else
      v_due_date := r.scheduled_date - v_due_days_before;
    end if;

    v_due_at := (v_due_date::timestamp + v_due_time) at time zone 'Asia/Ho_Chi_Minh';
    v_source_key := 'facebook_marketing:' || r.post_id::text;

    insert into public.daily_tasks (
      title, description, task_type, source_type, source_id, source_key,
      priority, available_on, due_at, action_url, auto_generated,
      verification_mode, created_by, metadata
    ) values (
      'Kiểm tra bài đăng ' || coalesce(r.post_type_name, 'Facebook') || ' - ' || coalesce(r.page_name, r.page_id),
      'Kiểm tra lại nội dung, hashtag và ảnh cho bài đăng dự kiến lúc '
        || to_char(r.scheduled_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
        || '. Nếu bài viết đã ổn, mở lịch bài đăng và bấm "Xác nhận bài ổn".'
        || case when nullif(coalesce(r.template_note, r.internal_note, ''), '') is not null then E'\nGhi chú: ' || coalesce(r.template_note, r.internal_note) else '' end,
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

drop trigger if exists trg_facebook_scheduled_posts_materialize_task on public.facebook_scheduled_posts;
create trigger trg_facebook_scheduled_posts_materialize_task
after insert or update of template_id, post_type_id, scheduled_at, scheduled_date, status
on public.facebook_scheduled_posts
for each row
when (new.status not in ('cancelled', 'published'))
execute function public.trigger_materialize_facebook_marketing_task();

grant execute on function public.materialize_facebook_marketing_tasks(date, date) to authenticated, service_role;
