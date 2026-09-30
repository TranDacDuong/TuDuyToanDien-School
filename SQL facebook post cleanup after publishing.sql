-- Purge Facebook post content and MindUp Drive media from the day after posting.
-- Safe to run repeatedly.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

alter table public.facebook_scheduled_posts
  add column if not exists cleanup_status text not null default 'pending',
  add column if not exists cleanup_attempts integer not null default 0,
  add column if not exists cleanup_error text,
  add column if not exists drive_cleanup_completed_at timestamptz,
  add column if not exists content_purged_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'facebook_scheduled_posts_cleanup_status_check'
      and conrelid = 'public.facebook_scheduled_posts'::regclass
  ) then
    alter table public.facebook_scheduled_posts
      add constraint facebook_scheduled_posts_cleanup_status_check
      check (cleanup_status in ('pending','processing','done','error'));
  end if;
end;
$$;

create index if not exists facebook_scheduled_posts_cleanup_due_idx
  on public.facebook_scheduled_posts(cleanup_status, scheduled_date)
  where content_purged_at is null;

create or replace function public.claim_facebook_post_cleanup_job()
returns setof public.facebook_scheduled_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.facebook_scheduled_posts;
begin
  update public.facebook_scheduled_posts
  set cleanup_status = 'error',
      cleanup_error = coalesce(cleanup_error, 'Cleanup worker timeout'),
      updated_at = now()
  where cleanup_status = 'processing'
    and updated_at < now() - interval '30 minutes';

  select p.* into v_post
  from public.facebook_scheduled_posts p
  where p.scheduled_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date
    and p.content_purged_at is null
    and p.cleanup_status in ('pending','error')
    and p.cleanup_attempts < 5
  order by p.scheduled_date, p.scheduled_at
  for update skip locked
  limit 1;

  if v_post.id is null then
    return;
  end if;

  update public.facebook_scheduled_posts
  set cleanup_status = 'processing',
      cleanup_attempts = cleanup_attempts + 1,
      cleanup_error = null,
      updated_at = now()
  where id = v_post.id
  returning * into v_post;

  return next v_post;
end;
$$;

revoke all on function public.claim_facebook_post_cleanup_job() from public;
grant execute on function public.claim_facebook_post_cleanup_job() to service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'mindup-facebook-post-cleanup'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

-- 17:05 UTC is 00:05 in Vietnam. Posts dated yesterday or earlier are eligible.
select cron.schedule(
  'mindup-facebook-post-cleanup',
  '5 17 * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'facebook_automation_project_url')
        || '/functions/v1/facebook-post-cleanup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'facebook_automation_service_role_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'facebook_automation_service_role_key'),
        'x-automation-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'facebook_automation_shared_secret')
      ),
      body := jsonb_build_object('action', 'cleanup_due', 'limit', 250),
      timeout_milliseconds := 120000
    ) as request_id;
  $cron$
);
