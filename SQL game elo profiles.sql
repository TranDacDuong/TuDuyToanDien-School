CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.game_elo_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  elo integer NOT NULL DEFAULT 1000,
  matches integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  quick_matches integer NOT NULL DEFAULT 0,
  quick_wins integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.game_elo_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  rank_no integer NOT NULL DEFAULT 0,
  elo_before integer NOT NULL,
  elo_delta integer NOT NULL,
  elo_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS game_elo_profiles_elo_idx
  ON public.game_elo_profiles (elo DESC, wins DESC, matches DESC);

CREATE INDEX IF NOT EXISTS game_elo_transactions_user_created_idx
  ON public.game_elo_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS game_elo_transactions_room_idx
  ON public.game_elo_transactions (room_id);

ALTER TABLE public.game_elo_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_elo_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS game_elo_profiles_select_policy ON public.game_elo_profiles;
CREATE POLICY game_elo_profiles_select_policy ON public.game_elo_profiles
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS game_elo_transactions_select_policy ON public.game_elo_transactions;
CREATE POLICY game_elo_transactions_select_policy ON public.game_elo_transactions
FOR SELECT TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.apply_game_elo_transactions(
  p_room_id uuid,
  p_rows jsonb
)
RETURNS TABLE(applied integer, skipped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms%ROWTYPE;
  v_item jsonb;
  v_user_id uuid;
  v_mode text;
  v_score integer;
  v_rank_no integer;
  v_delta integer;
  v_initial_elo integer;
  v_initial_matches integer;
  v_initial_wins integer;
  v_initial_quick_matches integer;
  v_initial_quick_wins integer;
  v_before integer;
  v_after integer;
  v_inserted_id uuid;
BEGIN
  applied := 0;
  skipped := 0;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_room
  FROM public.game_rooms
  WHERE id = p_room_id;

  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF v_room.status <> 'finished' THEN
    RAISE EXCEPTION 'Room is not finished';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.game_room_players p
    WHERE p.room_id = p_room_id
      AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only room players can finalize Elo';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    v_user_id := (v_item->>'user_id')::uuid;
    v_mode := COALESCE(v_item->>'mode', v_room.mode, 'quick');
    v_score := COALESCE((v_item->>'score')::integer, 0);
    v_rank_no := COALESCE((v_item->>'rank_no')::integer, 0);
    v_delta := COALESCE((v_item->>'elo_delta')::integer, 0);
    v_initial_elo := COALESCE((v_item->>'initial_elo')::integer, 1000);
    v_initial_matches := COALESCE((v_item->>'initial_matches')::integer, 0);
    v_initial_wins := COALESCE((v_item->>'initial_wins')::integer, 0);
    v_initial_quick_matches := COALESCE((v_item->>'initial_quick_matches')::integer, 0);
    v_initial_quick_wins := COALESCE((v_item->>'initial_quick_wins')::integer, 0);

    IF NOT EXISTS (
      SELECT 1
      FROM public.game_room_players p
      WHERE p.room_id = p_room_id
        AND p.user_id = v_user_id
    ) THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.game_elo_profiles (
      user_id,
      elo,
      matches,
      wins,
      quick_matches,
      quick_wins
    )
    VALUES (
      v_user_id,
      v_initial_elo,
      v_initial_matches,
      v_initial_wins,
      v_initial_quick_matches,
      v_initial_quick_wins
    )
    ON CONFLICT (user_id) DO NOTHING;

    SELECT elo
    INTO v_before
    FROM public.game_elo_profiles
    WHERE user_id = v_user_id
    FOR UPDATE;

    v_after := v_before + v_delta;
    v_inserted_id := NULL;

    INSERT INTO public.game_elo_transactions (
      room_id,
      user_id,
      mode,
      score,
      rank_no,
      elo_before,
      elo_delta,
      elo_after
    )
    VALUES (
      p_room_id,
      v_user_id,
      v_mode,
      v_score,
      v_rank_no,
      v_before,
      v_delta,
      v_after
    )
    ON CONFLICT (room_id, user_id) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NULL THEN
      skipped := skipped + 1;
    ELSE
      UPDATE public.game_elo_profiles
      SET elo = v_after,
          matches = matches + 1,
          wins = wins + CASE WHEN v_rank_no = 1 AND v_mode <> 'solo' THEN 1 ELSE 0 END,
          quick_matches = quick_matches + CASE WHEN v_mode = 'quick' THEN 1 ELSE 0 END,
          quick_wins = quick_wins + CASE WHEN v_mode = 'quick' AND v_rank_no = 1 THEN 1 ELSE 0 END,
          updated_at = now()
      WHERE user_id = v_user_id;

      applied := applied + 1;
    END IF;
  END LOOP;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_game_elo_transactions(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_game_elo_transactions(uuid, jsonb) TO authenticated;
