-- Add parent contact fields for trial lesson requests.

ALTER TABLE public.trial_lesson_requests
ADD COLUMN IF NOT EXISTS parent_full_name text,
ADD COLUMN IF NOT EXISTS parent_phone text;

