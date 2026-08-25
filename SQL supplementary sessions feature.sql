-- SQL Migration: Supplementary Sessions (Lớp / Buổi dạy bổ sung 1 lần)
-- Allows teachers to schedule one-off supplementary sessions for late-enrolled or struggling students.

CREATE TABLE IF NOT EXISTS public.supplementary_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parent_class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    topic TEXT NOT NULL,
    session_date DATE NOT NULL,
    starts_at TIME NOT NULL,
    ends_at TIME NOT NULL,
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    fee_per_student NUMERIC(12,2) DEFAULT 0 NOT NULL,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supplementary_session_students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.supplementary_sessions(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    attendance_status TEXT DEFAULT 'present' CHECK (attendance_status IN ('present', 'absent', 'late', 'excused')),
    tuition_fee NUMERIC(12,2) DEFAULT 0 NOT NULL,
    tuition_charged BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_session_student UNIQUE (session_id, student_id)
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_supp_sessions_class ON public.supplementary_sessions(parent_class_id);
CREATE INDEX IF NOT EXISTS idx_supp_sessions_teacher ON public.supplementary_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_supp_sessions_date ON public.supplementary_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_supp_sessions_status ON public.supplementary_sessions(status);
CREATE INDEX IF NOT EXISTS idx_supp_students_session ON public.supplementary_session_students(session_id);
CREATE INDEX IF NOT EXISTS idx_supp_students_student ON public.supplementary_session_students(student_id);

-- Enable RLS
ALTER TABLE public.supplementary_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplementary_session_students ENABLE ROW LEVEL SECURITY;

-- Policies for supplementary_sessions
DROP POLICY IF EXISTS supp_sessions_select_all ON public.supplementary_sessions;
CREATE POLICY supp_sessions_select_all ON public.supplementary_sessions
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS supp_sessions_staff_all ON public.supplementary_sessions;
CREATE POLICY supp_sessions_staff_all ON public.supplementary_sessions
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
            AND u.role IN ('admin', 'assistant', 'teacher', 'staff', 'employee', 'marketing', 'accountant')
        )
    );

-- Policies for supplementary_session_students
DROP POLICY IF EXISTS supp_students_select_all ON public.supplementary_session_students;
CREATE POLICY supp_students_select_all ON public.supplementary_session_students
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS supp_students_staff_all ON public.supplementary_session_students;
CREATE POLICY supp_students_staff_all ON public.supplementary_session_students
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
            AND u.role IN ('admin', 'assistant', 'teacher', 'staff', 'employee', 'marketing', 'accountant')
        )
    );

-- RPC Function: complete_supplementary_session
-- Updates attendance, posts student notifications, and completes the session.
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

    -- Loop through attendance items
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

        -- Send Zalo / App notification to parents if present/late
        IF v_status IN ('present', 'late') THEN
            FOR v_parent_record IN
                SELECT parent_id FROM public.parent_students WHERE student_id = v_student_id AND revoked_at IS NULL
            LOOP
                v_msg := 'Thông báo từ MindUp: Buổi dạy bổ sung "' || v_session.topic || '" ngày ' || to_char(v_session.session_date, 'DD/MM/YYYY') || ' đã hoàn thành. Học phí đính kèm: ' || to_char(v_fee, 'FM999,999,999') || 'đ.';
                INSERT INTO public.notifications (user_id, actor_id, type, ref_id, message)
                VALUES (v_parent_record.parent_id, auth.uid(), 'supplementary_session_completed', p_session_id::text, v_msg);
            END LOOP;
        END IF;
    END LOOP;

    -- Mark session completed
    UPDATE public.supplementary_sessions
    SET status = 'completed',
        updated_at = now()
    WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'session_id', p_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_supplementary_session(UUID, JSONB) TO authenticated, service_role;
