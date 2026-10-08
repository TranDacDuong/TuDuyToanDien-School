BEGIN;
SELECT 1 FROM public.mindup_zalo_dispatch_control WHERE id=1 FOR UPDATE;
DO $$
DECLARE s uuid; a uuid; c uuid; d uuid; p public.tuition_payments%ROWTYPE; basis jsonb;
BEGIN
 SELECT id INTO a FROM public.users WHERE role::text='admin' LIMIT 1;
 SELECT id INTO s FROM public.users u WHERE role::text='student'
  AND NOT EXISTS(SELECT 1 FROM public.tuition_payments WHERE student_id=u.id AND month>='2090-01-01')
  AND NOT EXISTS(SELECT 1 FROM public.tuition_discounts WHERE student_id=u.id) LIMIT 1;
 SELECT id INTO c FROM public.classes LIMIT 1;
 IF s IS NULL OR a IS NULL OR c IS NULL THEN RAISE EXCEPTION 'Missing fixture'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',a)::text,true);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 basis:=jsonb_build_array(jsonb_build_object('student_id',s,'components',jsonb_build_array(jsonb_build_object('class_id',c,'amount',100000,'percent',99))));
 PERFORM public.save_tuition_discount_basis('2090-10-01',basis);
 SELECT * INTO p FROM public.tuition_payments WHERE student_id=s AND month='2090-10-01';
 IF p.amount_due<>100000 OR (p.gross_components->0->>'percent')::numeric<>0 THEN RAISE EXCEPTION 'Client rate trusted'; END IF;
 UPDATE public.tuition_payments SET amount_paid=10000 WHERE id=p.id;
 d:=public.manage_tuition_discount(NULL,'save',s,25,'2090-10-01','2090-11-01',ARRAY[c],'test');
 SELECT * INTO p FROM public.tuition_payments WHERE student_id=s AND month='2090-10-01';
 IF p.amount_due<>75000 OR p.amount_paid<>10000 OR p.discount_amount<>25000 OR (p.gross_components->0->>'percent')::numeric<>25 THEN RAISE EXCEPTION 'Discount accounting failed'; END IF;
 BEGIN
  PERFORM public.manage_tuition_discount(NULL,'save',s,50,'2090-10-01',NULL,NULL,'overlap');
  RAISE EXCEPTION 'Overlap allowed';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Discount overlaps an existing period and class' THEN RAISE; END IF;
 END;
 UPDATE public.tuition_payments SET locked_at=now() WHERE id=p.id;
 PERFORM public.manage_tuition_discount(d,'stop');
 SELECT * INTO p FROM public.tuition_payments WHERE student_id=s AND month='2090-10-01';
 IF p.amount_due<>75000 THEN RAISE EXCEPTION 'Locked invoice changed'; END IF;
 PERFORM public.save_tuition_discount_basis('2090-10-01',basis);
 SELECT * INTO p FROM public.tuition_payments WHERE student_id=s AND month='2090-10-01';
 IF p.amount_due<>75000 THEN RAISE EXCEPTION 'Locked basis changed'; END IF;
 PERFORM public.save_tuition_discount_basis('2000-01-01',basis);
 d:=public.manage_tuition_discount(NULL,'save',s,50,'2000-01-01','2000-01-01',ARRAY[c],'retroactive');
 SELECT * INTO p FROM public.tuition_payments WHERE student_id=s AND month='2000-01-01';
 IF p.amount_due<>50000 THEN RAISE EXCEPTION 'Past discount failed'; END IF;
 UPDATE public.tuition_payments SET amount_paid=20000 WHERE id=p.id;
 d:=public.manage_tuition_discount(d,'save',s,100,'2000-01-01','2000-01-01',ARRAY[c],'revised');
 SELECT * INTO p FROM public.tuition_payments WHERE student_id=s AND month='2000-01-01';
 IF p.amount_due<>0 OR p.amount_paid<>20000 THEN RAISE EXCEPTION 'Past revision lost paid balance'; END IF;
 PERFORM set_config('request.jwt.claim.sub',s::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',s)::text,true);
 BEGIN
  PERFORM public.manage_tuition_discount(NULL,'save',s,100,'2090-12-01');
  RAISE EXCEPTION 'Permission bypass';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Discount permission required' THEN RAISE; END IF; END;
END;
$$;
SELECT 'PASS: rates, paid balance, locked months, overlap, history boundary and permissions' AS result;
ROLLBACK;
