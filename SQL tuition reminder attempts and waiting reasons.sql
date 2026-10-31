BEGIN;
-- attempt_no is an audit sequence, not the automatic reminder schedule or a retry limit.
ALTER TABLE public.zalo_tuition_deliveries DROP CONSTRAINT IF EXISTS zalo_tuition_deliveries_attempt_no_check;
ALTER TABLE public.zalo_tuition_deliveries ALTER COLUMN attempt_no TYPE integer;
ALTER TABLE public.zalo_tuition_deliveries ADD CONSTRAINT zalo_tuition_deliveries_attempt_no_check CHECK(attempt_no>0);

CREATE OR REPLACE FUNCTION public.list_automatic_tuition_reminders(p_month date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text='admin')
  OR NOT public.has_app_permission('tuition.zalo_queue.manage') THEN RAISE EXCEPTION 'Not authorized'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
  'id',r.id,'parent_id',r.parent_id,'parent_name',p.full_name,'phone',r.phone,'slot',r.slot,'due_date',r.due_date,
  'status',r.status,'completed_parts',jsonb_array_length(r.acknowledgements),'total_parts',jsonb_array_length(r.payload->'parts'),
  'students',(SELECT string_agg(child->>'student_name',', ') FROM jsonb_array_elements(r.payload->'children') child),
  'error_message',r.error_message,'created_at',r.created_at,'updated_at',r.updated_at,
  'waiting_reason',CASE WHEN r.status<>'queued' THEN NULL
   WHEN EXISTS(SELECT 1 FROM public.automatic_tuition_reminders other WHERE other.parent_id=r.parent_id AND other.month=r.month AND other.status='uncertain')
    THEN 'Có lượt gửi trước chưa xác nhận; cần kiểm tra Zalo trước để tránh gửi trùng.'
   WHEN EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries d WHERE d.parent_id=r.parent_id AND d.month=r.month AND d.status IN('queued','processing','not_found','not_friend','invited','greeted','uncertain'))
    THEN 'Đang có lượt học phí thủ công chờ xử lý hoặc chưa xác nhận.'
   WHEN c.zalo_uid IS NULL THEN 'Hệ thống chưa tìm thấy hoặc chưa liên kết Zalo phụ huynh.'
   WHEN c.status='invited' AND c.greeting_sent_at IS NULL THEN 'Đã gửi lời mời kết bạn; hệ thống đang chờ xác nhận kết bạn.'
   WHEN c.status<>'friend' AND c.greeting_sent_at IS NULL THEN coalesce(nullif(c.last_error,''),'Chưa đủ điều kiện nhắn Zalo; cần kiểm tra kết nối với phụ huynh.')
   ELSE NULL END
 ) ORDER BY r.due_date DESC,r.created_at,r.id)
 FROM public.automatic_tuition_reminders r JOIN public.users p ON p.id=r.parent_id
 LEFT JOIN public.zalo_parent_contacts c ON c.parent_id=r.parent_id
 WHERE r.month=date_trunc('month',p_month)::date),'[]'::jsonb);
END;$$;
REVOKE ALL ON FUNCTION public.list_automatic_tuition_reminders(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_automatic_tuition_reminders(date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
