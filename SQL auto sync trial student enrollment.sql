-- 1. Cập nhật ngay các học sinh học thử đã được thêm vào lớp sang trạng thái 'enrolled' (Đã thêm vào lớp)
UPDATE public.trial_lesson_requests tr
SET status = 'enrolled',
    handled_at = COALESCE(tr.handled_at, now())
WHERE tr.status <> 'enrolled'
  AND tr.student_id IS NOT NULL
  AND tr.trial_class_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.class_students cs
    WHERE cs.class_id = tr.trial_class_id
      AND cs.student_id = tr.student_id
      AND cs.left_at IS NULL
  );

-- 2. Tạo trigger tự động cập nhật trạng thái học thử khi học sinh được thêm vào lớp chính thức (class_students)
CREATE OR REPLACE FUNCTION public.sync_trial_request_on_class_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.trial_lesson_requests
    SET status = 'enrolled',
        handled_at = now()
    WHERE trial_class_id = NEW.class_id
      AND student_id = NEW.student_id
      AND status <> 'enrolled';
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_trial_request_on_class_enrollment ON public.class_students;
CREATE TRIGGER trg_sync_trial_request_on_class_enrollment
AFTER INSERT ON public.class_students
FOR EACH ROW
EXECUTE FUNCTION public.sync_trial_request_on_class_enrollment();
