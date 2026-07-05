-- Final cleanup: remove "Chương" from the database after code has moved fully to "Chủ đề".
-- Prerequisite: run "SQL migrate topics to subjects step 1.sql" first and verify Topics all have subject_id.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.topics WHERE subject_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot drop chapters: some topics still have subject_id IS NULL.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chapters'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.chapters;
  END IF;
END $$;

ALTER TABLE public.topics
DROP CONSTRAINT IF EXISTS topics_chapter_id_fkey;

ALTER TABLE public.topics
DROP COLUMN IF EXISTS chapter_id;

ALTER TABLE public.question_bank
DROP CONSTRAINT IF EXISTS question_bank_chapter_id_fkey;

ALTER TABLE public.question_bank
DROP COLUMN IF EXISTS chapter_id;

DROP TABLE IF EXISTS public.chapters CASCADE;
