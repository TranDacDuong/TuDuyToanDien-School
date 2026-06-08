-- Allow the room host to kick players who are not ready in a waiting quick-match room.
-- This is needed because RLS otherwise lets a student delete only their own player row.

ALTER TABLE public.game_room_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS game_room_players_host_kick_unready ON public.game_room_players;

CREATE POLICY game_room_players_host_kick_unready
ON public.game_room_players
FOR DELETE
TO authenticated
USING (
  ready IS NOT TRUE
  AND EXISTS (
    SELECT 1
    FROM public.game_rooms r
    WHERE r.id = game_room_players.room_id
      AND r.mode = 'quick'
      AND r.status = 'waiting'
      AND r.host_id = auth.uid()
      AND game_room_players.user_id <> auth.uid()
  )
);
