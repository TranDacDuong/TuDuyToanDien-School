-- Problem -> Learning Method paired content workflow for MindUp.
-- Safe to run repeatedly in Supabase SQL editor.

alter table public.facebook_scheduled_posts
add column if not exists metadata jsonb not null default '{}'::jsonb;

insert into public.facebook_post_types (name, description, ai_prompt, color, is_active)
select
  'Problem',
  'Bài nêu khó khăn/nỗi đau của học sinh hoặc phụ huynh, dùng để mở chuỗi Problem → Learning Method.',
  $prompt$
Loại bài Problem dùng để mở đầu chuỗi Problem → Learning Method.

Khi bấm Gemini ở bài Problem:
- Hệ thống sẽ tự tìm bài Learning Method gần nhất sau bài Problem trong cùng fanpage.
- Gemini tạo cả 2 bài cùng lúc để nội dung liên kết chặt với nhau.
- Problem có thể đăng thứ Ba, Learning Method có thể đăng thứ Năm hoặc bất kỳ thời điểm nào sau đó.

Yêu cầu bài Problem:
- Nêu một khó khăn thật của học sinh hoặc phụ huynh khi học, tự học hoặc kèm con học.
- Viết đồng cảm, chạm nỗi đau, có ví dụ đời thường.
- Không giải đáp hết; chỉ gợi mở và hẹn bài Learning Method sau đó.
- Có CTA hỏi phụ huynh/học sinh có đang gặp tình trạng này không.
- Hashtag gợi ý: #MindUp #VanDeHocTap #PhuHuynh #HocSinh.
$prompt$,
  '#0ea5e9',
  true
where not exists (
  select 1 from public.facebook_post_types where lower(name) = 'problem'
);

update public.facebook_post_types
set
  description = 'Bài nêu khó khăn/nỗi đau của học sinh hoặc phụ huynh, dùng để mở chuỗi Problem → Learning Method.',
  ai_prompt = $prompt$
Loại bài Problem dùng để mở đầu chuỗi Problem → Learning Method.

Khi bấm Gemini ở bài Problem:
- Hệ thống sẽ tự tìm bài Learning Method gần nhất sau bài Problem trong cùng fanpage.
- Gemini tạo cả 2 bài cùng lúc để nội dung liên kết chặt với nhau.
- Problem có thể đăng thứ Ba, Learning Method có thể đăng thứ Năm hoặc bất kỳ thời điểm nào sau đó.

Yêu cầu bài Problem:
- Nêu một khó khăn thật của học sinh hoặc phụ huynh khi học, tự học hoặc kèm con học.
- Viết đồng cảm, chạm nỗi đau, có ví dụ đời thường.
- Không giải đáp hết; chỉ gợi mở và hẹn bài Learning Method sau đó.
- Có CTA hỏi phụ huynh/học sinh có đang gặp tình trạng này không.
- Hashtag gợi ý: #MindUp #VanDeHocTap #PhuHuynh #HocSinh.
$prompt$,
  is_active = true
where lower(name) = 'problem';

update public.facebook_post_types
set ai_prompt = $prompt$
Loại bài Learning Method dùng để giải đáp một bài Problem trước đó.

Khi Learning Method được tạo từ bài Problem:
- Nội dung phải nối tiếp đúng vấn đề của bài Problem.
- Chia sẻ một phương pháp học tập phù hợp với vấn đề đã nêu.
- Có thể tham khảo insight/quy tắc học tập phổ biến từ nguồn tiếng Anh, nhưng phải viết lại thành bài gốc bằng tiếng Việt theo giọng MindUp; không copy nguyên văn.

Yêu cầu bài Learning Method:
- Nhắc lại vấn đề một cách ngắn gọn.
- Nêu tên phương pháp học.
- Giải thích vì sao phương pháp hiệu quả.
- Đưa cách áp dụng 3-5 bước cho học sinh/phụ huynh.
- Có ví dụ cụ thể.
- Hashtag gợi ý: #MindUp #LearningMethod #PhuongPhapHocTap #PhatTrienTuDuy.
$prompt$
where lower(name) = 'learning method';
