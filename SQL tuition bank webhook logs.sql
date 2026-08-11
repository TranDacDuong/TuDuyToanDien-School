-- SQL Khởi tạo Bảng Lịch sử Giao dịch Ngân hàng & Cập nhật Cột cho Bảng tuition_payments
-- Phục vụ tính năng Tự động Gạch nợ Học phí qua Bank Transfer Webhook (SePay / Casso / Bank Gateway).

CREATE TABLE IF NOT EXISTS public.bank_transaction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL DEFAULT 'sepay', -- 'sepay', 'casso', 'custom_bank'
  transaction_id text,
  account_number text,
  amount numeric NOT NULL DEFAULT 0,
  content text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_tuition_id uuid REFERENCES public.tuition_payments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'unmatched', 'failed', 'duplicate')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Bổ sung các cột phục vụ gạch nợ tự động vào tuition_payments
ALTER TABLE public.tuition_payments
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS transaction_ref text,
  ADD COLUMN IF NOT EXISTS auto_reconciled boolean DEFAULT false;

-- Index giúp tìm kiếm đối soát nhanh chóng
CREATE INDEX IF NOT EXISTS bank_tx_logs_gateway_tx_idx
  ON public.bank_transaction_logs (gateway, transaction_id);

CREATE INDEX IF NOT EXISTS tuition_payments_auto_reconciled_idx
  ON public.tuition_payments (auto_reconciled, paid_at DESC);

-- Bật Row Level Security (RLS)
ALTER TABLE public.bank_transaction_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_tx_logs_admin_select ON public.bank_transaction_logs;
CREATE POLICY bank_tx_logs_admin_select ON public.bank_transaction_logs
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'accountant'))
);

DROP POLICY IF EXISTS bank_tx_logs_service_role_all ON public.bank_transaction_logs;
CREATE POLICY bank_tx_logs_service_role_all ON public.bank_transaction_logs
FOR ALL TO service_role USING (true) WITH CHECK (true);
