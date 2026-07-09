-- Add school name to trial lesson requests.
-- Run this once in Supabase SQL editor before using the updated trial student form.

ALTER TABLE public.trial_lesson_requests
ADD COLUMN IF NOT EXISTS school text;
