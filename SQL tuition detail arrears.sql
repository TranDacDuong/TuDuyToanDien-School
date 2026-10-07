BEGIN;
CREATE OR REPLACE FUNCTION public.prepare_tuition_detail_bundle(p_student uuid,p_month date,p_amount_due numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE debts jsonb; memo text; amount numeric; existing public.tuition_payments%ROWTYPE;
  broad boolean; family boolean;
BEGIN
  IF auth.uid() IS NULL OR p_month IS NULL OR p_month<>date_trunc('month',p_month)::date
    OR p_amount_due IS NULL OR p_amount_due<0 OR p_amount_due<>trunc(p_amount_due) THEN
    RAISE EXCEPTION 'Invalid tuition detail request';
  END IF;
  broad := public.mindup_is_admin(auth.uid()) OR public.has_app_permission('tuition.view_all');
  family := p_student=auth.uid() OR EXISTS(SELECT 1 FROM public.parent_students
    WHERE parent_id=auth.uid() AND student_id=p_student AND revoked_at IS NULL);
  IF NOT (broad OR family OR (public.has_app_permission('tuition.view_assigned') AND EXISTS(
    SELECT 1 FROM public.class_students cs JOIN public.class_teachers ct ON ct.class_id=cs.class_id
    WHERE cs.student_id=p_student AND ct.teacher_id=auth.uid() AND (cs.left_at IS NULL OR cs.left_at>=p_month)))) THEN
    RAISE EXCEPTION 'Tuition access denied';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_student::text,0));
  SELECT * INTO existing FROM public.tuition_payments WHERE student_id=p_student AND month=p_month FOR UPDATE;
  IF NOT FOUND OR existing.amount_due<>p_amount_due THEN
    IF existing.locked_at IS NOT NULL THEN RAISE EXCEPTION 'Locked tuition amount changed; reload tuition'; END IF;
    IF public.mindup_is_admin(auth.uid()) OR public.has_app_permission('tuition.collect')
      OR public.has_app_permission('tuition.zalo_queue.manage') THEN
      INSERT INTO public.tuition_payments(student_id,month,amount_due,amount_paid)
        VALUES(p_student,p_month,p_amount_due,0)
        ON CONFLICT(student_id,month) DO UPDATE SET amount_due=EXCLUDED.amount_due;
    ELSE
      RAISE EXCEPTION 'Current tuition has not been saved; ask an administrator to save it before generating QR';
    END IF;
  END IF;
  PERFORM 1 FROM public.tuition_payments WHERE student_id=p_student AND month<=p_month ORDER BY month FOR UPDATE;
  SELECT coalesce(jsonb_agg(jsonb_build_object('payment_id',t.id,'month',t.month,
    'remaining',t.amount_due-t.amount_paid) ORDER BY t.month),'[]'::jsonb) INTO debts
    FROM public.tuition_payments t WHERE t.student_id=p_student AND t.month<=p_month AND t.amount_due>t.amount_paid
    AND (broad OR family OR EXISTS(SELECT 1 FROM public.class_students cs JOIN public.class_teachers ct ON ct.class_id=cs.class_id
      WHERE cs.student_id=p_student AND ct.teacher_id=auth.uid() AND (cs.left_at IS NULL OR cs.left_at>=t.month)));
  SELECT coalesce(sum((value->>'remaining')::numeric),0) INTO amount FROM jsonb_array_elements(debts);
  IF amount>0 THEN memo:=public.register_tuition_bundle(p_student,debts); END IF;
  SELECT * INTO existing FROM public.tuition_payments WHERE student_id=p_student AND month=p_month;
  RETURN jsonb_build_object('debts',debts,'remaining',amount,'memo',memo,'payment',to_jsonb(existing));
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_tuition_detail_bundle(uuid,date,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_tuition_detail_bundle(uuid,date,numeric) TO authenticated;
COMMIT;
