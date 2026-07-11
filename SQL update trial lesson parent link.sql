-- Lưu trực tiếp tài khoản phụ huynh đã link vào bản ghi học thử.
-- Giúp danh sách học thử luôn hiện đúng "Đã link" ngay sau khi bấm Lưu học thử.

ALTER TABLE public.trial_lesson_requests
ADD COLUMN IF NOT EXISTS parent_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trial_lesson_requests_parent_id_fkey'
  ) THEN
    ALTER TABLE public.trial_lesson_requests
      ADD CONSTRAINT trial_lesson_requests_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.trial_lesson_requests tr
SET parent_id = ps.parent_id
FROM LATERAL (
  SELECT parent_id
  FROM public.parent_students ps
  WHERE ps.student_id = tr.student_id
    AND ps.revoked_at IS NULL
  ORDER BY ps.updated_at DESC NULLS LAST, ps.created_at DESC NULLS LAST
  LIMIT 1
) ps
WHERE tr.parent_id IS NULL
  AND tr.student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS trial_lesson_requests_parent_idx
  ON public.trial_lesson_requests (parent_id, created_at DESC);
