ALTER TABLE public.trial_lesson_requests
ADD COLUMN IF NOT EXISTS teacher_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trial_lesson_requests_teacher_id_fkey'
  ) THEN
    ALTER TABLE public.trial_lesson_requests
      ADD CONSTRAINT trial_lesson_requests_teacher_id_fkey
      FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS trial_lesson_requests_teacher_created_idx
  ON public.trial_lesson_requests (teacher_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
