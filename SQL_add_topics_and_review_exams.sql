-- 1. Create topics table
CREATE TABLE IF NOT EXISTS public.topics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT topics_pkey PRIMARY KEY (id),
  CONSTRAINT topics_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE
);

-- 2. Add topic_id column to question_bank
ALTER TABLE public.question_bank
ADD COLUMN IF NOT EXISTS topic_id uuid;

ALTER TABLE public.question_bank
DROP CONSTRAINT IF EXISTS question_bank_topic_id_fkey;

ALTER TABLE public.question_bank
ADD CONSTRAINT question_bank_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE SET NULL;

-- 3. Add columns to exams
ALTER TABLE public.exams
ADD COLUMN IF NOT EXISTS topic_id uuid,
ADD COLUMN IF NOT EXISTS is_review_generated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS parent_exam_id uuid,
ADD COLUMN IF NOT EXISTS student_id uuid;

ALTER TABLE public.exams
DROP CONSTRAINT IF EXISTS exams_topic_id_fkey;

ALTER TABLE public.exams
ADD CONSTRAINT exams_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE SET NULL;

ALTER TABLE public.exams
DROP CONSTRAINT IF EXISTS exams_parent_exam_id_fkey;

ALTER TABLE public.exams
ADD CONSTRAINT exams_parent_exam_id_fkey FOREIGN KEY (parent_exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;

ALTER TABLE public.exams
DROP CONSTRAINT IF EXISTS exams_student_id_fkey;

ALTER TABLE public.exams
ADD CONSTRAINT exams_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 4. Enable RLS on topics and create policies
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS topics_select_policy ON public.topics;
CREATE POLICY topics_select_policy ON public.topics
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS topics_admin_policy ON public.topics;
CREATE POLICY topics_admin_policy ON public.topics
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );
