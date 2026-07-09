-- Monthly fixed salary + bonus for non-teacher staff.
-- Teachers still use the progressive revenue formula in teacher_salaries.

CREATE TABLE IF NOT EXISTS public.staff_monthly_salaries (
  staff_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  salary_month date NOT NULL,
  base_salary numeric NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
  bonus_amount numeric NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, salary_month)
);

CREATE INDEX IF NOT EXISTS idx_staff_monthly_salaries_month
ON public.staff_monthly_salaries(salary_month);

ALTER TABLE public.staff_monthly_salaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_monthly_salaries_select ON public.staff_monthly_salaries;
CREATE POLICY staff_monthly_salaries_select
ON public.staff_monthly_salaries
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR staff_id = auth.uid()
);

DROP POLICY IF EXISTS staff_monthly_salaries_admin_write ON public.staff_monthly_salaries;
CREATE POLICY staff_monthly_salaries_admin_write
ON public.staff_monthly_salaries
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_monthly_salaries TO authenticated;
