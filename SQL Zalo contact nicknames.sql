BEGIN;
ALTER TABLE public.zalo_external_threads ADD COLUMN IF NOT EXISTS zalo_alias text;
ALTER TABLE public.zalo_external_threads ADD COLUMN IF NOT EXISTS alias_updated_at timestamptz;
DO $patch$
DECLARE source text; needle text;
BEGIN
  source:=pg_get_functiondef('public.sync_mindup_zalo_message(text,text,text,text,boolean,timestamptz,boolean)'::regprocedure);
  IF position('contact_profile' IN source)=0 THEN
    needle:='IF event_kind=''reply_result'' THEN';
    IF position(needle IN source)=0 THEN RAISE EXCEPTION 'Unexpected sync definition'; END IF;
    source:=replace(source,needle,$branch$
    IF event_kind='contact_profile' THEN
      IF jsonb_typeof(env->'alias_known') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid alias snapshot'; END IF;
      INSERT INTO public.zalo_external_threads(zalo_uid,display_name,avatar,zalo_alias,alias_updated_at)
        VALUES(p_zalo_uid,left(coalesce(env->>'name',''),200),env->>'avatar',
          CASE WHEN (env->>'alias_known')::boolean THEN nullif(left(env->>'alias',200),'') END,
          CASE WHEN (env->>'alias_known')::boolean THEN stamp END)
      ON CONFLICT(zalo_uid) DO UPDATE SET
        display_name=coalesce(nullif(excluded.display_name,''),zalo_external_threads.display_name),
        avatar=coalesce(excluded.avatar,zalo_external_threads.avatar),
        zalo_alias=CASE WHEN (env->>'alias_known')::boolean AND stamp>=coalesce(zalo_external_threads.alias_updated_at,'-infinity')
          THEN excluded.zalo_alias ELSE zalo_external_threads.zalo_alias END,
        alias_updated_at=CASE WHEN (env->>'alias_known')::boolean THEN greatest(stamp,zalo_external_threads.alias_updated_at)
          ELSE zalo_external_threads.alias_updated_at END,updated_at=now();
      RETURN 'received';
    ELSIF event_kind='reply_result' THEN
    $branch$);
    EXECUTE source;
  END IF;
  source:=pg_get_functiondef('public.list_zalo_contact_profiles()'::regprocedure);
  IF position('t.zalo_alias' IN source)=0 THEN
    IF position('l.audience_user_id,t.display_name,t.avatar' IN source)=0 THEN RAISE EXCEPTION 'Unexpected contact profile definition'; END IF;
    EXECUTE replace(source,'l.audience_user_id,t.display_name,t.avatar',
      'l.audience_user_id,coalesce(nullif(t.zalo_alias,''''),t.display_name),t.avatar');
  END IF;
  source:=pg_get_functiondef('public.list_zalo_external_inbox()'::regprocedure);
  IF position('t.zalo_alias' IN source)=0 THEN
    IF position('t.id,t.display_name,t.avatar' IN source)=0 THEN RAISE EXCEPTION 'Unexpected external inbox definition'; END IF;
    EXECUTE replace(source,'t.id,t.display_name,t.avatar',
      't.id,coalesce(nullif(t.zalo_alias,''''),t.display_name) AS display_name,t.avatar');
  END IF;
END;
$patch$;
COMMIT;
