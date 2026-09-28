-- Unified MINDUP bank cash ledger and balance reconciliation.
-- Safe to run more than once.

ALTER TABLE public.bank_transaction_logs
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS signed_amount numeric,
  ADD COLUMN IF NOT EXISTS transaction_at timestamptz,
  ADD COLUMN IF NOT EXISTS accumulative numeric,
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.bank_transaction_logs
SET direction = CASE
  WHEN lower(COALESCE(raw_payload->>'transferType', '')) IN ('out', 'withdraw', 'debit', 'chi') THEN 'out'
  WHEN amount < 0 THEN 'out'
  ELSE 'in'
END
WHERE direction IS NULL;

UPDATE public.bank_transaction_logs
SET signed_amount = CASE WHEN direction = 'out' THEN -abs(amount) ELSE abs(amount) END
WHERE signed_amount IS NULL;

UPDATE public.bank_transaction_logs
SET transaction_at = created_at
WHERE transaction_at IS NULL;

UPDATE public.bank_transaction_logs
SET transaction_at = (raw_payload->>'transactionDate')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
WHERE raw_payload->>'transactionDate' ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}'
  AND entry_source = 'bank';

UPDATE public.bank_transaction_logs
SET account_number = COALESCE(
  NULLIF(raw_payload->>'accountNo', ''),
  NULLIF(raw_payload->>'accountNumber', ''),
  account_number
)
WHERE entry_source = 'bank';

UPDATE public.bank_transaction_logs
SET accumulative = COALESCE(
  CASE WHEN raw_payload->>'accumulative' ~ '^-?\d+(\.\d+)?$' THEN (raw_payload->>'accumulative')::numeric END,
  CASE WHEN raw_payload->>'accumulated' ~ '^-?\d+(\.\d+)?$' THEN (raw_payload->>'accumulated')::numeric END
)
WHERE (
    raw_payload->>'accumulative' ~ '^-?\d+(\.\d+)?$'
    OR raw_payload->>'accumulated' ~ '^-?\d+(\.\d+)?$'
  )
  AND accumulative IS NULL;

