-- Cập nhật hệ thống nhận xét buổi học sang mẫu gửi phụ huynh phiên bản 2.
-- Có thể chạy lại an toàn; nhận xét đã gửi và bản nháp cũ không bị xóa.
BEGIN;

-- Phiên bản mẫu nhận xét buổi học 2: khung tin nhắn cố định, cụm trạng thái và hai loại câu kết.
UPDATE public.evaluation_statuses SET active = false WHERE active;

INSERT INTO public.evaluation_statuses (code, name, category, display_order, active)
VALUES
  ('knowledge_good', 'TIẾP THU KIẾN THỨC TỐT', 'positive', 1, true),
  ('focused', 'TẬP TRUNG VÀO BÀI GIẢNG', 'positive', 2, true),
  ('enthusiastic', 'SÔI NỔI', 'positive', 3, true),
  ('knowledge_slow', 'TIẾP THU KIẾN THỨC CÒN CHẬM', 'needs_attention', 4, true),
  ('distracted', 'MẤT TẬP TRUNG', 'needs_attention', 5, true),
  ('low_interaction', 'ÍT TƯƠNG TÁC', 'needs_attention', 6, true),
  ('private_talking', 'NÓI CHUYỆN RIÊNG', 'needs_attention', 7, true),
  ('phone_use', 'SỬ DỤNG ĐIỆN THOẠI', 'needs_attention', 8, true),
  ('homework_incomplete', 'CHƯA LÀM BÀI TẬP', 'needs_attention', 9, true),
  ('late', 'ĐI HỌC MUỘN', 'needs_attention', 10, true),
  ('other_behavior', 'LỖI KHÁC', 'needs_attention', 11, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active;

DELETE FROM public.evaluation_message_templates;

INSERT INTO public.evaluation_message_templates
  (section_type, status_id, content, active, weight)
VALUES
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'knowledge_good'), 'tiếp thu kiến thức khá tốt và nắm bắt được các nội dung trọng tâm của bài học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'knowledge_good'), 'hiểu bài nhanh và vận dụng được kiến thức vào các bài tập trên lớp', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'knowledge_good'), 'nắm vững nội dung được hướng dẫn trong buổi học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'knowledge_good'), 'tiếp nhận kiến thức hiệu quả và hoàn thành tốt các yêu cầu học tập', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'knowledge_good'), 'thể hiện khả năng tiếp thu bài học tích cực trong suốt buổi học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'focused'), 'duy trì sự tập trung tốt trong quá trình học tập', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'focused'), 'theo sát nội dung bài giảng và thực hiện đầy đủ các yêu cầu của giáo viên', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'focused'), 'có thái độ học tập nghiêm túc trong giờ học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'focused'), 'chú ý lắng nghe và tham gia đầy đủ các hoạt động trên lớp', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'focused'), 'giữ được sự tập trung trong phần lớn thời gian học tập', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'enthusiastic'), 'tích cực tham gia phát biểu xây dựng bài', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'enthusiastic'), 'chủ động trao đổi với giáo viên trong quá trình học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'enthusiastic'), 'mạnh dạn chia sẻ ý kiến và cách làm bài của mình', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'enthusiastic'), 'tham gia thảo luận khá sôi nổi trong giờ học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'enthusiastic'), 'có tinh thần tương tác tích cực với giáo viên và các bạn', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'knowledge_slow'), 'vẫn cần thêm thời gian để nắm vững kiến thức của bài học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'knowledge_slow'), 'còn gặp một số khó khăn trong việc tiếp nhận kiến thức mới', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'knowledge_slow'), 'cần được luyện tập thêm để hiểu sâu hơn nội dung bài học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'knowledge_slow'), 'tiếp thu bài học còn chậm ở một số nội dung trọng tâm', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'knowledge_slow'), 'cần cố gắng hơn trong việc ghi nhớ và vận dụng kiến thức', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'đôi lúc còn mất tập trung trong giờ học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'vẫn còn một số thời điểm chưa chú ý vào nội dung bài giảng', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'cần cải thiện khả năng tập trung khi tham gia học tập', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'đôi khi còn sao nhãng trong quá trình học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'distracted'), 'chưa duy trì được sự tập trung xuyên suốt buổi học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'còn khá dè dặt khi tham gia trao đổi với giáo viên', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'chưa thực sự chủ động phát biểu xây dựng bài', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'còn hạn chế trong việc tương tác và chia sẻ ý kiến', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'cần mạnh dạn hơn khi tham gia các hoạt động trên lớp', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'low_interaction'), 'chưa tích cực trao đổi trong quá trình học tập', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'đôi lúc còn nói chuyện riêng trong giờ học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'vẫn còn trao đổi ngoài nội dung bài học khi đang học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'cần chú ý hạn chế nói chuyện riêng để tập trung hơn', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'có thời điểm chưa giữ được sự nghiêm túc trong giờ học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'private_talking'), 'còn bị phân tán bởi các cuộc trao đổi ngoài bài học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'còn sử dụng điện thoại vào những thời điểm không cần thiết trong giờ học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'cần hạn chế việc sử dụng điện thoại để tập trung hơn vào bài học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'đôi lúc còn bị ảnh hưởng bởi điện thoại trong quá trình học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'chưa thực sự kiểm soát tốt việc sử dụng điện thoại trong giờ học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'phone_use'), 'cần chú ý sử dụng điện thoại đúng mục đích học tập', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'chưa hoàn thành đầy đủ bài tập được giao trước buổi học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'còn thiếu một phần bài tập cần chuẩn bị', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'chưa thực hiện đầy đủ nhiệm vụ học tập được giao', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'cần chú ý hoàn thành bài tập trước khi đến lớp', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'homework_incomplete'), 'chưa chuẩn bị đầy đủ bài tập theo yêu cầu của giáo viên', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'đến lớp muộn so với thời gian quy định, phần nào ảnh hưởng đến việc tiếp nhận đầy đủ nội dung đầu buổi học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'đi học chưa đúng giờ, cần chú ý sắp xếp thời gian hợp lý để tham gia lớp học đầy đủ và hiệu quả hơn', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'vào lớp muộn trong buổi học hôm nay, dẫn đến bỏ lỡ một phần nội dung được giáo viên hướng dẫn ở đầu giờ', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'chưa có mặt đúng giờ khi buổi học bắt đầu, làm ảnh hưởng đến quá trình theo dõi nội dung đầu buổi học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'late'), 'đến lớp muộn hơn thời gian quy định, vì vậy chưa tham gia đầy đủ các hoạt động học tập ở đầu giờ', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'vẫn còn một số hạn chế cần tiếp tục khắc phục trong quá trình học tập', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'cần điều chỉnh thêm một số thói quen học tập để đạt hiệu quả tốt hơn', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'còn một vài điểm cần cải thiện để nâng cao kết quả học tập', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'cần cố gắng hơn trong việc thực hiện các nội quy của lớp học', true, 1),
  ('status', (SELECT id FROM public.evaluation_statuses WHERE code = 'other_behavior'), 'vẫn còn những hạn chế nhỏ cần được nhắc nhở và điều chỉnh', true, 1),
  ('opening', NULL, 'Cảm ơn anh/chị đã luôn đồng hành cùng giáo viên trong quá trình học tập của em. Mong em tiếp tục duy trì tinh thần học tập tích cực và phát huy những điểm mạnh hiện có.', true, 1),
  ('opening', NULL, 'Thầy/cô rất vui khi ghi nhận những biểu hiện tích cực của em trong buổi học hôm nay. Hy vọng với sự quan tâm của gia đình, em sẽ tiếp tục tiến bộ trong thời gian tới.', true, 1),
  ('opening', NULL, 'Cảm ơn anh/chị đã luôn quan tâm và tạo điều kiện cho em trong quá trình học tập. Thầy/cô mong em sẽ tiếp tục phát huy tốt những kết quả đã đạt được.', true, 1),
  ('opening', NULL, 'Với những biểu hiện tích cực trong buổi học hôm nay, thầy/cô tin rằng em sẽ tiếp tục có thêm nhiều tiến bộ nếu nhận được sự đồng hành thường xuyên từ gia đình.', true, 1),
  ('opening', NULL, 'Thầy/cô ghi nhận sự cố gắng của em trong buổi học hôm nay và mong anh/chị tiếp tục động viên để em duy trì phong độ học tập tích cực này.', true, 1),
  ('closing', NULL, 'Mong anh/chị tiếp tục đồng hành cùng giáo viên trong việc nhắc nhở và động viên em để em từng bước khắc phục những hạn chế hiện tại.', true, 1),
  ('closing', NULL, 'Hy vọng với sự quan tâm của gia đình và sự hỗ trợ từ giáo viên, em sẽ sớm cải thiện những điểm còn hạn chế và đạt kết quả học tập tốt hơn.', true, 1),
  ('closing', NULL, 'Mong anh/chị cùng phối hợp nhắc nhở và động viên em để xây dựng thói quen học tập tích cực hơn trong thời gian tới.', true, 1),
  ('closing', NULL, 'Thầy/cô tin rằng với sự đồng hành của gia đình, em sẽ có thêm động lực để điều chỉnh những điểm còn hạn chế và tiếp tục tiến bộ.', true, 1),
  ('closing', NULL, 'Cảm ơn anh/chị đã luôn phối hợp cùng giáo viên trong quá trình giáo dục và đồng hành cùng em. Hy vọng em sẽ sớm khắc phục những hạn chế hiện tại để đạt hiệu quả học tập tốt hơn.', true, 1)
ON CONFLICT DO NOTHING;

COMMIT;

SELECT
  (SELECT count(*) FROM public.evaluation_statuses WHERE active) AS active_statuses,
  (SELECT count(*) FROM public.evaluation_message_templates WHERE active) AS active_templates;
