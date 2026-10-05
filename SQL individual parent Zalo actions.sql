BEGIN;
ALTER TABLE public.zalo_parent_contacts ADD COLUMN IF NOT EXISTS manual_check_requested_at timestamptz;
CREATE OR REPLACE FUNCTION public.request_parent_zalo_action(p_parent_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.zalo_parent_contacts; v_phone text; v_job uuid; v_run uuid;
BEGIN
  IF public.has_app_permission('system.zalo.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'Zalo management permission required';
  END IF;
  IF p_action NOT IN ('check','alias') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid action'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('parent_zalo_action:'||p_parent_id::text));
  SELECT regexp_replace(phone,'[^0-9]','','g') INTO v_phone FROM public.users
    WHERE id=p_parent_id AND role::text='parent';
  IF v_phone IS NULL OR v_phone !~ '^(0[0-9]{9}|84[0-9]{9})$' THEN
    RAISE EXCEPTION 'Phụ huynh thiếu SĐT hợp lệ'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parent_students WHERE parent_id=p_parent_id AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Phụ huynh chưa liên kết học sinh'; END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE role::text='parent' AND id<>p_parent_id
    AND public.canonical_parent_zalo_phone(phone)=public.canonical_parent_zalo_phone(v_phone)) THEN
    RAISE EXCEPTION 'SĐT đang thuộc nhiều tài khoản phụ huynh'; END IF;
  SELECT * INTO c FROM public.zalo_parent_contacts WHERE parent_id=p_parent_id FOR UPDATE;
  IF c.parent_id IS NOT NULL AND public.canonical_parent_zalo_phone(c.phone) IS DISTINCT FROM public.canonical_parent_zalo_phone(v_phone) THEN
    RAISE EXCEPTION 'SĐT đã thay đổi; cần kiểm tra lại liên kết Zalo trước'; END IF;
  IF p_action='check' THEN
    IF c.lease_until>now() OR (c.manual_check_requested_at>COALESCE(c.last_checked_at,'-infinity'::timestamptz)
      AND c.next_check_at<=now()) THEN RETURN jsonb_build_object('already_running',true); END IF;
    INSERT INTO public.zalo_parent_contacts(parent_id,phone,next_check_at,manual_check_requested_at)
      VALUES(p_parent_id,v_phone,now(),now())
    ON CONFLICT (parent_id) DO UPDATE SET next_check_at=now(),manual_check_requested_at=now(),updated_at=now();
    RETURN jsonb_build_object('already_running',false);
  END IF;
  IF c.status IS DISTINCT FROM 'friend' OR nullif(trim(c.zalo_uid),'') IS NULL THEN
    RAISE EXCEPTION 'Cần kết bạn và có UID Zalo trước khi đổi biệt danh'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('zalo_parent_alias_sync'));
  SELECT j.id INTO v_job FROM public.zalo_parent_alias_jobs j JOIN public.zalo_parent_alias_runs r ON r.id=j.run_id
    WHERE j.parent_id=p_parent_id AND j.status IN ('pending','processing') AND r.status='running' LIMIT 1;
  IF v_job IS NOT NULL THEN RETURN jsonb_build_object('already_running',true,'job_id',v_job); END IF;
  INSERT INTO public.zalo_parent_alias_runs(created_by,total) VALUES(auth.uid(),1) RETURNING id INTO v_run;
  INSERT INTO public.zalo_parent_alias_jobs(run_id,parent_id,zalo_uid,phone)
    VALUES(v_run,p_parent_id,c.zalo_uid,c.phone) RETURNING id INTO v_job;
  RETURN jsonb_build_object('already_running',false,'job_id',v_job);
END;
$$;
REVOKE ALL ON FUNCTION public.request_parent_zalo_action(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_parent_zalo_action(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
