-- Update Facebook post type prompts for the new weekly content workflow.
-- These prompts are for the admin UI/type records. The main generation logic is in
-- supabase/functions/facebook-ai-draft/index.ts.

UPDATE public.facebook_post_types
SET ai_prompt = $prompt$
Loại bài Q&A/Tìm hiểu thực tế:
- Hệ thống chọn chủ đề theo tuần ISO và offset fanpage 0/10/20/30/40 để 5 fanpage không trùng bài.
- Nội dung giải thích kiến thức môn học trong đời sống: mở đầu bằng một câu hỏi gần gũi, giải thích bằng ngôn ngữ dễ hiểu, có ví dụ ngắn.
- Không copy nguyên văn từ nguồn khác; viết lại theo giọng MindUp.
- Ảnh dùng template Q&A của MindUp, không để Gemini tự tạo ảnh.
- Hashtag gợi ý: #MindUp #TimHieuThucTe #KienThucDoiSong.
$prompt$
WHERE lower(name) IN ('q&a', 'qa');

UPDATE public.facebook_post_types
SET ai_prompt = $prompt$
Loại bài Quiz:
- Hệ thống chọn bẫy/chủ đề theo tuần ISO và offset fanpage 0/10/20/30/40 để 5 fanpage không trùng bài.
- Câu hỏi nhanh, học sinh làm trong 10-30 giây.
- Câu hỏi ngắn, rõ, có 2-4 đáp án, có một bẫy nhỏ khiến học sinh dễ sai nếu đọc vội.
- Caption không lộ đáp án; đáp án đúng và giải thích nằm trong ghi chú nội bộ.
- Ảnh dùng template Quiz của MindUp, không để Gemini tự tạo ảnh.
- Hashtag gợi ý: #MindUp #Quiz #PhatTrienTuDuy.
$prompt$
WHERE lower(name) = 'quiz';

UPDATE public.facebook_post_types
SET ai_prompt = $prompt$
Loại bài Hard Quiz with Prize / Hỏi nhanh đớp trọn:
- Hệ thống chọn chủ đề vận dụng theo tuần ISO và offset fanpage 0/10/20/30/40 để 5 fanpage không trùng bài.
- Câu hỏi ở mức vận dụng, hơi khó, học sinh cần đặt bút viết khoảng 10 dòng mới giải chắc được.
- Caption có luật chơi: like bài, share công khai, comment đáp án và số dự đoán XSMB; không lộ đáp án.
- Kết quả công bố trong Monday Mindset.
- Ảnh dùng template Hỏi nhanh đớp trọn của MindUp, không để Gemini tự tạo ảnh.
- Hashtag gợi ý: #HardQuiz #HoiNhanhDopTron #MindUp.
$prompt$
WHERE lower(name) LIKE '%hard quiz%';

UPDATE public.facebook_post_types
SET ai_prompt = $prompt$
Loại bài Meme:
- Hệ thống chọn tình huống meme học tập theo tuần ISO và offset fanpage 0/10/20/30/40 để 5 fanpage không trùng bài.
- Nội dung vui, đời thường, học sinh thấy quen, phụ huynh thấy đáng yêu.
- Không chế giễu học sinh quá đà, không tiêu cực độc hại.
- Ảnh dùng template Meme của MindUp, không để Gemini tự tạo ảnh.
- Hashtag gợi ý: #MindUp #MemeHocTap #HocSinh.
$prompt$
WHERE lower(name) = 'meme';

UPDATE public.facebook_post_types
SET ai_prompt = $prompt$
Loại bài Enrollment:
- Hệ thống chọn pain point/chủ đề tuyển sinh theo tuần ISO và offset fanpage 0/10/20/30/40 để 5 fanpage không trùng bài.
- Mở đầu bằng vấn đề thật của học sinh/phụ huynh.
- Nêu cách MindUp hỗ trợ: chẩn đoán lỗ hổng, học theo lỗi sai, lớp nhỏ, giáo viên theo sát, phản hồi sau buổi học.
- CTA rõ: inbox/đăng ký học thử/đặt lịch học thử.
- Không cam kết tăng điểm phi thực tế, không dùng ngôn từ gây áp lực quá mức.
- Ảnh dùng template Enrollment của MindUp, không để Gemini tự tạo ảnh.
- Hashtag gợi ý: #MindUp #HocThu #DangKyHocThu #PhatTrienTuDuy.
$prompt$
WHERE lower(name) = 'enrollment';
