-- Apply after SQL Zalo parent bulk run.sql.
-- Keep the existing idempotency and delivery updates; only spread the next daily check across all hours.
CREATE OR REPLACE FUNCTION public.finish_zalo_parent_check(
  p_parent_id uuid, p_phone text, p_uid text, p_status text,
  p_invited boolean DEFAULT false, p_greeted boolean DEFAULT false, p_error text DEFAULT NULL,
  p_invite_attempted boolean DEFAULT false, p_greeting_attempted boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_status NOT IN ('friend','invited','not_friend','not_found','rate_limited','error') THEN
    RAISE EXCEPTION 'Invalid contact status';
  END IF;
  UPDATE public.zalo_parent_contacts c SET
    zalo_uid = CASE WHEN p_status = 'not_found' THEN NULL ELSE COALESCE(nullif(p_uid,''), c.zalo_uid) END,
    status = CASE
      WHEN p_status = 'friend' THEN 'friend'
      WHEN p_status = 'invited' OR p_invited OR c.invitation_sent_at IS NOT NULL THEN 'invited'
      ELSE p_status END,
    invitation_attempted_at = CASE WHEN p_invite_attempted THEN COALESCE(c.invitation_attempted_at, now()) ELSE c.invitation_attempted_at END,
    invitation_sent_at = CASE WHEN p_invited THEN COALESCE(c.invitation_sent_at, now()) ELSE c.invitation_sent_at END,
    greeting_attempted_at = CASE WHEN p_greeting_attempted THEN COALESCE(c.greeting_attempted_at, now()) ELSE c.greeting_attempted_at END,
    greeting_sent_at = CASE WHEN p_greeted THEN COALESCE(c.greeting_sent_at, now()) ELSE c.greeting_sent_at END,
    last_checked_at = now(), lease_until = NULL,
    next_check_at = now() + interval '1 day' + make_interval(secs => floor(random() * 21600)::int),
    last_error = CASE
      WHEN p_status <> 'friend' AND (p_status = 'invited' OR p_invited OR c.invitation_sent_at IS NOT NULL)
        THEN NULL ELSE left(p_error,500) END,
    updated_at = now()
  WHERE c.parent_id = p_parent_id AND c.phone = p_phone AND c.lease_until IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact check lease not found'; END IF;
  UPDATE public.zalo_tuition_deliveries d SET
    status = CASE WHEN p_status = 'not_found' THEN 'not_found'
      WHEN p_status = 'friend' THEN 'queued'
      WHEN p_greeted OR EXISTS (SELECT 1 FROM public.zalo_parent_contacts c
        WHERE c.parent_id = p_parent_id AND c.greeting_sent_at IS NOT NULL) THEN 'greeted'
      WHEN p_status = 'invited' THEN 'invited' ELSE 'not_friend' END,
    invitation_at = COALESCE(d.invitation_at, (SELECT invitation_sent_at FROM public.zalo_parent_contacts WHERE parent_id = p_parent_id)),
    greeting_at = COALESCE(d.greeting_at, (SELECT greeting_sent_at FROM public.zalo_parent_contacts WHERE parent_id = p_parent_id)),
    updated_at = now()
  WHERE d.parent_id = p_parent_id AND d.status IN ('queued','not_found','not_friend','invited','greeted');
  IF p_status = 'rate_limited' THEN
    UPDATE public.zalo_automation_state SET paused = true,
      reason = left(COALESCE(p_error,'Zalo limited contact lookup'),500), updated_at = now() WHERE id = 1;
  END IF;
END;
$$;
