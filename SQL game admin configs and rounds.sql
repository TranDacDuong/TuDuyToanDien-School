-- MindUp Game admin configuration and round system.
-- Run this in Supabase before using the new Game admin screen.

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS grade_id uuid REFERENCES public.grades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_grade_id_idx ON public.users(grade_id);

ALTER TABLE public.game_rooms
ADD COLUMN IF NOT EXISTS game_config_id uuid;

CREATE TABLE IF NOT EXISTS public.game_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('solo', 'quick')),
  title text NOT NULL,
  grade_id uuid NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  question_count integer NOT NULL DEFAULT 5 CHECK (question_count > 0),
  time_per_question integer NOT NULL DEFAULT 20 CHECK (time_per_question >= 5),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_configs_lookup_idx
  ON public.game_configs(mode, grade_id, subject_id, status);

CREATE TABLE IF NOT EXISTS public.game_config_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.game_configs(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  order_no integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(config_id, question_id),
  UNIQUE(config_id, order_no)
);

CREATE TABLE IF NOT EXISTS public.game_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  grade_id uuid NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  round_no integer NOT NULL DEFAULT 1,
  pass_score integer NOT NULL DEFAULT 300,
  retry_penalty integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_rounds_lookup_idx
  ON public.game_rounds(grade_id, subject_id, status, round_no);

CREATE TABLE IF NOT EXISTS public.game_round_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.game_rounds(id) ON DELETE CASCADE,
  challenge_type text NOT NULL CHECK (challenge_type IN ('warmup', 'obstacle', 'acceleration', 'finish')),
  title text NOT NULL,
  order_no integer NOT NULL,
  time_limit_seconds integer,
  question_limit integer,
  keyword_answer text,
  keyword_hint text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(round_id, challenge_type),
  UNIQUE(round_id, order_no)
);

CREATE TABLE IF NOT EXISTS public.game_round_challenge_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.game_round_challenges(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  order_no integer NOT NULL DEFAULT 1,
  finish_level text CHECK (finish_level IS NULL OR finish_level IN ('easy', 'medium', 'hard')),
  obstacle_key text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(challenge_id, question_id),
  UNIQUE(challenge_id, order_no)
);

ALTER TABLE public.game_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_config_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_round_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_round_challenge_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS game_configs_staff_manage ON public.game_configs;
CREATE POLICY game_configs_staff_manage ON public.game_configs
FOR ALL
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

DROP POLICY IF EXISTS game_config_questions_staff_manage ON public.game_config_questions;
CREATE POLICY game_config_questions_staff_manage ON public.game_config_questions
FOR ALL
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

DROP POLICY IF EXISTS game_rounds_staff_manage ON public.game_rounds;
CREATE POLICY game_rounds_staff_manage ON public.game_rounds
FOR ALL
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

DROP POLICY IF EXISTS game_round_challenges_staff_manage ON public.game_round_challenges;
CREATE POLICY game_round_challenges_staff_manage ON public.game_round_challenges
FOR ALL
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

DROP POLICY IF EXISTS game_round_challenge_questions_staff_manage ON public.game_round_challenge_questions;
CREATE POLICY game_round_challenge_questions_staff_manage ON public.game_round_challenge_questions
FOR ALL
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

DROP POLICY IF EXISTS game_configs_student_read_active ON public.game_configs;
CREATE POLICY game_configs_student_read_active ON public.game_configs
FOR SELECT
USING (
  status = 'active'
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.grade_id = game_configs.grade_id)
);

DROP POLICY IF EXISTS game_config_questions_student_read_active ON public.game_config_questions;
CREATE POLICY game_config_questions_student_read_active ON public.game_config_questions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.game_configs cfg
    JOIN public.users u ON u.id = auth.uid()
    WHERE cfg.id = game_config_questions.config_id
      AND cfg.status = 'active'
      AND u.grade_id = cfg.grade_id
  )
);

DROP POLICY IF EXISTS game_rounds_student_read_active ON public.game_rounds;
CREATE POLICY game_rounds_student_read_active ON public.game_rounds
FOR SELECT
USING (
  status = 'active'
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.grade_id = game_rounds.grade_id)
);

DROP POLICY IF EXISTS game_round_challenges_student_read_active ON public.game_round_challenges;
CREATE POLICY game_round_challenges_student_read_active ON public.game_round_challenges
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.game_rounds r
    JOIN public.users u ON u.id = auth.uid()
    WHERE r.id = game_round_challenges.round_id
      AND r.status = 'active'
      AND u.grade_id = r.grade_id
  )
);

DROP POLICY IF EXISTS game_round_challenge_questions_student_read_active ON public.game_round_challenge_questions;
CREATE POLICY game_round_challenge_questions_student_read_active ON public.game_round_challenge_questions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.game_round_challenges c
    JOIN public.game_rounds r ON r.id = c.round_id
    JOIN public.users u ON u.id = auth.uid()
    WHERE c.id = game_round_challenge_questions.challenge_id
      AND r.status = 'active'
      AND u.grade_id = r.grade_id
  )
);
