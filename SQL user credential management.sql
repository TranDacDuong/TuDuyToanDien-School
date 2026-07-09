-- Allow managed account email/password updates from the app UI.
-- Notes:
-- - Supabase Auth passwords cannot be read back after hashing.
-- - account_password stores the latest password set by the center/app so it can be shown in admin/trial forms.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS account_password text;

CREATE OR REPLACE FUNCTION public.admin_update_user_credentials(
  p_user_id uuid,
  p_new_email text DEFAULT NULL,
  p_new_password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_actor_role text;
  v_target_role text;
  v_old_email text;
  v_new_email text;
  v_new_password text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để đổi tài khoản.';
  END IF;

  SELECT role::text INTO v_actor_role
  FROM public.users
  WHERE id = auth.uid();

  SELECT role::text, email
  INTO v_target_role, v_old_email
  FROM public.users
  WHERE id = p_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy người dùng cần cập nhật.';
  END IF;

  IF v_actor_role = 'admin' THEN
    -- Admin can update every account.
    NULL;
  ELSIF v_actor_role IN ('teacher', 'assistant') AND v_target_role IN ('student', 'parent') THEN
    -- Teachers/assistants can manage student/parent accounts from trial workflows.
    NULL;
  ELSE
    RAISE EXCEPTION 'Bạn không có quyền đổi tài khoản này.';
  END IF;

  v_new_email := lower(nullif(trim(coalesce(p_new_email, '')), ''));
  v_new_password := nullif(trim(coalesce(p_new_password, '')), '');

  IF v_new_email IS NULL AND v_new_password IS NULL THEN
    RETURN jsonb_build_object('success', true, 'changed', false);
  END IF;

  IF v_new_email IS NOT NULL AND v_new_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Gmail/email không hợp lệ.';
  END IF;

  IF v_new_password IS NOT NULL AND length(v_new_password) < 6 THEN
    RAISE EXCEPTION 'Mật khẩu phải có ít nhất 6 ký tự.';
  END IF;

  IF v_new_email IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE lower(u.email) = v_new_email
      AND u.id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Email này đã tồn tại trong bảng người dùng.';
  END IF;

  IF v_new_email IS NOT NULL AND EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE lower(au.email) = v_new_email
      AND au.id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Email này đã tồn tại trong Supabase Auth.';
  END IF;

  UPDATE auth.users
  SET
    email = COALESCE(v_new_email, email),
    encrypted_password = CASE
      WHEN v_new_password IS NOT NULL THEN crypt(v_new_password, gen_salt('bf'))
      ELSE encrypted_password
    END,
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now(),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) ||
      CASE WHEN v_new_email IS NOT NULL THEN jsonb_build_object('email', v_new_email) ELSE '{}'::jsonb END
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản Auth tương ứng.';
  END IF;

  IF v_new_email IS NOT NULL THEN
    UPDATE auth.identities
    SET
      provider_id = v_new_email,
      identity_data = COALESCE(identity_data, '{}'::jsonb)
        || jsonb_build_object('email', v_new_email, 'email_verified', true),
      updated_at = now()
    WHERE user_id = p_user_id
      AND provider = 'email';
  END IF;

  UPDATE public.users
  SET
    email = COALESCE(v_new_email, email),
    account_password = COALESCE(v_new_password, account_password)
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'changed', true,
    'user_id', p_user_id,
    'email', COALESCE(v_new_email, v_old_email),
    'password', v_new_password
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(p_user_email text, p_new_password text DEFAULT 'mindup')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'Chỉ tài khoản Admin mới có quyền thực hiện chức năng này';
  END IF;

  SELECT id INTO v_user_id
  FROM public.users
  WHERE lower(email) = lower(trim(p_user_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy tài khoản với email này');
  END IF;

  RETURN public.admin_update_user_credentials(v_user_id, p_user_email, p_new_password);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_parent_student_credentials()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  account_password text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.phone,
    u.account_password
  FROM public.parent_students ps
  JOIN public.users u ON u.id = ps.student_id
  WHERE ps.parent_id = auth.uid()
    AND ps.revoked_at IS NULL
  ORDER BY u.full_name NULLS LAST, u.email;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user_credentials(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user_credentials(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_reset_user_password(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_parent_student_credentials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_parent_student_credentials() TO authenticated;
