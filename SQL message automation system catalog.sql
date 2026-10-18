BEGIN;
-- Keep the existing bot greeting until an administrator explicitly edits it.
INSERT INTO public.message_templates(id,name,content,is_enabled)
VALUES('parent_greeting','Chào phụ huynh sau liên kết','',true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.message_automation_systems()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE templates jsonb; history jsonb;
BEGIN
 IF NOT public.can_manage_message_campaigns() THEN RAISE EXCEPTION 'Không có quyền quản lý tin tự động'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.name),'[]') INTO templates FROM public.message_templates t
 WHERE id IN('tuition_confirmed','absent_notification','session_evaluation_notice','session_score_notice','offline_test_score_notice','exam_score_notice','parent_greeting');
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]') INTO history FROM (
  SELECT o.id,u.full_name AS parent,o.status,o.error_message,o.created_at,o.sent_at,m.content,m.zalo_dispatch_source AS source
  FROM public.zalo_outbox o JOIN public.messages m ON m.id=o.message_id JOIN public.users u ON u.id=o.audience_user_id
  WHERE m.zalo_dispatch_source<>'campaign' AND (m.real_sender_id IS NULL OR m.zalo_dispatch_source IN('tuition','receipt','greeting'))
   AND (public.is_admin_actor() OR (EXISTS(SELECT 1 FROM public.parent_students ps
    JOIN public.class_students cs ON cs.student_id=ps.student_id JOIN public.class_teachers ct ON ct.class_id=cs.class_id
    WHERE ps.parent_id=u.id AND ps.revoked_at IS NULL AND ct.teacher_id=auth.uid()
     AND (cs.left_at IS NULL OR cs.left_at::date>=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))))
  ORDER BY o.created_at DESC LIMIT 100
 ) x;
 RETURN jsonb_build_object('templates',templates,'history',history,'admin',public.is_admin_actor(),
  'tuition',(SELECT jsonb_build_object('paused',paused,'template',notice_template) FROM public.automatic_tuition_control WHERE id=1));
END;$$;

CREATE OR REPLACE FUNCTION public.update_message_automation_system(p_id text,p_content text,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
BEGIN
 IF NOT public.is_admin_actor() THEN RAISE EXCEPTION 'Chỉ admin được sửa thông báo hệ thống'; END IF;
 IF p_enabled IS NULL OR length(coalesce(p_content,''))>10000 THEN RAISE EXCEPTION 'Nội dung không hợp lệ'; END IF;
 IF p_id='tuition' THEN
  PERFORM public.tuition_notice_template(p_content);
  PERFORM public.control_automatic_tuition(CASE WHEN p_enabled THEN 'resume' ELSE 'pause' END);
 ELSIF p_id IN('tuition_confirmed','absent_notification','session_evaluation_notice','session_score_notice','offline_test_score_notice','exam_score_notice','parent_greeting') THEN
  IF p_id='parent_greeting' AND trim(p_content)<>'' THEN PERFORM public.render_message_campaign(p_content,'{}',now()); END IF;
  IF p_id<>'parent_greeting' AND trim(coalesce(p_content,''))='' THEN RAISE EXCEPTION 'Nội dung không được để trống'; END IF;
  UPDATE public.message_templates SET content=p_content,is_enabled=p_enabled,updated_at=now() WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy mẫu hệ thống'; END IF;
 ELSE RAISE EXCEPTION 'Mẫu không hỗ trợ'; END IF;
END;$$;

-- Modify only the service greeting input; retain identity checks and deduplication.
DO $hook$
DECLARE source text; anchor text := 'PERFORM pg_advisory_xact_lock(hashtextextended(p_parent_id::text';
BEGIN
 source:=pg_get_functiondef('public.enqueue_mindup_parent_greeting(uuid,text,text,text)'::regprocedure);
 IF position('parent_greeting_template' IN source)=0 THEN
  IF position(anchor IN source)=0 THEN RAISE EXCEPTION 'Unexpected greeting function'; END IF;
  source:=replace(source,anchor,$patch$
  -- parent_greeting_template: empty means preserve the existing bot variants.
  IF EXISTS(SELECT 1 FROM public.message_templates WHERE id='parent_greeting' AND NOT is_enabled) THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM public.message_templates WHERE id='parent_greeting' AND trim(content)<>'') THEN
   p_content:=public.render_message_campaign((SELECT content FROM public.message_templates WHERE id='parent_greeting'),
    jsonb_build_object('parent_name',(SELECT full_name FROM public.users WHERE id=p_parent_id),
     'students',(SELECT string_agg(DISTINCT u.full_name,' và ' ORDER BY u.full_name) FROM public.parent_students ps JOIN public.users u ON u.id=ps.student_id WHERE ps.parent_id=p_parent_id AND ps.revoked_at IS NULL),
     'classes',''),now());
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_parent_id::text$patch$);
  EXECUTE source;
 END IF;
END;$hook$;
REVOKE ALL ON FUNCTION public.message_automation_systems(),public.update_message_automation_system(text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.message_automation_systems(),public.update_message_automation_system(text,text,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
