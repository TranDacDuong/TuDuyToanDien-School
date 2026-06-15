-- MindUp: đánh giá học sinh theo từng buổi học và tạo tin nhắn cho phụ huynh.
-- Dữ liệu mẫu được sinh từ Mau_tin_nhan_nhan_xet_buoi_hoc_gui_phu_huynh.txt.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.evaluation_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('positive', 'neutral', 'needs_attention')),
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.evaluation_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_type text NOT NULL CHECK (section_type IN ('opening', 'status', 'expectation', 'closing')),
  status_id uuid REFERENCES public.evaluation_statuses(id) ON DELETE CASCADE,
  content text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  weight integer NOT NULL DEFAULT 1 CHECK (weight > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evaluation_template_status_shape CHECK (
    (section_type IN ('opening', 'closing') AND status_id IS NULL)
    OR (section_type IN ('status', 'expectation') AND status_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS evaluation_template_unique_idx
  ON public.evaluation_message_templates (
    section_type,
    COALESCE(status_id, '00000000-0000-0000-0000-000000000000'::uuid),
    content
  );

CREATE TABLE IF NOT EXISTS public.session_student_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_session_id uuid NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  evaluator_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  generated_message text,
  final_message text,
  template_selection jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_session_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.session_student_evaluation_statuses (
  evaluation_id uuid NOT NULL REFERENCES public.session_student_evaluations(id) ON DELETE CASCADE,
  status_id uuid NOT NULL REFERENCES public.evaluation_statuses(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evaluation_id, status_id)
);

CREATE INDEX IF NOT EXISTS evaluation_templates_lookup_idx
  ON public.evaluation_message_templates (section_type, status_id, active);
CREATE INDEX IF NOT EXISTS session_evaluations_class_session_idx
  ON public.session_student_evaluations (class_id, class_session_id, state);
CREATE INDEX IF NOT EXISTS session_evaluations_student_idx
  ON public.session_student_evaluations (student_id, sent_at DESC);

CREATE OR REPLACE FUNCTION public.set_session_evaluation_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evaluation_statuses_updated_at ON public.evaluation_statuses;
CREATE TRIGGER evaluation_statuses_updated_at BEFORE UPDATE ON public.evaluation_statuses
FOR EACH ROW EXECUTE FUNCTION public.set_session_evaluation_updated_at();
DROP TRIGGER IF EXISTS evaluation_templates_updated_at ON public.evaluation_message_templates;
CREATE TRIGGER evaluation_templates_updated_at BEFORE UPDATE ON public.evaluation_message_templates
FOR EACH ROW EXECUTE FUNCTION public.set_session_evaluation_updated_at();
DROP TRIGGER IF EXISTS session_student_evaluations_updated_at ON public.session_student_evaluations;
CREATE TRIGGER session_student_evaluations_updated_at BEFORE UPDATE ON public.session_student_evaluations
FOR EACH ROW EXECUTE FUNCTION public.set_session_evaluation_updated_at();

ALTER TABLE public.evaluation_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_student_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_student_evaluation_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_students_class_staff_select ON public.parent_students;
CREATE POLICY parent_students_class_staff_select ON public.parent_students
FOR SELECT TO authenticated USING (
  public.is_class_staff_for_student(parent_students.student_id)
);

DROP POLICY IF EXISTS evaluation_statuses_read ON public.evaluation_statuses;
CREATE POLICY evaluation_statuses_read ON public.evaluation_statuses
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS evaluation_statuses_admin_write ON public.evaluation_statuses;
CREATE POLICY evaluation_statuses_admin_write ON public.evaluation_statuses
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin'));

DROP POLICY IF EXISTS evaluation_templates_read ON public.evaluation_message_templates;
CREATE POLICY evaluation_templates_read ON public.evaluation_message_templates
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS evaluation_templates_admin_write ON public.evaluation_message_templates;
CREATE POLICY evaluation_templates_admin_write ON public.evaluation_message_templates
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin'));

DROP POLICY IF EXISTS session_evaluations_select ON public.session_student_evaluations;
CREATE POLICY session_evaluations_select ON public.session_student_evaluations
FOR SELECT TO authenticated USING (
  student_id = auth.uid()
  OR evaluator_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.class_teachers ct
    WHERE ct.class_id = session_student_evaluations.class_id AND ct.teacher_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.parent_id = auth.uid()
      AND ps.student_id = session_student_evaluations.student_id
      AND ps.revoked_at IS NULL
  )
);

DROP POLICY IF EXISTS session_evaluations_insert ON public.session_student_evaluations;
CREATE POLICY session_evaluations_insert ON public.session_student_evaluations
FOR INSERT TO authenticated WITH CHECK (
  evaluator_id = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.class_teachers ct
      WHERE ct.class_id = session_student_evaluations.class_id AND ct.teacher_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS session_evaluations_update ON public.session_student_evaluations;
CREATE POLICY session_evaluations_update ON public.session_student_evaluations
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.class_teachers ct
    WHERE ct.class_id = session_student_evaluations.class_id AND ct.teacher_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.class_teachers ct
    WHERE ct.class_id = session_student_evaluations.class_id AND ct.teacher_id = auth.uid()
  )
);

DROP POLICY IF EXISTS session_evaluation_statuses_select ON public.session_student_evaluation_statuses;
CREATE POLICY session_evaluation_statuses_select ON public.session_student_evaluation_statuses
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.session_student_evaluations e
    WHERE e.id = session_student_evaluation_statuses.evaluation_id
  )
);
DROP POLICY IF EXISTS session_evaluation_statuses_write ON public.session_student_evaluation_statuses;
CREATE POLICY session_evaluation_statuses_write ON public.session_student_evaluation_statuses
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.session_student_evaluations e
    WHERE e.id = session_student_evaluation_statuses.evaluation_id
      AND (
        EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin')
        OR EXISTS (
          SELECT 1 FROM public.class_teachers ct
          WHERE ct.class_id = e.class_id AND ct.teacher_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.session_student_evaluations e
    WHERE e.id = session_student_evaluation_statuses.evaluation_id
      AND (
        EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text = 'admin')
        OR EXISTS (
          SELECT 1 FROM public.class_teachers ct
          WHERE ct.class_id = e.class_id AND ct.teacher_id = auth.uid()
        )
      )
  )
);

