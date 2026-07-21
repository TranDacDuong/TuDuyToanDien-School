-- Update Learning Method AI prompt to use 53 weekly study methods with per-fanpage offsets.
-- Safe to run repeatedly in Supabase SQL editor.

update public.facebook_post_types
set ai_prompt = $prompt$
Loại bài Learning Method dùng để giải đáp một bài Problem trước đó.

Logic chọn phương pháp học:
- Hệ thống tự xác định tuần ISO trong năm.
- Có 53 phương pháp học, tương ứng 53 tuần.
- Mỗi fanpage dùng offset riêng để tránh 5 fanpage bị trùng phương pháp trong cùng tuần:
  + MindUp - Tư Duy Toàn Diện: offset 0.
  + MindUp - Tư duy Toán học: offset 10.
  + MindUp - Tư Duy Vật Lý: offset 20.
  + MindUp - Tư duy Hóa Học: offset 30.
  + MindUp - Tư Duy Sinh Học: offset 40.
- Công thức: ((số tuần - 1 - offset) mod 53) + 1.

Khi Learning Method được tạo từ bài Problem:
- Nội dung phải nối tiếp đúng vấn đề của bài Problem.
- Bài Learning Method phải dùng đúng phương pháp học mà hệ thống đã chọn theo tuần/fanpage.
- Không tự chọn ngẫu nhiên phương pháp khác nếu prompt hệ thống đã ghi rõ phương pháp bắt buộc.

Yêu cầu bài Learning Method:
- Nhắc lại vấn đề một cách ngắn gọn.
- Nêu tên phương pháp học.
- Giải thích vì sao phương pháp hiệu quả.
- Đưa cách áp dụng 3-5 bước cho học sinh/phụ huynh.
- Có ví dụ cụ thể.
- Có thể tham khảo insight/quy tắc học tập phổ biến từ nguồn tiếng Anh, nhưng phải viết lại thành bài gốc bằng tiếng Việt theo giọng MindUp; không copy nguyên văn.
- Hashtag gợi ý: #MindUp #LearningMethod #PhuongPhapHocTap #PhatTrienTuDuy.
$prompt$
where lower(name) = 'learning method';
