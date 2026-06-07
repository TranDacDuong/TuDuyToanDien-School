-- Fix required columns for playable MindUp rounds.
-- Run this in Supabase SQL Editor if entering a MindUp round fails.

ALTER TABLE public.game_rooms
ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'quick';

ALTER TABLE public.game_rooms
ADD COLUMN IF NOT EXISTS round_retry boolean NOT NULL DEFAULT false;

ALTER TABLE public.game_rooms
ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES public.game_rounds(id) ON DELETE SET NULL;

ALTER TABLE public.game_rooms
DROP CONSTRAINT IF EXISTS game_rooms_mode_check;

ALTER TABLE public.game_rooms
ADD CONSTRAINT game_rooms_mode_check
CHECK (mode IN ('quick', 'friends', 'ranked', 'survival', 'speed', 'solo', 'round'));

ALTER TABLE public.game_room_questions
ADD COLUMN IF NOT EXISTS challenge_type text
  CHECK (challenge_type IS NULL OR challenge_type IN ('warmup', 'obstacle', 'acceleration', 'finish'));

ALTER TABLE public.game_room_questions
ADD COLUMN IF NOT EXISTS finish_level text
  CHECK (finish_level IS NULL OR finish_level IN ('easy', 'medium', 'hard'));

CREATE INDEX IF NOT EXISTS game_rooms_round_id_idx
  ON public.game_rooms(round_id);
