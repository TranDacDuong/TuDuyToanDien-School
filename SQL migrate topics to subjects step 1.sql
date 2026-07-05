-- Step 1: Move "Chủ đề" to belong directly to "Môn học" while keeping old chapter data for rollback.
-- Run this before deploying the code that removes the Chapter selector from question flows.

ALTER TABLE public.topics
ADD COLUMN IF NOT EXISTS subject_id uuid;

ALTER TABLE public.topics
ALTER COLUMN chapter_id DROP NOT NULL;

ALTER TABLE public.question_bank
ALTER COLUMN chapter_id DROP NOT NULL;

UPDATE public.topics t
SET subject_id = c.subject_id
FROM public.chapters c
WHERE t.chapter_id = c.id
  AND t.subject_id IS NULL;

ALTER TABLE public.topics
DROP CONSTRAINT IF EXISTS topics_subject_id_fkey;

ALTER TABLE public.topics
ADD CONSTRAINT topics_subject_id_fkey
FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_topics_subject_id ON public.topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_question_bank_topic_id ON public.question_bank(topic_id);

-- Keep chapter_id and the chapters table in this step.
-- After all screens use topic_id/subject_id safely, run a later cleanup migration to drop chapter_id/chapters.
