-- Dry run only: all function/temp changes are rolled back. No deletions.
BEGIN;
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
DO $validate$ DECLARE expected int;actual int;BEGIN
 SELECT coalesce(sum(x.n-1),0) INTO expected FROM(SELECT count(*) n FROM public.users
 WHERE role::text='parent' AND public.canonical_parent_zalo_phone(phone) IS NOT NULL
 GROUP BY public.canonical_parent_zalo_phone(phone) HAVING count(*)>1)x;
 SELECT count(*) INTO actual FROM parent_cleanup_plan;
 IF actual<>expected THEN RAISE EXCEPTION 'Có nhóm trùng chưa xác định duy nhất hồ sơ chính (%/% hồ sơ)',actual,expected;END IF;
 PERFORM 1 FROM public.users WHERE id IN(SELECT removed_id FROM parent_cleanup_plan UNION SELECT retained_id FROM parent_cleanup_plan) FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.parent_students ps JOIN parent_cleanup_plan p ON p.removed_id=ps.parent_id WHERE ps.revoked_at IS NULL) THEN RAISE EXCEPTION 'Hồ sơ dự kiến xóa vẫn có liên kết đang hoạt động';END IF;
 IF EXISTS(SELECT 1 FROM public.parent_students WHERE revoked_at IS NULL GROUP BY student_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Có học sinh đang có nhiều phụ huynh';END IF;
END;$validate$;

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
SELECT jsonb_build_object('plan_fingerprint',(SELECT md5(coalesce(string_agg(removed_id::text||'=>'||retained_id::text,',' ORDER BY removed_id),'')) FROM parent_cleanup_plan),'proposed_removals',(SELECT count(*) FROM parent_cleanup_plan),
'used_login_accounts',(SELECT count(*) FROM auth.users a JOIN parent_cleanup_plan p ON p.removed_id=a.id WHERE a.last_sign_in_at IS NOT NULL),
'dependent_rows',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM parent_cleanup_reference_audit r),
'parents',(SELECT jsonb_agg(jsonb_build_object('keep',k.full_name,'remove',d.full_name,'used_login',a.last_sign_in_at IS NOT NULL) ORDER BY k.full_name) FROM parent_cleanup_plan p JOIN public.users k ON k.id=p.retained_id JOIN public.users d ON d.id=p.removed_id LEFT JOIN auth.users a ON a.id=d.id),
'active_family_links',(SELECT count(*) FROM public.parent_students WHERE revoked_at IS NULL)) AS dry_run;
ROLLBACK;
