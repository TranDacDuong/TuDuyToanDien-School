BEGIN;
CREATE TABLE IF NOT EXISTS public.zalo_parent_account_changes (
  external_id text PRIMARY KEY,
  parent_id uuid NOT NULL REFERENCES public.users(id),
  old_uid text,
  new_uid text NOT NULL,
  new_phone text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zalo_parent_account_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zalo_parent_account_changes FROM anon,authenticated;
GRANT SELECT ON public.zalo_parent_account_changes TO authenticated;
DROP POLICY IF EXISTS zalo_account_changes_admin_read ON public.zalo_parent_account_changes;
CREATE POLICY zalo_account_changes_admin_read ON public.zalo_parent_account_changes FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text='admin'));

CREATE OR REPLACE FUNCTION public.prepare_parent_zalo_account_change(
  p_parent_id uuid,p_uid text,p_phone text,p_external_id text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old text; c public.zalo_parent_contacts;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  SELECT * INTO c FROM public.zalo_parent_contacts WHERE parent_id=p_parent_id FOR UPDATE;
  SELECT zalo_uid INTO v_old FROM public.zalo_verified_links WHERE audience_user_id=p_parent_id FOR UPDATE;
  v_old:=COALESCE(v_old,c.zalo_uid);
  IF v_old IS NOT DISTINCT FROM p_uid AND public.canonical_parent_zalo_phone(c.phone)=public.canonical_parent_zalo_phone(p_phone) THEN RETURN; END IF;
  IF c.lease_until>now()
    OR EXISTS(SELECT 1 FROM public.zalo_outbox WHERE audience_user_id=p_parent_id AND status='processing')
    OR EXISTS(SELECT 1 FROM public.zalo_tuition_receipts WHERE parent_id=p_parent_id AND status='processing')
    OR EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE parent_id=p_parent_id AND status='processing')
    OR EXISTS(SELECT 1 FROM public.zalo_parent_alias_jobs WHERE parent_id=p_parent_id AND status='processing') THEN
    RAISE EXCEPTION 'Phụ huynh đang có tác vụ xử lý. Vui lòng gửi lại lệnh liên kết sau khi tác vụ hoàn tất';
  END IF;
  UPDATE public.zalo_outbox SET zalo_uid=p_uid,updated_at=now()
    WHERE audience_user_id=p_parent_id AND status='pending' AND dispatch_purpose<>'greeting';
  UPDATE public.zalo_outbox SET status='cancelled',updated_at=now(),error_message='Đã đổi tài khoản Zalo'
    WHERE audience_user_id=p_parent_id AND status='pending' AND dispatch_purpose='greeting';
  UPDATE public.zalo_parent_alias_jobs SET status='cancelled',completed_at=now(),updated_at=now(),
    error_message='Đã đổi tài khoản Zalo' WHERE parent_id=p_parent_id AND status='pending';
  UPDATE public.zalo_tuition_deliveries SET status='queued',updated_at=now(),error_message=NULL
    WHERE parent_id=p_parent_id AND status IN ('not_found','not_friend','invited','greeted');
  UPDATE public.zalo_parent_contacts SET invitation_attempted_at=NULL,invitation_sent_at=NULL,
    greeting_attempted_at=NULL,greeting_sent_at=NULL,zalo_alias=NULL,alias_error=NULL
    WHERE parent_id=p_parent_id;
  INSERT INTO public.zalo_parent_account_changes(external_id,parent_id,old_uid,new_uid,new_phone)
    VALUES(p_external_id,p_parent_id,v_old,p_uid,p_phone) ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_parent_zalo_account_change(uuid,text,text,text) FROM PUBLIC,anon,authenticated;

DO $migration$
DECLARE source text; old_block text; block_start integer; block_end integer;
BEGIN
  SELECT pg_get_functiondef('public.link_zalo_parent_from_command(text,text,text,boolean)'::regprocedure) INTO source;
  source:=replace(source,chr(13),'');
  IF position('prepare_parent_zalo_account_change' IN source)>0 THEN RETURN; END IF;
  old_block:=$old$  IF EXISTS (SELECT 1 FROM public.zalo_verified_links
      WHERE audience_user_id = v_parent_id AND zalo_uid <> p_zalo_uid AND enabled)
    OR EXISTS (SELECT 1 FROM public.zalo_parent_contacts
      WHERE parent_id = v_parent_id AND zalo_uid IS NOT NULL AND zalo_uid <> p_zalo_uid) THEN
    v_result := jsonb_build_object('status','rejected','message','Phụ huynh đã liên kết với một tài khoản Zalo khác');
    INSERT INTO public.zalo_parent_link_commands(external_id,zalo_uid,phone,parent_id,status,result)
    VALUES (p_external_id,p_zalo_uid,v_digits,v_parent_id,'rejected',v_result);
    RETURN v_result;
  END IF;$old$;
  IF position(old_block IN source)=0 THEN
    block_start:=position('IF EXISTS (SELECT 1 FROM public.zalo_verified_links' IN source);
    block_end:=position('SELECT COALESCE(jsonb_agg(s.full_name ORDER BY s.full_name)' IN source);
    IF block_start<1 OR block_end<=block_start THEN RAISE EXCEPTION 'Link function changed; review migration before applying'; END IF;
    old_block:=substring(source FROM block_start FOR block_end-block_start);
    IF position('Phụ huynh đã liên kết với một tài khoản Zalo khác' IN old_block)=0 THEN
      RAISE EXCEPTION 'Unexpected link conflict block'; END IF;
  END IF;
  source:=replace(source,old_block,'  PERFORM public.prepare_parent_zalo_account_change(v_parent_id,p_zalo_uid,v_stored_phone,p_external_id);');
  source:=replace(source,
    'SELECT count(*) INTO v_parent_count',
    'PERFORM 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended(''zalo-link:'' || p_zalo_uid,0));
  SELECT count(*) INTO v_parent_count');
  IF position('PERFORM 1 FROM public.mindup_zalo_dispatch_control' IN source)=0 THEN RAISE EXCEPTION 'Dispatch lock anchor missing'; END IF;
  EXECUTE source;
END;
$migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
