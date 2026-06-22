-- ============================================
-- Add PayOS columns to tuition_payments table
-- Run this in your Supabase SQL Editor.
-- ============================================

ALTER TABLE public.tuition_payments 
  ADD COLUMN IF NOT EXISTS payos_order_code bigint UNIQUE,
  ADD COLUMN IF NOT EXISTS payos_link_id text,
  ADD COLUMN IF NOT EXISTS payos_status text DEFAULT 'PENDING';
