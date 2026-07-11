-- ============================================
-- Track student/parent mobile app login + notification status
-- Paste this into Supabase SQL Editor.
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_mobile_app_status (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_mobile boolean NOT NULL DEFAULT false,
  is_standalone_app boolean NOT NULL DEFAULT false,
  platform text,
  notification_permission text NOT NULL DEFAULT 'unsupported',
  has_push_subscription boolean NOT NULL DEFAULT false,
  push_endpoint text,
  user_agent text,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  first_mobile_seen_at timestamp with time zone,
  last_mobile_seen_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_mobile_app_status_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_mobile_app_status_notification_permission_chk
    CHECK (notification_permission IN ('granted', 'denied', 'default', 'unsupported'))
);

CREATE INDEX IF NOT EXISTS user_mobile_app_status_last_mobile_idx
  ON public.user_mobile_app_status (last_mobile_seen_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.set_user_mobile_app_status_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_user_mobile_app_status_updated_at ON public.user_mobile_app_status;
CREATE TRIGGER set_user_mobile_app_status_updated_at
BEFORE UPDATE ON public.user_mobile_app_status
FOR EACH ROW
EXECUTE FUNCTION public.set_user_mobile_app_status_updated_at();

ALTER TABLE public.user_mobile_app_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_mobile_app_status_select_own ON public.user_mobile_app_status;
CREATE POLICY user_mobile_app_status_select_own ON public.user_mobile_app_status
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_mobile_app_status_select_admin ON public.user_mobile_app_status;
CREATE POLICY user_mobile_app_status_select_admin ON public.user_mobile_app_status
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
  )
);

DROP POLICY IF EXISTS user_mobile_app_status_insert_own ON public.user_mobile_app_status;
CREATE POLICY user_mobile_app_status_insert_own ON public.user_mobile_app_status
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_mobile_app_status_update_own ON public.user_mobile_app_status;
CREATE POLICY user_mobile_app_status_update_own ON public.user_mobile_app_status
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.upsert_my_mobile_app_status(
  p_is_mobile boolean DEFAULT false,
  p_is_standalone_app boolean DEFAULT false,
  p_platform text DEFAULT NULL,
  p_notification_permission text DEFAULT 'unsupported',
  p_push_endpoint text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS public.user_mobile_app_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_permission text := lower(coalesce(nullif(trim(p_notification_permission), ''), 'unsupported'));
  v_row public.user_mobile_app_status;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_permission NOT IN ('granted', 'denied', 'default', 'unsupported') THEN
    v_permission := 'unsupported';
  END IF;

  INSERT INTO public.user_mobile_app_status AS current_status (
    user_id,
    is_mobile,
    is_standalone_app,
    platform,
    notification_permission,
    has_push_subscription,
    push_endpoint,
    user_agent,
    first_mobile_seen_at,
    last_mobile_seen_at,
    last_seen_at
  ) VALUES (
    v_user_id,
    coalesce(p_is_mobile, false),
    coalesce(p_is_standalone_app, false),
    nullif(trim(p_platform), ''),
    v_permission,
    v_permission = 'granted' AND nullif(trim(coalesce(p_push_endpoint, '')), '') IS NOT NULL,
    nullif(trim(p_push_endpoint), ''),
    nullif(p_user_agent, ''),
    CASE WHEN coalesce(p_is_mobile, false) THEN now() ELSE NULL END,
    CASE WHEN coalesce(p_is_mobile, false) THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    is_mobile = coalesce(p_is_mobile, false),
    is_standalone_app = coalesce(p_is_standalone_app, false),
    platform = coalesce(nullif(trim(p_platform), ''), current_status.platform),
    notification_permission = v_permission,
    has_push_subscription = v_permission = 'granted'
      AND nullif(trim(coalesce(p_push_endpoint, current_status.push_endpoint, '')), '') IS NOT NULL,
    push_endpoint = coalesce(nullif(trim(p_push_endpoint), ''), current_status.push_endpoint),
    user_agent = coalesce(nullif(p_user_agent, ''), current_status.user_agent),
    first_mobile_seen_at = CASE
      WHEN coalesce(p_is_mobile, false)
        THEN coalesce(current_status.first_mobile_seen_at, now())
      ELSE current_status.first_mobile_seen_at
    END,
    last_mobile_seen_at = CASE
      WHEN coalesce(p_is_mobile, false) THEN now()
      ELSE current_status.last_mobile_seen_at
    END,
    last_seen_at = now(),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_mobile_app_status(boolean, boolean, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_my_mobile_app_status(boolean, boolean, text, text, text, text) TO authenticated;
