-- Xóa hoàn toàn mẫu công việc tự động cũ: "Đăng bài/Hẹn lịch đăng bài trên Facebook"
-- và các công việc cũ sinh ra từ mẫu đó.

DELETE FROM public.admin_task_templates
WHERE lower(coalesce(title, '')) LIKE '%đăng bài%'
   OR lower(coalesce(title, '')) LIKE '%hẹn lịch%'
   OR lower(coalesce(title, '')) LIKE '%facebook%';

DELETE FROM public.task_templates
WHERE lower(coalesce(title, '')) LIKE '%đăng bài%'
   OR lower(coalesce(title, '')) LIKE '%hẹn lịch%'
   OR lower(coalesce(title, '')) LIKE '%facebook%';

WITH old_tasks AS (
  SELECT id FROM public.daily_tasks
  WHERE (
    lower(coalesce(title, '')) LIKE '%đăng bài/hẹn lịch%'
    OR lower(coalesce(title, '')) LIKE '%hẹn lịch đăng bài trên facebook%'
  ) AND source_type != 'facebook_fanpage'
)
DELETE FROM public.task_assignments a
USING old_tasks t
WHERE a.task_id = t.id;

DELETE FROM public.daily_tasks
WHERE (
  lower(coalesce(title, '')) LIKE '%đăng bài/hẹn lịch%'
  OR lower(coalesce(title, '')) LIKE '%hẹn lịch đăng bài trên facebook%'
) AND source_type != 'facebook_fanpage';
