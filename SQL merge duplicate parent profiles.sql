-- Owner-only maintenance. Review the full dry-run and obtain action-time
-- confirmation before executing: unused/duplicate Auth logins are removed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
LOCK TABLE auth.users,public.users,public.parent_students,public.zalo_parent_contacts,public.zalo_verified_links IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.canonical_parent_zalo_phone(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN d~'^0[0-9]{9}$' THEN '84'||substr(d,2)
  WHEN d~'^84[0-9]{9}$' THEN d
  WHEN d~'^[35789][0-9]{8}$' THEN '84'||d ELSE NULL END
 FROM(SELECT regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')d)x;
$$;

CREATE TEMP TABLE parent_cleanup_plan ON COMMIT DROP AS
WITH profiles AS(
 SELECT u.id,u.full_name,public.canonical_parent_zalo_phone(u.phone) phone,
 EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=u.id AND ps.revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.zalo_parent_contacts c WHERE c.parent_id=u.id AND nullif(trim(c.zalo_uid),'') IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.zalo_verified_links l WHERE l.audience_user_id=u.id AND l.enabled) AS is_primary
 FROM public.users u WHERE u.role::text='parent'
), groups AS(
 SELECT phone,count(*) total,count(*) FILTER(WHERE is_primary) primaries
 FROM profiles WHERE phone IS NOT NULL GROUP BY phone HAVING count(*)>1
)
SELECT other.id removed_id,main.id retained_id FROM groups g
JOIN profiles main ON main.phone=g.phone AND main.is_primary
JOIN profiles other ON other.phone=g.phone AND NOT other.is_primary
WHERE g.primaries=1 AND (
 lower(trim(other.full_name))=lower(trim(main.full_name)) OR EXISTS(
 SELECT 1 FROM public.parent_students a JOIN public.parent_students b ON b.student_id=a.student_id
 WHERE a.parent_id=main.id AND b.parent_id=other.id));

-- Never choose a parent merely by phone when family/Zalo ownership is ambiguous.
DO $validate$ DECLARE expected int;actual int;fingerprint text;BEGIN
 SELECT coalesce(sum(x.n-1),0) INTO expected FROM(SELECT count(*) n FROM public.users
 WHERE role::text='parent' AND public.canonical_parent_zalo_phone(phone) IS NOT NULL
 GROUP BY public.canonical_parent_zalo_phone(phone) HAVING count(*)>1)x;
 SELECT count(*) INTO actual FROM parent_cleanup_plan;
 IF actual<>expected THEN RAISE EXCEPTION 'Có nhóm trùng chưa xác định duy nhất hồ sơ chính (%/% hồ sơ)',actual,expected;END IF;
 SELECT md5(coalesce(string_agg(removed_id::text||'=>'||retained_id::text,',' ORDER BY removed_id),'')) INTO fingerprint FROM parent_cleanup_plan;
 IF actual>0 AND fingerprint IS DISTINCT FROM current_setting('app.parent_cleanup.approved_fingerprint',true) THEN
  RAISE EXCEPTION 'Danh sách gộp chưa được phê duyệt hoặc đã thay đổi; hãy chạy lại bản xem trước';
 END IF;
 PERFORM 1 FROM public.users WHERE id IN(SELECT removed_id FROM parent_cleanup_plan UNION SELECT retained_id FROM parent_cleanup_plan) FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.parent_students ps JOIN parent_cleanup_plan p ON p.removed_id=ps.parent_id WHERE ps.revoked_at IS NULL) THEN RAISE EXCEPTION 'Hồ sơ dự kiến xóa vẫn có liên kết đang hoạt động';END IF;
 IF EXISTS(SELECT 1 FROM public.parent_students WHERE revoked_at IS NULL GROUP BY student_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Có học sinh đang có nhiều phụ huynh';END IF;
END;$validate$;

CREATE SCHEMA IF NOT EXISTS parent_cleanup_private;
REVOKE ALL ON SCHEMA parent_cleanup_private FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS parent_cleanup_private.removed_profiles(
 removed_id uuid PRIMARY KEY,retained_id uuid NOT NULL,removed_at timestamptz NOT NULL DEFAULT now(),profile jsonb NOT NULL,login_summary jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS parent_cleanup_private.merged_rows(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,removed_id uuid NOT NULL,retained_id uuid NOT NULL,
 table_name text NOT NULL,row_data jsonb NOT NULL,saved_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE parent_cleanup_private.removed_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_cleanup_private.merged_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA parent_cleanup_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA parent_cleanup_private FROM PUBLIC,anon,authenticated;

-- Archive each affected row before changing its owner; refuse unexpected tables.
DO $backup$ DECLARE r record;n bigint;ids uuid[];BEGIN
 SELECT array_agg(removed_id) INTO ids FROM parent_cleanup_plan;
 FOR r IN SELECT DISTINCT ns.nspname schema_name,t.relname table_name,a.attname column_name
 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
 JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(c.conkey)
 WHERE c.contype='f' AND c.confrelid IN('public.users'::regclass,'auth.users'::regclass)
 AND ns.nspname NOT IN('auth','parent_cleanup_private')
 AND NOT(c.conrelid='public.users'::regclass AND a.attname='id' AND c.confrelid='auth.users'::regclass)
 LOOP
  EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I=ANY($1)',r.schema_name,r.table_name,r.column_name) INTO n USING ids;
  IF n>0 THEN
   IF r.schema_name<>'public' OR (r.table_name,r.column_name) NOT IN(
    ('parent_students','parent_id'),('parent_students','created_by'),
    ('conversation_members','user_id'),('conversations','audience_user_id'),('conversations','mindup_audience_user_id'),
    ('notifications','user_id'),('notifications','actor_id'),('push_subscriptions','user_id'),('user_mobile_app_status','user_id'),('zalo_parent_contacts','parent_id')) THEN
    RAISE EXCEPTION 'Cần kế hoạch gộp thêm: %.% (%) có % dòng',r.schema_name,r.table_name,r.column_name,n;
   END IF;
   EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',r.schema_name,r.table_name);
   EXECUTE format('INSERT INTO parent_cleanup_private.merged_rows(removed_id,retained_id,table_name,row_data) SELECT p.removed_id,p.retained_id,%L,to_jsonb(t)-''auth''-''p256dh'' FROM %I.%I t JOIN parent_cleanup_plan p ON t.%I=p.removed_id',r.schema_name||'.'||r.table_name,r.schema_name,r.table_name,r.column_name);
  END IF;
 END LOOP;
END;$backup$;
INSERT INTO parent_cleanup_private.removed_profiles(removed_id,retained_id,profile,login_summary)
SELECT p.removed_id,p.retained_id,to_jsonb(u)-'account_password',
 jsonb_build_object('id',a.id,'email',a.email,'created_at',a.created_at,'last_sign_in_at',a.last_sign_in_at)
FROM parent_cleanup_plan p JOIN public.users u ON u.id=p.removed_id LEFT JOIN auth.users a ON a.id=u.id;

-- Coalesce redundant revoked links; their original history is in the archive.
DO $links$ DECLARE r record;n bigint;BEGIN
 FOR r IN SELECT c.conrelid::regclass table_name,a.attname column_name
 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
 WHERE c.contype='f' AND c.confrelid='public.parent_students'::regclass LOOP
  EXECUTE format('SELECT count(*) FROM %s WHERE %I IN(SELECT s.id FROM public.parent_students s JOIN parent_cleanup_plan p ON p.removed_id=s.parent_id)',r.table_name,r.column_name) INTO n;
  IF n>0 THEN RAISE EXCEPTION 'Có lịch sử tham chiếu liên kết phụ huynh trong %',r.table_name;END IF;
 END LOOP;
END;$links$;
DELETE FROM public.parent_students s USING parent_cleanup_plan p
WHERE s.parent_id=p.removed_id AND s.revoked_at IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.parent_students k WHERE k.parent_id=p.retained_id AND k.student_id=s.student_id);

-- Preserve all conversation IDs/messages. A key collision requires a separate
-- conversation merge plan; never delete a conversation as a side effect.
DO $conversations$ DECLARE p record;BEGIN
 FOR p IN SELECT * FROM parent_cleanup_plan LOOP
  IF EXISTS(SELECT 1 FROM public.conversations c JOIN public.conversations k
   ON k.direct_key=replace(c.direct_key,p.removed_id::text,p.retained_id::text) AND k.id<>c.id
   WHERE position(p.removed_id::text IN c.direct_key)>0) THEN RAISE EXCEPTION 'Có hội thoại cần gộp riêng';END IF;
  UPDATE public.conversations SET direct_key=replace(direct_key,p.removed_id::text,p.retained_id::text)
  WHERE position(p.removed_id::text IN direct_key)>0;
 END LOOP;
END;$conversations$;
-- Handle unique per-conversation membership and per-user device status.
DELETE FROM public.conversation_members m USING parent_cleanup_plan p
WHERE m.user_id=p.removed_id AND EXISTS(SELECT 1 FROM public.conversation_members k
 WHERE k.user_id=p.retained_id AND k.conversation_id=m.conversation_id);
DELETE FROM public.user_mobile_app_status s USING parent_cleanup_plan p
WHERE s.user_id=p.removed_id AND EXISTS(SELECT 1 FROM public.user_mobile_app_status k WHERE k.user_id=p.retained_id);
-- A duplicate may have a pending empty contact row, but never a competing UID.
DO $contacts$ BEGIN
 IF EXISTS(SELECT 1 FROM public.zalo_parent_contacts c JOIN parent_cleanup_plan p ON p.removed_id=c.parent_id WHERE nullif(trim(c.zalo_uid),'') IS NOT NULL) THEN RAISE EXCEPTION 'Có Zalo UID khác trên hồ sơ dư';END IF;
END;$contacts$;
DELETE FROM public.zalo_parent_contacts c USING parent_cleanup_plan p WHERE c.parent_id=p.removed_id;

-- Remaining reviewed FK references are simple ownership transfers.
DO $remap$ DECLARE r record;n bigint;ids uuid[];BEGIN
 SELECT array_agg(removed_id) INTO ids FROM parent_cleanup_plan;
 FOR r IN SELECT DISTINCT ns.nspname schema_name,t.relname table_name,a.attname column_name
 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
 JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(c.conkey)
 WHERE c.contype='f' AND c.confrelid IN('public.users'::regclass,'auth.users'::regclass)
 AND ns.nspname NOT IN('auth','parent_cleanup_private')
 AND NOT(c.conrelid='public.users'::regclass AND a.attname='id' AND c.confrelid='auth.users'::regclass)
 LOOP
  EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I=ANY($1)',r.schema_name,r.table_name,r.column_name) INTO n USING ids;
  IF n>0 THEN EXECUTE format('UPDATE %I.%I t SET %I=p.retained_id FROM parent_cleanup_plan p WHERE t.%I=p.removed_id',r.schema_name,r.table_name,r.column_name,r.column_name);END IF;
 END LOOP;
END;$remap$;

DELETE FROM public.users u USING parent_cleanup_plan p WHERE u.id=p.removed_id AND u.role::text='parent';
DELETE FROM auth.users a USING parent_cleanup_plan p WHERE a.id=p.removed_id;
CREATE UNIQUE INDEX IF NOT EXISTS parent_students_one_active_parent_per_student_idx
 ON public.parent_students(student_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_one_parent_per_canonical_phone_idx
 ON public.users(public.canonical_parent_zalo_phone(phone)) WHERE role='parent' AND public.canonical_parent_zalo_phone(phone) IS NOT NULL;
DO $reconcile$ DECLARE p record;BEGIN
 FOR p IN SELECT DISTINCT retained_id FROM parent_cleanup_plan LOOP PERFORM public.reconcile_parent_zalo_identity(p.retained_id);END LOOP;
END;$reconcile$;

-- Reuse the existing account by canonical phone when importing another child.
-- Patch in place so the deployed function's existing authorization stays intact.
DO $import$ DECLARE body text;anchor text:='    SELECT id INTO v_auth_user_id';BEGIN
 IF to_regprocedure('public.admin_import_parents_batch(jsonb)') IS NOT NULL THEN
  body:=pg_get_functiondef('public.admin_import_parents_batch(jsonb)'::regprocedure);
  IF position('reuse_canonical_parent_phone' IN body)=0 THEN
   IF position(anchor IN body)=0 THEN RAISE EXCEPTION 'Hàm import đã thay đổi; cần cập nhật bản vá tái sử dụng hồ sơ';END IF;
   body:=replace(body,anchor,$patch$
    -- reuse_canonical_parent_phone: preserve the existing login/name/phone.
    IF public.canonical_parent_zalo_phone(v_phone) IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('parent-phone:'||public.canonical_parent_zalo_phone(v_phone),0));
      SELECT id INTO v_parent_id FROM public.users WHERE role='parent'
        AND public.canonical_parent_zalo_phone(phone)=public.canonical_parent_zalo_phone(v_phone);
      IF FOUND THEN
        SELECT email,full_name,phone INTO v_email,v_full_name,v_phone FROM public.users WHERE id=v_parent_id;
      END IF;
    END IF;

    SELECT id INTO v_auth_user_id$patch$);
   EXECUTE body;
  END IF;
 END IF;
END;$import$;
SELECT count(*) AS removed_duplicate_profiles FROM parent_cleanup_plan;
COMMIT;
