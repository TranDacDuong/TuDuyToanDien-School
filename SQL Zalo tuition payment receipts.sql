-- Queue one Zalo acknowledgement for every recorded tuition payment event.
CREATE TABLE IF NOT EXISTS public.zalo_tuition_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  payment_id uuid NOT NULL REFERENCES public.tuition_payments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users(id),
  month date NOT NULL,
  received_amount numeric NOT NULL CHECK (received_amount > 0),
  content text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','failed','uncertain','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zalo_tuition_receipts_claim_idx
  ON public.zalo_tuition_receipts (status, created_at);

ALTER TABLE public.zalo_tuition_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zalo_tuition_receipts FROM anon, authenticated;
GRANT SELECT ON public.zalo_tuition_receipts TO authenticated;

DROP POLICY IF EXISTS zalo_tuition_receipts_finance_read ON public.zalo_tuition_receipts;
CREATE POLICY zalo_tuition_receipts_finance_read ON public.zalo_tuition_receipts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin','accountant')
  ));

CREATE OR REPLACE FUNCTION public.enqueue_zalo_tuition_receipt(
  p_payment_id uuid,
  p_received_amount numeric,
  p_event_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.tuition_payments;
  v_parent uuid;
  v_student_name text;
  v_content text;
  v_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text IN ('admin','accountant')
  ) THEN
    RAISE EXCEPTION 'Tuition admin or accountant required';
  END IF;
  IF p_received_amount IS NULL OR p_received_amount <= 0
    OR nullif(trim(p_event_key), '') IS NULL OR length(p_event_key) > 200 THEN
    RAISE EXCEPTION 'Invalid tuition receipt event';
  END IF;

  SELECT * INTO v_payment FROM public.tuition_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tuition payment not found'; END IF;

  SELECT ps.parent_id INTO v_parent
  FROM public.parent_students ps
  LEFT JOIN public.zalo_parent_contacts zc ON zc.parent_id = ps.parent_id
  WHERE ps.student_id = v_payment.student_id AND ps.revoked_at IS NULL
  ORDER BY
    CASE WHEN zc.status = 'friend' THEN 0
         WHEN zc.greeting_sent_at IS NOT NULL THEN 1
         WHEN zc.zalo_uid IS NOT NULL THEN 2 ELSE 3 END,
    ps.parent_id
  LIMIT 1;
  IF v_parent IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(nullif(trim(full_name), ''), 'học sinh') INTO v_student_name
  FROM public.users WHERE id = v_payment.student_id;

  v_content := 'Trung tâm MindUp xin xác nhận đã nhận được học phí tháng '
    || extract(month FROM v_payment.month)::integer || '/' || extract(year FROM v_payment.month)::integer
    || ' của em ' || v_student_name || ', với số tiền '
    || replace(to_char(round(p_received_amount), 'FM999,999,999,990'), ',', '.') || 'đ.'
    || E'\n\nCảm ơn Quý phụ huynh đã tin tưởng và đồng hành cùng MindUp trong quá trình học tập của em. 💙';

  INSERT INTO public.zalo_tuition_receipts
    (event_key, payment_id, student_id, parent_id, month, received_amount, content)
  VALUES
    (trim(p_event_key), v_payment.id, v_payment.student_id, v_parent,
     v_payment.month, p_received_amount, v_content)
  ON CONFLICT (event_key) DO UPDATE SET event_key = excluded.event_key
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_zalo_tuition_receipt()
RETURNS TABLE(job_id uuid, zalo_uid text, content text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF (SELECT paused FROM public.zalo_automation_state WHERE id = 1) THEN RETURN; END IF;

  UPDATE public.zalo_tuition_receipts SET status = 'uncertain', lease_until = NULL,
    error_message = 'Sender interrupted; check Zalo before another acknowledgement', updated_at = now()
  WHERE status = 'processing' AND lease_until < now();

  RETURN QUERY
  WITH due AS (
    SELECT r.id
    FROM public.zalo_tuition_receipts r
    JOIN public.zalo_parent_contacts c ON c.parent_id = r.parent_id
    JOIN public.users p ON p.id = r.parent_id
    WHERE r.status = 'pending'
      AND c.zalo_uid IS NOT NULL
      AND (c.status = 'friend' OR c.greeting_sent_at IS NOT NULL)
      AND c.phone = regexp_replace(p.phone, '[^0-9]', '', 'g')
      AND EXISTS (
        SELECT 1 FROM public.parent_students ps
        WHERE ps.parent_id = r.parent_id AND ps.student_id = r.student_id
          AND ps.revoked_at IS NULL
      )
    ORDER BY r.created_at
    FOR UPDATE OF r SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE public.zalo_tuition_receipts r
    SET status = 'processing', attempts = attempts + 1,
      lease_until = now() + interval '5 minutes', updated_at = now()
    FROM due WHERE r.id = due.id
    RETURNING r.id, r.parent_id, r.content
  )
  SELECT x.id, c.zalo_uid, x.content
  FROM claimed x JOIN public.zalo_parent_contacts c ON c.parent_id = x.parent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_zalo_tuition_receipt(
  p_job_id uuid,
  p_status text,
  p_error text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_status NOT IN ('sent','failed','uncertain') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.zalo_tuition_receipts
  SET status = p_status,
    sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
    lease_until = NULL, error_message = left(p_error, 500), updated_at = now()
  WHERE id = p_job_id AND status = 'processing';
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_zalo_tuition_receipt(uuid,numeric,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_zalo_tuition_receipt() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_zalo_tuition_receipt(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_zalo_tuition_receipt(uuid,numeric,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_zalo_tuition_receipt() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_zalo_tuition_receipt(uuid,text,text) TO service_role;

UPDATE public.message_templates
SET content = 'Trung tâm MindUp xin xác nhận đã nhận được học phí tháng **{{month_label}}** của em **{{student_name}}**, với số tiền **{{amount}}đ**.

Cảm ơn Quý phụ huynh đã tin tưởng và đồng hành cùng MindUp trong quá trình học tập của em. 💙

__ACTION__{"type":"url","label":"🧾 Xem lịch sử học phí","url":"tuition.html"}',
    updated_at = now()
WHERE id = 'tuition_confirmed';
