-- Destructive maintenance, not an application RPC. Review the live audit first.
-- Deletes only unused duplicate login accounts whose same-phone primary profile
-- already owns the family/Zalo identity. Never merges distinct family histories.
-- Run as the database owner in a single transaction after explicit approval.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
LOCK TABLE auth.users,public.users,public.parent_students,public.zalo_parent_contacts,public.zalo_verified_links IN SHARE ROW EXCLUSIVE MODE;

CREATE SCHEMA IF NOT EXISTS parent_cleanup_private;
REVOKE ALL ON SCHEMA parent_cleanup_private FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS parent_cleanup_private.removed_profiles(
 removed_id uuid PRIMARY KEY,retained_id uuid NOT NULL,removed_at timestamptz NOT NULL DEFAULT now(),
 profile jsonb NOT NULL,login_summary jsonb NOT NULL
);
REVOKE ALL ON parent_cleanup_private.removed_profiles FROM PUBLIC,anon,authenticated;

CREATE TEMP TABLE parent_cleanup_plan ON COMMIT DROP AS
WITH profiles AS (
 SELECT u.id,u.full_name,public.canonical_parent_zalo_phone(u.phone) phone,
 EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.parent_id=u.id AND ps.revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.zalo_parent_contacts c WHERE c.parent_id=u.id AND c.zalo_uid IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.zalo_verified_links l WHERE l.audience_user_id=u.id AND l.enabled) AS is_primary
 FROM public.users u WHERE u.role::text='parent'
), groups AS (
 SELECT phone,count(*) total,count(*) FILTER(WHERE is_primary) primaries
 FROM profiles WHERE phone IS NOT NULL GROUP BY phone HAVING count(*)>1
)
SELECT other.id removed_id,main.id retained_id
FROM groups g JOIN profiles main ON main.phone=g.phone AND main.is_primary
JOIN profiles other ON other.phone=g.phone AND NOT other.is_primary
WHERE g.primaries=1 AND lower(trim(other.full_name))=lower(trim(main.full_name));

DO $validate$
DECLARE expected int;actual int;ids uuid[];r record;n bigint;
BEGIN
 SELECT coalesce(sum(x.n-1),0) INTO expected FROM (
  SELECT count(*) n FROM public.users WHERE role::text='parent' AND public.canonical_parent_zalo_phone(phone) IS NOT NULL
  GROUP BY public.canonical_parent_zalo_phone(phone) HAVING count(*)>1)x;
 SELECT count(*),array_agg(removed_id) INTO actual,ids FROM parent_cleanup_plan;
 IF actual<>expected THEN RAISE EXCEPTION 'Không tự xóa: có nhóm trùng chưa xác định duy nhất hồ sơ chính (%/% hồ sơ)',actual,expected;END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=ANY(ids) AND last_sign_in_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Không tự xóa: hồ sơ dư có lịch sử đăng nhập; cần kiểm tra tài khoản đang được sử dụng';
 END IF;
 -- A duplicate with *any* application/storage dependency needs an explicit
 -- merge plan. Do not rely on CASCADE or silently discard revoked links/history.
 FOR r IN SELECT DISTINCT ns.nspname schema_name,t.relname table_name,a.attname column_name
  FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
  JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(c.conkey)
  WHERE c.contype='f' AND c.confrelid IN('public.users'::regclass,'auth.users'::regclass)
   AND ns.nspname NOT IN('auth','parent_cleanup_private')
   AND NOT(c.conrelid='public.users'::regclass AND a.attname='id' AND c.confrelid='auth.users'::regclass)
 LOOP
  EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I=ANY($1)',r.schema_name,r.table_name,r.column_name) INTO n USING ids;
  IF n>0 THEN RAISE EXCEPTION 'Không tự xóa: % dòng phụ thuộc trong %.% (%)',n,r.schema_name,r.table_name,r.column_name;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.parent_students WHERE revoked_at IS NULL GROUP BY student_id HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Có học sinh đang liên kết nhiều phụ huynh; cần chọn hồ sơ chính trước';
 END IF;
END;$validate$;

-- Preserve profile data (excluding the application's plaintext password field).
-- This is an audit archive, not a promise that deleted logins can be restored.
INSERT INTO parent_cleanup_private.removed_profiles(removed_id,retained_id,profile,login_summary)
SELECT p.removed_id,p.retained_id,to_jsonb(u)-'account_password',
 jsonb_build_object('id',a.id,'email',a.email,'created_at',a.created_at,'last_sign_in_at',a.last_sign_in_at)
FROM parent_cleanup_plan p JOIN public.users u ON u.id=p.removed_id LEFT JOIN auth.users a ON a.id=u.id;

DELETE FROM public.users u USING parent_cleanup_plan p WHERE u.id=p.removed_id AND u.role::text='parent';
DELETE FROM auth.users a USING parent_cleanup_plan p WHERE a.id=p.removed_id;

CREATE UNIQUE INDEX IF NOT EXISTS parent_students_one_active_parent_per_student_idx
 ON public.parent_students(student_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_one_parent_per_canonical_phone_idx
 ON public.users(public.canonical_parent_zalo_phone(phone))
 WHERE role='parent' AND public.canonical_parent_zalo_phone(phone) IS NOT NULL;

-- Reuse the existing identity reconciler, preserving its UID/conflict checks.
DO $reconcile$ DECLARE r record;BEGIN
 FOR r IN SELECT DISTINCT retained_id FROM parent_cleanup_plan LOOP
  PERFORM public.reconcile_parent_zalo_identity(r.retained_id);
 END LOOP;
END;$reconcile$;

SELECT count(*) AS removed_duplicate_profiles FROM parent_cleanup_plan;
COMMIT;
