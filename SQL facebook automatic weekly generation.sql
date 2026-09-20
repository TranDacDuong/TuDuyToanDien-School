-- Automatic Facebook planning and Gemini draft generation.
-- Safe to run repeatedly.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.facebook_content_generation_queue (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.facebook_scheduled_posts(id) on delete cascade,
  job_kind text not null check (job_kind in ('weekly', 'daily_news')),
  provider text not null default 'gemini' check (provider in ('gemini')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id)
);

create index if not exists facebook_content_generation_queue_worker_idx
  on public.facebook_content_generation_queue(status, run_after, created_at);

create table if not exists public.facebook_automation_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  run_kind text not null check (run_kind in ('weekly', 'daily_news')),
  source_date date,
  target_date date not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  created_posts integer not null default 0,
  queued_posts integer not null default 0,
  last_error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.facebook_content_generation_queue enable row level security;
alter table public.facebook_automation_runs enable row level security;

drop policy if exists facebook_generation_queue_staff_read on public.facebook_content_generation_queue;
create policy facebook_generation_queue_staff_read
on public.facebook_content_generation_queue for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin', 'assistant', 'teacher', 'marketing', 'accountant')
  )
);

drop policy if exists facebook_automation_runs_staff_read on public.facebook_automation_runs;
create policy facebook_automation_runs_staff_read
on public.facebook_automation_runs for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role::text in ('admin', 'assistant', 'teacher', 'marketing', 'accountant')
  )
);

create or replace function public.facebook_local_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

create or replace function public.facebook_local_monday(p_date date default public.facebook_local_today())
returns date
language sql
immutable
set search_path = public
as $$
  select p_date - (extract(isodow from p_date)::integer - 1)
$$;

