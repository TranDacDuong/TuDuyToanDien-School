-- ============================================================
-- SQL Fix: Fix complete_supplementary_session function
-- Lỗi đã sửa: column "ref_id" is of type uuid but expression is of type text
-- ============================================================

-- 1. Đảm bảo bảng notifications không bị giới hạn cứng type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- 2. Cập nhật lại RPC Function: complete_supplementary_session
CREATE OR REPLACE FUNCTION public.complete_supplementary_session(
    p_session_id UUID,
    p_attendance JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_item JSONB;
    v_student_id UUID;
    v_status TEXT;
    v_fee NUMERIC;
    v_parent_record RECORD;
    v_msg TEXT;
BEGIN
    SELECT * INTO v_session FROM public.supplementary_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Buổi học bổ sung không tồn tại.';
    END IF;

    -- Lặp qua từng học sinh để cập nhật điểm danh và học phí
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_attendance) LOOP
        v_student_id := (v_item->>'student_id')::UUID;
        v_status := COALESCE(v_item->>'attendance_status', 'present');
        v_fee := COALESCE((v_item->>'tuition_fee')::NUMERIC, v_session.fee_per_student);

        UPDATE public.supplementary_session_students
        SET attendance_status = v_status,
            tuition_fee = v_fee,
            tuition_charged = (v_status IN ('present', 'late')),
            updated_at = now()
        WHERE session_id = p_session_id AND student_id = v_student_id;

        -- Gửi thông báo cho phụ huynh nếu học sinh Có mặt hoặc Đi muộn
        IF v_status IN ('present', 'late') THEN
            FOR v_parent_record IN
                SELECT parent_id FROM public.parent_students WHERE student_id = v_student_id AND revoked_at IS NULL
            LOOP
                v_msg := 'Thông báo từ MindUp: Buổi dạy bổ sung "' || v_session.topic || '" ngày ' || to_char(v_session.session_date, 'DD/MM/YYYY') || ' đã hoàn thành. Học phí đính kèm: ' || to_char(v_fee, 'FM999,999,999') || 'đ.';
                BEGIN
                    INSERT INTO public.notifications (user_id, actor_id, type, ref_id, message)
                    VALUES (v_parent_record.parent_id, auth.uid(), 'supplementary_session_completed', p_session_id, v_msg);
                EXCEPTION WHEN OTHERS THEN
                    -- Bỏ qua nếu có lỗi gửi thông báo để không chặn việc hoàn tất buổi học
                    NULL;
                END;
            END LOOP;
        END IF;
    END LOOP;

    -- Đánh dấu buổi học hoàn thành
    UPDATE public.supplementary_sessions
    SET status = 'completed',
        updated_at = now()
    WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'session_id', p_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_supplementary_session(UUID, JSONB) TO authenticated, service_role;
