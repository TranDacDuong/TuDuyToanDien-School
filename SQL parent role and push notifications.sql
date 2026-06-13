-- ============================================
-- MindUp parent role + parent/student links
-- Run in Supabase SQL Editor.
-- ============================================

DO $$
DECLARE
  role_type regtype;
BEGIN
  SELECT atttypid::regtype INTO role_type
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'role'
    AND NOT attisdropped;

  IF role_type IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_enum
       WHERE enumtypid = role_type::oid
         AND enumlabel = 'parent'
     ) THEN
    EXECUTE format('ALTER TYPE %s ADD VALUE IF NOT EXISTS %L', role_type, 'parent');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.parent_students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'parent',
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  CONSTRAINT parent_students_pkey PRIMARY KEY (id),
  CONSTRAINT parent_students_unique UNIQUE (parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS parent_students_parent_active_idx
  ON public.parent_students (parent_id, revoked_at, student_id);

CREATE INDEX IF NOT EXISTS parent_students_student_active_idx
  ON public.parent_students (student_id, revoked_at, parent_id);

CREATE OR REPLACE FUNCTION public.set_parent_students_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_parent_students_updated_at ON public.parent_students;
CREATE TRIGGER set_parent_students_updated_at
BEFORE UPDATE ON public.parent_students
FOR EACH ROW
EXECUTE FUNCTION public.set_parent_students_updated_at();

ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_students_select_policy ON public.parent_students;
CREATE POLICY parent_students_select_policy ON public.parent_students
FOR SELECT
USING (
  parent_id = auth.uid()
  OR student_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text = 'admin'
  )
);

DROP POLICY IF EXISTS parent_students_admin_insert_policy ON public.parent_students;
CREATE POLICY parent_students_admin_insert_policy ON public.parent_students
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text = 'admin'
  )
);

DROP POLICY IF EXISTS parent_students_admin_update_policy ON public.parent_students;
CREATE POLICY parent_students_admin_update_policy ON public.parent_students
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text = 'admin'
  )
);

DROP POLICY IF EXISTS parent_students_admin_delete_policy ON public.parent_students;
CREATE POLICY parent_students_admin_delete_policy ON public.parent_students
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text = 'admin'
  )
);

-- Parent read access to child learning data.
DROP POLICY IF EXISTS class_students_parent_select ON public.class_students;
CREATE POLICY class_students_parent_select ON public.class_students
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.parent_id = auth.uid()
      AND ps.student_id = class_students.student_id
      AND ps.revoked_at IS NULL
  )
);

DROP POLICY IF EXISTS class_student_schedules_parent_select ON public.class_student_schedules;
CREATE POLICY class_student_schedules_parent_select ON public.class_student_schedules
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.parent_id = auth.uid()
      AND ps.student_id = class_student_schedules.student_id
      AND ps.revoked_at IS NULL
  )
);

DROP POLICY IF EXISTS attendance_parent_select ON public.attendance;
CREATE POLICY attendance_parent_select ON public.attendance
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.parent_id = auth.uid()
      AND ps.student_id = attendance.student_id
      AND ps.revoked_at IS NULL
  )
);

DROP POLICY IF EXISTS tuition_payments_parent_select ON public.tuition_payments;
CREATE POLICY tuition_payments_parent_select ON public.tuition_payments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.parent_id = auth.uid()
      AND ps.student_id = tuition_payments.student_id
      AND ps.revoked_at IS NULL
  )
);

DROP POLICY IF EXISTS exam_results_parent_select ON public.exam_results;
CREATE POLICY exam_results_parent_select ON public.exam_results
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.parent_id = auth.uid()
      AND ps.student_id = exam_results.student_id
      AND ps.revoked_at IS NULL
  )
);

DROP POLICY IF EXISTS pdf_exam_results_parent_select ON public.pdf_exam_results;
CREATE POLICY pdf_exam_results_parent_select ON public.pdf_exam_results
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.parent_id = auth.uid()
      AND ps.student_id = pdf_exam_results.student_id
      AND ps.revoked_at IS NULL
  )
);

DROP POLICY IF EXISTS course_enrollments_parent_select ON public.course_enrollments;
CREATE POLICY course_enrollments_parent_select ON public.course_enrollments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.parent_id = auth.uid()
      AND ps.student_id = course_enrollments.student_id
      AND ps.revoked_at IS NULL
  )
);

