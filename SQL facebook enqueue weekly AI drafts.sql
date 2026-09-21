-- Queue current-week Facebook drafts from the UI without keeping the browser open.

create or replace function public.enqueue_facebook_week_content(
  p_page_id text,
  p_week_start date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_week_start date := public.facebook_local_monday(p_week_start);
  v_week_end date := public.facebook_local_monday(p_week_start) + 6;
  v_batch_id uuid := gen_random_uuid();
  v_eligible integer := 0;
  v_enqueued integer := 0;
  v_pending integer := 0;
begin
  if v_user_id is null then
    raise exception 'Bạn cần đăng nhập để tạo nội dung tuần.';
  end if;

  select u.role::text into v_user_role
  from public.users u
  where u.id = v_user_id;

  if coalesce(v_user_role, '') not in ('admin', 'assistant', 'teacher', 'marketing', 'accountant') then
    raise exception 'Tài khoản này chưa có quyền tạo nội dung Facebook.';
  end if;

  if nullif(trim(coalesce(p_page_id, '')), '') is null then
    raise exception 'Thiếu fanpage cần tạo nội dung.';
  end if;

  select count(*) into v_eligible
  from public.facebook_scheduled_posts p
  left join public.facebook_post_types pt on pt.id = p.post_type_id
  where p.page_id = p_page_id
    and p.scheduled_date between v_week_start and v_week_end
    and p.status not in ('scheduled', 'published', 'cancelled')
    and lower(trim(coalesce(pt.name, ''))) not in ('problem', 'tin tức', 'tin tuc', 'news')
    and nullif(trim(coalesce(p.content, '')), '') is null
    and nullif(trim(coalesce(p.link_url, '')), '') is null
    and nullif(trim(coalesce(p.image_url, '')), '') is null;

  with eligible as (
    select p.id
    from public.facebook_scheduled_posts p
    left join public.facebook_post_types pt on pt.id = p.post_type_id
    where p.page_id = p_page_id
      and p.scheduled_date between v_week_start and v_week_end
      and p.status not in ('scheduled', 'published', 'cancelled')
      and lower(trim(coalesce(pt.name, ''))) not in ('problem', 'tin tức', 'tin tuc', 'news')
      and nullif(trim(coalesce(p.content, '')), '') is null
      and nullif(trim(coalesce(p.link_url, '')), '') is null
      and nullif(trim(coalesce(p.image_url, '')), '') is null
  ), changed as (
    insert into public.facebook_content_generation_queue (
      post_id,
      job_kind,
      provider,
      status,
      attempts,
      run_after,
      locked_at,
      completed_at,
      last_error,
      metadata
    )
    select
      e.id,
      'weekly',
      'gemini',
      'queued',
      0,
      now(),
      null,
      null,
      null,
      jsonb_build_object(
        'source', 'manual_week_button',
        'batch_id', v_batch_id,
        'requested_by', v_user_id,
        'page_id', p_page_id,
        'week_start', v_week_start,
        'queued_at', now()
      )
    from eligible e
    on conflict (post_id) do update
      set job_kind = 'weekly',
          provider = 'gemini',
          status = 'queued',
          attempts = 0,
          run_after = now(),
          locked_at = null,
          completed_at = null,
          last_error = null,
          metadata = public.facebook_content_generation_queue.metadata || excluded.metadata,
          updated_at = now()
      where public.facebook_content_generation_queue.status in ('completed', 'failed')
    returning post_id
  )
  select count(*) into v_enqueued from changed;

  update public.facebook_scheduled_posts p
  set ai_status = 'generating',
      ai_error = null,
      updated_at = now()
  where p.page_id = p_page_id
    and p.scheduled_date between v_week_start and v_week_end
    and coalesce((
      select lower(trim(pt.name))
      from public.facebook_post_types pt
      where pt.id = p.post_type_id
    ), '') not in ('problem', 'tin tức', 'tin tuc', 'news')
    and exists (
      select 1
      from public.facebook_content_generation_queue q
      where q.post_id = p.id
        and q.status in ('queued', 'processing')
    )
    and p.status not in ('scheduled', 'published', 'cancelled')
    and nullif(trim(coalesce(p.content, '')), '') is null
    and nullif(trim(coalesce(p.link_url, '')), '') is null
    and nullif(trim(coalesce(p.image_url, '')), '') is null;

  select count(*) into v_pending
  from public.facebook_content_generation_queue q
  join public.facebook_scheduled_posts p on p.id = q.post_id
  left join public.facebook_post_types pt on pt.id = p.post_type_id
  where p.page_id = p_page_id
    and p.scheduled_date between v_week_start and v_week_end
    and q.status in ('queued', 'processing')
    and p.status not in ('scheduled', 'published', 'cancelled')
    and lower(trim(coalesce(pt.name, ''))) not in ('problem', 'tin tức', 'tin tuc', 'news')
    and nullif(trim(coalesce(p.content, '')), '') is null
    and nullif(trim(coalesce(p.link_url, '')), '') is null
    and nullif(trim(coalesce(p.image_url, '')), '') is null;

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_batch_id,
    'page_id', p_page_id,
    'week_start', v_week_start,
    'week_end', v_week_end,
    'eligible_posts', v_eligible,
    'newly_enqueued_posts', v_enqueued,
    'pending_posts', v_pending,
    'news_deferred_to_publish_day', true
  );
end;
$$;

revoke all on function public.enqueue_facebook_week_content(text, date) from public;
grant execute on function public.enqueue_facebook_week_content(text, date) to authenticated;
grant execute on function public.enqueue_facebook_week_content(text, date) to service_role;
