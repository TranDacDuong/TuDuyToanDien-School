-- =========================================================
-- ĐỔI VAI TRÒ TÀI KHOẢN TỪ ADMIN SANG TEACHER
-- =========================================================

-- 1. Cập nhật vai trò trong bảng public.users (Thay email bên dưới bằng email tài khoản cần chuyển)
UPDATE public.users
SET role = 'teacher',
    updated_at = now()
WHERE email = 'email_tai_khoan@gmail.com';

-- 2. Đảm bảo cập nhật metadata đồng bộ trong auth.users
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', '"teacher"')
WHERE email = 'email_tai_khoan@gmail.com';

-- Kiểm tra kết quả sau khi cập nhật
SELECT id, email, full_name, role
FROM public.users
WHERE role = 'teacher';
