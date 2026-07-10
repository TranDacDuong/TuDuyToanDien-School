-- Remove old automatic social/content tasks completely.
-- Deletes old generated tasks/templates such as:
-- 1) Đăng bài/Hẹn lịch đăng bài trên Facebook
-- 2) Comment dạo các bài viết ngày hôm trước
--
-- Safe to run multiple times.

WITH old_social_tasks AS (
  SELECT id
  FROM public.daily_tasks
  WHERE task_type IN ('facebook_posting', 'social_comment')
     OR source_type IN ('facebook_posting', 'social_comment')
     OR lower(coalesce(source_key, '')) LIKE '%facebook%'
     OR lower(coalesce(source_key, '')) LIKE '%social_comment%'
     OR lower(coalesce(title, '')) LIKE '%facebook%'
     OR lower(coalesce(description, '')) LIKE '%facebook%'
     OR lower(coalesce(title, '')) LIKE '%comment dao%'
     OR lower(coalesce(description, '')) LIKE '%comment dao%'
     OR lower(coalesce(title, '')) LIKE '%comment d%'
     OR lower(coalesce(description, '')) LIKE '%comment d%'
     OR lower(coalesce(title, '')) LIKE '%bai viet ngay hom truoc%'
     OR lower(coalesce(description, '')) LIKE '%bai viet ngay hom truoc%'
     OR lower(coalesce(title, '')) LIKE '%đăng bài%'
     OR lower(coalesce(description, '')) LIKE '%đăng bài%'
     OR lower(coalesce(title, '')) LIKE '%dang bai%'
     OR lower(coalesce(description, '')) LIKE '%dang bai%'
     OR lower(coalesce(title, '')) LIKE '%hẹn lịch%'
     OR lower(coalesce(description, '')) LIKE '%hẹn lịch%'
     OR lower(coalesce(title, '')) LIKE '%hen lich%'
     OR lower(coalesce(description, '')) LIKE '%hen lich%'
     OR lower(metadata::text) LIKE '%facebook%'
     OR lower(metadata::text) LIKE '%social_comment%'
     OR lower(metadata::text) LIKE '%comment dao%'
     OR lower(metadata::text) LIKE '%comment d%'
     OR lower(metadata::text) LIKE '%bai viet ngay hom truoc%'
)
DELETE FROM public.task_events e
USING old_social_tasks t
WHERE e.task_id = t.id;

WITH old_social_tasks AS (
  SELECT id
  FROM public.daily_tasks
  WHERE task_type IN ('facebook_posting', 'social_comment')
     OR source_type IN ('facebook_posting', 'social_comment')
     OR lower(coalesce(source_key, '')) LIKE '%facebook%'
     OR lower(coalesce(source_key, '')) LIKE '%social_comment%'
     OR lower(coalesce(title, '')) LIKE '%facebook%'
     OR lower(coalesce(description, '')) LIKE '%facebook%'
     OR lower(coalesce(title, '')) LIKE '%comment dao%'
     OR lower(coalesce(description, '')) LIKE '%comment dao%'
     OR lower(coalesce(title, '')) LIKE '%comment d%'
     OR lower(coalesce(description, '')) LIKE '%comment d%'
     OR lower(coalesce(title, '')) LIKE '%bai viet ngay hom truoc%'
     OR lower(coalesce(description, '')) LIKE '%bai viet ngay hom truoc%'
     OR lower(coalesce(title, '')) LIKE '%đăng bài%'
     OR lower(coalesce(description, '')) LIKE '%đăng bài%'
     OR lower(coalesce(title, '')) LIKE '%dang bai%'
     OR lower(coalesce(description, '')) LIKE '%dang bai%'
     OR lower(coalesce(title, '')) LIKE '%hẹn lịch%'
     OR lower(coalesce(description, '')) LIKE '%hẹn lịch%'
     OR lower(coalesce(title, '')) LIKE '%hen lich%'
     OR lower(coalesce(description, '')) LIKE '%hen lich%'
     OR lower(metadata::text) LIKE '%facebook%'
     OR lower(metadata::text) LIKE '%social_comment%'
     OR lower(metadata::text) LIKE '%comment dao%'
     OR lower(metadata::text) LIKE '%comment d%'
     OR lower(metadata::text) LIKE '%bai viet ngay hom truoc%'
)
DELETE FROM public.task_assignments a
USING old_social_tasks t
WHERE a.task_id = t.id;