ALTER TABLE public.bank_transaction_logs
  ALTER COLUMN direction SET NOT NULL,
  ALTER COLUMN signed_amount SET NOT NULL,
  ALTER COLUMN transaction_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_transaction_logs_direction_check'
  ) THEN
    ALTER TABLE public.bank_transaction_logs
      ADD CONSTRAINT bank_transaction_logs_direction_check CHECK (direction IN ('in', 'out'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_transaction_logs_entry_source_check'
  ) THEN
    ALTER TABLE public.bank_transaction_logs
      ADD CONSTRAINT bank_transaction_logs_entry_source_check
      CHECK (entry_source IN ('bank', 'manual_reconciliation', 'migrated_expense'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bank_transaction_logs_transaction_at_idx
  ON public.bank_transaction_logs (transaction_at DESC);

CREATE INDEX IF NOT EXISTS bank_transaction_logs_account_transaction_idx
  ON public.bank_transaction_logs (account_number, transaction_at DESC);

-- PostgREST upsert and SQL ON CONFLICT need a non-partial unique index.
DROP INDEX IF EXISTS public.bank_tx_logs_gateway_tx_idx;
CREATE UNIQUE INDEX bank_tx_logs_gateway_tx_idx
  ON public.bank_transaction_logs (gateway, transaction_id);

UPDATE public.bank_transaction_logs AS log
SET business_description = format(
  'Học phí của em %s tháng %s năm %s',
  COALESCE(NULLIF(u.full_name, ''), 'học sinh'),
  EXTRACT(MONTH FROM tp.month)::int,
  EXTRACT(YEAR FROM tp.month)::int
)
FROM public.tuition_payments AS tp
LEFT JOIN public.users AS u ON u.id = tp.student_id
WHERE log.matched_tuition_id = tp.id
  AND COALESCE(log.business_description, '') = '';

-- Preserve old operating expenses as outgoing manual ledger entries.
INSERT INTO public.bank_transaction_logs (
  gateway,
  transaction_id,
  account_number,
  amount,
  content,
  raw_payload,
  status,
  direction,
  signed_amount,
  transaction_at,
  accumulative,
  business_description,
  entry_source,
  created_by
)
SELECT
  'manual',
  'expense:' || oe.id::text,
  '104888332556',
  abs(oe.amount),
  COALESCE(NULLIF(oe.title, ''), 'Chi phí vận hành'),
  jsonb_build_object('migrated_from', 'operating_expenses', 'operating_expense_id', oe.id),
  'resolved',
  'out',
  -abs(oe.amount),
  (oe.expense_month::timestamp + time '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
  NULL,
  concat_ws(' - ', NULLIF(oe.title, ''), NULLIF(oe.note, '')),
  'migrated_expense',
  oe.created_by
FROM public.operating_expenses AS oe
ON CONFLICT (gateway, transaction_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bank_balance_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number text NOT NULL DEFAULT '104888332556',
  checked_at timestamptz NOT NULL DEFAULT now(),
  balance numeric NOT NULL,
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_balance_checkpoints_account_time_idx
  ON public.bank_balance_checkpoints (account_number, checked_at DESC);

ALTER TABLE public.bank_balance_checkpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_balance_checkpoints_admin_select ON public.bank_balance_checkpoints;
CREATE POLICY bank_balance_checkpoints_admin_select ON public.bank_balance_checkpoints
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'accountant')
  ));

DROP POLICY IF EXISTS bank_balance_checkpoints_service_role_all ON public.bank_balance_checkpoints;
CREATE POLICY bank_balance_checkpoints_service_role_all ON public.bank_balance_checkpoints
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.create_manual_bank_ledger_entry(
  p_account_number text,
  p_transaction_at timestamptz,
  p_signed_amount numeric,
  p_content text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'Bạn không có quyền bổ sung giao dịch.';
  END IF;
  IF COALESCE(p_signed_amount, 0) = 0 THEN
    RAISE EXCEPTION 'Số tiền phải khác 0.';
  END IF;
  IF length(trim(COALESCE(p_description, ''))) < 3 THEN
    RAISE EXCEPTION 'Vui lòng nhập mô tả chi tiết.';
  END IF;

  INSERT INTO public.bank_transaction_logs (
    id, gateway, transaction_id, account_number, amount, content, raw_payload,
    status, direction, signed_amount, transaction_at, accumulative,
    business_description, entry_source, created_by, updated_at
  ) VALUES (
    v_id,
    'manual',
    'manual:' || v_id::text,
    COALESCE(NULLIF(trim(p_account_number), ''), '104888332556'),
    abs(p_signed_amount),
    trim(COALESCE(p_content, '')),
    jsonb_build_object('created_manually', true),
    'resolved',
    CASE WHEN p_signed_amount < 0 THEN 'out' ELSE 'in' END,
    p_signed_amount,
    COALESCE(p_transaction_at, now()),
    NULL,
    trim(p_description),
    'manual_reconciliation',
    auth.uid(),
    now()
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_bank_ledger_description(
  p_id uuid,
  p_description text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'Bạn không có quyền sửa mô tả.';
  END IF;
  IF length(trim(COALESCE(p_description, ''))) < 3 THEN
    RAISE EXCEPTION 'Vui lòng nhập mô tả chi tiết.';
  END IF;
  UPDATE public.bank_transaction_logs
  SET business_description = trim(p_description), updated_at = now()
  WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy giao dịch.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_manual_bank_ledger_entry(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'Bạn không có quyền xóa giao dịch.';
  END IF;
  DELETE FROM public.bank_transaction_logs
  WHERE id = p_id AND entry_source = 'manual_reconciliation';
  IF NOT FOUND THEN RAISE EXCEPTION 'Chỉ có thể xóa giao dịch bổ sung thủ công.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_bank_balance_checkpoint(
  p_account_number text,
  p_checked_at timestamptz,
  p_balance numeric,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'Bạn không có quyền đối chiếu số dư.';
  END IF;
  INSERT INTO public.bank_balance_checkpoints(account_number, checked_at, balance, note, created_by)
  VALUES (
    COALESCE(NULLIF(trim(p_account_number), ''), '104888332556'),
    COALESCE(p_checked_at, now()),
    p_balance,
    NULLIF(trim(COALESCE(p_note, '')), ''),
    auth.uid()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_bank_ledger_entry(text, timestamptz, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_bank_ledger_description(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_manual_bank_ledger_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_bank_balance_checkpoint(text, timestamptz, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_bank_ledger_entry(text, timestamptz, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_bank_ledger_description(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_manual_bank_ledger_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_bank_balance_checkpoint(text, timestamptz, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
