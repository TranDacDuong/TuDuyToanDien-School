-- Enforce: mỗi học sinh chỉ có 1 tài khoản phụ huynh đang liên kết.
-- Chạy file này trên Supabase SQL Editor sau khi deploy code.

-- 1) Dọn dữ liệu cũ: nếu một học sinh đang có nhiều phụ huynh active,
-- giữ lại liên kết được cập nhật/tạo mới nhất, revoke các liên kết còn lại.
WITH ranked_links AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY student_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.parent_students
  WHERE revoked_at IS NULL
)
UPDATE public.parent_students ps
SET revoked_at = now(),
    updated_at = now()
FROM ranked_links rl
WHERE ps.id = rl.id
  AND rl.rn > 1;

-- 2) Chặn lỗi tái diễn ở tầng database.
CREATE UNIQUE INDEX IF NOT EXISTS parent_students_one_active_parent_per_student_idx
  ON public.parent_students (student_id)
  WHERE revoked_at IS NULL;

-- 3) Cập nhật function tạo/liên kết phụ huynh:
-- trước khi link phụ huynh mới cho học sinh, tự revoke phụ huynh active cũ.
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

REVOKE ALL ON FUNCTION public.admin_import_parents_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_import_parents_batch(jsonb) TO authenticated;
