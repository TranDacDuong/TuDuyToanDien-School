-- Fix RLS so assistants can use Question Bank.
-- Paste this into Supabase SQL Editor if assistants get:
-- "new row violates row-level security policy for table question_bank"

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS question_bank_staff_select_policy ON public.question_bank;
CREATE POLICY question_bank_staff_select_policy
ON public.question_bank
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS question_bank_staff_insert_policy ON public.question_bank;
CREATE POLICY question_bank_staff_insert_policy
ON public.question_bank
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
  AND (
    created_by IS NULL
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role::text = 'admin'
    )
  )
);

DROP POLICY IF EXISTS question_bank_staff_update_policy ON public.question_bank;
CREATE POLICY question_bank_staff_update_policy
ON public.question_bank
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text = 'admin'
  )
  OR (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role::text IN ('teacher', 'assistant')
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text = 'admin'
  )
  OR (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role::text IN ('teacher', 'assistant')
    )
  )
);

DROP POLICY IF EXISTS question_bank_admin_delete_policy ON public.question_bank;
CREATE POLICY question_bank_admin_delete_policy
ON public.question_bank
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text = 'admin'
  )
);
