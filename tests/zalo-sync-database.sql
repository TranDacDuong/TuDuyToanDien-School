-- Run inside the migration's transaction, replacing its COMMIT with this script.
-- All fixtures, notifications, and outbox jobs are rolled back. No real sends.
DO $$
DECLARE
  v_parent uuid;
  v_student uuid;
  v_admin uuid;
  v_teacher uuid;
  v_unscoped uuid;
  v_uid text;
  v_conversation uuid;
  v_message uuid;
  v_job uuid;
  v_result text;
  v_before bigint;
  v_admin_before bigint;
  v_prefix text := 'sync-test-' || gen_random_uuid()::text;
BEGIN
  SELECT l.audience_user_id, l.zalo_uid, ps.student_id, ct.teacher_id
    INTO v_parent, v_uid, v_student, v_teacher
    FROM public.zalo_verified_links l
    JOIN public.parent_students ps ON ps.parent_id = l.audience_user_id AND ps.revoked_at IS NULL
    JOIN public.class_students cs ON cs.student_id = ps.student_id AND (cs.left_at IS NULL OR cs.left_at >= now())
    JOIN public.class_teachers ct ON ct.class_id = cs.class_id
    JOIN public.users teacher ON teacher.id = ct.teacher_id AND teacher.role::text = 'teacher'
    WHERE l.enabled LIMIT 1;
  SELECT id INTO v_admin FROM public.users WHERE role::text = 'admin' LIMIT 1;
  IF v_parent IS NULL OR v_admin IS NULL THEN RAISE EXCEPTION 'Test needs a linked parent and admin'; END IF;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role','service_role','sub',v_admin)::text, true);
  IF (public.get_mindup_zalo_sync_state()->>'linked')::integer < 1 THEN
    RAISE EXCEPTION 'Verified link state is invalid';
  END IF;
  PERFORM public.list_mindup_zalo_link_candidates(v_parent);

  SELECT count(*) INTO v_before FROM public.notifications;
  v_result := public.sync_mindup_zalo_message(v_uid || ':' || v_prefix || '-history', v_uid,
    'History fixture', NULL, false, now() - interval '1 day', true);
  IF v_result <> 'history_imported' THEN RAISE EXCEPTION 'History was not imported'; END IF;
  IF (SELECT count(*) FROM public.notifications) <> v_before THEN RAISE EXCEPTION 'History generated notifications'; END IF;

  v_result := public.sync_mindup_zalo_message(v_uid || ':' || v_prefix || '-history', v_uid,
    'History fixture', NULL, false, now(), true);
  IF v_result <> 'duplicate' THEN RAISE EXCEPTION 'Duplicate history was inserted'; END IF;

  v_result := public.sync_mindup_zalo_message(v_prefix || '-unlinked-id', v_prefix || '-unlinked',
    'Private unlinked history', NULL, false, now(), true);
  IF v_result <> 'ignored_unlinked' THEN RAISE EXCEPTION 'Unlinked history leaked'; END IF;

  -- Live incoming messages produce exactly one notification per eligible staff user.
  SELECT count(*) INTO v_admin_before FROM public.notifications WHERE user_id = v_admin;
  v_result := public.sync_mindup_zalo_message(v_uid || ':' || v_prefix || '-live', v_uid,
    'Live fixture', NULL, false, now(), false);
  IF v_result <> 'received' THEN RAISE EXCEPTION 'Live message was not inserted'; END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_admin) <> v_admin_before + 1 THEN
    RAISE EXCEPTION 'Live message did not produce exactly one admin notification';
  END IF;
  SELECT count(*) INTO v_before FROM public.notifications;
  PERFORM public.sync_mindup_zalo_message(v_uid || ':' || v_prefix || '-live', v_uid,
    'Live fixture', NULL, false, now(), false);
  IF (SELECT count(*) FROM public.notifications) <> v_before THEN RAISE EXCEPTION 'Duplicate live message notified again'; END IF;

  v_conversation := public.ensure_mindup_official_audience_conversation(v_parent);
  INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id, context_student_id, transport)
    VALUES (v_conversation, '00000000-0000-0000-0000-000000000001', v_prefix,
      v_admin, v_student, 'web') RETURNING id INTO v_message;
  INSERT INTO public.zalo_outbox (message_id, conversation_id, audience_user_id, zalo_uid, content, status)
    VALUES (v_message, v_conversation, v_parent, v_uid, v_prefix, 'processing') RETURNING id INTO v_job;
  SELECT count(*) INTO v_before FROM public.messages;
  v_result := public.sync_mindup_zalo_message(v_uid || ':' || v_prefix || '-echo', v_uid,
    v_prefix, NULL, true, now(), false);
  IF v_result <> 'deferred' OR (SELECT count(*) FROM public.messages) <> v_before THEN
    RAISE EXCEPTION 'Early self echo duplicated the web message';
  END IF;
  PERFORM public.finish_mindup_zalo_message_v2(v_job, 'sent', NULL, v_uid || ':' || v_prefix || '-echo');
  PERFORM public.finish_mindup_zalo_message_v2(v_job, 'sent', NULL, v_uid || ':' || v_prefix || '-echo');
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE id = v_message AND real_sender_id = v_admin
    AND context_student_id = v_student AND external_message_id = v_uid || ':' || v_prefix || '-echo') THEN
    RAISE EXCEPTION 'Acknowledgement lost the original author or student context';
  END IF;
  v_result := public.sync_mindup_zalo_message(v_uid || ':' || v_prefix || '-echo', v_uid,
    v_prefix, NULL, true, now(), false);
  IF v_result <> 'duplicate' THEN RAISE EXCEPTION 'Late self echo duplicated the web message'; END IF;

  -- Simulate an echo already inserted by a previous sender version; reconcile by exact id.
  INSERT INTO public.messages (conversation_id, sender_id, content, real_sender_id, context_student_id, transport)
    VALUES (v_conversation, '00000000-0000-0000-0000-000000000001', v_prefix || '-race',
      v_admin, v_student, 'web') RETURNING id INTO v_message;
  INSERT INTO public.zalo_outbox (message_id, conversation_id, audience_user_id, zalo_uid, content, status)
    VALUES (v_message, v_conversation, v_parent, v_uid, v_prefix || '-race', 'processing') RETURNING id INTO v_job;
  INSERT INTO public.messages (conversation_id, sender_id, content, transport, external_message_id)
    VALUES (v_conversation, '00000000-0000-0000-0000-000000000001', v_prefix || '-race',
      'zalo', v_uid || ':' || v_prefix || '-race');
  PERFORM public.finish_mindup_zalo_message_v2(v_job, 'sent', NULL, v_uid || ':' || v_prefix || '-race');
  IF (SELECT count(*) FROM public.messages WHERE external_message_id = v_uid || ':' || v_prefix || '-race') <> 1 THEN
    RAISE EXCEPTION 'Race reconciliation did not leave exactly one message';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE id = v_message AND real_sender_id = v_admin AND context_student_id = v_student) THEN
    RAISE EXCEPTION 'Race reconciliation replaced the original scoped message';
  END IF;
  PERFORM public.sync_mindup_zalo_message(v_uid || ':' || v_prefix || '-unscoped', v_uid,
    'Admin-only unscoped outgoing fixture', NULL, true, now(), true);
  SELECT id INTO v_unscoped FROM public.messages WHERE external_message_id = v_uid || ':' || v_prefix || '-unscoped';
  CREATE TEMP TABLE zalo_sync_scope_fixture(teacher_id uuid, scoped_id uuid, unscoped_id uuid) ON COMMIT DROP;
  INSERT INTO zalo_sync_scope_fixture VALUES (v_teacher, v_message, v_unscoped);
  GRANT SELECT ON zalo_sync_scope_fixture TO authenticated;
END;
$$;
SELECT set_config('request.jwt.claim.role','authenticated',true),
  set_config('request.jwt.claim.sub',(SELECT teacher_id::text FROM zalo_sync_scope_fixture),true),
  set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
    'sub',(SELECT teacher_id FROM zalo_sync_scope_fixture))::text,true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE id = (SELECT scoped_id FROM zalo_sync_scope_fixture)) THEN
    RAISE EXCEPTION 'Assigned teacher cannot read correctly scoped outgoing message';
  END IF;
  IF EXISTS (SELECT 1 FROM public.messages WHERE id = (SELECT unscoped_id FROM zalo_sync_scope_fixture)) THEN
    RAISE EXCEPTION 'Teacher can read admin-only unscoped outgoing message';
  END IF;
END;
$$;
RESET ROLE;
ROLLBACK;
SELECT 'Database behavior tests passed; migration and fixtures rolled back' AS result;
