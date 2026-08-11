-- SQL tạo thêm 1 tài khoản Admin mới trên Supabase
-- Hãy thay email, mật khẩu và họ tên mong muốn ở các dòng bên dưới trước khi chạy trong Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
  user_email text := 'admin2@mindup.edu.vn'; -- ✏️ Thay email admin mới tại đây
  user_password text := 'MatKhauAdmin123@'; -- ✏️ Thay mật khẩu mong muốn tại đây
  user_fullname text := 'Quản Trị Viên 2';  -- ✏️ Thay họ tên admin mới tại đây
BEGIN
  -- 1. Nếu email đã tồn tại trong auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(user_email))) THEN
    -- Đổi mật khẩu tài khoản hiện tại & Nâng quyền admin trong public.users
    UPDATE auth.users
    SET encrypted_password = crypt(user_password, gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE lower(email) = lower(trim(user_email));

    UPDATE public.users
    SET role = 'admin',
        full_name = user_fullname
    WHERE lower(email) = lower(trim(user_email));

    RAISE NOTICE 'Tài khoản % đã tồn tại! Đã nâng quyền thành Admin và cập nhật mật khẩu mới.', user_email;
  ELSE
    -- 2. Nếu tài khoản chưa tồn tại ➔ Tạo mới hoàn toàn trong auth.users & public.users
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      lower(trim(user_email)),
      crypt(user_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', user_fullname),
      now(),
      now(),
      'authenticated',
      'authenticated'
    );

    INSERT INTO public.users (id, email, full_name, role, created_at)
    VALUES (new_user_id, lower(trim(user_email)), user_fullname, 'admin', now())
    ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = EXCLUDED.full_name;

    RAISE NOTICE 'Đã tạo thành công tài khoản Admin mới: %', user_email;
  END IF;
END $$;
