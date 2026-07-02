-- Create secure RPC function for Admin to reset student passwords to a default value
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(p_user_email text, p_new_password text DEFAULT 'mindup')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with DB owner privileges to modify auth.users
SET search_path = public, auth, extensions
AS $$
BEGIN
  -- 1. Verify if the calling user has 'admin' role in public.users
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'Chỉ tài khoản Admin mới có quyền thực hiện chức năng này';
  END IF;

  -- 2. Update the encrypted password for the target email
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE lower(email) = lower(trim(p_user_email));

  -- 3. Return status
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy tài khoản với email này');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Đã đặt lại mật khẩu thành công về mặc định: ' || p_new_password);
END;
$$;

-- Revoke execute privilege from public and grant to authenticated users
REVOKE ALL ON FUNCTION public.admin_reset_user_password(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(text, text) TO authenticated;
