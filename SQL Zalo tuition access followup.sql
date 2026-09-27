-- Apply after SQL Zalo parent tuition automation.sql.
DROP POLICY zalo_parent_contacts_staff_read ON public.zalo_parent_contacts;
DROP POLICY zalo_tuition_deliveries_staff_read ON public.zalo_tuition_deliveries;
DROP POLICY zalo_automation_state_staff_read ON public.zalo_automation_state;

CREATE POLICY zalo_parent_contacts_finance_read ON public.zalo_parent_contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role::text IN ('admin','accountant')));
CREATE POLICY zalo_tuition_deliveries_finance_read ON public.zalo_tuition_deliveries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role::text IN ('admin','accountant')));
CREATE POLICY zalo_automation_state_finance_read ON public.zalo_automation_state FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role::text IN ('admin','accountant')));

REVOKE ALL ON FUNCTION public.queue_zalo_tuition_deliveries(text,jsonb) FROM PUBLIC, authenticated;
CREATE OR REPLACE FUNCTION public.queue_zalo_tuition_deliveries_v2(p_month text, p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role::text IN ('admin','accountant')) THEN
    RAISE EXCEPTION 'Tuition admin or accountant required';
  END IF;
  RETURN public.queue_zalo_tuition_deliveries(p_month, p_items);
END;
$$;
REVOKE ALL ON FUNCTION public.queue_zalo_tuition_deliveries_v2(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_zalo_tuition_deliveries_v2(text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_zalo_tuition_deliveries_v2(p_month text, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month date; v_cancelled integer := 0; v_processing integer := 0; v_queued integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role::text IN ('admin','accountant')) THEN
    RAISE EXCEPTION 'Tuition admin or accountant required';
  END IF;
  IF p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'Invalid month or batch size';
  END IF;
  v_month := (p_month || '-01')::date;
  DELETE FROM public.zalo_tuition_deliveries
  WHERE month = v_month
    AND status IN ('queued','not_found','not_friend','invited','greeted');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  SELECT count(*) INTO v_processing FROM public.zalo_tuition_deliveries
    WHERE month = v_month AND status = 'processing';
  v_queued := public.queue_zalo_tuition_deliveries(p_month, p_items);
  RETURN jsonb_build_object('queued', v_queued, 'cancelled', v_cancelled,
    'processing', v_processing);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_zalo_tuition_deliveries_v2(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_zalo_tuition_deliveries_v2(text,jsonb) TO authenticated;
