BEGIN;
CREATE OR REPLACE FUNCTION public.can_view_mindup_family_student(p_parent uuid,p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN ('admin','teacher','assistant','marketing','accountant','staff'))
    AND public.can_access_mindup_official_audience(p_parent)
    AND EXISTS(SELECT 1 FROM public.parent_students WHERE parent_id=p_parent AND student_id=p_student AND revoked_at IS NULL)
    AND (public.is_admin_actor() OR public.teacher_manages_student(p_student));
$$;
REVOKE ALL ON FUNCTION public.can_view_mindup_family_student(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_view_mindup_family_student(uuid,uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.mindup_family_notes (
  id uuid PRIMARY KEY, parent_id uuid NOT NULL REFERENCES public.users(id),
  student_id uuid NOT NULL REFERENCES public.users(id), created_by uuid NOT NULL REFERENCES public.users(id),
  content text NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mindup_family_notes_family ON public.mindup_family_notes(parent_id,student_id,created_at DESC);
ALTER TABLE public.mindup_family_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mindup_family_notes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mindup_family_notes TO authenticated;
DROP POLICY IF EXISTS family_notes_scoped ON public.mindup_family_notes;
CREATE POLICY family_notes_scoped ON public.mindup_family_notes FOR SELECT TO authenticated USING (
  public.can_view_mindup_family_student(parent_id,student_id)
  AND (public.is_admin_actor() OR created_by=auth.uid())
);

CREATE OR REPLACE FUNCTION public.add_mindup_family_note(p_parent uuid,p_student uuid,p_content text,p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET jit=off AS $$
BEGIN
  IF NOT public.can_view_mindup_family_student(p_parent,p_student) THEN RAISE EXCEPTION 'Family access denied'; END IF;
  IF p_id IS NULL OR p_content IS NULL OR length(trim(p_content)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid note'; END IF;
  INSERT INTO public.mindup_family_notes(id,parent_id,student_id,created_by,content)
    VALUES(p_id,p_parent,p_student,auth.uid(),trim(p_content)) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.mindup_family_notes WHERE id=p_id AND parent_id=p_parent AND student_id=p_student
    AND created_by=auth.uid() AND content=trim(p_content)) THEN RAISE EXCEPTION 'Note conflict'; END IF;
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.add_mindup_family_note(uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_mindup_family_note(uuid,uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_mindup_family_info(p_parent uuid,p_month date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET jit=off AS $$
DECLARE result jsonb; children jsonb:='[]'; child record; class_ids uuid[]; finance_ids uuid[];
  finance_allowed boolean; broad boolean; month_end date; billing jsonb; item jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_month IS NULL OR p_month<>date_trunc('month',p_month)::date
    OR p_month<'2000-01-01' OR p_month>date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN RAISE EXCEPTION 'Invalid family request'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN ('admin','teacher','assistant','marketing','accountant','staff'))
    OR NOT public.can_access_mindup_official_audience(p_parent)
    OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_parent AND role::text='parent') THEN RAISE EXCEPTION 'Family access denied'; END IF;
  broad:=public.is_admin_actor() OR public.has_app_permission('tuition.view_all');
  month_end:=(p_month+interval '1 month')::date;
  FOR child IN SELECT u.id,u.full_name,to_jsonb(u) profile FROM public.users u
    WHERE EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.student_id=u.id AND ps.parent_id=p_parent AND ps.revoked_at IS NULL)
      AND public.can_view_mindup_family_student(p_parent,u.id) ORDER BY u.full_name
  LOOP
    SELECT coalesce(array_agg(DISTINCT cs.class_id),'{}') INTO class_ids FROM public.class_students cs
      WHERE cs.student_id=child.id AND (public.is_admin_actor() OR EXISTS(
        SELECT 1 FROM public.class_teachers ct WHERE ct.class_id=cs.class_id AND ct.teacher_id=auth.uid()));
    finance_allowed:=broad OR (public.has_app_permission('tuition.view_assigned') AND cardinality(class_ids)>0
      AND NOT EXISTS(SELECT 1 FROM public.class_students cs WHERE cs.student_id=child.id AND NOT cs.class_id=ANY(class_ids)));
    billing:=NULL;
    IF finance_allowed THEN
      SELECT coalesce(array_agg(DISTINCT cs.class_id),'{}') INTO finance_ids FROM public.class_students cs
        JOIN public.classes c ON c.id=cs.class_id WHERE cs.student_id=child.id AND NOT c.hidden;
      billing:=jsonb_build_object(
        'classes',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
          SELECT c.id,c.class_name,c.tuition_type,c.tuition_fee,c.makeup_fee,
            (SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM public.class_schedules s WHERE s.class_id=c.id) class_schedules
          FROM public.classes c WHERE c.id=ANY(finance_ids))x),
        'classStudents',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
          SELECT cs.id,cs.student_id,cs.class_id,cs.joined_at,cs.left_at,
            jsonb_build_object('id',child.id,'full_name',child.full_name) AS "user"
          FROM public.class_students cs WHERE cs.student_id=child.id AND cs.class_id=ANY(finance_ids))x),
        'chosenSchedules',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
          SELECT class_id,student_id,schedule_id,effective_from FROM public.class_student_schedules
          WHERE student_id=child.id AND class_id=ANY(finance_ids))x),
        'attData',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
          SELECT student_id,class_id,date,status,status_overridden,schedule_id FROM public.attendance
          WHERE student_id=child.id AND class_id=ANY(finance_ids) AND date>=p_month AND date<month_end)x),
        'trialReqs',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
          SELECT student_id,trial_class_id,trial_session_1_at,trial_session_2_at FROM public.trial_lesson_requests
          WHERE student_id=child.id AND trial_class_id=ANY(finance_ids))x),
        'suppSessions',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
          SELECT s.id,s.parent_class_id,s.topic,s.session_date,s.fee_per_student,
            (SELECT coalesce(jsonb_agg(to_jsonb(st)),'[]') FROM (
              SELECT student_id,attendance_status,tuition_fee,tuition_charged FROM public.supplementary_session_students
              WHERE session_id=s.id AND student_id=child.id)st) students
          FROM public.supplementary_sessions s WHERE s.parent_class_id=ANY(finance_ids)
            AND s.status='completed' AND s.session_date>=p_month AND s.session_date<month_end)x),
        'payments',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.month),'[]') FROM (
          SELECT id,student_id,month,amount_due,amount_paid,paid_at,locked_at,gross_components,gross_amount,discount_amount,payment_method
          FROM public.tuition_payments WHERE student_id=child.id AND month<=p_month)x),
        'transactions',CASE WHEN public.is_admin_actor() OR public.has_app_permission('tuition.transactions.view') THEN
          (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
            SELECT l.id,l.created_at,l.gateway,sum(a.amount) amount FROM public.bank_transaction_logs l
              JOIN public.tuition_bank_allocations a ON a.log_id=l.id JOIN public.tuition_payments p ON p.id=a.payment_id
              WHERE p.student_id=child.id AND p.month<=p_month AND l.status IN ('success','resolved')
              GROUP BY l.id,l.created_at,l.gateway
            UNION ALL
            SELECT l.id,l.created_at,l.gateway,l.amount FROM public.bank_transaction_logs l JOIN public.tuition_payments p ON p.id=l.matched_tuition_id
              WHERE p.student_id=child.id AND p.month<=p_month AND l.status IN ('success','resolved')
                AND NOT EXISTS(SELECT 1 FROM public.tuition_bank_allocations a WHERE a.log_id=l.id)
            ORDER BY created_at DESC LIMIT 10)x) ELSE NULL END,
        'discountRules',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]') FROM (
          SELECT d.student_id,d.percent,d.starts_month,d.ends_month,d.class_ids,d.cancelled,d.created_at FROM public.tuition_discounts d WHERE d.student_id=child.id)x)
      );
    END IF;
    item:=jsonb_build_object(
      'id',child.id,'name',child.full_name,'birth_year',child.profile->'birth_year','school',child.profile->'school',
      'province',child.profile->'province','phone',CASE WHEN broad OR public.has_app_permission('tuition.view_assigned') THEN child.profile->'phone' ELSE NULL END,
      'finance',billing,
      'classes',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
        SELECT DISTINCT ON (c.id) c.id,c.class_name,c.hidden,cs.joined_at,cs.left_at,
          (SELECT coalesce(jsonb_agg(jsonb_build_object('name',u.full_name,'role',u.role)),'[]') FROM public.class_teachers ct JOIN public.users u ON u.id=ct.teacher_id WHERE ct.class_id=c.id) teachers,
          (SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM public.class_schedules s WHERE s.class_id=c.id) schedules
        FROM public.class_students cs JOIN public.classes c ON c.id=cs.class_id WHERE cs.student_id=child.id AND c.id=ANY(class_ids)
          AND (cs.joined_at IS NULL OR cs.joined_at<month_end) ORDER BY c.id,cs.joined_at DESC NULLS LAST)x),
      'attendance',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.date DESC),'[]') FROM (
        SELECT class_id,date,status,schedule_id FROM public.attendance WHERE student_id=child.id AND class_id=ANY(class_ids) AND date>=p_month AND date<month_end)x),
      'scores',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
        SELECT s.class_id,t.title,t.test_date,s.score,s.max_score,s.note FROM public.class_offline_test_scores s
          JOIN public.class_offline_tests t ON t.id=s.test_id WHERE s.student_id=child.id AND s.class_id=ANY(class_ids)
          AND t.test_date<month_end ORDER BY t.test_date DESC,s.id DESC LIMIT 5)x),
      'evaluations',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
        SELECT e.class_id,e.state,e.sent_at,e.updated_at,coalesce(nullif(e.final_message,''),e.generated_message) content
        FROM public.session_student_evaluations e WHERE e.student_id=child.id AND e.class_id=ANY(class_ids)
          AND e.updated_at<month_end ORDER BY e.updated_at DESC,e.id DESC LIMIT 3)x),
      'trials',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
        SELECT id,status,trial_class_id,trial_session_1_at,trial_session_2_at FROM public.trial_lesson_requests
        WHERE student_id=child.id AND (public.is_admin_actor() OR trial_class_id=ANY(class_ids))
          AND status::text NOT IN ('enrolled','cancelled','completed'))x),
      'upcoming',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
        SELECT s.parent_class_id,s.topic,s.session_date,s.starts_at,s.ends_at,s.status FROM public.supplementary_sessions s
          WHERE s.parent_class_id=ANY(class_ids) AND s.session_date>=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            AND s.status NOT IN ('completed','cancelled') AND EXISTS(SELECT 1 FROM public.supplementary_session_students ss WHERE ss.session_id=s.id AND ss.student_id=child.id)
          ORDER BY s.session_date,s.starts_at LIMIT 10)x),
      'notes',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
        SELECT n.id,n.content,n.created_at,u.full_name author FROM public.mindup_family_notes n JOIN public.users u ON u.id=n.created_by
        WHERE n.parent_id=p_parent AND n.student_id=child.id AND (public.is_admin_actor() OR n.created_by=auth.uid()) ORDER BY n.created_at DESC,n.id DESC LIMIT 20)x)
    );
    children:=children||jsonb_build_array(item);
  END LOOP;
  SELECT jsonb_build_object('id',u.id,'name',u.full_name,'phone',u.phone,'linked',EXISTS(
    SELECT 1 FROM public.zalo_verified_links z WHERE z.audience_user_id=u.id AND z.enabled)) INTO result FROM public.users u WHERE u.id=p_parent;
  RETURN jsonb_build_object('parent',result,'month',p_month,'students',children);
END $$;
REVOKE ALL ON FUNCTION public.get_mindup_family_info(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_mindup_family_info(uuid,date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
