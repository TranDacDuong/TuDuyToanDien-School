BEGIN;
CREATE OR REPLACE FUNCTION public.list_automatic_tuition_reminders(p_month date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text='admin')
    OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',r.id,'parent_name',p.full_name,'phone',r.phone,'slot',r.slot,'due_date',r.due_date,
    'status',r.status,'completed_parts',jsonb_array_length(r.acknowledgements),
    'total_parts',jsonb_array_length(r.payload->'parts'),
    'students',(SELECT string_agg(c->>'student_name',', ') FROM jsonb_array_elements(r.payload->'children') c),
    'error_message',r.error_message,'created_at',r.created_at,'updated_at',r.updated_at
  ) ORDER BY r.due_date DESC,r.created_at,r.id)
  FROM public.automatic_tuition_reminders r JOIN public.users p ON p.id=r.parent_id
  WHERE r.month=date_trunc('month',p_month)::date),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_automatic_tuition_reminders(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_automatic_tuition_reminders(date) TO authenticated;
COMMIT;
