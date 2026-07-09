-- Operating expenses for admin income calculation
CREATE TABLE IF NOT EXISTS public.operating_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_month date NOT NULL,
  title text NOT NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operating_expenses_month_idx
  ON public.operating_expenses (expense_month);

ALTER TABLE public.operating_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operating_expenses_admin_select ON public.operating_expenses;
CREATE POLICY operating_expenses_admin_select
ON public.operating_expenses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
  )
);

DROP POLICY IF EXISTS operating_expenses_admin_write ON public.operating_expenses;
CREATE POLICY operating_expenses_admin_write
ON public.operating_expenses
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
  )
);