-- Admin helper: create/update parent accounts and optionally link them to students.
CREATE OR REPLACE FUNCTION public.admin_import_parents_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  row_item jsonb;
  v_email text;
  v_full_name text;
  v_phone text;
  v_password text;
  v_student_id uuid;
  v_student_email text;
  v_auth_user_id uuid;
  v_parent_id uuid;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_linked integer := 0;
  v_processed integer := 0;
  v_created_accounts jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'Chỉ admin mới được tạo phụ huynh';
  END IF;

  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Dữ liệu import phải là một mảng JSON';
  END IF;

  FOR row_item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_processed := v_processed + 1;
    v_email := lower(trim(coalesce(row_item->>'email', '')));
    v_full_name := nullif(trim(coalesce(row_item->>'full_name', '')), '');
    v_phone := nullif(trim(coalesce(row_item->>'phone', '')), '');
    v_password := nullif(trim(coalesce(row_item->>'password', '')), '');
    v_student_email := lower(trim(coalesce(row_item->>'student_email', '')));
    v_student_id := nullif(trim(coalesce(row_item->>'student_id', '')), '')::uuid;

    IF v_email = '' THEN
      RAISE EXCEPTION 'Dòng % thiếu email phụ huynh', v_processed;
    END IF;

    IF v_password IS NULL THEN
      v_password := nullif(regexp_replace(coalesce(v_phone, ''), '\D+', '', 'g'), '');
      IF v_password IS NULL OR length(v_password) < 6 THEN
        v_password := '123456';
      END IF;
    END IF;

    SELECT id INTO v_auth_user_id
    FROM auth.users
    WHERE lower(email) = v_email
    LIMIT 1;

    IF v_auth_user_id IS NULL THEN
      v_auth_user_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
      )
      VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_auth_user_id,
        'authenticated',
        'authenticated',
        v_email,
        crypt(v_password, gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
        jsonb_build_object('full_name', coalesce(v_full_name, split_part(v_email, '@', 1))),
        now(),
        now(),
        '',
        '',
        '',
        ''
      );

      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      )
      VALUES (
        gen_random_uuid(),
        v_auth_user_id,
        jsonb_build_object(
          'sub', v_auth_user_id::text,
          'email', v_email,
          'email_verified', true,
          'phone_verified', false
        ),
        'email',
        v_email,
        now(),
        now(),
        now()
      );

      v_inserted := v_inserted + 1;
      v_created_accounts := v_created_accounts || jsonb_build_array(jsonb_build_object(
        'email', v_email,
        'full_name', v_full_name,
        'password', v_password,
        'status', 'created'
      ));
    END IF;

    SELECT id INTO v_parent_id
    FROM public.users
    WHERE lower(email) = v_email
    LIMIT 1;

    IF v_parent_id IS NULL THEN
      INSERT INTO public.users (id, email, full_name, role, phone)
      VALUES (v_auth_user_id, v_email, v_full_name, 'parent', v_phone)
      RETURNING id INTO v_parent_id;
    ELSE
      UPDATE public.users
      SET full_name = COALESCE(v_full_name, public.users.full_name),
          role = 'parent',
          phone = COALESCE(v_phone, public.users.phone)
      WHERE id = v_parent_id;
      v_updated := v_updated + 1;
    END IF;

    IF v_student_id IS NULL AND v_student_email <> '' THEN
      SELECT id INTO v_student_id
      FROM public.users
      WHERE lower(email) = v_student_email
        AND role::text = 'student'
      LIMIT 1;
    END IF;

    IF v_student_id IS NOT NULL THEN
      INSERT INTO public.parent_students (parent_id, student_id, relationship, created_by, revoked_at)
      VALUES (v_parent_id, v_student_id, coalesce(nullif(row_item->>'relationship', ''), 'parent'), auth.uid(), NULL)
      ON CONFLICT (parent_id, student_id)
      DO UPDATE SET
        relationship = EXCLUDED.relationship,
        revoked_at = NULL,
        updated_at = now();
      v_linked := v_linked + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'inserted', v_inserted,
    'updated', v_updated,
    'linked', v_linked,
    'created_accounts', v_created_accounts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_import_parents_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_import_parents_batch(jsonb) TO authenticated;
