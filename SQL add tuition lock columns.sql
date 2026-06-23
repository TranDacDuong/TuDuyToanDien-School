-- ============================================================
-- Migration: Thêm cột chốt học phí vào bảng tuition_payments
-- Chạy script này trên Supabase Dashboard → SQL Editor
-- An toàn: chỉ ADD COLUMN IF NOT EXISTS, không mất dữ liệu cũ
-- ============================================================

ALTER TABLE public.tuition_payments
  ADD COLUMN IF NOT EXISTS locked_at       timestamp with time zone,
  ADD COLUMN IF NOT EXISTS locked_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_snapshot jsonb;

-- Index để tra cứu nhanh các tháng đã chốt
CREATE INDEX IF NOT EXISTS tuition_payments_locked_idx
  ON public.tuition_payments (month, locked_at)
  WHERE locked_at IS NOT NULL;
