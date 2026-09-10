-- Migration: Create staff_bonus_records table for custom monthly bonuses
-- (e.g. Thưởng làm sách, Thưởng tuyển sinh, Thưởng chuyên cần,...)
-- Added directly to monthly salary calculation for teachers and staff.

CREATE TABLE IF NOT EXISTS public.staff_bonus_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bonus_month date NOT NULL, -- Format: YYYY-MM-01
  title text NOT NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by month and user
CREATE INDEX IF NOT EXISTS idx_staff_bonus_records_month_user 
ON public.staff_bonus_records(bonus_month, user_id);

-- Enable RLS
ALTER TABLE public.staff_bonus_records ENABLE ROW LEVEL SECURITY;

-- Select Policy: Admins can view all, users can view their own bonuses
DROP POLICY IF EXISTS staff_bonus_records_select ON public.staff_bonus_records;
CREATE POLICY staff_bonus_records_select
ON public.staff_bonus_records
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR user_id = auth.uid()
);

-- Admin Write Policy: Only admins can insert, update, or delete bonus records
DROP POLICY IF EXISTS staff_bonus_records_admin_write ON public.staff_bonus_records;
CREATE POLICY staff_bonus_records_admin_write
ON public.staff_bonus_records
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_bonus_records TO authenticated;
