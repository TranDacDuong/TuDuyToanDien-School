BEGIN;

CREATE OR REPLACE FUNCTION public.tuition_discount_totals(p_student uuid,p_month date,p_components jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; rate numeric; gross numeric:=0; reduction numeric:=0; value numeric; components jsonb:='[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_components) IS DISTINCT FROM 'array' OR jsonb_array_length(p_components)>100 THEN RAISE EXCEPTION 'Invalid tuition components'; END IF;
  FOR item IN SELECT x.value FROM jsonb_array_elements(p_components) x LOOP
    value:=(item->>'amount')::numeric;
    IF value IS NULL OR value<0 OR value<>trunc(value) OR item->>'class_id' IS NULL THEN RAISE EXCEPTION 'Invalid tuition component'; END IF;
    SELECT d.percent INTO rate FROM public.tuition_discounts d WHERE d.student_id=p_student AND NOT d.cancelled
      AND d.starts_month<=p_month AND (d.ends_month IS NULL OR d.ends_month>=p_month)
      AND (d.class_ids IS NULL OR (item->>'class_id')::uuid=ANY(d.class_ids)) ORDER BY d.created_at DESC LIMIT 1;
    gross:=gross+value; reduction:=reduction+round(value*coalesce(rate,0)/100);
    components:=components||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('class_id',item->>'class_id','amount',value,'percent',coalesce(rate,0),
      'first_regular_on',CASE WHEN (item->>'first_regular_on')::date>=p_month
        AND (item->>'first_regular_on')::date<p_month+interval '1 month' THEN item->>'first_regular_on' END)));
  END LOOP;
  RETURN jsonb_build_object('gross',gross,'discount',reduction,'due',gross-reduction,'components',components);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_tuition_discount_basis(p_month date,p_rows jsonb)
