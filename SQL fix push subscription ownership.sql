-- Allow the currently signed-in account to claim this browser's push endpoint.
-- This fixes RLS failures when the same browser/device was previously used by another account.

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_my_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time timestamp with time zone DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_subscription_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(trim(p_endpoint), '') IS NULL
     OR NULLIF(trim(p_p256dh), '') IS NULL
     OR NULLIF(trim(p_auth), '') IS NULL THEN
    RAISE EXCEPTION 'Push subscription is incomplete';
  END IF;

  INSERT INTO public.push_subscriptions (
    user_id, endpoint, p256dh, auth, expiration_time, user_agent, revoked_at, last_seen_at
  ) VALUES (
    v_user_id, p_endpoint, p_p256dh, p_auth, p_expiration_time, p_user_agent, NULL, now()
  )
  ON CONFLICT (endpoint) DO UPDATE SET
    user_id = v_user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    expiration_time = EXCLUDED.expiration_time,
    user_agent = EXCLUDED.user_agent,
    revoked_at = NULL,
    last_seen_at = now(),
    updated_at = now()
  RETURNING id INTO v_subscription_id;

  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_push_subscription(text, text, text, timestamp with time zone, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_my_push_subscription(text, text, text, timestamp with time zone, text) TO authenticated;

COMMIT;
