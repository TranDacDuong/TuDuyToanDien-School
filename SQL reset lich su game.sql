-- RESET TOÀN BỘ LỊCH SỬ GAME
-- Chạy file này trong Supabase SQL Editor.
--
-- Sẽ xóa:
--   - Tất cả phòng/trận đã tạo (kể cả đang chờ hoặc đang chơi)
--   - Người chơi, câu hỏi trong trận và câu trả lời của các trận đó
--   - Toàn bộ giao dịch Elo và bảng điểm Elo hiện tại
--
-- Không xóa:
--   - Cấu hình Chơi đơn / Đấu nhanh
--   - Đấu đỉnh cao, các thử thách và danh sách câu hỏi
--   - Ngân hàng câu hỏi, tài khoản người dùng

BEGIN;

DELETE FROM public.game_elo_transactions;
DELETE FROM public.game_elo_profiles;

-- Các bảng game_room_players, game_room_questions và game_room_answers
-- được xóa theo ON DELETE CASCADE.
DELETE FROM public.game_rooms;

COMMIT;

