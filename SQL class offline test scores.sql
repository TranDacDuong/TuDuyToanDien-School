-- Điểm đề kiểm tra offline theo lớp.
-- Loại điểm này tách riêng khỏi class_session_scores (BTVN/Đề luyện tập theo từng buổi).

CREATE TABLE IF NOT EXISTS public.class_offline_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  test_date date NOT NULL DEFAULT CURRENT_DATE,
  max_score numeric NOT NULL DEFAULT 10 CHECK (max_score > 0),
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.class_offline_test_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.class_offline_tests(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score numeric NOT NULL CHECK (score >= 0),
  max_score numeric NOT NULL DEFAULT 10 CHECK (max_score > 0),
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_offline_test_scores_unique UNIQUE (test_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_class_offline_tests_class_date
  ON public.class_offline_tests(class_id, test_date DESC);

CREATE INDEX IF NOT EXISTS idx_class_offline_scores_student
  ON public.class_offline_test_scores(student_id, created_at);

CREATE INDEX IF NOT EXISTS idx_class_offline_scores_test
  ON public.class_offline_test_scores(test_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_class_offline_tests_updated_at ON public.class_offline_tests;
CREATE TRIGGER touch_class_offline_tests_updated_at
BEFORE UPDATE ON public.class_offline_tests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_class_offline_scores_updated_at ON public.class_offline_test_scores;
CREATE TRIGGER touch_class_offline_scores_updated_at
BEFORE UPDATE ON public.class_offline_test_scores
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.class_offline_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_offline_test_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_offline_tests_select_policy ON public.class_offline_tests;
CREATE POLICY class_offline_tests_select_policy
ON public.class_offline_tests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
  OR EXISTS (
    SELECT 1
    FROM public.class_offline_test_scores s
    WHERE s.test_id = class_offline_tests.id
      AND s.student_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.class_offline_test_scores s
    JOIN public.parent_students ps
      ON ps.student_id = s.student_id
     AND ps.revoked_at IS NULL
    WHERE s.test_id = class_offline_tests.id
      AND ps.parent_id = auth.uid()
  )
);

DROP POLICY IF EXISTS class_offline_tests_insert_policy ON public.class_offline_tests;
CREATE POLICY class_offline_tests_insert_policy
ON public.class_offline_tests
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_offline_tests_update_policy ON public.class_offline_tests;
CREATE POLICY class_offline_tests_update_policy
ON public.class_offline_tests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_offline_tests_delete_policy ON public.class_offline_tests;
CREATE POLICY class_offline_tests_delete_policy
ON public.class_offline_tests
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_offline_scores_select_policy ON public.class_offline_test_scores;
CREATE POLICY class_offline_scores_select_policy
ON public.class_offline_test_scores
FOR SELECT
TO authenticated
USING (
  student_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.parent_students ps
    WHERE ps.parent_id = auth.uid()
      AND ps.student_id = class_offline_test_scores.student_id
      AND ps.revoked_at IS NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_offline_scores_insert_policy ON public.class_offline_test_scores;
CREATE POLICY class_offline_scores_insert_policy
ON public.class_offline_test_scores
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_offline_scores_update_policy ON public.class_offline_test_scores;
CREATE POLICY class_offline_scores_update_policy
ON public.class_offline_test_scores
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);

DROP POLICY IF EXISTS class_offline_scores_delete_policy ON public.class_offline_test_scores;
CREATE POLICY class_offline_scores_delete_policy
ON public.class_offline_test_scores
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  )
);
