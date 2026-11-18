BEGIN;

CREATE OR REPLACE FUNCTION public.create_class_student_profile(
  p_class uuid, p_student_name text, p_student_phone text, p_school text,
  p_parent_name text, p_parent_phone text, p_confirm_parent uuid DEFAULT NULL,
  p_distinct_student_phone boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
  student_name text:=btrim(coalesce(p_student_name,''));
  parent_name text:=btrim(coalesce(p_parent_name,''));
  school_name text:=btrim(coalesce(p_school,''));
  normalized_student_phone text:=regexp_replace(regexp_replace(coalesce(p_student_phone,''),'[^0-9]','','g'),'^84([0-9]{9})$','0\1');
  normalized_parent_phone text:=regexp_replace(regexp_replace(coalesce(p_parent_phone,''),'[^0-9]','','g'),'^84([0-9]{9})$','0\1');
  student_matches jsonb;
  parent_matches jsonb;
  student public.users;
  parent public.users;
  student_account jsonb;
  parent_account jsonb;
  account_email text;
  email_base text;
  password_value text;
  suffix integer;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.has_app_permission('class.students.add'),false)
    OR NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id=p_class AND NOT coalesce(c.hidden,false))
    OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=auth.uid()
      AND u.role::text IN ('admin','teacher','assistant')
      AND (u.role::text='admin' OR public.has_app_permission('classes.all.view')
        OR EXISTS (SELECT 1 FROM public.class_teachers ct WHERE ct.class_id=p_class AND ct.teacher_id=u.id)))
  THEN RAISE EXCEPTION 'Bạn không có quyền tạo học sinh từ lớp này'; END IF;

  IF length(student_name) NOT BETWEEN 1 AND 150 OR length(parent_name) NOT BETWEEN 1 AND 150
    OR length(school_name) NOT BETWEEN 1 AND 200
    OR normalized_student_phone !~ '^0[0-9]{9}$' OR normalized_parent_phone !~ '^0[0-9]{9}$'
  THEN RAISE EXCEPTION 'Vui lòng nhập đủ họ tên, trường và số điện thoại hợp lệ'; END IF;

  -- Serialize profile creation from different classes using the same role and phone.
  PERFORM pg_advisory_xact_lock(hashtextextended('class-profile:student:'||normalized_student_phone,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('class-profile:parent:'||normalized_parent_phone,0));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'full_name',u.full_name,'email',u.email)
    ORDER BY u.full_name,u.id),'[]') INTO student_matches
  FROM public.users u
  WHERE u.role::text='student'
    AND regexp_replace(regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'),'^84([0-9]{9})$','0\1')=normalized_student_phone
    AND (NOT coalesce(p_distinct_student_phone,false)
      OR regexp_replace(lower(unaccent(u.full_name)),'[^a-z0-9]','','g')=
         regexp_replace(lower(unaccent(student_name)),'[^a-z0-9]','','g'));
  IF jsonb_array_length(student_matches)>0 THEN
    RETURN jsonb_build_object('status','student_exists','students',student_matches,
      'can_create_distinct',NOT EXISTS (SELECT 1 FROM jsonb_array_elements(student_matches) item
        WHERE regexp_replace(lower(unaccent(item->>'full_name')),'[^a-z0-9]','','g')=
              regexp_replace(lower(unaccent(student_name)),'[^a-z0-9]','','g')));
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'full_name',u.full_name,'email',u.email)),'[]')
    INTO parent_matches FROM public.users u
  WHERE u.role::text='parent'
    AND regexp_replace(regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'),'^84([0-9]{9})$','0\1')=normalized_parent_phone;
  IF jsonb_array_length(parent_matches)>1 THEN
    RAISE EXCEPTION 'Số điện thoại này có nhiều hồ sơ phụ huynh. Vui lòng nhờ quản trị viên kiểm tra.';
  ELSIF jsonb_array_length(parent_matches)=1 THEN
    IF p_confirm_parent IS DISTINCT FROM (parent_matches->0->>'id')::uuid THEN
      RETURN jsonb_build_object('status','confirm_parent','parent',parent_matches->0);
    END IF;
    SELECT * INTO STRICT parent FROM public.users WHERE id=p_confirm_parent FOR UPDATE;
    IF parent.role::text<>'parent'
      OR regexp_replace(regexp_replace(coalesce(parent.phone,''),'[^0-9]','','g'),'^84([0-9]{9})$','0\1')<>normalized_parent_phone
    THEN RAISE EXCEPTION 'Hồ sơ phụ huynh vừa thay đổi. Vui lòng kiểm tra lại.'; END IF;
    parent_name:=coalesce(nullif(parent.full_name,''),parent_name);
  ELSIF p_confirm_parent IS NOT NULL THEN
    RAISE EXCEPTION 'Hồ sơ phụ huynh vừa thay đổi. Vui lòng kiểm tra lại.';
  END IF;

  -- Use the same Gmail naming convention as the class-trial form.
  -- Serialize allocation even when two different phone numbers have the same suffix.
  PERFORM pg_advisory_xact_lock(hashtextextended('class-profile:allocate-email',0));
  email_base:=coalesce(nullif(left(regexp_replace(lower(unaccent(student_name)),'[^a-z0-9]','','g'),28),''),'hocsinh')||right(normalized_student_phone,4);
  suffix:=0;
  LOOP
    account_email:=email_base||CASE WHEN suffix=0 THEN '' ELSE suffix::text END||'@gmail.com';
    EXIT WHEN NOT EXISTS(SELECT 1 FROM auth.users u WHERE lower(u.email)=account_email)
      AND NOT EXISTS(SELECT 1 FROM public.users u WHERE lower(u.email)=account_email);
    suffix:=suffix+1;
  END LOOP;
  password_value:=encode(gen_random_bytes(12),'hex');
  student_account:=public.admin_import_students_batch(jsonb_build_array(jsonb_build_object(
    'email',account_email,'full_name',student_name,'phone',normalized_student_phone,'school',school_name,
    'parent_full_name',parent_name,'parent_phone',normalized_parent_phone,'password',password_value)));
  IF coalesce((student_account->>'inserted')::int,0)<>1 THEN
    RAISE EXCEPTION 'Không tạo được tài khoản học sinh. Vui lòng thử lại.';
  END IF;
  SELECT * INTO STRICT student FROM public.users WHERE email=account_email AND role::text='student';
  UPDATE public.users SET account_password=password_value WHERE id=student.id;
  student_account:=jsonb_build_object('id',student.id,'full_name',student.full_name,'email',student.email,'password',password_value);

  IF parent.id IS NULL THEN
    email_base:=coalesce(nullif(left(regexp_replace(lower(unaccent(parent_name)),'[^a-z0-9]','','g'),28),''),'phuhuynh')||right(normalized_parent_phone,4);
    suffix:=0;
    LOOP
      account_email:=email_base||CASE WHEN suffix=0 THEN '' ELSE suffix::text END||'@gmail.com';
      EXIT WHEN NOT EXISTS(SELECT 1 FROM auth.users u WHERE lower(u.email)=account_email)
        AND NOT EXISTS(SELECT 1 FROM public.users u WHERE lower(u.email)=account_email);
      suffix:=suffix+1;
    END LOOP;
    password_value:=encode(gen_random_bytes(12),'hex');
    parent_account:=public.admin_import_parents_batch(jsonb_build_array(jsonb_build_object(
      'email',account_email,'full_name',parent_name,'phone',normalized_parent_phone,
      'password',password_value,'student_id',student.id,'relationship','parent')));
    IF coalesce((parent_account->>'inserted')::int,0)<>1 OR coalesce((parent_account->>'linked')::int,0)<>1 THEN
      RAISE EXCEPTION 'Không tạo được tài khoản phụ huynh. Vui lòng thử lại.';
    END IF;
    UPDATE public.users SET account_password=password_value WHERE email=account_email AND role::text='parent';
    parent_account:=jsonb_build_object('email',account_email,'password',password_value);
  ELSE
    INSERT INTO public.parent_students(parent_id,student_id,relationship,created_by)
    VALUES (parent.id,student.id,'parent',auth.uid());
  END IF;

  RETURN jsonb_build_object('status','created','student',student_account,'parent',parent_account);
END;
$$;

REVOKE ALL ON FUNCTION public.create_class_student_profile(uuid,text,text,text,text,text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_class_student_profile(uuid,text,text,text,text,text,uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
