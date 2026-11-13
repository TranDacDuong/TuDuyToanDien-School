BEGIN;

CREATE OR REPLACE VIEW public.zalo_send_overview_items AS
SELECT j.*, CASE WHEN j.category='evaluation' THEN cs.session_date
  WHEN j.category='absence' AND j.batch_key ~ '^absence:[0-9a-f-]+:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  THEN split_part(j.batch_key,':',3)::date END AS lesson_day,
  CASE WHEN j.category='evaluation' THEN c.class_name
    WHEN j.category='absence' THEN nullif(split_part(j.title,' · ',2),'')
    WHEN j.category='score' THEN nullif(btrim(replace(substring(j.body from '(?m)^.*?lớp[ ]+([^\r\n]+)'), '**','')),'') END AS class_name
FROM public.zalo_send_batch_items j
LEFT JOIN public.class_sessions cs ON j.batch_key='session_evaluation:'||cs.id
LEFT JOIN public.classes c ON c.id=cs.class_id;
REVOKE ALL ON public.zalo_send_overview_items FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_zalo_send_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  month_ago timestamptz := ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '1 month') AT TIME ZONE 'Asia/Ho_Chi_Minh';
BEGIN
  IF NOT public.can_manage_zalo_send_batches() THEN RAISE EXCEPTION 'Zalo batch permission required'; END IF;
  RETURN (WITH visible AS MATERIALIZED (
    SELECT id,category,batch_key,title,created_at,status,awaiting_second_scan,lesson_day,class_name
    FROM public.zalo_send_overview_items
    WHERE public.can_manage_zalo_send_item(queue,parent_id,student_id)
  ), latest AS (
    SELECT DISTINCT ON (category) category,batch_key,title,created_at,class_name FROM visible
    ORDER BY category, (category='score' AND batch_key LIKE 'web:%'),created_at DESC,id DESC
  ), periods AS (
    SELECT v.* FROM visible v JOIN latest l USING(category)
    WHERE CASE WHEN v.category IN ('evaluation','absence') THEN v.lesson_day=today-1
      WHEN v.category='receipt' THEN v.created_at >= ((today-1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND v.created_at<=now()
      WHEN v.category='other' THEN v.created_at BETWEEN month_ago AND now()
      ELSE v.batch_key=l.batch_key END
  ) SELECT jsonb_agg(to_jsonb(o)) FROM (
    SELECT kinds.category,l.batch_key,l.title,l.created_at AS latest,l.class_name,
      count(p.id) AS total, count(*) FILTER (WHERE p.status='sent') AS sent,
      count(*) FILTER (WHERE p.status IN ('pending','queued','not_found','not_friend','invited','greeted') OR p.awaiting_second_scan) AS waiting,
      count(*) FILTER (WHERE p.status='processing') AS processing,
      count(*) FILTER (WHERE p.status IN ('failed','not_queued')) AS errors,
      count(*) FILTER (WHERE p.status='uncertain' AND NOT p.awaiting_second_scan) AS uncertain,
      count(*) FILTER (WHERE p.status='cancelled') AS skipped,
      coalesce(array_agg(DISTINCT p.class_name ORDER BY p.class_name) FILTER (WHERE p.class_name IS NOT NULL),'{}') AS classes
    FROM unnest(ARRAY['tuition','evaluation','absence','score','receipt','campaign','other']) AS kinds(category)
    LEFT JOIN latest l USING(category) LEFT JOIN periods p ON p.category=kinds.category
    GROUP BY kinds.category,l.batch_key,l.title,l.created_at,l.class_name
  ) o);
END; $$;

CREATE OR REPLACE FUNCTION public.list_zalo_recipient_status(p_category text, p_batch text DEFAULT NULL, p_offset integer DEFAULT 0, p_state text DEFAULT NULL, p_class text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  month_ago timestamptz := ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '1 month') AT TIME ZONE 'Asia/Ho_Chi_Minh';
BEGIN
  IF NOT public.can_manage_zalo_send_batches() THEN RAISE EXCEPTION 'Zalo batch permission required'; END IF;
  RETURN (WITH visible AS MATERIALIZED (
    SELECT j.* FROM public.zalo_send_overview_items j WHERE (j.category=p_category OR (p_category IS NULL AND p_batch IS NOT NULL))
      AND public.can_manage_zalo_send_item(j.queue,j.parent_id,j.student_id)
  ), history AS (
    SELECT parent_id,category,max(updated_at) FILTER (WHERE status='sent') AS last_success FROM visible GROUP BY parent_id,category
  ), scoped AS (
    SELECT DISTINCT ON (j.parent_id) j.* FROM visible j
    WHERE CASE WHEN p_batch IS NOT NULL THEN j.batch_key=p_batch
      WHEN p_category IN ('evaluation','absence') THEN j.lesson_day=today-1 AND (p_class IS NULL OR j.class_name=p_class)
      WHEN p_category='receipt' THEN j.created_at>=((today-1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND j.created_at<=now()
      WHEN p_category='other' THEN j.created_at BETWEEN month_ago AND now()
      ELSE false END
    ORDER BY j.parent_id,j.created_at DESC,j.id DESC
  ), page AS (
    SELECT j.*,public.zalo_parent_display_name(j.parent_id) AS parent_name,s.full_name AS student_name,h.last_success
    FROM scoped j LEFT JOIN history h USING(parent_id,category) LEFT JOIN public.users s ON s.id=j.student_id
    WHERE p_state IS NULL OR (p_state='errors' AND j.status IN ('failed','uncertain','not_queued'))
      OR (p_state='active' AND (j.status IN ('pending','queued','processing','not_found','not_friend','invited','greeted') OR j.awaiting_second_scan))
    ORDER BY j.created_at DESC,j.id DESC LIMIT 100 OFFSET greatest(coalesce(p_offset,0),0)
  ) SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id DESC),'[]') FROM page);
END; $$;

REVOKE ALL ON FUNCTION public.get_zalo_send_overview(),public.list_zalo_recipient_status(text,text,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_zalo_send_overview(),public.list_zalo_recipient_status(text,text,integer,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
