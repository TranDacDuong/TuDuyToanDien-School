-- Read-only production audit; temporary tables disappear at commit.
BEGIN;
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


CREATE TEMP TABLE parent_cleanup_reference_audit(table_name text,column_name text,rows_found bigint) ON COMMIT DROP;
DO $audit$ DECLARE r record;n bigint;ids uuid[];BEGIN
 SELECT array_agg(removed_id) INTO ids FROM parent_cleanup_plan;
 FOR r IN SELECT DISTINCT ns.nspname schema_name,t.relname table_name,a.attname column_name
 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
 JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(c.conkey)
 WHERE c.contype='f' AND c.confrelid IN('public.users'::regclass,'auth.users'::regclass)
 AND ns.nspname NOT IN('auth','parent_cleanup_private')
 AND NOT(c.conrelid='public.users'::regclass AND a.attname='id' AND c.confrelid='auth.users'::regclass)
 LOOP
 EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I=ANY($1)',r.schema_name,r.table_name,r.column_name) INTO n USING ids;
 IF n>0 THEN INSERT INTO parent_cleanup_reference_audit VALUES(r.schema_name||'.'||r.table_name,r.column_name,n);END IF;
 END LOOP;
END;$audit$;
SELECT (SELECT count(*) FROM parent_cleanup_plan) AS proposed_removals,
 (SELECT count(*) FROM auth.users a JOIN parent_cleanup_plan p ON p.removed_id=a.id WHERE a.last_sign_in_at IS NOT NULL) AS used_login_accounts,
 (SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM parent_cleanup_reference_audit r) AS dependent_rows,
 (SELECT count(*) FROM public.parent_students WHERE revoked_at IS NULL) AS active_family_links,
 to_regclass('public.parent_students_one_active_parent_per_student_idx') IS NOT NULL AS one_parent_constraint_exists;
COMMIT;