create or replace function public.prepare_facebook_next_week(
  p_source_week_start date default public.facebook_local_monday()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_target_week_start date := p_source_week_start + 7;
  v_effective_source_week_start date := p_source_week_start;
  v_target_scheduled_at timestamptz;
  v_target_post_id uuid;
  v_run_key text := 'weekly:' || to_char(p_source_week_start + 7, 'YYYY-MM-DD');
  v_created integer := 0;
  v_queued integer := 0;
  v_is_news boolean;
begin
  if not exists (
    select 1
    from public.facebook_scheduled_posts p
    where p.scheduled_date between p_source_week_start and p_source_week_start + 6
      and p.status <> 'cancelled'
  ) then
    select max(
      p.scheduled_date - (extract(isodow from p.scheduled_date)::integer - 1)
    ) into v_effective_source_week_start
    from public.facebook_scheduled_posts p
    where p.scheduled_date < p_source_week_start
      and p.status <> 'cancelled';
  end if;

  if v_effective_source_week_start is null then
    raise exception 'Không tìm thấy tuần lịch Facebook nào trước ngày % để làm mẫu.', p_source_week_start;
  end if;

  insert into public.facebook_automation_runs(run_key, run_kind, source_date, target_date, status)
  values (v_run_key, 'weekly', v_effective_source_week_start, v_target_week_start, 'running')
  on conflict (run_key) do update
    set status = case
          when public.facebook_automation_runs.status = 'completed' then 'completed'
          else 'running'
        end,
        last_error = null,
        updated_at = now();

  for r in
    select
      p.*,
      coalesce(pt.name, '') as post_type_name
    from public.facebook_scheduled_posts p
    left join public.facebook_post_types pt on pt.id = p.post_type_id
    where p.scheduled_date between v_effective_source_week_start and v_effective_source_week_start + 6
      and p.status <> 'cancelled'
      and lower(trim(coalesce(pt.name, ''))) <> 'problem'
    order by p.scheduled_at, p.id
  loop
    v_target_scheduled_at := r.scheduled_at
      + ((v_target_week_start - v_effective_source_week_start) * interval '1 day');
    v_is_news := lower(trim(r.post_type_name)) in ('tin tức', 'tin tuc', 'news');

    select p.id into v_target_post_id
    from public.facebook_scheduled_posts p
    where p.page_id = r.page_id
      and p.post_type_id is not distinct from r.post_type_id
      and p.scheduled_at = v_target_scheduled_at
      and p.status <> 'cancelled'
    order by p.created_at
    limit 1;

    if v_target_post_id is null then
      insert into public.facebook_scheduled_posts (
        page_id,
        post_type_id,
        template_id,
        scheduled_at,
        scheduled_date,
        content,
        link_url,
        image_url,
        internal_note,
        status,
        content_status,
        approval_status,
        ai_status,
        created_by,
        metadata
      ) values (
        r.page_id,
        r.post_type_id,
        r.template_id,
        v_target_scheduled_at,
        v_target_week_start + (r.scheduled_date - v_effective_source_week_start),
        '',
        null,
        null,
        null,
        'missing_content',
        'missing_content',
        'pending',
        'idle',
        r.created_by,
        jsonb_build_object(
          'auto_generated_schedule', true,
          'auto_source_post_id', r.id,
          'auto_source_week_start', v_effective_source_week_start,
          'auto_target_week_start', v_target_week_start,
          'auto_created_at', now()
        )
      )
      returning id into v_target_post_id;
      v_created := v_created + 1;
    end if;

    if not v_is_news and exists (
      select 1
      from public.facebook_scheduled_posts p
      where p.id = v_target_post_id
        and nullif(trim(coalesce(p.content, '')), '') is null
        and nullif(trim(coalesce(p.link_url, '')), '') is null
        and nullif(trim(coalesce(p.image_url, '')), '') is null
        and p.status not in ('scheduled', 'published', 'cancelled')
    ) then
      insert into public.facebook_content_generation_queue (
        post_id,
        job_kind,
        provider,
        status,
        run_after,
        metadata
      ) values (
        v_target_post_id,
        'weekly',
        'gemini',
        'queued',
        now(),
        jsonb_build_object(
          'run_key', v_run_key,
          'source_post_id', r.id,
          'source_week_start', v_effective_source_week_start,
          'target_week_start', v_target_week_start
        )
      )
      on conflict (post_id) do nothing;

      if found then
        v_queued := v_queued + 1;
      end if;
    end if;
  end loop;

  update public.facebook_automation_runs
  set status = 'completed',
      created_posts = v_created,
      queued_posts = v_queued,
      completed_at = now(),
      updated_at = now()
  where run_key = v_run_key;

  perform public.materialize_facebook_marketing_tasks(
    v_target_week_start,
    v_target_week_start + 6
  );

  return jsonb_build_object(
    'run_key', v_run_key,
    'requested_source_week_start', p_source_week_start,
    'source_week_start', v_effective_source_week_start,
    'target_week_start', v_target_week_start,
    'created_posts', v_created,
    'queued_posts', v_queued
  );
exception when others then
  update public.facebook_automation_runs
  set status = 'failed',
      last_error = sqlerrm,
      completed_at = now(),
      updated_at = now()
  where run_key = v_run_key;
  raise;
end;
$$;

create or replace function public.enqueue_facebook_daily_news(
  p_target_date date default public.facebook_local_today()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_key text := 'daily_news:' || to_char(p_target_date, 'YYYY-MM-DD');
  v_queued integer := 0;
begin
  insert into public.facebook_automation_runs(run_key, run_kind, target_date, status)
  values (v_run_key, 'daily_news', p_target_date, 'running')
  on conflict (run_key) do update
    set status = case
          when public.facebook_automation_runs.status = 'completed' then 'completed'
          else 'running'
        end,
        last_error = null,
        updated_at = now();

  with inserted as (
    insert into public.facebook_content_generation_queue (
      post_id,
      job_kind,
      provider,
      status,
      run_after,
      metadata
    )
    select
      p.id,
      'daily_news',
      'gemini',
      'queued',
      now(),
      jsonb_build_object('run_key', v_run_key, 'target_date', p_target_date)
    from public.facebook_scheduled_posts p
    join public.facebook_post_types pt on pt.id = p.post_type_id
    where p.scheduled_date = p_target_date
      and lower(trim(pt.name)) in ('tin tức', 'tin tuc', 'news')
      and nullif(trim(coalesce(p.content, '')), '') is null
      and nullif(trim(coalesce(p.link_url, '')), '') is null
      and nullif(trim(coalesce(p.image_url, '')), '') is null
      and p.status not in ('scheduled', 'published', 'cancelled')
    on conflict (post_id) do nothing
    returning id
  )
  select count(*) into v_queued from inserted;

  update public.facebook_automation_runs
  set status = 'completed',
      queued_posts = v_queued,
      completed_at = now(),
      updated_at = now()
  where run_key = v_run_key;

  return jsonb_build_object(
    'run_key', v_run_key,
    'target_date', p_target_date,
    'queued_posts', v_queued
  );
exception when others then
  update public.facebook_automation_runs
  set status = 'failed',
      last_error = sqlerrm,
      completed_at = now(),
      updated_at = now()
  where run_key = v_run_key;
  raise;
end;
$$;

create or replace function public.claim_facebook_content_generation_job()
returns setof public.facebook_content_generation_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.facebook_content_generation_queue;
begin
  update public.facebook_content_generation_queue
  set status = 'queued',
      locked_at = null,
      run_after = now(),
      last_error = coalesce(last_error, 'Worker timeout; automatically queued again.'),
      updated_at = now()
  where status = 'processing'
    and locked_at < now() - interval '15 minutes'
    and attempts < max_attempts;

  update public.facebook_content_generation_queue
  set status = 'failed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where status in ('queued', 'processing')
    and attempts >= max_attempts;

  select q.* into v_job
  from public.facebook_content_generation_queue q
  join public.facebook_scheduled_posts p on p.id = q.post_id
  where q.status = 'queued'
    and q.run_after <= now()
    and q.attempts < q.max_attempts
    and p.status not in ('scheduled', 'published', 'cancelled')
    and nullif(trim(coalesce(p.content, '')), '') is null
    and nullif(trim(coalesce(p.link_url, '')), '') is null
    and nullif(trim(coalesce(p.image_url, '')), '') is null
  order by q.run_after, q.created_at
  for update of q skip locked
  limit 1;

  if v_job.id is null then
    return;
  end if;

  update public.facebook_content_generation_queue
  set status = 'processing',
      attempts = attempts + 1,
      locked_at = now(),
      last_error = null,
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  return next v_job;
end;
$$;

revoke all on function public.prepare_facebook_next_week(date) from public;
revoke all on function public.enqueue_facebook_daily_news(date) from public;
revoke all on function public.claim_facebook_content_generation_job() from public;
grant execute on function public.prepare_facebook_next_week(date) to service_role;
grant execute on function public.enqueue_facebook_daily_news(date) to service_role;
grant execute on function public.claim_facebook_content_generation_job() to service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job
    where jobname in (
      'mindup-facebook-prepare-next-week',
      'mindup-facebook-enqueue-daily-news',
      'mindup-facebook-content-worker'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

-- Supabase databases use UTC. 17:00 UTC is 00:00 the following day in Vietnam.
select cron.schedule(
  'mindup-facebook-prepare-next-week',
  '0 17 * * 0',
  $$select public.prepare_facebook_next_week(public.facebook_local_monday());$$
);

select cron.schedule(
  'mindup-facebook-enqueue-daily-news',
  '0 17 * * *',
  $$select public.enqueue_facebook_daily_news(public.facebook_local_today());$$
);

-- The worker only claims one job per invocation. Multiple overlapping invocations remain safe
-- because claim_facebook_content_generation_job uses FOR UPDATE SKIP LOCKED.
select cron.schedule(
  'mindup-facebook-content-worker',
  '* * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'facebook_automation_project_url')
        || '/functions/v1/facebook-content-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'facebook_automation_service_role_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'facebook_automation_service_role_key'),
        'x-automation-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'facebook_automation_shared_secret')
      ),
      body := jsonb_build_object('action', 'process_next'),
      timeout_milliseconds := 120000
    ) as request_id;
  $cron$
);