DELETE FROM public.daily_tasks
WHERE task_type IN ('facebook_posting', 'social_comment')
   OR source_type IN ('facebook_posting', 'social_comment')
   OR lower(coalesce(source_key, '')) LIKE '%facebook%'
   OR lower(coalesce(source_key, '')) LIKE '%social_comment%'
   OR lower(coalesce(title, '')) LIKE '%facebook%'
   OR lower(coalesce(description, '')) LIKE '%facebook%'
   OR lower(coalesce(title, '')) LIKE '%comment dao%'
   OR lower(coalesce(description, '')) LIKE '%comment dao%'
   OR lower(coalesce(title, '')) LIKE '%comment d%'
   OR lower(coalesce(description, '')) LIKE '%comment d%'
   OR lower(coalesce(title, '')) LIKE '%bai viet ngay hom truoc%'
   OR lower(coalesce(description, '')) LIKE '%bai viet ngay hom truoc%'
   OR lower(coalesce(title, '')) LIKE '%đăng bài%'
   OR lower(coalesce(description, '')) LIKE '%đăng bài%'
   OR lower(coalesce(title, '')) LIKE '%dang bai%'
   OR lower(coalesce(description, '')) LIKE '%dang bai%'
   OR lower(coalesce(title, '')) LIKE '%hẹn lịch%'
   OR lower(coalesce(description, '')) LIKE '%hẹn lịch%'
   OR lower(coalesce(title, '')) LIKE '%hen lich%'
   OR lower(coalesce(description, '')) LIKE '%hen lich%'
   OR lower(metadata::text) LIKE '%facebook%'
   OR lower(metadata::text) LIKE '%social_comment%'
   OR lower(metadata::text) LIKE '%comment dao%'
   OR lower(metadata::text) LIKE '%comment d%'
   OR lower(metadata::text) LIKE '%bai viet ngay hom truoc%';

DELETE FROM public.task_templates
WHERE lower(coalesce(title, '')) LIKE '%facebook%'
   OR lower(coalesce(description, '')) LIKE '%facebook%'
   OR lower(coalesce(title, '')) LIKE '%comment dao%'
   OR lower(coalesce(description, '')) LIKE '%comment dao%'
   OR lower(coalesce(title, '')) LIKE '%comment d%'
   OR lower(coalesce(description, '')) LIKE '%comment d%'
   OR lower(coalesce(title, '')) LIKE '%bai viet ngay hom truoc%'
   OR lower(coalesce(description, '')) LIKE '%bai viet ngay hom truoc%'
   OR lower(coalesce(title, '')) LIKE '%đăng bài%'
   OR lower(coalesce(description, '')) LIKE '%đăng bài%'
   OR lower(coalesce(title, '')) LIKE '%dang bai%'
   OR lower(coalesce(description, '')) LIKE '%dang bai%'
   OR lower(coalesce(title, '')) LIKE '%hẹn lịch%'
   OR lower(coalesce(description, '')) LIKE '%hẹn lịch%'
   OR lower(coalesce(title, '')) LIKE '%hen lich%'
   OR lower(coalesce(description, '')) LIKE '%hen lich%'
   OR lower(requirements::text) LIKE '%facebook%'
   OR lower(requirements::text) LIKE '%social_comment%'
   OR lower(requirements::text) LIKE '%comment dao%'
   OR lower(requirements::text) LIKE '%comment d%'
   OR lower(requirements::text) LIKE '%bai viet ngay hom truoc%';