RETURNS SETOF public.tuition_payments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; student uuid; totals jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (auth.uid() IS NULL OR NOT (public.mindup_is_admin(auth.uid()) OR public.has_app_permission('tuition.discounts.manage'))) THEN RAISE EXCEPTION 'Discount permission required'; END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.mindup_is_admin(auth.uid()) AND NOT public.has_app_permission('tuition.view_all') THEN RAISE EXCEPTION 'Full tuition scope required'; END IF;
  IF p_month IS NULL OR p_month<>date_trunc('month',p_month)::date OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'Invalid basis'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    student:=(item->>'student_id')::uuid;
    PERFORM pg_advisory_xact_lock(hashtextextended(student::text,0));
    IF EXISTS(SELECT 1 FROM public.tuition_payments WHERE student_id=student AND month=p_month AND locked_at IS NOT NULL) THEN CONTINUE; END IF;
    totals:=public.tuition_discount_totals(student,p_month,item->'components');
    INSERT INTO public.tuition_payments(student_id,month,amount_due,amount_paid,gross_components,gross_amount,discount_amount)
      VALUES(student,p_month,(totals->>'due')::numeric,0,totals->'components',(totals->>'gross')::numeric,(totals->>'discount')::numeric)
      ON CONFLICT(student_id,month) DO UPDATE SET amount_due=EXCLUDED.amount_due,gross_components=EXCLUDED.gross_components,
        gross_amount=EXCLUDED.gross_amount,discount_amount=EXCLUDED.discount_amount,updated_at=now()
      WHERE (tuition_payments.amount_due,tuition_payments.gross_components,tuition_payments.gross_amount,tuition_payments.discount_amount)
        IS DISTINCT FROM (EXCLUDED.amount_due,EXCLUDED.gross_components,EXCLUDED.gross_amount,EXCLUDED.discount_amount);
    RETURN QUERY SELECT * FROM public.tuition_payments WHERE student_id=student AND month=p_month;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_tuition_discount_basis(date,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.tuition_trial_billing_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH dates AS (
    SELECT date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS current_month
  ), scope AS (
    SELECT DISTINCT cs.student_id
    FROM dates d JOIN public.class_students cs
      ON cs.joined_at<d.current_month+interval '1 month'
      AND (cs.left_at IS NULL OR cs.left_at>=d.current_month-interval '1 month')
    WHERE NOT cs.is_trial AND cs.tuition_starts_on IS NULL
      AND EXISTS (
        SELECT 1 FROM public.attendance a WHERE a.student_id=cs.student_id AND a.class_id=cs.class_id
          AND a.status='trial' AND a.status_overridden AND a.date>=cs.joined_at::date
          AND a.date<d.current_month+interval '1 month'
          AND (cs.left_at IS NULL OR a.date<=cs.left_at::date)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.tuition_payments t
        CROSS JOIN LATERAL jsonb_array_elements(coalesce(t.gross_components,'[]')) part
        WHERE t.student_id=cs.student_id AND t.month<d.current_month-interval '1 month'
          AND part->>'class_id'=cs.class_id::text AND (part->>'amount')::numeric>0
      )
  ), memberships AS (
    SELECT cs.* FROM dates d JOIN public.class_students cs
      ON cs.joined_at<d.current_month+interval '1 month'
      AND (cs.left_at IS NULL OR cs.left_at>=d.current_month-interval '1 month')
    JOIN scope s ON s.student_id=cs.student_id
  )
  SELECT jsonb_build_object(
    'months',jsonb_build_array(to_char(d.current_month-interval '1 month','YYYY-MM'),to_char(d.current_month,'YYYY-MM')),
    'classStudents',(SELECT coalesce(jsonb_agg(to_jsonb(cs)),'[]') FROM memberships cs),
    'classes',(SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('class_schedules',
      (SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM public.class_schedules s WHERE s.class_id=c.id))),'[]')
      FROM public.classes c WHERE NOT c.hidden AND c.id IN (SELECT class_id FROM memberships)),
    'attData',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.attendance a JOIN scope s USING(student_id)
      WHERE a.date>=d.current_month-interval '1 month' AND a.date<d.current_month+interval '1 month'),
    'chosenSchedules',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM public.class_student_schedules c JOIN scope s USING(student_id)),
    'trialReqs',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.trial_lesson_requests t JOIN scope s USING(student_id)),
    'suppSessions',(SELECT coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('students',x.students)),'[]')
      FROM (
        SELECT supp.*, (SELECT jsonb_agg(to_jsonb(st)) FROM public.supplementary_session_students st
          JOIN scope s USING(student_id) WHERE st.session_id=supp.id) AS students
        FROM public.supplementary_sessions supp WHERE supp.status='completed'
          AND supp.session_date>=d.current_month-interval '1 month' AND supp.session_date<d.current_month+interval '1 month'
      ) x WHERE x.students IS NOT NULL),
    'discountRules','[]'::jsonb)
  FROM dates d;
$$;
REVOKE ALL ON FUNCTION public.tuition_trial_billing_context() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tuition_trial_billing_context() TO service_role;

