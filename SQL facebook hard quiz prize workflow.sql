-- Hard Quiz with Prize / Hỏi nhanh đớp trọn workflow.
-- Safe to run repeatedly in Supabase SQL editor.

alter table public.facebook_scheduled_posts
add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.facebook_post_types
set
  name = 'Hard Quiz with Prize',
  description = coalesce(description, 'Hỏi nhanh đớp trọn: câu hỏi khó có thưởng, chốt người thắng theo đáp án đúng + dự đoán XSMB.'),
  ai_prompt = $prompt$
Loại bài Hard Quiz with Prize hiển thị với tên HỎI NHANH ĐỚP TRỌN.

Mục tiêu:
- Tạo bài tương tác có thưởng cho học sinh/phụ huynh.
- Caption không được lộ đáp án đúng.
- Ảnh bài đăng chỉ chứa đề bài/câu hỏi trên template Hỏi nhanh đớp trọn của MindUp.

Luật chơi bắt buộc phải có trong caption:
1. Like bài viết.
2. Share bài viết ở chế độ công khai.
3. Comment đáp án đúng của câu hỏi.
4. Comment kèm 1 số dự đoán từ 00 đến 99.
5. Người thắng là người có đáp án đúng và dự đoán gần nhất với 2 số cuối giải Đặc biệt XSMB Chủ nhật.
6. Nếu nhiều bạn cùng gần nhất, ưu tiên người comment sớm hơn.
7. Kết quả và phần thưởng được công bố trong bài Monday Mindset thứ Hai tuần sau.

Hashtag bắt buộc:
#HardQuiz #HoiNhanhDopTron #MindUp #PhatTrienTuDuy và hashtag riêng của fanpage.
$prompt$,
  is_active = true
where name = 'Hard Quiz with Prize';

insert into public.facebook_post_types (name, description, ai_prompt, color, is_active)
select
  'Hard Quiz with Prize',
  'Hỏi nhanh đớp trọn: câu hỏi khó có thưởng, chốt người thắng theo đáp án đúng + dự đoán XSMB.',
  $prompt$
Loại bài Hard Quiz with Prize hiển thị với tên HỎI NHANH ĐỚP TRỌN.

Mục tiêu:
- Tạo bài tương tác có thưởng cho học sinh/phụ huynh.
- Caption không được lộ đáp án đúng.
- Ảnh bài đăng chỉ chứa đề bài/câu hỏi trên template Hỏi nhanh đớp trọn của MindUp.

Luật chơi bắt buộc phải có trong caption:
1. Like bài viết.
2. Share bài viết ở chế độ công khai.
3. Comment đáp án đúng của câu hỏi.
4. Comment kèm 1 số dự đoán từ 00 đến 99.
5. Người thắng là người có đáp án đúng và dự đoán gần nhất với 2 số cuối giải Đặc biệt XSMB Chủ nhật.
6. Nếu nhiều bạn cùng gần nhất, ưu tiên người comment sớm hơn.
7. Kết quả và phần thưởng được công bố trong bài Monday Mindset thứ Hai tuần sau.

Hashtag bắt buộc:
#HardQuiz #HoiNhanhDopTron #MindUp #PhatTrienTuDuy và hashtag riêng của fanpage.
$prompt$,
  '#f59e0b',
  true
where not exists (
  select 1 from public.facebook_post_types where name = 'Hard Quiz with Prize'
);
