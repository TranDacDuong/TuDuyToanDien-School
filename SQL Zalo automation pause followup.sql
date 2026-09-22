-- Apply after SQL Zalo parent tuition automation.sql.
CREATE OR REPLACE FUNCTION public.pause_zalo_parent_automation(p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  UPDATE public.zalo_automation_state SET paused = true,
    reason = left(COALESCE(p_reason, 'Zalo temporarily limited sending'), 500),
    updated_at = now()
  WHERE id = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.pause_zalo_parent_automation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pause_zalo_parent_automation(text) TO service_role;
