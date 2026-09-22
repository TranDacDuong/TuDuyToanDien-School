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
