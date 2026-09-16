-- ============================================================
-- SQL SCRIPT: Tạo bảng quản lý Zalo Bot Nhắc Học Phí (Anti-ban)
-- Thực thi file này trong Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Bảng cấu hình Zalo Bot & Tham số chống chặn (Anti-Ban)
CREATE TABLE IF NOT EXISTS public.zalo_bot_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    is_active BOOLEAN DEFAULT true,
    min_delay_seconds INT DEFAULT 45,          -- Giãn cách tối thiểu giữa 2 tin (giây)
    max_delay_seconds INT DEFAULT 90,          -- Giãn cách tối đa giữa 2 tin (giây)
    batch_size INT DEFAULT 50,                 -- Số tin tối đa trong 1 mẻ
    batch_pause_minutes INT DEFAULT 30,        -- Thời gian nghỉ giữa các mẻ (phút)
    message_template TEXT DEFAULT 'Trung tâm MindUp xin chào Quý phụ huynh em {TenHS}! 🌸

Trung tâm xin gửi thông báo chi tiết học phí tháng {Thang}/{Nam} của con như sau:
• Lớp học: {TenLop}
• Số buổi học trong tháng: {SoBuoi} buổi
• Số tiền cần thanh toán: {SoTien} VNĐ
• Hạn thanh toán: Trước ngày {HanDong}

Quý phụ huynh có thể thanh toán nhanh bằng cách quét ảnh mã QR đính kèm hoặc chuyển khoản theo thông tin:
• Ngân hàng: {TenNganHang}
• Số tài khoản: {SoTaiKhoan}
• Nội dung chuyển khoản: {NoiDungCK}

(Lưu ý: Quý phụ huynh vui lòng giữ nguyên nội dung chuyển khoản trên để hệ thống tự động gạch nợ ngay khi nhận được tiền).
Trung tâm MindUp xin chân thành cảm ơn Quý phụ huynh! ❤️',
    bank_name TEXT DEFAULT 'VietinBank',
    bank_account_no TEXT DEFAULT '105870682948',
    bot_status TEXT DEFAULT 'disconnected',    -- 'disconnected', 'qr_ready', 'connected'
    bot_phone TEXT,
    bot_name TEXT,
    last_heartbeat TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Khởi tạo bản ghi cấu hình mặc định nếu chưa có
INSERT INTO public.zalo_bot_config (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- 2. Bảng Hàng đợi Tin nhắn Zalo (Zalo Messages Queue)
CREATE TABLE IF NOT EXISTS public.zalo_messages_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_ym TEXT NOT NULL,                  -- Ví dụ: '2026-09'
    student_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    parent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    parent_name TEXT,
    phone TEXT NOT NULL,                       -- Số điện thoại Zalo của phụ huynh
    class_name TEXT,
    sessions_count INT DEFAULT 0,
    amount NUMERIC(12, 2) NOT NULL,
    transfer_memo TEXT NOT NULL,               -- SEVQR HP0926 Dac Duong 5267
    message_text TEXT NOT NULL,
    qr_url TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled', 'skipped', 'friend_requested')),
    is_friend BOOLEAN DEFAULT false,           -- Đã là bạn bè Zalo hay chưa
    note TEXT,                                 -- Ghi chú (ví dụ: Chưa kết bạn - Cần gọi điện trực tiếp)
    error_message TEXT,
    attempts INT DEFAULT 0,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Cập nhật cột note và check constraint nếu bảng đã tồn tại từ trước
ALTER TABLE public.zalo_messages_queue ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.zalo_messages_queue DROP CONSTRAINT IF EXISTS zalo_messages_queue_status_check;
ALTER TABLE public.zalo_messages_queue ADD CONSTRAINT zalo_messages_queue_status_check
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled', 'skipped', 'friend_requested'));

-- 3. Đánh index để truy vấn hàng đợi siêu nhanh
CREATE INDEX IF NOT EXISTS idx_zalo_queue_status ON public.zalo_messages_queue (status, created_at);
CREATE INDEX IF NOT EXISTS idx_zalo_queue_campaign ON public.zalo_messages_queue (campaign_ym, student_id);
CREATE INDEX IF NOT EXISTS idx_zalo_queue_phone ON public.zalo_messages_queue (phone);

-- 4. Bật Row Level Security (RLS)
ALTER TABLE public.zalo_bot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_messages_queue ENABLE ROW LEVEL SECURITY;

-- 5. Policies cho Admin / Quản trị viên
DROP POLICY IF EXISTS "Admin manage zalo_bot_config" ON public.zalo_bot_config;
CREATE POLICY "Admin manage zalo_bot_config"
    ON public.zalo_bot_config
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role::text = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role::text = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admin manage zalo_messages_queue" ON public.zalo_messages_queue;
CREATE POLICY "Admin manage zalo_messages_queue"
    ON public.zalo_messages_queue
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role::text = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role::text = 'admin'
        )
    );

-- Cho phép Service Role / Anon bot cục bộ đọc ghi cấu hình & hàng đợi
DROP POLICY IF EXISTS "Anon public access to queue for local bot" ON public.zalo_messages_queue;
CREATE POLICY "Anon public access to queue for local bot"
    ON public.zalo_messages_queue
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Anon public access to config for local bot" ON public.zalo_bot_config;
CREATE POLICY "Anon public access to config for local bot"
    ON public.zalo_bot_config
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
