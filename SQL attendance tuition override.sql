BEGIN;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS status_overridden boolean NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
COMMIT;
