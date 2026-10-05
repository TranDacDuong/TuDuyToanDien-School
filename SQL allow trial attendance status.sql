BEGIN;
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('present','absent','makeup','trial'));
NOTIFY pgrst,'reload schema';
COMMIT;