CREATE OR REPLACE FUNCTION public.save_trial_tuition_basis(p_month date,p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE context jsonb:=public.tuition_trial_billing_context();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_month IS NULL OR p_month<>date_trunc('month',p_month)::date
    OR NOT (context->'months' ? to_char(p_month,'YYYY-MM'))
    OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>100
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_rows) row
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(context->'classStudents') cs
        WHERE cs->>'student_id'=row->>'student_id'
      )
    ) THEN RAISE EXCEPTION 'Invalid trial tuition basis scope'; END IF;
  PERFORM public.save_tuition_discount_basis(p_month,p_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.save_trial_tuition_basis(date,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_trial_tuition_basis(date,jsonb) TO service_role;

-- Determine which saved class charges are still waiting for their first collection.
-- Keep accounting in the original month, including discounts and recorded payments.
CREATE OR REPLACE FUNCTION public.tuition_trial_hold(p_payment public.tuition_payments,p_today date)
RETURNS TABLE(class_id uuid, amount numeric)
LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT (component->>'class_id')::uuid,
    (component->>'amount')::numeric-round((component->>'amount')::numeric*coalesce((component->>'percent')::numeric,0)/100)
  FROM jsonb_array_elements(coalesce(p_payment.gross_components,'[]')) component
  CROSS JOIN LATERAL (
    SELECT min(a.date::date) AS trial_date
    FROM public.attendance a
    JOIN public.class_students cs ON cs.student_id=a.student_id AND cs.class_id=a.class_id
      AND a.date>=cs.joined_at::date AND (cs.left_at IS NULL OR a.date<=cs.left_at::date)
      AND NOT cs.is_trial AND cs.tuition_starts_on IS NULL
    WHERE a.student_id=p_payment.student_id AND a.class_id=(component->>'class_id')::uuid
      AND a.status='trial' AND a.status_overridden
      AND a.date<p_payment.month+interval '1 month'
  ) trial
  WHERE p_today<p_payment.month+interval '1 month 4 days'
    AND (component->>'amount')::numeric>0
    AND trial.trial_date IS NOT NULL
    AND (component->>'first_regular_on' IS NULL OR trial.trial_date<(component->>'first_regular_on')::date)
    AND NOT EXISTS (
      SELECT 1 FROM public.attendance a WHERE a.student_id=p_payment.student_id
        AND a.class_id=(component->>'class_id')::uuid
        AND a.date<trial.trial_date AND a.status IN ('present','makeup')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.tuition_payments earlier
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(earlier.gross_components,'[]')) previous
      WHERE earlier.student_id=p_payment.student_id AND earlier.month<p_payment.month
        AND previous->>'class_id'=component->>'class_id' AND (previous->>'amount')::numeric>0
    );
$$;
REVOKE ALL ON FUNCTION public.tuition_trial_hold(public.tuition_payments,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tuition_debt_snapshot(p_student uuid,p_month date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('payment_id',payment.id,'month',payment.month,
    'remaining',available.remaining) ||
    CASE WHEN hold.amount>0 THEN jsonb_build_object('deferred_class_ids',hold.classes) ELSE '{}'::jsonb END
    ORDER BY payment.month),'[]'::jsonb)
  FROM public.tuition_payments payment
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(h.amount),0) AS amount,array_agg(DISTINCT h.class_id ORDER BY h.class_id) AS classes
    FROM public.tuition_trial_hold(payment,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) h
  ) hold
  CROSS JOIN LATERAL (SELECT payment.amount_due-payment.amount_paid-hold.amount AS remaining) available
  WHERE payment.student_id=p_student AND payment.month<=p_month AND available.remaining>0;
$$;

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
  SELECT coalesce(jsonb_agg(d ORDER BY d->>'month'),'[]'::jsonb) INTO debts
    FROM jsonb_array_elements(public.tuition_debt_snapshot(p_student,p_month)) d
    WHERE broad OR family OR EXISTS(SELECT 1 FROM public.class_students cs JOIN public.class_teachers ct ON ct.class_id=cs.class_id
      WHERE cs.student_id=p_student AND ct.teacher_id=auth.uid() AND (cs.left_at IS NULL OR cs.left_at>=(d->>'month')::date));
  SELECT coalesce(sum((value->>'remaining')::numeric),0) INTO amount FROM jsonb_array_elements(debts);
  IF amount>0 THEN memo:=public.register_tuition_bundle(p_student,debts); END IF;
  SELECT * INTO existing FROM public.tuition_payments WHERE student_id=p_student AND month=p_month;
  RETURN jsonb_build_object('debts',debts,'remaining',amount,'memo',memo,'payment',to_jsonb(existing));
END;
$$;

-- Keep the same eligible amounts for old delivery records and bank allocation.
DO $migration$
DECLARE source text; anchor text;
BEGIN
  source:=pg_get_functiondef('public.reconcile_tuition_bundle(uuid)'::regprocedure);
  anchor:='allocated:=least(remaining,greatest(0,payment.amount_due-payment.amount_paid));';
  IF position('public.tuition_trial_hold' IN source)=0 THEN
    IF position(anchor IN source)=0 THEN RAISE EXCEPTION 'Unexpected transfer reconciliation definition'; END IF;
    EXECUTE replace(source,anchor,'allocated:=least(remaining,greatest(0,payment.amount_due-payment.amount_paid-
      (SELECT coalesce(sum(amount),0) FROM public.tuition_trial_hold(
        (SELECT t FROM public.tuition_payments t WHERE t.id=payment.id),(now() AT TIME ZONE ''Asia/Ho_Chi_Minh'')::date))));');
  END IF;
END;
$migration$;

NOTIFY pgrst,'reload schema';
COMMIT;
