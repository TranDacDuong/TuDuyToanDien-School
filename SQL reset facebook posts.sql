-- SQL xóa toàn bộ lịch đăng bài Facebook và các công việc liên quan trên hệ thống.
-- Chạy đoạn script này trong Supabase SQL Editor khi muốn làm sạch dữ liệu và tạo lại lịch từ đầu.

-- 1. Xóa phân công task và các task hàng ngày liên quan đến bài đăng Facebook
DELETE FROM public.task_assignments 
WHERE task_id IN (
    SELECT id FROM public.daily_tasks 
    WHERE source_type = 'facebook_marketing' 
       OR source_key LIKE 'facebook_marketing:%'
       OR verification_mode = 'facebook_schedule'
);

DELETE FROM public.daily_tasks 
WHERE source_type = 'facebook_marketing' 
   OR source_key LIKE 'facebook_marketing:%'
   OR verification_mode = 'facebook_schedule';

-- 2. Xóa toàn bộ lịch đăng bài Facebook
TRUNCATE TABLE public.facebook_scheduled_posts CASCADE;
