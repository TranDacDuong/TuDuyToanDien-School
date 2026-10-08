BEGIN;
INSERT INTO public.app_permissions(permission_key,section,label,description,sort_order,group_key,group_label,subgroup_key,subgroup_label,action_key,access_level,is_sensitive,is_assignable)
VALUES('tuition.discounts.manage','Học phí','Quản lý miễn/giảm học phí','Thiết lập tỷ lệ, lớp và thời gian miễn/giảm học phí.',123,'page.tuition','Học phí','tuition.payments','Thu và hoàn tiền','discount','full',true,true)
ON CONFLICT(permission_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tuition_discounts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES public.users(id),
  percent numeric(5,2) NOT NULL CHECK(percent>0 AND percent<=100),
  starts_month date NOT NULL CHECK(starts_month=date_trunc('month',starts_month)::date),
  ends_month date CHECK(ends_month=date_trunc('month',ends_month)::date),
  class_ids uuid[], reason text NOT NULL DEFAULT '', cancelled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tuition_discount_audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, discount_id uuid REFERENCES public.tuition_discounts(id),
  actor_id uuid, action text NOT NULL, before_value jsonb, after_value jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tuition_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuition_discount_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tuition_discounts,public.tuition_discount_audit FROM anon,authenticated;
GRANT SELECT ON public.tuition_discounts TO authenticated;
DROP POLICY IF EXISTS tuition_discounts_read ON public.tuition_discounts;
CREATE POLICY tuition_discounts_read ON public.tuition_discounts FOR SELECT TO authenticated USING(
  public.mindup_is_admin(auth.uid()) OR public.has_app_permission('tuition.discounts.manage') OR public.has_app_permission('tuition.view_all')
  OR student_id=auth.uid() OR EXISTS(SELECT 1 FROM public.parent_students ps WHERE ps.student_id=tuition_discounts.student_id AND ps.parent_id=auth.uid() AND ps.revoked_at IS NULL)
  OR (public.has_app_permission('tuition.view_assigned') AND EXISTS(SELECT 1 FROM public.class_students cs JOIN public.class_teachers ct ON ct.class_id=cs.class_id WHERE cs.student_id=tuition_discounts.student_id AND ct.teacher_id=auth.uid())));
ALTER TABLE public.tuition_payments ADD COLUMN IF NOT EXISTS gross_components jsonb;
ALTER TABLE public.tuition_payments ADD COLUMN IF NOT EXISTS gross_amount numeric;
ALTER TABLE public.tuition_payments ADD COLUMN IF NOT EXISTS discount_amount numeric;

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
    components:=components||jsonb_build_array(jsonb_build_object('class_id',item->>'class_id','amount',value,'percent',coalesce(rate,0)));
  END LOOP;
  RETURN jsonb_build_object('gross',gross,'discount',reduction,'due',gross-reduction,'components',components);
END;
$$;

CREATE OR REPLACE FUNCTION public.tuition_discount_catalog()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.mindup_is_admin(auth.uid()) OR public.has_app_permission('tuition.discounts.manage')) THEN RAISE EXCEPTION 'Discount permission required'; END IF;
  RETURN jsonb_build_object('students',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name,'phone',phone) ORDER BY full_name),'[]'::jsonb) FROM public.users WHERE role::text='student'),
    'classes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',class_name) ORDER BY class_name),'[]'::jsonb) FROM public.classes WHERE NOT hidden),
    'rules',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY created_at DESC),'[]'::jsonb) FROM public.tuition_discounts d));
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_tuition_discount(p_id uuid,p_action text,p_student uuid DEFAULT NULL,p_percent numeric DEFAULT NULL,p_start date DEFAULT NULL,p_end date DEFAULT NULL,p_classes uuid[] DEFAULT NULL,p_reason text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.tuition_discounts%ROWTYPE; current_month date:=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  new_id uuid; payment record; totals jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.mindup_is_admin(auth.uid()) OR public.has_app_permission('tuition.discounts.manage')) THEN RAISE EXCEPTION 'Discount permission required'; END IF;
  IF p_action NOT IN ('save','stop') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  IF p_action='stop' AND p_id IS NULL THEN RAISE EXCEPTION 'Discount required'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO old FROM public.tuition_discounts WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Discount not found'; END IF;
    p_student:=old.student_id;
  END IF;
  IF p_student IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_student AND role::text='student') THEN RAISE EXCEPTION 'Invalid student'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_student::text,0));
  IF p_id IS NOT NULL THEN
    SELECT * INTO old FROM public.tuition_discounts WHERE id=p_id FOR UPDATE;
    IF old.cancelled OR old.ends_month<current_month THEN RAISE EXCEPTION 'Historical discount cannot be changed'; END IF;
    UPDATE public.tuition_discounts SET ends_month=CASE WHEN starts_month<current_month THEN current_month-INTERVAL '1 month' ELSE ends_month END,
      cancelled=starts_month>=current_month WHERE id=p_id;
    INSERT INTO public.tuition_discount_audit(discount_id,actor_id,action,before_value,after_value)
      SELECT id,auth.uid(),p_action,to_jsonb(old),to_jsonb(d) FROM public.tuition_discounts d WHERE id=p_id;
  END IF;
  IF p_action='save' THEN
    IF p_start IS NULL OR p_start<current_month OR p_start<>date_trunc('month',p_start)::date
      OR p_percent IS NULL OR p_percent<=0 OR p_percent>100 OR p_percent<>round(p_percent,2)
      OR (p_end IS NOT NULL AND (p_end<p_start OR p_end<>date_trunc('month',p_end)::date)) OR length(coalesce(p_reason,''))>1000 THEN RAISE EXCEPTION 'Invalid discount period or percentage'; END IF;
    IF cardinality(p_classes)=0 THEN p_classes:=NULL; END IF;
    IF p_classes IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(p_classes) x WHERE x IS NULL OR NOT EXISTS(SELECT 1 FROM public.classes c WHERE c.id=x)) THEN RAISE EXCEPTION 'Invalid classes'; END IF;
    IF EXISTS(SELECT 1 FROM public.tuition_discounts d WHERE d.student_id=p_student AND NOT d.cancelled
      AND d.starts_month<=coalesce(p_end,'infinity'::date) AND coalesce(d.ends_month,'infinity'::date)>=p_start
      AND (d.class_ids IS NULL OR p_classes IS NULL OR d.class_ids&&p_classes)) THEN RAISE EXCEPTION 'Discount overlaps an existing period and class'; END IF;
    INSERT INTO public.tuition_discounts(student_id,percent,starts_month,ends_month,class_ids,reason,created_by)
      VALUES(p_student,p_percent,p_start,p_end,p_classes,coalesce(p_reason,''),auth.uid()) RETURNING id INTO new_id;
    INSERT INTO public.tuition_discount_audit(discount_id,actor_id,action,after_value)
      SELECT id,auth.uid(),'create',to_jsonb(d) FROM public.tuition_discounts d WHERE id=new_id;
  END IF;
  FOR payment IN SELECT * FROM public.tuition_payments WHERE student_id=p_student AND month>=current_month AND locked_at IS NULL AND gross_components IS NOT NULL ORDER BY month FOR UPDATE LOOP
    totals:=public.tuition_discount_totals(p_student,payment.month,payment.gross_components);
    UPDATE public.tuition_payments SET amount_due=(totals->>'due')::numeric,gross_amount=(totals->>'gross')::numeric,
      discount_amount=(totals->>'discount')::numeric,gross_components=totals->'components',updated_at=now() WHERE id=payment.id;
  END LOOP;
  RETURN coalesce(new_id,p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_tuition_discount_basis(p_month date,p_rows jsonb)
RETURNS SETOF public.tuition_payments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; student uuid; totals jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.mindup_is_admin(auth.uid()) OR public.has_app_permission('tuition.discounts.manage')) THEN RAISE EXCEPTION 'Discount permission required'; END IF;
  IF NOT public.mindup_is_admin(auth.uid()) AND NOT public.has_app_permission('tuition.view_all') THEN RAISE EXCEPTION 'Full tuition scope required'; END IF;
  IF p_month IS NULL OR p_month<date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date OR p_month<>date_trunc('month',p_month)::date OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'Invalid basis'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    student:=(item->>'student_id')::uuid;
    PERFORM pg_advisory_xact_lock(hashtextextended(student::text,0));
    IF EXISTS(SELECT 1 FROM public.tuition_payments WHERE student_id=student AND month=p_month AND locked_at IS NOT NULL) THEN CONTINUE; END IF;
    totals:=public.tuition_discount_totals(student,p_month,item->'components');
    INSERT INTO public.tuition_payments(student_id,month,amount_due,amount_paid,gross_components,gross_amount,discount_amount)
      VALUES(student,p_month,(totals->>'due')::numeric,0,totals->'components',(totals->>'gross')::numeric,(totals->>'discount')::numeric)
      ON CONFLICT(student_id,month) DO UPDATE SET amount_due=EXCLUDED.amount_due,gross_components=EXCLUDED.gross_components,
        gross_amount=EXCLUDED.gross_amount,discount_amount=EXCLUDED.discount_amount,updated_at=now();
    RETURN QUERY SELECT * FROM public.tuition_payments WHERE student_id=student AND month=p_month;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.tuition_discount_totals(uuid,date,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.manage_tuition_discount(uuid,text,uuid,numeric,date,date,uuid[],text),public.tuition_discount_catalog(),public.save_tuition_discount_basis(date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_tuition_discount(uuid,text,uuid,numeric,date,date,uuid[],text),public.tuition_discount_catalog(),public.save_tuition_discount_basis(date,jsonb) TO authenticated;
COMMIT;
