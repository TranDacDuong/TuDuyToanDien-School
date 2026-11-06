BEGIN;
CREATE OR REPLACE FUNCTION public.tuition_notice_context(p_parent uuid,p_month date,p_students uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE children jsonb; ids uuid[]; classes_ids uuid[]; bank public.zalo_bot_config; context jsonb; statement_context jsonb; from_month date;
BEGIN
 IF p_month IS NULL OR p_month<>date_trunc('month',p_month)::date OR p_month<'2000-01-01'
  OR p_month>date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN RAISE EXCEPTION 'Tháng học phí không hợp lệ'; END IF;
 SELECT coalesce(jsonb_agg(c ORDER BY c->>'student_id'),'[]') INTO children
 FROM jsonb_array_elements(public.automatic_tuition_snapshot(p_parent,p_month)) c
 WHERE p_students IS NULL OR (c->>'student_id')::uuid=ANY(p_students);
 IF jsonb_array_length(children)=0 THEN RETURN NULL; END IF;
 IF auth.role() IS DISTINCT FROM 'service_role' AND public.has_app_permission('tuition.view_all') IS DISTINCT FROM true AND EXISTS(SELECT 1 FROM jsonb_array_elements(children)c WHERE NOT public.can_view_mindup_family_student(p_parent,(c->>'student_id')::uuid)) THEN RAISE EXCEPTION 'Student scope denied'; END IF;
 SELECT array_agg((c->>'student_id')::uuid) INTO ids FROM jsonb_array_elements(children)c;
 SELECT coalesce(min((d->>'month')::date),p_month) INTO from_month FROM jsonb_array_elements(children)c CROSS JOIN LATERAL jsonb_array_elements(c->'debts')d;
 SELECT array_agg(DISTINCT class_id) INTO classes_ids FROM (
 SELECT class_id FROM public.class_students WHERE student_id=ANY(ids)
 UNION SELECT class_id FROM public.attendance WHERE student_id=ANY(ids) AND date>=from_month AND date<(p_month+interval '1 month')) scoped_classes;
 SELECT * INTO bank FROM public.zalo_bot_config WHERE id='default' AND is_active;
 IF NOT FOUND OR bank.bank_account_no IS NULL OR bank.bank_name IS NULL OR bank.bank_account_no !~ '^[0-9]{6,30}$' THEN RAISE EXCEPTION 'Chưa cấu hình ngân hàng học phí'; END IF;
 context:=jsonb_build_object(
 'classes',(SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('class_schedules',
   (SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM public.class_schedules s WHERE s.class_id=c.id))),'[]') FROM public.classes c WHERE c.id=ANY(classes_ids) AND NOT c.hidden),
 'classStudents',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM public.class_students c WHERE c.student_id=ANY(ids)),
 'chosenSchedules',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM public.class_student_schedules c WHERE c.student_id=ANY(ids)),
 'attData',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.attendance a WHERE a.student_id=ANY(ids) AND a.date>=p_month AND a.date<(p_month+interval '1 month')),
 'trialReqs',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.trial_lesson_requests t WHERE t.student_id=ANY(ids)),
 'suppSessions',(SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('students',
   (SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.supplementary_session_students t WHERE t.session_id=s.id AND t.student_id=ANY(ids)))),'[]')
   FROM public.supplementary_sessions s WHERE s.parent_class_id=ANY(classes_ids) AND s.status='completed' AND s.session_date>=p_month AND s.session_date<(p_month+interval '1 month')),
 'payments',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.tuition_payments t WHERE t.student_id=ANY(ids) AND t.month=p_month),
 'discountRules',(SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]') FROM public.tuition_discounts d WHERE d.student_id=ANY(ids)));
 -- Keep the current-month preview context stable; statements additionally need
 -- saved payment and attendance records for every month in the transfer bundle.
 statement_context:=context||jsonb_build_object(
 'classes',(SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('class_schedules',
   (SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM public.class_schedules s WHERE s.class_id=c.id))),'[]') FROM public.classes c WHERE c.id=ANY(classes_ids)),
 'attData',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.attendance a WHERE a.student_id=ANY(ids) AND a.date>=from_month AND a.date<(p_month+interval '1 month')),
 'payments',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.tuition_payments t WHERE t.student_id=ANY(ids) AND t.month>=from_month AND t.month<=p_month),
 'suppSessions',(SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('students',
   (SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.supplementary_session_students t WHERE t.session_id=s.id AND t.student_id=ANY(ids)))),'[]')
   FROM public.supplementary_sessions s WHERE s.parent_class_id=ANY(classes_ids) AND s.status='completed' AND s.session_date>=from_month AND s.session_date<(p_month+interval '1 month')));
 RETURN jsonb_build_object('version',2,'month',to_char(p_month,'YYYY-MM'),'parent_id',p_parent,
 'parentName',(SELECT full_name FROM public.users WHERE id=p_parent),'parentPhone',(SELECT regexp_replace(phone,'[^0-9]','','g') FROM public.users WHERE id=p_parent),'children',children,'billing_context',context,'statement_context',statement_context,
 'captured_at',clock_timestamp(),'bank',jsonb_build_object('code',lower(regexp_replace(bank.bank_name,'[^a-zA-Z0-9]','','g')),
 'bankName',bank.bank_name,'account',bank.bank_account_no),
 'template',coalesce((SELECT notice_template FROM public.automatic_tuition_control WHERE id=1),''));
END; $$;
REVOKE ALL ON FUNCTION public.tuition_notice_context(uuid,date,uuid[]) FROM PUBLIC,anon,authenticated;


UPDATE public.automatic_tuition_control SET notice_template=$template$Trung tâm MindUp kính gửi Quý phụ huynh thông báo học phí của em {TenHS} tháng {Thang} năm {Nam}:
Tổng số tiền: {SoTien}đ bao gồm học phí của {CacThang}.
Ngân hàng: {TenNganHang}
Số tài khoản: {SoTaiKhoan}
Nội dung chuyển khoản: {NoiDungCK}
Gửi kèm: {AnhDinhKem} (mỗi ảnh kèm theo số tiền trong từng tháng) và ảnh QR chuyển khoản chung.$template$ WHERE id=1;
UPDATE public.tuition_notice_jobs j SET payload=public.tuition_notice_context(j.parent_id,j.month,j.student_filter),updated_at=clock_timestamp() WHERE j.status='queued' AND j.manifest IS NULL AND j.next_part=0 AND j.part_started=false AND j.acknowledgements='[]'::jsonb AND public.tuition_notice_context(j.parent_id,j.month,j.student_filter) IS NOT NULL;
NOTIFY pgrst,'reload schema';
COMMIT;
