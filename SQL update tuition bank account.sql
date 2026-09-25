ALTER TABLE public.zalo_bot_config
  ALTER COLUMN bank_name SET DEFAULT 'VietinBank',
  ALTER COLUMN bank_account_no SET DEFAULT '104888332556';

UPDATE public.zalo_bot_config
SET bank_name = 'VietinBank',
    bank_account_no = '104888332556',
    updated_at = now()
WHERE id = 'default';
