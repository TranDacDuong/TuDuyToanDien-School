-- ============================================
-- Web Push subscriptions for MindUp PWA
-- Run this in Supabase SQL Editor before enabling push sending.
-- ============================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  expiration_time timestamp with time zone,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_active_idx
  ON public.push_subscriptions (user_id, revoked_at, last_seen_at DESC);

CREATE OR REPLACE FUNCTION public.set_push_subscription_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_push_subscription_updated_at ON public.push_subscriptions;
CREATE TRIGGER set_push_subscription_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_push_subscription_updated_at();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
FOR DELETE
USING (auth.uid() = user_id);

-- Safely lets the current signed-in account claim this browser endpoint.
-- A SECURITY DEFINER function is required because an endpoint may still belong
-- to a previously signed-in account and cannot be reassigned through normal RLS.
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
