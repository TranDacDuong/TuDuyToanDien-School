-- SQL cập nhật Prompt AI cho Loại bài Enrollment (Tuyển sinh) hỗ trợ linh hoạt cả 5 Fanpage (Toán, Lý, Hóa, Sinh, Toàn diện) và Thầy/Cô giáo MindUp.
-- Chạy script này trong Supabase SQL Editor để áp dụng prompt mới cho database.

UPDATE public.facebook_post_types
SET ai_prompt = 'Loại bài Enrollment dùng để giới thiệu các buổi HỌC THỬ MIỄN PHÍ diễn ra trong tuần tới cho từng Fanpage của MindUp.
- THÍCH ỨNG THEO FANPAGE & MÔN HỌC:
  + Fanpage Toán: Tập trung tư duy Toán học, tháo gỡ sợ hình học/phương trình (xưng hô Thầy/Cô dạy Toán MindUp).
  + Fanpage Vật lý: Tập trung tư duy Vật lý, hiểu bản chất hiện tượng đời sống (xưng hô Cô Ngô Hương / Thầy Cô dạy Lý MindUp).
  + Fanpage Hóa học: Tập trung tư duy Hóa học, ghi nhớ bản chất phản ứng/bảng tuần hoàn (xưng hô Thầy/Cô dạy Hóa MindUp).
  + Fanpage Sinh học: Tập trung tư duy Sinh học, liên hệ tế bào/di truyền/thực tế (xưng hô Thầy/Cô dạy Sinh MindUp).
  + Fanpage Toàn diện (Page chính): Giới thiệu các khóa học thử liên môn Toán - Lý - Hóa - Sinh hoặc lớp tư duy chung cho học sinh MindUp.
- GIỌNG VĂN & PHONG CÁCH:
  + Ấm áp, nhiệt huyết, đồng cảm và truyền năng lượng như người Thầy/Người Cô thân thiết (học hỏi phong cách truyền cảm hứng Cô Ngô Hương MindUp).
  + Xưng hô linh hoạt theo môn & fanpage: "Thầy/Cô" hoặc "Cô Hương / Thầy MindUp" với "Các em học sinh / Quý phụ huynh".
  + Thấu hiểu nỗi lo bỡ ngỡ kiến thức mới, áp lực thi chuyển cấp hoặc sợ môn học khó đầu năm.
  + Tuyệt đối không dùng từ ngữ quảng cáo thô cứng, không cam kết điểm số phi thực tế, không gây áp lực quá mức.
- YÊU CẦU NỘI DUNG CHÍNH:
  + TẤT CẢ BÀI VIẾT ENROLLMENT CHỈ TẬP TRUNG VÀO: Mời đăng ký tham gia 2 BUỔI HỌC THỬ MIỄN PHÍ diễn ra trong TUẦN TỚI.
  + Mở đầu bằng tình huống thật: học sinh mất gốc/ngập ngừng khi học môn mới, hoặc phụ huynh lo lắng tìm môi trường học phù hợp cho con.
  + Nhấn mạnh lợi ích học thử 2 buổi: Trải nghiệm phương pháp học tư duy, kiểm tra lực học, xem Thầy/Cô giảng có dễ hiểu không trước khi vào khóa chính.
  + Đưa ra gợi ý khung giờ học thử cụ thể trong tuần tới (ví dụ: Tối Thứ 3 & Thứ 5 lúc 19h30 - 21h00), kèm quà tặng bộ tài liệu ôn tập/sổ tay công thức cho 30 bạn đăng ký sớm.
  + Kêu gọi hành động (CTA): Nhẹ nhàng – "Inbox cho Thầy/Cô hoặc Fanpage ngay hôm nay để giữ chỗ học thử tuần tới nhé!".
- HASHTAG GỢI Ý: #MindUp #HocThuMienPhi #KhungTuanToi #PhuongPhapTuDuy #MienPhi2Buoi.',
    updated_at = NOW()
WHERE LOWER(TRIM(name)) = 'enrollment';