INSERT INTO public.evaluation_statuses (code, name, category, display_order, active)
VALUES
  ('very_good', 'RẤT TỐT', 'positive', 1, true),
  ('stable', 'ỔN ĐỊNH', 'neutral', 2, true),
  ('distracted', 'MẤT TẬP TRUNG', 'needs_attention', 3, true),
  ('low_interaction', 'ÍT TƯƠNG TÁC', 'needs_attention', 4, true),
  ('private_talking', 'NÓI CHUYỆN RIÊNG', 'needs_attention', 5, true),
  ('disruptive', 'MẤT TRẬT TỰ', 'needs_attention', 6, true),
  ('phone_use', 'SỬ DỤNG ĐIỆN THOẠI', 'needs_attention', 7, true),
  ('homework_incomplete', 'CHƯA LÀM BÀI TẬP THEO YÊU CẦU', 'needs_attention', 8, true),
  ('late', 'ĐI HỌC MUỘN', 'needs_attention', 9, true),
  ('other_behavior', 'HÀNH VI CHƯA PHÙ HỢP KHÁC', 'needs_attention', 10, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active;

INSERT INTO public.evaluation_message_templates
  (section_type, status_id, content, active, weight)
VALUES
  ('opening', NULL, 'Kính gửi phụ huynh {ten_phu_huynh}, giáo viên xin gửi một số ghi nhận về buổi học {mon_hoc} ngày {ngay_hoc} của em {ten_hoc_sinh}.', true, 1),
  ('opening', NULL, 'Trung tâm xin chia sẻ cùng phụ huynh một vài thông tin về quá trình học tập của em {ten_hoc_sinh} trong buổi học hôm nay.', true, 1),
  ('opening', NULL, 'Trong buổi học {mon_hoc} ngày {ngay_hoc}, giáo viên đã ghi nhận một số điểm nổi bật trong quá trình tham gia học tập của em {ten_hoc_sinh}.', true, 1),
  ('opening', NULL, 'Xin gửi tới phụ huynh những ghi nhận từ buổi học hôm nay của em {ten_hoc_sinh}.', true, 1),
  ('opening', NULL, 'Giáo viên xin phép chia sẻ ngắn gọn về tình hình học tập của em {ten_hoc_sinh} trong buổi học ngày {ngay_hoc}.', true, 1),
  ('opening', NULL, 'Buổi học {mon_hoc} hôm nay đã ghi nhận một số biểu hiện đáng chú ý từ em {ten_hoc_sinh}.', true, 1),
  ('opening', NULL, 'Trung tâm xin gửi tới phụ huynh thông tin phản hồi sau buổi học của em {ten_hoc_sinh}.', true, 1),
  ('opening', NULL, 'Hôm nay giáo viên có cơ hội quan sát quá trình học tập của em {ten_hoc_sinh} và xin được chia sẻ cùng gia đình.', true, 1),
  ('opening', NULL, 'Dưới đây là một số ghi nhận từ buổi học {mon_hoc} ngày {ngay_hoc} của em {ten_hoc_sinh}.', true, 1),
  ('opening', NULL, 'Xin gửi phụ huynh thông tin phản hồi về sự tham gia học tập của em {ten_hoc_sinh} trong buổi học hôm nay.', true, 1),
  ('closing', NULL, 'Xin cảm ơn phụ huynh đã luôn đồng hành cùng trung tâm trong quá trình học tập của em.', true, 1),
  ('closing', NULL, 'Rất mong tiếp tục nhận được sự phối hợp từ gia đình để hỗ trợ em phát triển tốt hơn mỗi ngày.', true, 1),
  ('closing', NULL, 'Giáo viên tin rằng với sự đồng hành của gia đình, em sẽ ngày càng tiến bộ hơn trong thời gian tới.', true, 1),
  ('closing', NULL, 'Xin cảm ơn sự quan tâm của phụ huynh đối với hành trình học tập của em.', true, 1),
  ('closing', NULL, 'Chúc em tiếp tục có thêm nhiều trải nghiệm học tập tích cực trong các buổi học tiếp theo.', true, 1),
  ('closing', NULL, 'Trung tâm rất trân trọng sự đồng hành của gia đình trong quá trình giáo dục và phát triển của em.', true, 1),
  ('closing', NULL, 'Mong rằng sự phối hợp giữa gia đình và giáo viên sẽ tiếp tục giúp em phát huy tối đa tiềm năng của mình.', true, 1),
  ('closing', NULL, 'Xin cảm ơn phụ huynh đã luôn dành sự quan tâm và động viên đối với việc học của em.', true, 1),
  ('closing', NULL, 'Giáo viên rất mong được tiếp tục đồng hành cùng em trên hành trình trưởng thành và học tập.', true, 1),
  ('closing', NULL, 'Chúc em sẽ có thêm nhiều bước tiến tích cực trong thời gian sắp tới.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Em đã thể hiện tinh thần học tập tích cực và chủ động trong suốt buổi học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Em tham gia lớp học với thái độ nghiêm túc và tinh thần trách nhiệm cao.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Em duy trì sự tập trung tốt và hoàn thành đầy đủ các nhiệm vụ học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Em tích cực tương tác và có nhiều đóng góp trong quá trình học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Em cho thấy sự chuẩn bị tốt và thái độ học tập đáng khen ngợi.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Em thể hiện sự cố gắng rõ rệt và tinh thần cầu tiến trong buổi học hôm nay.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Em tham gia học tập tích cực và hợp tác tốt với giáo viên.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Em đã có một buổi học hiệu quả với tinh thần học tập nghiêm túc.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Em thể hiện được ý thức học tập tốt và sự chủ động trong lớp học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Em duy trì được năng lượng tích cực và sự tập trung trong suốt buổi học.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Đây là tín hiệu rất đáng khích lệ trên hành trình học tập của em.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Giáo viên tin rằng em sẽ tiếp tục phát huy những điểm mạnh này trong thời gian tới.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Sự nỗ lực đều đặn hôm nay sẽ tạo nền tảng cho những bước tiến lớn hơn trong tương lai.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Mong em tiếp tục duy trì tinh thần học tập tích cực này.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Đây là một kết quả rất đáng ghi nhận từ sự cố gắng của em.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Giáo viên rất vui khi được chứng kiến sự tiến bộ của em qua từng buổi học.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Những biểu hiện tích cực hôm nay cho thấy tiềm năng phát triển rất tốt của em.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Em đang đi đúng hướng trong việc xây dựng thói quen học tập hiệu quả.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Sự chủ động của em là yếu tố quan trọng giúp nâng cao kết quả học tập.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'very_good'), 'Giáo viên kỳ vọng em sẽ tiếp tục giữ vững phong độ này trong các buổi học tiếp theo.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Em tham gia học tập đầy đủ và duy trì được nề nếp học tập ổn định.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Em hoàn thành các yêu cầu cơ bản của buổi học một cách nghiêm túc.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Em duy trì được sự tập trung ở mức phù hợp trong quá trình học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Em có thái độ học tập tích cực và hợp tác tốt với giáo viên.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Em tham gia đầy đủ các hoạt động học tập theo yêu cầu.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Em giữ được sự ổn định trong việc học tập và tiếp nhận kiến thức.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Em có ý thức học tập tốt và thực hiện đúng các yêu cầu của lớp học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Em tham gia lớp học với thái độ nghiêm túc và tinh thần hợp tác.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Em duy trì được nhịp độ học tập tương đối tốt trong buổi học hôm nay.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Em thể hiện sự cố gắng và trách nhiệm trong quá trình học tập.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Giáo viên mong em sẽ ngày càng tự tin và chủ động hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Đây là nền tảng quan trọng để em tiếp tục phát triển trong thời gian tới.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Mong em tiếp tục duy trì sự đều đặn và tinh thần học tập hiện tại.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Chỉ cần thêm một chút chủ động, em sẽ còn tiến bộ hơn nữa.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Giáo viên tin rằng em sẽ tiếp tục phát huy khả năng của mình.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Sự bền bỉ trong học tập sẽ mang lại nhiều kết quả tích cực cho em.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Đây là bước đệm tốt để em hướng tới những mục tiêu cao hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Mong em tiếp tục duy trì những thói quen học tập tích cực này.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Giáo viên kỳ vọng em sẽ có thêm nhiều cơ hội thể hiện năng lực của mình.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'stable'), 'Sự ổn định hôm nay là một tín hiệu đáng khích lệ cho quá trình học tập lâu dài.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Em đôi lúc chưa duy trì được sự tập trung liên tục trong quá trình học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Có một số thời điểm em bị phân tán sự chú ý khỏi nội dung bài học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Em vẫn tham gia lớp học nhưng chưa thực sự tập trung trong toàn bộ thời lượng buổi học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Em cần thêm thời gian để rèn luyện khả năng duy trì sự chú ý khi học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Trong một số thời điểm, em chưa theo sát được tiến trình bài học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Sự tập trung của em hôm nay chưa ổn định như những buổi học hiệu quả trước đó.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Em đôi lúc bị ảnh hưởng bởi các yếu tố xung quanh trong quá trình học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Em còn bỏ lỡ một vài nội dung do chưa duy trì được sự chú ý liên tục.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Em vẫn có khả năng tiếp thu tốt nhưng cần tập trung hơn để phát huy hết năng lực.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Quá trình học tập của em hôm nay có một số thời điểm chưa đạt được sự tập trung cần thiết.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Giáo viên tin rằng em hoàn toàn có thể cải thiện kỹ năng này trong thời gian tới.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Chỉ cần tăng cường khả năng tập trung, hiệu quả học tập của em sẽ được nâng cao rõ rệt.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Với sự đồng hành từ gia đình, em sẽ sớm hình thành thói quen học tập hiệu quả hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Đây là một kỹ năng có thể rèn luyện và cải thiện từng ngày.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Giáo viên tin tưởng vào khả năng điều chỉnh và tiến bộ của em.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Em hoàn toàn có thể phát huy tốt hơn năng lực của mình nếu duy trì được sự tập trung ổn định.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Mong em sẽ ngày càng chủ động hơn trong việc kiểm soát sự chú ý khi học tập.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Những thay đổi nhỏ trong thói quen học tập sẽ mang lại kết quả tích cực cho em.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Giáo viên sẽ tiếp tục đồng hành để hỗ trợ em trong quá trình cải thiện kỹ năng này.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'Đây là một điểm hoàn toàn có thể cải thiện thông qua sự kiên trì và nỗ lực mỗi ngày.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Em tham gia học tập nghiêm túc nhưng còn khá dè dặt trong việc chia sẻ ý kiến.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Em theo dõi bài học đầy đủ nhưng chưa chủ động tương tác với giáo viên.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Em còn hạn chế trong việc tham gia các hoạt động trao đổi và thảo luận.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Em có xu hướng lắng nghe nhiều hơn là thể hiện suy nghĩ của mình.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Trong buổi học hôm nay, em chưa mạnh dạn tham gia phát biểu ý kiến.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Em hoàn thành các nhiệm vụ học tập nhưng còn ít phản hồi trong quá trình học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Em có sự tập trung tốt nhưng chưa thực sự chủ động trong việc trao đổi bài học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Em vẫn tham gia lớp học đầy đủ, tuy nhiên mức độ tương tác còn khá khiêm tốn.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Em đôi lúc còn e ngại khi chia sẻ quan điểm hoặc đặt câu hỏi.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Em có tiềm năng học tập tốt nhưng chưa thể hiện nhiều qua các hoạt động tương tác trên lớp.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Giáo viên mong em sẽ tự tin hơn khi chia sẻ suy nghĩ của mình.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Việc tăng cường tương tác sẽ giúp em tiếp thu bài học hiệu quả hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Mỗi ý kiến của em đều có giá trị và rất đáng được lắng nghe.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Giáo viên tin rằng em sẽ ngày càng mạnh dạn hơn trong môi trường học tập.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Chỉ cần thêm một chút tự tin, em sẽ thể hiện được nhiều năng lực của mình hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Việc chủ động trao đổi sẽ giúp em phát triển tốt hơn kỹ năng tư duy và giao tiếp.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Giáo viên rất mong được lắng nghe nhiều hơn những ý kiến từ em.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Đây là một kỹ năng có thể cải thiện dần thông qua sự động viên và rèn luyện.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Em hoàn toàn có thể phát huy tốt hơn khả năng của mình khi tham gia tương tác tích cực hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'Giáo viên tin rằng em sẽ từng bước vượt qua sự e dè và ngày càng tự tin hơn.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Em có một số thời điểm trao đổi riêng với bạn trong khi giáo viên đang hướng dẫn bài học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Trong buổi học {mon_hoc} ngày {ngay_hoc}, em đôi lúc nói chuyện riêng và chưa theo sát nội dung trên lớp.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Em có lúc trao đổi ngoài nội dung bài học, làm gián đoạn sự tập trung của bản thân.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Một vài cuộc trò chuyện riêng khiến em bỏ lỡ một phần hướng dẫn của giáo viên.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Em đôi lúc chưa kiểm soát tốt việc trao đổi với bạn trong thời gian học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Trong một số thời điểm, em còn nói chuyện riêng khi lớp cần tập trung vào nhiệm vụ chung.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Em vẫn tham gia học tập nhưng đôi lúc bị cuốn vào các cuộc trao đổi không liên quan đến bài học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Việc nói chuyện riêng trong giờ có lúc làm giảm hiệu quả tiếp thu bài của em.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Em cần chú ý lựa chọn thời điểm trao đổi phù hợp hơn để không ảnh hưởng đến quá trình học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Buổi học ghi nhận một số thời điểm em trao đổi riêng và cần được nhắc nhở để quay lại bài học.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Giáo viên mong em sẽ chủ động giữ sự tập trung và trao đổi đúng thời điểm hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Việc hạn chế nói chuyện riêng sẽ giúp em theo sát bài học và tiếp thu kiến thức trọn vẹn hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Giáo viên tin rằng em có thể nhanh chóng điều chỉnh để duy trì nề nếp học tập tốt.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Mong em chuyển sự năng động của mình vào các hoạt động trao đổi chung của lớp.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Chỉ cần chú ý hơn đến thời điểm giao tiếp, em sẽ có một buổi học hiệu quả hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Sự tự giác trong việc giữ trật tự sẽ giúp em và các bạn cùng học tập tốt hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Giáo viên kỳ vọng em sẽ ngày càng biết cân bằng giữa giao tiếp và tập trung học tập.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Với sự nhắc nhở và đồng hành của gia đình, em sẽ sớm hình thành thói quen phù hợp hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Đây là điều em hoàn toàn có thể cải thiện thông qua sự chủ động và ý thức mỗi ngày.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'Giáo viên tin tưởng em sẽ có những chuyển biến tích cực trong các buổi học tiếp theo.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Em có một vài thời điểm chưa duy trì được sự tập trung vào nề nếp lớp học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Trong buổi học hôm nay, em đôi lúc chưa thực sự ổn định trong quá trình học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Em có những thời điểm bị cuốn theo các hoạt động bên ngoài nội dung bài học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Sự tập trung vào nề nếp lớp học của em hôm nay chưa được duy trì xuyên suốt.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Em đôi lúc thể hiện sự hứng khởi chưa đúng thời điểm trong giờ học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Trong một số thời điểm, em cần thêm sự nhắc nhở để duy trì tác phong học tập phù hợp.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Em có biểu hiện chưa thực sự hòa nhịp với không khí học tập của lớp ở một vài thời điểm.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Em đôi lúc làm gián đoạn mạch học tập của bản thân do chưa duy trì được sự ổn định cần thiết.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Trong buổi học hôm nay, em cần thêm sự chú ý tới các quy định chung của lớp học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Em vẫn tham gia học tập nhưng đôi lúc chưa giữ được sự tập trung vào nề nếp lớp học.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Giáo viên tin rằng em sẽ sớm điều chỉnh và hoàn thiện kỹ năng này.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Việc duy trì nề nếp học tập tốt sẽ giúp em phát huy tối đa khả năng của mình.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Em hoàn toàn có thể chuyển nguồn năng lượng tích cực của mình vào việc học tập hiệu quả hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Đây là một kỹ năng quan trọng và có thể được cải thiện từng ngày.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Giáo viên mong em sẽ ngày càng trưởng thành hơn trong ý thức học tập.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Sự ổn định trong lớp học sẽ giúp em tiếp thu kiến thức hiệu quả hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Giáo viên tin rằng em sẽ nhanh chóng thích nghi và điều chỉnh tích cực.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Với sự đồng hành của gia đình, em sẽ sớm xây dựng được những thói quen học tập tốt hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Những thay đổi nhỏ trong tác phong học tập sẽ mang lại nhiều kết quả tích cực cho em.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'disruptive'), 'Giáo viên rất kỳ vọng vào sự tiến bộ của em trong thời gian tới.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Em có một số thời điểm bị phân tán sự chú ý bởi điện thoại cá nhân.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Trong buổi học hôm nay, việc sử dụng điện thoại đã ảnh hưởng phần nào đến sự tập trung của em.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Em đôi lúc dành sự quan tâm cho thiết bị cá nhân nhiều hơn nội dung bài học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Quá trình học tập của em có những thời điểm bị gián đoạn bởi điện thoại.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Em vẫn tham gia học tập nhưng chưa thực sự kiểm soát tốt việc sử dụng thiết bị cá nhân.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Trong giờ học hôm nay, điện thoại đôi lúc làm giảm sự tập trung của em vào bài học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Em cần thêm thời gian để hình thành thói quen sử dụng thiết bị điện tử phù hợp trong giờ học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Sự chú ý của em có lúc bị phân tán bởi các yếu tố ngoài bài học trên thiết bị cá nhân.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Em có khả năng học tập tốt nhưng chưa duy trì được sự tập trung liên tục do tác động từ điện thoại.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Trong một số thời điểm, việc sử dụng điện thoại khiến em chưa theo sát hoàn toàn nội dung bài học.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Giáo viên tin rằng em sẽ sớm hình thành thói quen sử dụng thiết bị phù hợp hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Việc hạn chế các yếu tố gây xao nhãng sẽ giúp em phát huy tốt hơn khả năng học tập của mình.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Chỉ cần cải thiện thêm khả năng tự quản lý, em sẽ có nhiều bước tiến tích cực.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Đây là một kỹ năng rất quan trọng trong thời đại số và cần được rèn luyện từng ngày.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Giáo viên mong em sẽ ưu tiên sự tập trung cho việc học trong thời gian trên lớp.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Em hoàn toàn có thể nâng cao hiệu quả học tập nếu giảm bớt các yếu tố gây phân tâm.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Với sự đồng hành của gia đình, em sẽ xây dựng được thói quen học tập hiệu quả hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Giáo viên tin tưởng vào khả năng tự điều chỉnh của em trong thời gian tới.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Đây là một thay đổi nhỏ nhưng có thể mang lại tác động rất tích cực đến kết quả học tập.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'Mong em sẽ từng bước hoàn thiện kỹ năng quản lý thời gian và sự tập trung của mình.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Em chưa hoàn thành đầy đủ bài tập hoặc phần chuẩn bị được giao trước buổi học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Trong buổi học hôm nay, em còn thiếu một phần nội dung chuẩn bị theo yêu cầu.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Em chưa có sự chuẩn bị đầy đủ cho bài học như kế hoạch đã đề ra.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Một số nhiệm vụ học tập được giao trước đó của em vẫn chưa hoàn thành.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Em cần thêm sự chủ động trong việc thực hiện các nhiệm vụ học tập ngoài giờ lên lớp.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Việc chuẩn bị bài của em hôm nay chưa thực sự đầy đủ.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Em còn gặp khó khăn trong việc duy trì thói quen hoàn thành bài tập đúng thời hạn.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Một số nội dung cần chuẩn bị trước buổi học của em chưa được hoàn thiện.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Em vẫn tham gia lớp học đầy đủ nhưng khâu chuẩn bị trước buổi học còn hạn chế.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Quá trình chuẩn bị bài của em hôm nay chưa đáp ứng đầy đủ yêu cầu của buổi học.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Giáo viên tin rằng em sẽ sớm xây dựng được thói quen học tập chủ động hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Việc hoàn thành đầy đủ nhiệm vụ học tập sẽ giúp em tự tin hơn khi đến lớp.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Đây là một kỹ năng quan trọng và hoàn toàn có thể cải thiện thông qua sự kiên trì.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Giáo viên mong em sẽ từng bước nâng cao tinh thần trách nhiệm với việc học.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Mỗi nhiệm vụ được hoàn thành đúng hạn sẽ là một bước tiến đáng quý của em.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Với sự hỗ trợ từ gia đình, em sẽ sớm hình thành thói quen học tập hiệu quả hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Giáo viên tin rằng em có đủ khả năng để đáp ứng tốt các yêu cầu học tập.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Việc chuẩn bị bài đầy đủ sẽ giúp em phát huy tốt hơn năng lực của mình trên lớp.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Mong em sẽ ngày càng chủ động và tự tin hơn trong quá trình học tập.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'Đây là cơ hội để em rèn luyện tính kỷ luật và sự tự giác cho tương lai.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Em tham gia buổi học muộn hơn thời gian bắt đầu theo kế hoạch.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Hôm nay em chưa có mặt đúng giờ để bắt đầu buổi học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Em đến lớp sau thời điểm khai giảng của buổi học.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Việc tham gia lớp học của em hôm nay chưa đúng với thời gian quy định.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Em đã bỏ lỡ một phần nội dung đầu giờ do đến lớp muộn.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Thời gian tham gia lớp học của em hôm nay chưa thực sự đảm bảo.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Em có mặt tại lớp muộn hơn dự kiến ban đầu.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Buổi học hôm nay ghi nhận em chưa duy trì được thói quen đúng giờ.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Việc sắp xếp thời gian tham gia học tập của em hôm nay còn gặp một số khó khăn.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Em tham gia lớp học muộn hơn kế hoạch và cần thêm sự chủ động trong việc chuẩn bị.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Giáo viên mong em sẽ xây dựng được thói quen đúng giờ trong học tập.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Việc đến lớp đúng giờ sẽ giúp em tiếp nhận bài học một cách trọn vẹn hơn.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Đây là một kỹ năng quan trọng không chỉ trong học tập mà còn trong cuộc sống.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Giáo viên tin rằng em sẽ nhanh chóng cải thiện điều này trong thời gian tới.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Chỉ cần chuẩn bị sớm hơn một chút, em sẽ có nhiều lợi thế trong học tập.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Sự đúng giờ sẽ giúp em hình thành tính kỷ luật và trách nhiệm với bản thân.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Mong em sẽ ngày càng chủ động hơn trong việc quản lý thời gian của mình.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Đây là cơ hội để em rèn luyện những thói quen tích cực cho tương lai.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Với sự đồng hành từ gia đình, em sẽ sớm khắc phục được khó khăn này.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'Giáo viên rất kỳ vọng vào sự tiến bộ của em trong việc xây dựng tác phong học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Em có một số biểu hiện cần được điều chỉnh thêm để phù hợp hơn với môi trường học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Trong buổi học hôm nay, em còn một vài thói quen cần được hoàn thiện.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Em cần thêm thời gian để rèn luyện một số kỹ năng và tác phong học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Một số hành vi của em hôm nay chưa thực sự hỗ trợ cho quá trình học tập hiệu quả.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Em đang trong quá trình hoàn thiện những kỹ năng cần thiết cho môi trường học đường.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Giáo viên ghi nhận một số điểm em cần chú ý thêm trong quá trình tham gia học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Em còn một vài biểu hiện cần được điều chỉnh để phát huy tốt hơn năng lực của mình.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Trong buổi học hôm nay, em cần thêm sự hỗ trợ để hoàn thiện các thói quen tích cực.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Một số hành vi của em hôm nay cần được định hướng thêm để phù hợp với mục tiêu học tập.', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Em đang từng bước hoàn thiện bản thân và vẫn còn một số điểm cần được rèn luyện thêm.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Giáo viên tin rằng em sẽ ngày càng trưởng thành hơn qua từng buổi học.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Những điều cần điều chỉnh hôm nay sẽ trở thành bài học quý giá cho sự phát triển của em.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Với sự đồng hành từ gia đình và giáo viên, em sẽ có nhiều chuyển biến tích cực.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Đây là những kỹ năng hoàn toàn có thể cải thiện thông qua sự kiên trì và nỗ lực.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Giáo viên rất tin tưởng vào khả năng tiến bộ của em.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Mỗi bước thay đổi nhỏ hôm nay sẽ góp phần tạo nên sự trưởng thành trong tương lai.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Mong em sẽ tiếp tục hoàn thiện bản thân và phát huy những điểm mạnh của mình.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Giáo viên sẽ tiếp tục đồng hành cùng em trên hành trình phát triển toàn diện.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Đây là cơ hội để em rèn luyện những phẩm chất tích cực cho tương lai.', true, 1),
  ('expectation', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'Giáo viên kỳ vọng em sẽ ngày càng tự tin, trách nhiệm và trưởng thành hơn.', true, 1)
ON CONFLICT DO NOTHING;

SELECT
  (SELECT count(*) FROM public.evaluation_statuses WHERE active) AS active_statuses,
  (SELECT count(*) FROM public.evaluation_message_templates WHERE active) AS active_templates;
