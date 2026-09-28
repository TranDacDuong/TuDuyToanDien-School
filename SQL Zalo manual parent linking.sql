-- Link a parent to the current private Zalo conversation by a command sent by MindUp.
-- The phone identifies the internal parent only; the Zalo UID comes from the conversation.

ALTER TABLE public.zalo_verified_links
  ALTER COLUMN verified_by DROP NOT NULL;
ALTER TABLE public.zalo_verified_links
  ADD COLUMN IF NOT EXISTS verification_source text NOT NULL DEFAULT 'admin';
ALTER TABLE public.zalo_verified_links
  DROP CONSTRAINT IF EXISTS zalo_verified_links_verification_source_check;
ALTER TABLE public.zalo_verified_links
  ADD CONSTRAINT zalo_verified_links_verification_source_check
  CHECK (verification_source IN ('admin', 'zalo_self_command'));

ALTER TABLE public.zalo_parent_contacts
  ADD COLUMN IF NOT EXISTS link_source text,
  ADD COLUMN IF NOT EXISTS linked_at timestamptz,
  ADD COLUMN IF NOT EXISTS zalo_alias text,
  ADD COLUMN IF NOT EXISTS alias_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS alias_error text;

CREATE TABLE IF NOT EXISTS public.zalo_parent_link_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  zalo_uid text NOT NULL,
  phone text NOT NULL,
  parent_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('linked', 'already_linked', 'rejected')),
  result jsonb NOT NULL,
  alias text,
  alias_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zalo_parent_link_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zalo_parent_link_commands FROM anon, authenticated;
GRANT SELECT ON public.zalo_parent_link_commands TO authenticated;
DROP POLICY IF EXISTS zalo_parent_link_commands_admin_read ON public.zalo_parent_link_commands;
CREATE POLICY zalo_parent_link_commands_admin_read ON public.zalo_parent_link_commands
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin'));

