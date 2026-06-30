-- Migration: Create teacher_salaries table
CREATE TABLE IF NOT EXISTS public.teacher_salaries (
  teacher_id uuid NOT NULL,
  base_salary numeric NOT NULL DEFAULT 0,
  base_tier_percent numeric NOT NULL DEFAULT 30,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT teacher_salaries_pkey PRIMARY KEY (teacher_id),
  CONSTRAINT teacher_salaries_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.teacher_salaries ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS teacher_salaries_select ON public.teacher_salaries;
CREATE POLICY teacher_salaries_select ON public.teacher_salaries
  FOR SELECT
  USING (
    teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS teacher_salaries_all_admin ON public.teacher_salaries;
CREATE POLICY teacher_salaries_all_admin ON public.teacher_salaries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Pre-populate salaries for existing teachers with defaults (6M salary, 30% base tier)
INSERT INTO public.teacher_salaries (teacher_id, base_salary, base_tier_percent)
SELECT id, 6000000, 30
FROM public.users
WHERE role IN ('teacher', 'admin')
ON CONFLICT (teacher_id) DO NOTHING;
