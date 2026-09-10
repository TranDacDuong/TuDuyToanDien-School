-- ====================================================================
-- HƯỚNG DẪN CẤU HÌNH & SQL CHO CỔNG THANH TOÁN PAYOS WEBHOOK
-- ====================================================================

-- 1. Đảm bảo bảng tuition_payments có Unique Index (student_id, month)
CREATE UNIQUE INDEX IF NOT EXISTS tuition_payments_student_month_unique 
  ON public.tuition_payments (student_id, month);

-- 2. Đảm bảo bảng bank_transaction_logs ghi nhận gateway 'payos'
-- Cột gateway trong bank_transaction_logs là kiểu text nên tự động chấp nhận 'payos', 'sepay', 'casso'.
-- Tạo index giúp tìm kiếm đối soát theo gateway và transaction_id nhanh chóng:
CREATE INDEX IF NOT EXISTS bank_tx_logs_gateway_tx_idx
  ON public.bank_transaction_logs (gateway, transaction_id);

-- 3. HƯỚNG DẪN CẤU HÌNH PAYOS WEBHOOK:
-- Bước 3.1: Truy cập https://payos.vn/ -> Kênh thanh toán -> Webhook
--           Điền URL: https://lgydjaaqfxqzgbdpqvkp.supabase.co/functions/v1/tuition-bank-webhook
--           Bấm "Xác nhận Webhook" (Hệ thống trả về HTTP 200 OK).

-- Bước 3.2: Lấy thông số Checksum Key trên PayOS Dashboard và cấu hình vào Supabase Secrets:
--           Vào Supabase Dashboard -> Project Settings -> Edge Functions -> Secrets
--           Thêm Secret:
--           Name: PAYOS_CHECKSUM_KEY
--           Value: <Mã Checksum Key trên PayOS của bạn>
--
--           (Tùy chọn thêm PAYOS_CLIENT_ID và PAYOS_API_KEY nếu sử dụng các tính năng tạo link nâng cao).