CREATE OR REPLACE FUNCTION public.link_zalo_parent_from_command(
  p_external_id text, p_phone text, p_zalo_uid text, p_is_friend boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_digits text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  v_canonical_phone text;
  v_parent_id uuid;
  v_parent_name text;
  v_stored_phone text;
  v_parent_count integer;
  v_conflict uuid;
  v_student_names jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF nullif(trim(p_external_id), '') IS NULL OR length(p_external_id) > 220
    OR nullif(trim(p_zalo_uid), '') IS NULL OR length(p_zalo_uid) > 100 THEN
    RAISE EXCEPTION 'Invalid link command identity';
  END IF;

  SELECT result INTO v_result FROM public.zalo_parent_link_commands
  WHERE external_id = p_external_id;
  IF FOUND THEN RETURN v_result; END IF;

  IF v_digits ~ '^0[0-9]{9}$' THEN
    v_canonical_phone := '84' || substr(v_digits, 2);
  ELSIF v_digits ~ '^84[0-9]{9}$' THEN
    v_canonical_phone := v_digits;
  ELSE
    v_result := jsonb_build_object('status','rejected','message','Số điện thoại phụ huynh không hợp lệ');
    INSERT INTO public.zalo_parent_link_commands(external_id,zalo_uid,phone,status,result)
    VALUES (p_external_id,p_zalo_uid,v_digits,'rejected',v_result);
    RETURN v_result;
  END IF;

  IF NOT COALESCE(p_is_friend, false) THEN
    v_result := jsonb_build_object('status','rejected','message','Tài khoản Zalo chưa kết bạn với trung tâm');
    INSERT INTO public.zalo_parent_link_commands(external_id,zalo_uid,phone,status,result)
    VALUES (p_external_id,p_zalo_uid,v_digits,'rejected',v_result);
    RETURN v_result;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_canonical_phone || ':' || p_zalo_uid, 0));
  SELECT count(*) INTO v_parent_count
  FROM public.users u
  WHERE u.role::text = 'parent'
    AND CASE
      WHEN regexp_replace(u.phone, '[^0-9]', '', 'g') ~ '^0[0-9]{9}$'
        THEN '84' || substr(regexp_replace(u.phone, '[^0-9]', '', 'g'), 2)
      WHEN regexp_replace(u.phone, '[^0-9]', '', 'g') ~ '^84[0-9]{9}$'
        THEN regexp_replace(u.phone, '[^0-9]', '', 'g')
      ELSE NULL END = v_canonical_phone;

  IF v_parent_count = 0 THEN
    v_result := jsonb_build_object('status','rejected','message','Không tìm thấy tài khoản phụ huynh có số điện thoại này');
    INSERT INTO public.zalo_parent_link_commands(external_id,zalo_uid,phone,status,result)
    VALUES (p_external_id,p_zalo_uid,v_digits,'rejected',v_result);
    RETURN v_result;
  ELSIF v_parent_count > 1 THEN
    v_result := jsonb_build_object('status','rejected','message','Số điện thoại đang thuộc nhiều tài khoản phụ huynh');
    INSERT INTO public.zalo_parent_link_commands(external_id,zalo_uid,phone,status,result)
    VALUES (p_external_id,p_zalo_uid,v_digits,'rejected',v_result);
    RETURN v_result;
  END IF;

  SELECT u.id, u.full_name, regexp_replace(u.phone, '[^0-9]', '', 'g')
    INTO v_parent_id, v_parent_name, v_stored_phone
  FROM public.users u
  WHERE u.role::text = 'parent'
    AND CASE
      WHEN regexp_replace(u.phone, '[^0-9]', '', 'g') ~ '^0[0-9]{9}$'
        THEN '84' || substr(regexp_replace(u.phone, '[^0-9]', '', 'g'), 2)
      WHEN regexp_replace(u.phone, '[^0-9]', '', 'g') ~ '^84[0-9]{9}$'
        THEN regexp_replace(u.phone, '[^0-9]', '', 'g')
      ELSE NULL END = v_canonical_phone
  LIMIT 1;

  SELECT audience_user_id INTO v_conflict FROM public.zalo_verified_links
  WHERE zalo_uid = p_zalo_uid AND audience_user_id <> v_parent_id LIMIT 1;
  IF v_conflict IS NULL THEN
    SELECT parent_id INTO v_conflict FROM public.zalo_parent_contacts
    WHERE zalo_uid = p_zalo_uid AND parent_id <> v_parent_id LIMIT 1;
  END IF;
  IF v_conflict IS NOT NULL THEN
    v_result := jsonb_build_object('status','rejected','message','Tài khoản Zalo này đã liên kết với phụ huynh khác');
    INSERT INTO public.zalo_parent_link_commands(external_id,zalo_uid,phone,parent_id,status,result)
    VALUES (p_external_id,p_zalo_uid,v_digits,v_parent_id,'rejected',v_result);
    RETURN v_result;
  END IF;

  IF EXISTS (SELECT 1 FROM public.zalo_verified_links
      WHERE audience_user_id = v_parent_id AND zalo_uid <> p_zalo_uid AND enabled)
    OR EXISTS (SELECT 1 FROM public.zalo_parent_contacts
      WHERE parent_id = v_parent_id AND zalo_uid IS NOT NULL AND zalo_uid <> p_zalo_uid) THEN
    v_result := jsonb_build_object('status','rejected','message','Phụ huynh đã liên kết với một tài khoản Zalo khác');
    INSERT INTO public.zalo_parent_link_commands(external_id,zalo_uid,phone,parent_id,status,result)
    VALUES (p_external_id,p_zalo_uid,v_digits,v_parent_id,'rejected',v_result);
    RETURN v_result;
  END IF;

  SELECT COALESCE(jsonb_agg(s.full_name ORDER BY s.full_name), '[]'::jsonb)
    INTO v_student_names
  FROM public.parent_students ps
  JOIN public.users s ON s.id = ps.student_id
  WHERE ps.parent_id = v_parent_id AND ps.revoked_at IS NULL;

  INSERT INTO public.zalo_verified_links
    (audience_user_id,zalo_uid,verified_by,verified_at,enabled,verification_source)
  VALUES (v_parent_id,p_zalo_uid,NULL,now(),true,'zalo_self_command')
  ON CONFLICT (audience_user_id) DO UPDATE SET
    zalo_uid = excluded.zalo_uid, verified_by = NULL, verified_at = now(),
    enabled = true, verification_source = 'zalo_self_command';

  INSERT INTO public.zalo_parent_contacts
    (parent_id,phone,zalo_uid,status,last_checked_at,next_check_at,last_error,
      lease_until,link_source,linked_at)
  VALUES (v_parent_id,v_stored_phone,p_zalo_uid,'friend',now(),now() + interval '30 days',NULL,
    NULL,'zalo_self_command',now())
  ON CONFLICT (parent_id) DO UPDATE SET
    phone = excluded.phone, zalo_uid = excluded.zalo_uid, status = 'friend',
    last_checked_at = now(), next_check_at = now() + interval '30 days',
    last_error = NULL, lease_until = NULL, link_source = 'zalo_self_command', linked_at = now(),
    updated_at = now();

  UPDATE public.zalo_unmatched_inbox SET resolved_at = now()
  WHERE zalo_uid = p_zalo_uid AND resolved_at IS NULL;

  v_result := jsonb_build_object(
    'status', CASE WHEN EXISTS (SELECT 1 FROM public.zalo_parent_link_commands
      WHERE parent_id = v_parent_id AND status IN ('linked','already_linked'))
      THEN 'already_linked' ELSE 'linked' END,
    'parent_id',v_parent_id,'parent_name',v_parent_name,'phone',v_stored_phone,
    'zalo_uid',p_zalo_uid,'student_names',v_student_names
  );
  INSERT INTO public.zalo_parent_link_commands(external_id,zalo_uid,phone,parent_id,status,result)
  VALUES (p_external_id,p_zalo_uid,v_digits,v_parent_id,v_result->>'status',v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_zalo_parent_alias(
  p_external_id text, p_alias text, p_error text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_parent_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  SELECT parent_id INTO v_parent_id FROM public.zalo_parent_link_commands
  WHERE external_id = p_external_id;
  IF v_parent_id IS NULL THEN RAISE EXCEPTION 'Link command not found'; END IF;
  UPDATE public.zalo_parent_link_commands SET alias = nullif(trim(p_alias),''),
    alias_error = left(nullif(trim(p_error),''),500), processed_at = now()
  WHERE external_id = p_external_id;
  UPDATE public.zalo_parent_contacts SET zalo_alias = nullif(trim(p_alias),''),
    alias_updated_at = CASE WHEN nullif(trim(p_alias),'') IS NOT NULL THEN now() ELSE alias_updated_at END,
    alias_error = left(nullif(trim(p_error),''),500), updated_at = now()
  WHERE parent_id = v_parent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_zalo_parent_from_command(text,text,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_zalo_parent_alias(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_zalo_parent_from_command(text,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_zalo_parent_alias(text,text,text) TO service_role;
