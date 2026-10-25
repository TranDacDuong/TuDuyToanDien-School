-- Include laptop-scheduled tuition notices in the existing admin-only queue view.
CREATE OR REPLACE FUNCTION public.list_mindup_zalo_dispatch_jobs()
RETURNS TABLE(id uuid,kind text,parent_name text,student_name text,content text,status text,error_message text,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.is_admin_actor() IS NOT TRUE THEN RAISE EXCEPTION 'Admin required'; END IF;
  RETURN QUERY SELECT j.id,j.kind,COALESCE(c.zalo_alias,u.full_name),s.full_name,j.content,j.status,j.error_message,j.created_at
    FROM (
      SELECT o.id,'web'::text kind,o.audience_user_id parent_id,m.context_student_id student_id,o.content,o.status,o.error_message,o.created_at
        FROM public.zalo_outbox o JOIN public.messages m ON m.id=o.message_id
      UNION ALL SELECT r.id,'receipt',r.parent_id,r.student_id,r.content,r.status,r.error_message,r.created_at FROM public.zalo_tuition_receipts r
      UNION ALL SELECT d.id,'tuition',d.parent_id,d.student_id,d.content,d.status,d.error_message,d.created_at FROM public.zalo_tuition_deliveries d
      UNION ALL SELECT a.id,'automatic_tuition',a.parent_id,NULL::uuid,a.payload->>'content',a.status,a.error_message,a.created_at FROM public.automatic_tuition_reminders a
    ) j JOIN public.users u ON u.id=j.parent_id LEFT JOIN public.users s ON s.id=j.student_id
      LEFT JOIN public.zalo_parent_contacts c ON c.parent_id=j.parent_id
    ORDER BY CASE WHEN j.status IN ('pending','processing','queued','not_found','not_friend','invited','greeted') THEN 0
      WHEN j.status IN ('failed','uncertain') THEN 1 ELSE 2 END,j.created_at DESC LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION public.list_mindup_zalo_dispatch_jobs() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_mindup_zalo_dispatch_jobs() TO authenticated;
NOTIFY pgrst,'reload schema';
