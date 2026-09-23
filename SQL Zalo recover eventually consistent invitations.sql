-- Apply after SQL Zalo 24 hour parent checks.sql.
-- Requeue only requests that the Zalo API accepted but did not expose through
-- getFriendRequestStatus quickly enough. The bot always checks the relationship
-- before acting, so this cannot send a duplicate friend request.
UPDATE public.zalo_parent_contacts c
SET status = 'invited',
    invitation_sent_at = COALESCE(c.invitation_sent_at, c.invitation_attempted_at),
    bulk_checked_at = NULL,
    next_check_at = now(),
    lease_until = NULL,
    last_error = NULL,
    updated_at = now()
FROM public.zalo_automation_state s
WHERE s.id = 1
  AND s.bulk_cancelled_at IS NULL
  AND c.bulk_run_id = s.bulk_run_id
  AND c.status = 'error'
  AND c.invitation_attempted_at IS NOT NULL
  AND c.last_error = 'Zalo chưa xác nhận lời mời sau khi API báo gửi; cần kiểm tra thủ công';

-- Older bot versions surfaced lookup misses as generic errors. Keep the reason
-- for operators, but classify them correctly in the progress counters.
UPDATE public.zalo_parent_contacts c
SET status = 'not_found',
    updated_at = now()
FROM public.zalo_automation_state s
WHERE s.id = 1
  AND c.bulk_run_id = s.bulk_run_id
  AND c.status = 'error'
  AND c.last_error IN ('Không tìm thấy', 'User không hợp lệ');
