-- REVIEW ONLY. Apply after parent notification policy and evaluation Zalo bridge.
-- No migration-time dispatch, historical attendance writes, or message backfill.
BEGIN;

CREATE TABLE IF NOT EXISTS public.fortnight_evaluation_installation (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  installed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.fortnight_evaluation_installation(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.fortnight_evaluation_installation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fortnight_evaluation_installation FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.fortnight_evaluation_publications (
  class_id uuid NOT NULL REFERENCES public.classes(id),
  student_id uuid NOT NULL REFERENCES public.users(id),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK(period_end>=period_start),
  evaluation_id uuid NOT NULL REFERENCES public.session_student_evaluations(id),
  publication_state text NOT NULL CHECK(publication_state IN ('awaiting_parent','published')),
  published_at timestamptz,
  PRIMARY KEY(class_id,student_id,period_start),
  UNIQUE(evaluation_id)
);
ALTER TABLE public.fortnight_evaluation_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fortnight_evaluation_publications FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.fortnight_evaluation_publications IS
  'Calendar halves: 1-15 and 16-lastday. Published means in-app creation; evaluation_zalo_publications records external delivery separately.';

-- Exactly the frontend choose() rule: prefer unused IDs, then weighted random.
CREATE OR REPLACE FUNCTION public.pick_parent_evaluation_template(
  p_section text,p_status_id uuid,p_previous jsonb DEFAULT '[]'::jsonb
) RETURNS public.evaluation_message_templates LANGUAGE sql VOLATILE SET search_path=public AS $$
  SELECT t FROM public.evaluation_message_templates t
  WHERE t.active AND t.section_type=p_section AND t.status_id IS NOT DISTINCT FROM p_status_id
  ORDER BY CASE WHEN COALESCE(p_previous,'[]'::jsonb) ? t.id::text THEN 1 ELSE 0 END,
    -ln(GREATEST(random(),0.000000000001))/GREATEST(t.weight,1),t.id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.render_parent_evaluation_phrase(p_content text,p_values jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE result text:=COALESCE(p_content,''); pair record;
BEGIN
  FOR pair IN SELECT * FROM jsonb_each_text(p_values) LOOP
    result:=replace(result,'{'||pair.key||'}',COALESCE(pair.value,''));
  END LOOP;
  result:=regexp_replace(result,'\{[a-z_]+\}','','g');
  result:=regexp_replace(result,'Kính gửi anh/chị[[:space:]]*,','Kính gửi Quý phụ huynh,','gi');
  RETURN trim(regexp_replace(result,'[[:space:]]{2,}',' ','g'));
END $$;

CREATE OR REPLACE FUNCTION public.join_parent_evaluation_phrases(p_phrases text[])
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE phrases text[]; n integer;
BEGIN
  SELECT array_agg(clean ORDER BY ord) INTO phrases FROM (
    SELECT regexp_replace(trim(item),'[.!?;,[:space:]]+$','') clean,ord
    FROM unnest(p_phrases) WITH ORDINALITY x(item,ord)
  ) src WHERE clean<>'';
  n:=COALESCE(array_length(phrases,1),0);
  IF n=0 THEN RETURN ''; ELSIF n=1 THEN RETURN phrases[1]; END IF;
  RETURN array_to_string(phrases[1:n-1],', ')||' và '||phrases[n];
END $$;

CREATE OR REPLACE FUNCTION public.compose_parent_evaluation_message(
  p_evaluation_id uuid,p_status_ids uuid[] DEFAULT NULL,p_fortnight boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; status record; chosen public.evaluation_message_templates;
  selected_ids uuid[]; values jsonb; previous jsonb; selection jsonb;
  positives text[]:=ARRAY[]::text[]; attention text[]:=ARRAY[]::text[];
  positive_ids text[]:=ARRAY[]::text[]; attention_ids text[]:=ARRAY[]::text[];
  parent_name text; closing text; intro text; message text; positive_phrase text;
BEGIN
  SELECT ev.*,cs.session_date,c.class_name,COALESCE(s.name,'buổi học') subject_name,
    u.full_name student_name,teacher.full_name teacher_name INTO e
  FROM public.session_student_evaluations ev
  JOIN public.class_sessions cs ON cs.id=ev.class_session_id
  JOIN public.classes c ON c.id=ev.class_id
  JOIN public.users u ON u.id=ev.student_id
  LEFT JOIN public.subjects s ON s.id=c.subject_id
  LEFT JOIN public.users teacher ON teacher.id=ev.evaluator_id
  WHERE ev.id=p_evaluation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  selected_ids:=p_status_ids;
  IF selected_ids IS NULL THEN
    SELECT array_agg(status_id) INTO selected_ids FROM public.session_student_evaluation_statuses
    WHERE evaluation_id=p_evaluation_id;
  END IF;
  IF COALESCE(array_length(selected_ids,1),0)=0 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM unnest(selected_ids) i WHERE NOT EXISTS (
    SELECT 1 FROM public.evaluation_statuses s WHERE s.id=i AND s.active)) THEN RETURN NULL; END IF;
  SELECT u.full_name INTO parent_name FROM public.parent_students ps JOIN public.users u
    ON u.id=ps.parent_id AND u.role::text='parent'
    WHERE ps.student_id=e.student_id AND ps.revoked_at IS NULL ORDER BY ps.parent_id LIMIT 1;
  values:=jsonb_build_object('ten_hoc_sinh',COALESCE(e.student_name,'học sinh'),
    'ten_phu_huynh',COALESCE(parent_name,''),'ngay_hoc',to_char(e.session_date,'DD/MM/YYYY'),
    'mon_hoc',e.subject_name,'ten_lop',e.class_name,'ten_giao_vien',COALESCE(e.teacher_name,''));
  previous:=CASE WHEN e.template_selection->>'format_version'='2' THEN e.template_selection ELSE '{}'::jsonb END;
  FOR status IN SELECT * FROM public.evaluation_statuses WHERE id=ANY(selected_ids) AND active
    ORDER BY display_order,id LOOP
    chosen:=public.pick_parent_evaluation_template('status',status.id,
      CASE WHEN status.category='needs_attention' THEN previous->'attention_descriptions'
        ELSE previous->'positive_descriptions' END);
    -- Fortnight praise must use the existing positive templates, not fabricated names.
    IF p_fortnight AND chosen.id IS NULL THEN RETURN NULL; END IF;
    IF status.category='needs_attention' THEN
      attention:=array_append(attention,public.render_parent_evaluation_phrase(COALESCE(chosen.content,status.name),values));
      attention_ids:=array_append(attention_ids,COALESCE(chosen.id,status.id)::text);
    ELSE
      positives:=array_append(positives,public.render_parent_evaluation_phrase(COALESCE(chosen.content,status.name),values));
      positive_ids:=array_append(positive_ids,COALESCE(chosen.id,status.id)::text);
    END IF;
  END LOOP;
  chosen:=public.pick_parent_evaluation_template(
    CASE WHEN cardinality(attention)>0 THEN 'closing' ELSE 'opening' END,NULL,
    jsonb_build_array(previous->>'closing'));
  closing:=public.render_parent_evaluation_phrase(COALESCE(chosen.content,
    'Thầy/cô mong con tiếp tục phát huy và cố gắng trong các buổi học tới'),values);
  selection:=jsonb_build_object('format_version',2,'positive_descriptions',to_jsonb(positive_ids),
    'attention_descriptions',to_jsonb(attention_ids),'closing',chosen.id,'generated_at_dispatch',true);
  positive_phrase:=public.join_parent_evaluation_phrases(positives);
  IF p_fortnight THEN
    intro:='Trong 2 tuần vừa qua, tại lớp '||COALESCE(e.class_name,'')||' môn '||e.subject_name||
      ', em '||COALESCE(e.student_name,'học sinh')||' '||positive_phrase||'.';
    selection:=selection||jsonb_build_object('fortnight_fallback',true);
  ELSIF positive_phrase<>'' THEN
    intro:='Trong buổi học môn '||e.subject_name||' ngày '||to_char(e.session_date,'DD/MM/YYYY')||
      ', em '||COALESCE(e.student_name,'học sinh')||' '||positive_phrase||'.';
  ELSE
    intro:='Trong buổi học môn '||e.subject_name||' ngày '||to_char(e.session_date,'DD/MM/YYYY')||
      ', giáo viên đã theo dõi và ghi nhận quá trình học tập của em '||COALESCE(e.student_name,'học sinh')||'.';
  END IF;
  message:=CASE WHEN NULLIF(trim(parent_name),'') IS NOT NULL THEN 'Kính gửi anh/chị '||trim(parent_name)||','
    ELSE 'Kính gửi Quý phụ huynh,' END||E'\n\n'||intro;
  IF cardinality(attention)>0 THEN message:=message||E'\n\nTuy nhiên, con '||public.join_parent_evaluation_phrases(attention)||'.'; END IF;
  message:=message||E'\n\n'||regexp_replace(trim(closing),'[.!?;,[:space:]]+$','')||'.';
  RETURN jsonb_build_object('message',message,'template_selection',selection);
END $$;

CREATE TABLE IF NOT EXISTS public.evaluation_draft_requests (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  class_session_id uuid NOT NULL REFERENCES public.class_sessions(id),
  student_id uuid NOT NULL REFERENCES public.users(id),
  request_payload jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.evaluation_draft_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evaluation_draft_requests FROM PUBLIC,anon,authenticated;

-- Atomic frontend contract. NULL text is stored as '' for NOT NULL live schemas.
-- Remove the earlier five-argument overload so PostgREST cannot choose ambiguously.
DROP FUNCTION IF EXISTS public.save_session_evaluation_draft(uuid,uuid,uuid[],text,jsonb);
CREATE OR REPLACE FUNCTION public.save_session_evaluation_draft(
  p_class_session_id uuid,p_student_id uuid,p_status_ids uuid[],
  p_message text DEFAULT NULL,p_template_selection jsonb DEFAULT '{}'::jsonb,
  p_request_id uuid DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE session public.class_sessions; saved public.session_student_evaluations; ids uuid[];
  prior public.evaluation_draft_requests; payload jsonb; response jsonb; existing boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('parent-auto-evaluations'));
  SELECT * INTO session FROM public.class_sessions WHERE id=p_class_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class session not found'; END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=auth.uid()
    AND (u.role::text='admin' OR (u.role::text IN ('teacher','assistant') AND EXISTS (
      SELECT 1 FROM public.class_teachers ct WHERE ct.class_id=session.class_id AND ct.teacher_id=auth.uid()))))
  THEN RAISE EXCEPTION 'Assigned class staff required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.class_students cs WHERE cs.class_id=session.class_id
    AND cs.student_id=p_student_id AND (cs.joined_at IS NULL OR cs.joined_at::date<=session.session_date)
    AND (cs.left_at IS NULL OR cs.left_at::date>=session.session_date))
  THEN RAISE EXCEPTION 'Student not enrolled for this session'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Draft request ID required'; END IF;
  IF jsonb_typeof(COALESCE(p_template_selection,'{}'::jsonb))<>'object'
  THEN RAISE EXCEPTION 'Template selection must be an object'; END IF;
  SELECT array_agg(DISTINCT i ORDER BY i) INTO ids FROM unnest(p_status_ids) i;
  ids:=COALESCE(ids,ARRAY[]::uuid[]);
  payload:=jsonb_build_object('class_session_id',p_class_session_id,'student_id',p_student_id,
    'status_ids',ids,'message',COALESCE(trim(p_message),''),
    'template_selection',COALESCE(p_template_selection,'{}'::jsonb),'expected_updated_at',p_expected_updated_at);
  SELECT * INTO prior FROM public.evaluation_draft_requests WHERE request_id=p_request_id;
  IF FOUND THEN
    IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.request_payload IS DISTINCT FROM payload
    THEN RAISE EXCEPTION 'Draft request ID reused with different content'; END IF;
    IF EXISTS (SELECT 1 FROM public.session_student_evaluations e
      WHERE e.id=(prior.response->>'id')::uuid AND (e.state<>'draft' OR e.notification_published_at IS NOT NULL))
    THEN RAISE EXCEPTION 'Evaluation already published or failed; reload before saving'; END IF;
    RETURN prior.response;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ids) i WHERE NOT EXISTS (
    SELECT 1 FROM public.evaluation_statuses s WHERE s.id=i AND s.active))
  THEN RAISE EXCEPTION 'Active evaluation statuses required'; END IF;
  SELECT * INTO saved FROM public.session_student_evaluations
    WHERE class_session_id=p_class_session_id AND student_id=p_student_id FOR UPDATE;
  existing:=FOUND;
  IF existing THEN
    IF saved.state NOT IN ('draft','failed') OR saved.sent_at IS NOT NULL OR saved.notification_published_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.evaluation_zalo_publications p WHERE p.evaluation_id=saved.id)
      OR EXISTS (SELECT 1 FROM public.notifications n WHERE n.type='session_evaluation'
        AND n.meta->>'evaluation_id'=saved.id::text)
    THEN RAISE EXCEPTION 'Evaluation with publication evidence cannot be overwritten by autosave'; END IF;
    IF p_expected_updated_at IS DISTINCT FROM saved.updated_at
    THEN RAISE EXCEPTION 'Evaluation changed; reload before saving' USING ERRCODE='40001'; END IF;
    UPDATE public.session_student_evaluations SET evaluator_id=auth.uid(),
      generated_message=COALESCE(trim(p_message),''),final_message=COALESCE(trim(p_message),''),
      template_selection=COALESCE(p_template_selection,'{}'::jsonb),state='draft',sent_at=NULL,updated_at=clock_timestamp()
      WHERE id=saved.id RETURNING * INTO saved;
  ELSE
    IF p_expected_updated_at IS NOT NULL
    THEN RAISE EXCEPTION 'Evaluation changed; reload before saving' USING ERRCODE='40001'; END IF;
    INSERT INTO public.session_student_evaluations(class_session_id,class_id,student_id,evaluator_id,
      generated_message,final_message,template_selection,state,sent_at)
    VALUES(p_class_session_id,session.class_id,p_student_id,auth.uid(),COALESCE(trim(p_message),''),
      COALESCE(trim(p_message),''),COALESCE(p_template_selection,'{}'::jsonb),'draft',NULL) RETURNING * INTO saved;
  END IF;
  DELETE FROM public.session_student_evaluation_statuses WHERE evaluation_id=saved.id;
  INSERT INTO public.session_student_evaluation_statuses(evaluation_id,status_id)
    SELECT saved.id,unnest(ids);
  response:=to_jsonb(saved)||jsonb_build_object('status_ids',to_jsonb(ids));
  INSERT INTO public.evaluation_draft_requests(request_id,actor_id,class_session_id,student_id,request_payload,response)
    VALUES(p_request_id,auth.uid(),p_class_session_id,p_student_id,payload,response);
  RETURN response;
