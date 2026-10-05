DO $test$
DECLARE p uuid;q uuid;r jsonb;n integer;prior_uid text;conv uuid;m uuid;pending_job uuid;uncertain_job uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SELECT c.parent_id INTO p FROM public.zalo_parent_contacts c JOIN public.users u ON u.id=c.parent_id
    WHERE c.status='friend' AND u.role::text='parent' AND c.lease_until IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.zalo_outbox WHERE audience_user_id=c.parent_id AND status='processing')
    AND NOT EXISTS(SELECT 1 FROM public.zalo_tuition_receipts WHERE parent_id=c.parent_id AND status='processing')
    AND NOT EXISTS(SELECT 1 FROM public.zalo_tuition_deliveries WHERE parent_id=c.parent_id AND status='processing')
    AND NOT EXISTS(SELECT 1 FROM public.zalo_parent_alias_jobs WHERE parent_id=c.parent_id AND status='processing') LIMIT 1;
  IF p IS NULL THEN RAISE EXCEPTION 'No safe fixture'; END IF;
  SELECT zalo_uid INTO prior_uid FROM public.zalo_parent_contacts WHERE parent_id=p;
  conv:=public.ensure_mindup_official_audience_conversation(p);
  INSERT INTO public.messages(conversation_id,sender_id,content,transport,zalo_dispatch_source)
    VALUES(conv,'00000000-0000-0000-0000-000000000001','Account change fixture pending','web','fixture') RETURNING id INTO m;
  INSERT INTO public.zalo_outbox(message_id,conversation_id,audience_user_id,zalo_uid,content)
    VALUES(m,conv,p,prior_uid,'Account change fixture pending') RETURNING id INTO pending_job;
  INSERT INTO public.messages(conversation_id,sender_id,content,transport,zalo_dispatch_source)
    VALUES(conv,'00000000-0000-0000-0000-000000000001','Account change fixture uncertain','web','fixture') RETURNING id INTO m;
  INSERT INTO public.zalo_outbox(message_id,conversation_id,audience_user_id,zalo_uid,content,status)
    VALUES(m,conv,p,prior_uid,'Account change fixture uncertain','uncertain') RETURNING id INTO uncertain_job;
  SELECT count(*) INTO n FROM public.messages;
  r:=public.link_zalo_parent_from_command('test-account-change-1',(SELECT phone FROM public.users WHERE id=p),'test-new-zalo-uid',true);
  IF r->>'status' NOT IN ('linked','already_linked') THEN RAISE EXCEPTION 'Relink failed: %',r; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.zalo_verified_links WHERE audience_user_id=p AND zalo_uid='test-new-zalo-uid' AND enabled) THEN
    RAISE EXCEPTION 'New UID not enabled'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.zalo_parent_account_changes WHERE parent_id=p AND new_uid='test-new-zalo-uid') THEN
    RAISE EXCEPTION 'Missing audit record'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.zalo_outbox WHERE id=pending_job AND status='pending' AND zalo_uid='test-new-zalo-uid') THEN
    RAISE EXCEPTION 'Pending message not retargeted'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.zalo_outbox WHERE id=uncertain_job AND status='uncertain' AND zalo_uid=prior_uid) THEN
    RAISE EXCEPTION 'Uncertain message retargeted'; END IF;
  r:=public.link_zalo_parent_from_command('test-account-change-1',(SELECT phone FROM public.users WHERE id=p),'test-new-zalo-uid',true);
  IF (SELECT count(*) FROM public.zalo_parent_account_changes WHERE external_id='test-account-change-1')<>1 THEN
    RAISE EXCEPTION 'Duplicate command changed identity twice'; END IF;
  IF (SELECT count(*) FROM public.messages)<>n THEN RAISE EXCEPTION 'History changed'; END IF;
  SELECT c.parent_id,c.zalo_uid INTO q,prior_uid FROM public.zalo_parent_contacts c JOIN public.users u ON u.id=c.parent_id
    WHERE c.parent_id<>p AND c.zalo_uid IS NOT NULL AND u.role::text='parent' LIMIT 1;
  r:=public.link_zalo_parent_from_command('test-account-change-conflict',(SELECT phone FROM public.users WHERE id=p),prior_uid,true);
  IF r->>'status'<>'rejected' THEN RAISE EXCEPTION 'Conflicting UID accepted'; END IF;
  IF (SELECT zalo_uid FROM public.zalo_verified_links WHERE audience_user_id=p)<>'test-new-zalo-uid' THEN
    RAISE EXCEPTION 'Rejected conflict changed identity'; END IF;
  UPDATE public.zalo_parent_contacts SET lease_until=now()+interval '1 minute' WHERE parent_id=p;
  BEGIN
    PERFORM public.link_zalo_parent_from_command('test-account-change-busy',(SELECT phone FROM public.users WHERE id=p),'test-newer-zalo-uid',true);
    RAISE EXCEPTION 'Busy replacement accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Busy replacement accepted' THEN RAISE; END IF;
  END;
END;
$test$;
ROLLBACK;
SELECT 'Account replacement, duplicate command, conflict, history and busy safeguards verified' AS result;
