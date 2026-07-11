-- Allow Admin/Teacher/Assistant to create or link trial student and parent accounts.
-- Run this in Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.admin_import_students_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  row_item jsonb;
  v_email text;
  v_email_base text;
  v_full_name text;
  v_phone text;
  v_parent_full_name text;
  v_parent_phone text;
  v_province text;
  v_school text;
  v_password text;
  v_birth_year integer;
  v_auth_user_id uuid;
  v_public_user_id uuid;
  v_suffix integer;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_processed integer := 0;
  v_created_accounts jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  ) THEN
    RAISE EXCEPTION 'Chỉ admin, giáo viên hoặc trợ giảng mới được tạo/liên kết tài khoản học thử';
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
    v_parent_full_name := nullif(trim(coalesce(row_item->>'parent_full_name', '')), '');
    v_parent_phone := nullif(trim(coalesce(row_item->>'parent_phone', '')), '');
    v_province := nullif(trim(coalesce(row_item->>'province', '')), '');
    v_school := nullif(trim(coalesce(row_item->>'school', '')), '');
    v_password := nullif(trim(coalesce(row_item->>'password', '')), '');

    BEGIN
      v_birth_year := NULLIF(trim(coalesce(row_item->>'birth_year', '')), '')::integer;
    EXCEPTION WHEN others THEN
      v_birth_year := NULL;
    END;

    IF v_email = '' THEN
      v_email_base := regexp_replace(lower(unaccent(coalesce(v_full_name, 'hocsinh'))), '[^a-z0-9]+', '', 'g');
      IF v_email_base = '' THEN
        v_email_base := 'hocsinh';
      END IF;
      v_suffix := 0;
      LOOP
        v_email := CASE
          WHEN v_suffix = 0 THEN v_email_base || '@gmail.com'
          ELSE v_email_base || lpad(v_suffix::text, 2, '0') || '@gmail.com'
        END;
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM auth.users au WHERE lower(au.email) = v_email
        ) AND NOT EXISTS (
          SELECT 1 FROM public.users pu WHERE lower(pu.email) = v_email
        );
        v_suffix := v_suffix + 1;
      END LOOP;
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

    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE lower(email) = v_email
    LIMIT 1;

    IF v_public_user_id IS NULL THEN
      INSERT INTO public.users (
        id,
        email,
        full_name,
        role,
        phone,
        parent_full_name,
        parent_phone,
        birth_year,
        province,
        school
      )
      VALUES (
        v_auth_user_id,
        v_email,
        v_full_name,
        'student',
        v_phone,
        v_parent_full_name,
        v_parent_phone,
        v_birth_year,
        v_province,
        v_school
      );
    ELSE
      UPDATE public.users
      SET
        full_name = COALESCE(v_full_name, public.users.full_name),
        role = 'student',
        phone = COALESCE(v_phone, public.users.phone),
        parent_full_name = COALESCE(v_parent_full_name, public.users.parent_full_name),
        parent_phone = COALESCE(v_parent_phone, public.users.parent_phone),
        birth_year = COALESCE(v_birth_year, public.users.birth_year),
        province = COALESCE(v_province, public.users.province),
        school = COALESCE(v_school, public.users.school)
      WHERE id = v_public_user_id;

      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped,
    'created_accounts', v_created_accounts,
    'errors', v_errors
  );
END;
$$;

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
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text IN ('admin', 'teacher', 'assistant')
  ) THEN
    RAISE EXCEPTION 'Chỉ admin, giáo viên hoặc trợ giảng mới được tạo/liên kết phụ huynh học thử';
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
      UPDATE public.parent_students
      SET revoked_at = now(),
          updated_at = now()
      WHERE student_id = v_student_id
        AND parent_id <> v_parent_id
        AND revoked_at IS NULL;

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

REVOKE ALL ON FUNCTION public.admin_import_students_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_import_parents_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_import_students_batch(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_parents_batch(jsonb) TO authenticated;
