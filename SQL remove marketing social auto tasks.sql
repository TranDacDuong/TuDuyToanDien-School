-- Remove old automatic social/content tasks.
-- Deletes:
-- 1) Đăng bài/Hẹn lịch đăng bài trên Facebook
-- 2) Comment dạo các bài viết ngày hôm trước

DELETE FROM public.task_events
WHERE task_id IN (
  SELECT id
  FROM public.daily_tasks
  WHERE task_type IN ('facebook_posting', 'social_comment')
     OR source_type IN ('facebook_posting', 'social_comment')
     OR title ILIKE '%Đăng bài/Hẹn lịch đăng bài%'
     OR title ILIKE '%Facebook%'
     OR title ILIKE '%Comment dạo%'
);

DELETE FROM public.task_assignments
WHERE task_id IN (
  SELECT id
  FROM public.daily_tasks
  WHERE task_type IN ('facebook_posting', 'social_comment')
     OR source_type IN ('facebook_posting', 'social_comment')
     OR title ILIKE '%Đăng bài/Hẹn lịch đăng bài%'
     OR title ILIKE '%Facebook%'
     OR title ILIKE '%Comment dạo%'
);

DELETE FROM public.daily_tasks
WHERE task_type IN ('facebook_posting', 'social_comment')
   OR source_type IN ('facebook_posting', 'social_comment')
   OR title ILIKE '%Đăng bài/Hẹn lịch đăng bài%'
   OR title ILIKE '%Facebook%'
   OR title ILIKE '%Comment dạo%';

DELETE FROM public.task_templates
WHERE title ILIKE '%Đăng bài/Hẹn lịch đăng bài%'
   OR title ILIKE '%Facebook%'
   OR title ILIKE '%Comment dạo%'
   OR description ILIKE '%Đăng bài/Hẹn lịch đăng bài%'
   OR description ILIKE '%Facebook%'
   OR description ILIKE '%Comment dạo%';