END $$;

-- Upgrade the already policy-guarded 30m function without losing its integrations.
DO $migration$
DECLARE definition text; block text;
BEGIN
  definition:=pg_get_functiondef('public.auto_send_session_evaluations_after_30m(uuid,date,boolean)'::regprocedure);
  definition:=replace(replace(definition,E'\r\n',E'\n'),E'\r',E'\n');
  IF position('parent_status_dispatch_generator' IN definition)>0 THEN RETURN; END IF;
  block:=substring(definition FROM '      IF v_eval.final_message IS NULL OR TRIM\(v_eval.final_message\) = '''' THEN[\s\S]*?      END IF;');
  IF position('parent_evaluation_delivery_guard' IN definition)=0 OR block IS NULL
    OR definition !~ 'DECLARE[[:space:]]' THEN RAISE EXCEPTION 'Unknown policy-guarded 30m evaluation definition'; END IF;
  definition:=regexp_replace(definition,'DECLARE[[:space:]]*',E'DECLARE\n  v_composed jsonb;\n');
  definition:=replace(definition,block,$dispatch$
      -- parent_status_dispatch_generator
      IF NULLIF(trim(v_eval.final_message),'') IS NULL THEN
        v_eval.final_message:=NULLIF(trim(v_eval.generated_message),'');
        IF v_eval.final_message IS NULL THEN
          v_composed:=public.compose_parent_evaluation_message(v_eval.eval_id);
          IF v_composed IS NULL THEN CONTINUE; END IF;
          v_eval.final_message:=v_composed->>'message';
          UPDATE public.session_student_evaluations SET generated_message=v_eval.final_message,
            template_selection=v_composed->'template_selection',updated_at=now() WHERE id=v_eval.eval_id;
        END IF;
      END IF;
$dispatch$);
  EXECUTE definition;
END $migration$;

CREATE OR REPLACE FUNCTION public.parent_evaluation_session_end(p_session_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT COALESCE(cs.ends_at,(SELECT (cs.session_date+sch.end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh'
    FROM public.class_schedules sch WHERE sch.class_id=cs.class_id
      AND sch.weekday=EXTRACT(ISODOW FROM cs.session_date) AND sch.effective_from<=cs.session_date
    ORDER BY sch.effective_from DESC,sch.end_time DESC LIMIT 1),
    (cs.session_date+time '21:00') AT TIME ZONE 'Asia/Ho_Chi_Minh')
  FROM public.class_sessions cs WHERE cs.id=p_session_id
$$;

CREATE OR REPLACE FUNCTION public.send_fortnight_evaluation_fallback(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE local_day date:=(p_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_period_start date; v_period_end date; candidate record; eid uuid; evaluator uuid;
  status_ids uuid[]; composed jsonb; previous_publication public.fortnight_evaluation_publications;
  rows integer; published integer:=0; suppressed integer:=0; waiting integer:=0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('parent-auto-evaluations'));
  IF EXTRACT(HOUR FROM p_now AT TIME ZONE 'Asia/Ho_Chi_Minh')<7
    OR EXTRACT(HOUR FROM p_now AT TIME ZONE 'Asia/Ho_Chi_Minh')>=22
  THEN RETURN jsonb_build_object('success',true,'skipped','outside_delivery_window'); END IF;
  IF EXTRACT(DAY FROM local_day)>=16 THEN
    v_period_start:=date_trunc('month',local_day)::date; v_period_end:=v_period_start+14;
  ELSE
    v_period_end:=date_trunc('month',local_day)::date-1;
    v_period_start:=date_trunc('month',v_period_end)::date+15;
  END IF;
  IF v_period_end < (SELECT (installed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    FROM public.fortnight_evaluation_installation WHERE id)
  THEN RETURN jsonb_build_object('success',true,'skipped','pre_installation_period'); END IF;
  IF EXISTS (SELECT 1 FROM public.message_templates WHERE id='session_evaluation_notice' AND is_enabled=false)
  THEN RETURN jsonb_build_object('success',true,'skipped','template_disabled'); END IF;
  SELECT array_agg(id ORDER BY display_order) INTO status_ids FROM public.evaluation_statuses
    WHERE code IN ('knowledge_good','focused') AND active AND category='positive';
  IF COALESCE(cardinality(status_ids),0)<>2 THEN
    RETURN jsonb_build_object('success',true,'skipped','positive_statuses_unavailable'); END IF;
  FOR candidate IN
    SELECT a.class_id,a.student_id,
      (array_agg(cs.id ORDER BY cs.session_date DESC,public.parent_evaluation_session_end(cs.id) DESC,cs.id))[1] anchor_id
    FROM public.attendance a
    JOIN public.class_sessions cs ON cs.class_id=a.class_id AND cs.session_date=a.date
    JOIN public.users u ON u.id=a.student_id AND u.role::text='student'
    WHERE a.date BETWEEN v_period_start AND v_period_end
      AND a.status IN ('present','makeup','trial')
      AND EXISTS (SELECT 1 FROM public.class_students enrolled
        WHERE enrolled.class_id=a.class_id AND enrolled.student_id=a.student_id
          AND (enrolled.joined_at IS NULL OR enrolled.joined_at::date<=a.date)
          AND (enrolled.left_at IS NULL OR enrolled.left_at>p_now))
    GROUP BY a.class_id,a.student_id
    ORDER BY a.class_id,a.student_id
  LOOP
    SELECT * INTO previous_publication FROM public.fortnight_evaluation_publications p
      WHERE p.class_id=candidate.class_id AND p.student_id=candidate.student_id
        AND p.period_start=v_period_start;
    IF previous_publication.publication_state='published' THEN CONTINUE; END IF;
    -- Wait for ALL class lessons in the half-month, not just the last attendance row.
    IF EXISTS (SELECT 1 FROM public.class_sessions cs WHERE cs.class_id=candidate.class_id
      AND cs.session_date BETWEEN v_period_start AND v_period_end
      AND public.parent_evaluation_session_end(cs.id)+interval '30 minutes'>p_now)
    THEN waiting:=waiting+1; CONTINUE; END IF;
    -- Meaningful individual intent, queued/unknown/error delivery or a delivered
    -- evaluation all suppress generic praise. Legacy state='sent' is not proof
    -- of external delivery; uncertainty still must not produce a positive fallback.
    IF EXISTS (SELECT 1 FROM public.session_student_evaluations e
      JOIN public.class_sessions cs ON cs.id=e.class_session_id
      WHERE e.student_id=candidate.student_id AND e.class_id=candidate.class_id
        AND cs.session_date BETWEEN v_period_start AND v_period_end
        AND NOT EXISTS (SELECT 1 FROM public.fortnight_evaluation_publications f WHERE f.evaluation_id=e.id)
        AND (e.state<>'draft' OR e.sent_at IS NOT NULL OR NULLIF(trim(e.final_message),'') IS NOT NULL
          OR NULLIF(trim(e.generated_message),'') IS NOT NULL
          OR e.notification_published_at IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.session_student_evaluation_statuses s WHERE s.evaluation_id=e.id)
          OR EXISTS (SELECT 1 FROM public.evaluation_zalo_publications z WHERE z.evaluation_id=e.id)))
    THEN suppressed:=suppressed+1; CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.parent_students ps JOIN public.users u
      ON u.id=ps.parent_id AND u.role::text='parent'
      WHERE ps.student_id=candidate.student_id AND ps.revoked_at IS NULL AND ps.parent_id<>ps.student_id)
    THEN waiting:=waiting+1; CONTINUE; END IF;
    SELECT u.id INTO evaluator FROM public.users u WHERE u.role::text='admin' ORDER BY u.created_at,u.id LIMIT 1;
    IF evaluator IS NULL THEN waiting:=waiting+1; CONTINUE; END IF;
    eid:=previous_publication.evaluation_id;
    IF eid IS NULL THEN
      INSERT INTO public.session_student_evaluations(class_session_id,class_id,student_id,evaluator_id,
        generated_message,final_message,template_selection,state)
      VALUES(candidate.anchor_id,candidate.class_id,candidate.student_id,evaluator,'','','{}'::jsonb,'draft')
      ON CONFLICT(class_session_id,student_id) DO UPDATE SET updated_at=now()
        WHERE session_student_evaluations.state='draft' AND session_student_evaluations.sent_at IS NULL
          AND NULLIF(trim(session_student_evaluations.final_message),'') IS NULL
          AND NULLIF(trim(session_student_evaluations.generated_message),'') IS NULL
          AND session_student_evaluations.notification_published_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.session_student_evaluation_statuses s
            WHERE s.evaluation_id=session_student_evaluations.id)
          AND NOT EXISTS (SELECT 1 FROM public.evaluation_zalo_publications z
            WHERE z.evaluation_id=session_student_evaluations.id)
      RETURNING id INTO eid;
      IF eid IS NULL THEN suppressed:=suppressed+1; CONTINUE; END IF;
    END IF;
    composed:=public.compose_parent_evaluation_message(eid,status_ids,true);
    IF composed IS NULL THEN waiting:=waiting+1; CONTINUE; END IF;
    UPDATE public.session_student_evaluations SET final_message=composed->>'message',
      generated_message=composed->>'message',template_selection=(composed->'template_selection')||
        jsonb_build_object('period_start',v_period_start,'period_end',v_period_end),updated_at=now() WHERE id=eid;
    INSERT INTO public.fortnight_evaluation_publications(class_id,student_id,period_start,period_end,evaluation_id,publication_state)
      VALUES(candidate.class_id,candidate.student_id,v_period_start,v_period_end,eid,'awaiting_parent') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications(user_id,actor_id,type,title,message,ref_id,target_url,meta)
      SELECT DISTINCT ps.parent_id,evaluator,'session_evaluation','MindUp - Tư duy Toàn Diện',composed->>'message',eid,
        'class.html?openClassId='||candidate.class_id,
        jsonb_build_object('evaluation_id',eid,'student_id',candidate.student_id,'class_id',candidate.class_id,
          'class_session_id',candidate.anchor_id,'fortnight_fallback',true,'period_start',v_period_start,'period_end',v_period_end)
      FROM public.parent_students ps JOIN public.users u ON u.id=ps.parent_id AND u.role::text='parent'
      WHERE ps.student_id=candidate.student_id AND ps.revoked_at IS NULL AND ps.parent_id<>ps.student_id;
    GET DIAGNOSTICS rows=ROW_COUNT;
    IF rows>0 THEN
      UPDATE public.session_student_evaluations SET state='sent',sent_at=now(),notification_delivery_state='published',
        notification_published_at=COALESCE(notification_published_at,now()),updated_at=now() WHERE id=eid;
      UPDATE public.fortnight_evaluation_publications p SET publication_state='published',published_at=now()
        WHERE p.class_id=candidate.class_id AND p.student_id=candidate.student_id
          AND p.period_start=v_period_start;
      published:=published+1;
    ELSE waiting:=waiting+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('success',true,'period_start',v_period_start,'period_end',v_period_end,
    'evaluations_published',published,'suppressed_individual',suppressed,'waiting',waiting);
END $$;

REVOKE ALL ON FUNCTION public.pick_parent_evaluation_template(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.render_parent_evaluation_phrase(text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.join_parent_evaluation_phrases(text[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.compose_parent_evaluation_message(uuid,uuid[],boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.parent_evaluation_session_end(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_session_evaluation_draft(uuid,uuid,uuid[],text,jsonb,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_session_evaluation_draft(uuid,uuid,uuid[],text,jsonb,uuid,timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.send_fortnight_evaluation_fallback(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.send_fortnight_evaluation_fallback(timestamptz) TO service_role;

-- First eligible scan is after period closure; repeating scans allow safe late
-- lesson/no-parent retries. Reapplying does not reset the installation baseline.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='mindup-fortnight-evaluation-fallback';
    PERFORM cron.schedule('mindup-fortnight-evaluation-fallback','*/10 0-14 * * *',
      'SELECT public.send_fortnight_evaluation_fallback();');
  END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
