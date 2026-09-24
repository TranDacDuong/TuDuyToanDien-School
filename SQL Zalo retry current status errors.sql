-- Apply after SQL Zalo skip connected parents in bulk run.sql.
-- Retry only current-run errors. If a request was previously sent, preserve
-- that known state so a transient Zalo lookup error cannot erase it again.
UPDATE public.zalo_parent_contacts c
SET status = CASE WHEN c.invitation_sent_at IS NOT NULL THEN 'invited' ELSE c.status END,
    bulk_checked_at = NULL,
    next_check_at = now(),
    lease_until = NULL,
    updated_at = now()
FROM public.zalo_automation_state s
WHERE s.id = 1
  AND s.bulk_cancelled_at IS NULL
  AND c.bulk_run_id = s.bulk_run_id
  AND c.status = 'error'
  AND c.lease_until IS NULL;
