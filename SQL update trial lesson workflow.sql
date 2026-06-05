-- Trial lesson workflow: admin intake, 2 trial sessions, then enroll into class.

ALTER TABLE public.trial_lesson_requests
ADD COLUMN IF NOT EXISTS student_id uuid,
ADD COLUMN IF NOT EXISTS trial_class_id uuid,
ADD COLUMN IF NOT EXISTS trial_schedule_1_id integer,
ADD COLUMN IF NOT EXISTS trial_schedule_2_id integer,
ADD COLUMN IF NOT EXISTS trial_session_1_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS trial_session_2_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS parent_full_name text,
ADD COLUMN IF NOT EXISTS parent_phone text,
ADD COLUMN IF NOT EXISTS note text,
ADD COLUMN IF NOT EXISTS enrolled_at timestamp with time zone;

ALTER TABLE public.trial_lesson_requests
DROP CONSTRAINT IF EXISTS trial_lesson_requests_status_check;

ALTER TABLE public.trial_lesson_requests
ADD CONSTRAINT trial_lesson_requests_status_check
CHECK (
  status IN (
    'new',
    'contacted',
    'pending_schedule',
    'scheduled',
    'trial_1_done',
    'trial_2_done',
    'enrolled',
    'cancelled',
    'closed'
  )
);

ALTER TABLE public.trial_lesson_requests
ALTER COLUMN status SET DEFAULT 'pending_schedule';

UPDATE public.trial_lesson_requests
SET status = 'pending_schedule'
WHERE status IN ('new', 'contacted');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trial_lesson_requests_student_id_fkey'
  ) THEN
    ALTER TABLE public.trial_lesson_requests
      ADD CONSTRAINT trial_lesson_requests_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trial_lesson_requests_trial_class_id_fkey'
  ) THEN
    ALTER TABLE public.trial_lesson_requests
      ADD CONSTRAINT trial_lesson_requests_trial_class_id_fkey
      FOREIGN KEY (trial_class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trial_lesson_requests_schedule_1_fkey'
  ) THEN
    ALTER TABLE public.trial_lesson_requests
      ADD CONSTRAINT trial_lesson_requests_schedule_1_fkey
      FOREIGN KEY (trial_schedule_1_id) REFERENCES public.class_schedules(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trial_lesson_requests_schedule_2_fkey'
  ) THEN
    ALTER TABLE public.trial_lesson_requests
      ADD CONSTRAINT trial_lesson_requests_schedule_2_fkey
      FOREIGN KEY (trial_schedule_2_id) REFERENCES public.class_schedules(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS trial_lesson_requests_trial_class_idx
  ON public.trial_lesson_requests (trial_class_id, status);

CREATE INDEX IF NOT EXISTS trial_lesson_requests_student_idx
  ON public.trial_lesson_requests (student_id, created_at DESC);

DROP POLICY IF EXISTS trial_lesson_requests_delete_policy ON public.trial_lesson_requests;
CREATE POLICY trial_lesson_requests_delete_policy ON public.trial_lesson_requests
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);
