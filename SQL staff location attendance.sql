-- Staff location attendance for MindUp.
-- Paste this whole file into Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.staff_attendance_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_meters integer NOT NULL DEFAULT 200 CHECK (radius_meters > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.staff_attendance_locations(id) ON DELETE SET NULL,
  check_type text NOT NULL CHECK (check_type IN ('check_in', 'check_out')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_meters double precision,
  distance_meters double precision,
  is_valid boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('valid', 'outside_range', 'low_accuracy', 'location_denied', 'manual_review', 'pending')),
  note text,
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_attendance_logs_user_day_idx
  ON public.staff_attendance_logs (user_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS staff_attendance_logs_location_day_idx
  ON public.staff_attendance_logs (location_id, checked_at DESC);

ALTER TABLE public.staff_attendance_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_mindup_staff_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.role IN ('admin', 'teacher', 'assistant', 'marketing', 'accountant')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_mindup_admin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.role = 'admin'
  );
$$;

DROP POLICY IF EXISTS staff_attendance_locations_staff_select ON public.staff_attendance_locations;
CREATE POLICY staff_attendance_locations_staff_select
ON public.staff_attendance_locations
FOR SELECT
TO authenticated
USING (public.is_mindup_staff_user(auth.uid()));

DROP POLICY IF EXISTS staff_attendance_locations_admin_all ON public.staff_attendance_locations;
CREATE POLICY staff_attendance_locations_admin_all
ON public.staff_attendance_locations
FOR ALL
TO authenticated
USING (public.is_mindup_admin_user(auth.uid()))
WITH CHECK (public.is_mindup_admin_user(auth.uid()));

DROP POLICY IF EXISTS staff_attendance_logs_staff_select_own ON public.staff_attendance_logs;
CREATE POLICY staff_attendance_logs_staff_select_own
ON public.staff_attendance_logs
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_mindup_admin_user(auth.uid())
);

DROP POLICY IF EXISTS staff_attendance_logs_staff_insert_own ON public.staff_attendance_logs;
CREATE POLICY staff_attendance_logs_staff_insert_own
ON public.staff_attendance_logs
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_mindup_staff_user(auth.uid())
);

DROP POLICY IF EXISTS staff_attendance_logs_admin_update ON public.staff_attendance_logs;
CREATE POLICY staff_attendance_logs_admin_update
ON public.staff_attendance_logs
FOR UPDATE
TO authenticated
USING (public.is_mindup_admin_user(auth.uid()))
WITH CHECK (public.is_mindup_admin_user(auth.uid()));

CREATE OR REPLACE FUNCTION public.staff_attendance_distance_meters(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 6371000 * 2 * asin(
    sqrt(
      power(sin(radians((p_lat2 - p_lat1) / 2)), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians((p_lng2 - p_lng1) / 2)), 2)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.touch_staff_attendance_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_staff_attendance_locations_updated_at ON public.staff_attendance_locations;
CREATE TRIGGER touch_staff_attendance_locations_updated_at
BEFORE UPDATE ON public.staff_attendance_locations
FOR EACH ROW
EXECUTE FUNCTION public.touch_staff_attendance_updated_at();

DROP TRIGGER IF EXISTS touch_staff_attendance_logs_updated_at ON public.staff_attendance_logs;
CREATE TRIGGER touch_staff_attendance_logs_updated_at
BEFORE UPDATE ON public.staff_attendance_logs
FOR EACH ROW
EXECUTE FUNCTION public.touch_staff_attendance_updated_at();

INSERT INTO public.staff_attendance_locations (
  name,
  address,
  latitude,
  longitude,
  radius_meters,
  is_active
)
SELECT
  'MindUp - Tư Duy Toàn Diện',
  'Số 124 phố Chùa Quỳnh, Phường Bạch Mai, thành phố Hà Nội',
  20.9999701,
  105.8576233,
  200,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.staff_attendance_locations
  WHERE name = 'MindUp - Tư Duy Toàn Diện'
);

CREATE OR REPLACE FUNCTION public.mark_staff_attendance(
  p_check_type text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_device_info jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  location_id uuid,
  check_type text,
  checked_at timestamptz,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  distance_meters double precision,
  is_valid boolean,
  status text,
  note text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_location public.staff_attendance_locations%ROWTYPE;
  v_distance double precision;
  v_status text;
  v_is_valid boolean;
  v_log public.staff_attendance_logs%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để điểm danh.';
  END IF;

  IF NOT public.is_mindup_staff_user(v_user_id) THEN
    RAISE EXCEPTION 'Chỉ nhân viên MindUp mới được điểm danh.';
  END IF;

  IF p_check_type NOT IN ('check_in', 'check_out') THEN
    RAISE EXCEPTION 'Loại điểm danh không hợp lệ.';
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'Chưa có tọa độ vị trí để điểm danh.';
  END IF;

  SELECT *
  INTO v_location
  FROM public.staff_attendance_locations
  WHERE is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_location.id IS NULL THEN
    RAISE EXCEPTION 'Chưa cấu hình địa điểm điểm danh.';
  END IF;

  v_distance := public.staff_attendance_distance_meters(
    v_location.latitude,
    v_location.longitude,
    p_latitude,
    p_longitude
  );

  IF p_accuracy_meters IS NOT NULL AND p_accuracy_meters > 300 THEN
    v_status := 'low_accuracy';
    v_is_valid := false;
  ELSIF v_distance < v_location.radius_meters THEN
    v_status := 'valid';
    v_is_valid := true;
  ELSE
    v_status := 'outside_range';
    v_is_valid := false;
  END IF;

  INSERT INTO public.staff_attendance_logs (
    user_id,
    location_id,
    check_type,
    latitude,
    longitude,
    accuracy_meters,
    distance_meters,
    is_valid,
    status,
    note,
    device_info
  )
  VALUES (
    v_user_id,
    v_location.id,
    p_check_type,
    p_latitude,
    p_longitude,
    p_accuracy_meters,
    v_distance,
    v_is_valid,
    v_status,
    NULLIF(trim(coalesce(p_note, '')), ''),
    coalesce(p_device_info, '{}'::jsonb)
  )
  RETURNING * INTO v_log;

  RETURN QUERY
  SELECT
    v_log.id,
    v_log.user_id,
    v_log.location_id,
    v_log.check_type,
    v_log.checked_at,
    v_log.latitude,
    v_log.longitude,
    v_log.accuracy_meters,
    v_log.distance_meters,
    v_log.is_valid,
    v_log.status,
    v_log.note;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_staff_attendance(text, double precision, double precision, double precision, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_attendance_distance_meters(double precision, double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mindup_staff_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mindup_admin_user(uuid) TO authenticated;
