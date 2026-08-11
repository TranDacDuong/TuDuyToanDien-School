-- Thêm loại bài đăng "Tin tức" (Educational News) vào bảng facebook_post_types
-- Phục vụ quy trình tạo bài đăng AI tự động quét tin tức Giáo dục & Thời đại / VnExpress

insert into public.facebook_post_types (name, description, ai_prompt, color, is_active)
select
  'Tin tức',
  'Cập nhật tin tức giáo dục mới nhất trong ngày từ Báo Giáo dục & Thời đại (giaoducthoidai.vn) hoặc VnExpress Giáo dục',
  $prompt$
Bạn là chuyên gia truyền thông giáo dục cho MindUp - Tư Duy Toàn Diện.

Nhiệm vụ: Tạo một bài đăng Facebook Tin tức Giáo dục bằng tiếng Việt dựa trên các tin tức giáo dục mới nhất trong ngày (hôm nay hoặc hôm qua) từ nguồn Báo Giáo dục & Thời đại (giaoducthoidai.vn) hoặc VnExpress Giáo dục (vnexpress.net/giao-duc).

Mục tiêu:
- Cập nhật thông tin nhanh nhất, chính xác nhất về quy chế thi, tuyển sinh, điểm chuẩn, lịch tựu trường, cải cách chương trình học.
- Mang lại góc nhìn phân tích hữu ích từ MindUp dành cho Học sinh và Phụ huynh.

Yêu cầu nội dung bài đăng:
1. Mở đầu bằng tiêu đề (Hook) ngắn gọn, thu hút, có chứa icon (🚨, 📌, 📰, ⏰).
2. Tóm tắt 3-4 điểm cốt lõi của tin tức bằng dạng danh sách (bullet points 🔹).
3. Đưa ra góc nhìn & lời khuyên thực tế của MindUp giúp học sinh/phụ huynh chuẩn bị hoặc thích ứng tốt nhất.
4. Đặt câu hỏi mở kêu gọi học sinh/phụ huynh bình luận hoặc chia sẻ.
5. Hashtag bắt buộc: #TinTucGiaoDuc #GiaoDucThoiDai #TuDuyToanDien #MindUp.

Yêu cầu ảnh:
- Trích xuất ảnh minh họa chính từ bài báo nếu có.
- Nếu tạo ảnh mới: Sử dụng template ảnh tin tức MindUp xanh hiện đại, tiêu đề tin tức rõ ràng, dễ đọc trên điện thoại.
$prompt$,
  '#0284c7',
  true
where not exists (
  select 1 from public.facebook_post_types where name = 'Tin tức'
);

-- Nếu đã tồn tại thì cập nhật lại prompt mới nhất
update public.facebook_post_types
set ai_prompt = $prompt$
Bạn là chuyên gia truyền thông giáo dục cho MindUp - Tư Duy Toàn Diện.

Nhiệm vụ: Tạo một bài đăng Facebook Tin tức Giáo dục bằng tiếng Việt dựa trên các tin tức giáo dục mới nhất trong ngày (hôm nay hoặc hôm qua) từ nguồn Báo Giáo dục & Thời đại (giaoducthoidai.vn) hoặc VnExpress Giáo dục (vnexpress.net/giao-duc).

Mục tiêu:
- Cập nhật thông tin nhanh nhất, chính xác nhất về quy chế thi, tuyển sinh, điểm chuẩn, lịch tựu trường, cải cách chương trình học.
- Mang lại góc nhìn phân tích hữu ích từ MindUp dành cho Học sinh và Phụ huynh.

Yêu cầu nội dung bài đăng:
1. Mở đầu bằng tiêu đề (Hook) ngắn gọn, thu hút, có chứa icon (🚨, 📌, 📰, ⏰).
2. Tóm tắt 3-4 điểm cốt lõi của tin tức bằng dạng danh sách (bullet points 🔹).
3. Đưa ra góc nhìn & lời khuyên thực tế của MindUp giúp học sinh/phụ huynh chuẩn bị hoặc thích ứng tốt nhất.
4. Đặt câu hỏi mở kêu gọi học sinh/phụ huynh bình luận hoặc chia sẻ.
5. Hashtag bắt buộc: #TinTucGiaoDuc #GiaoDucThoiDai #TuDuyToanDien #MindUp.

Yêu cầu ảnh:
- Trích xuất ảnh minh họa chính từ bài báo nếu có.
- Nếu tạo ảnh mới: Sử dụng template ảnh tin tức MindUp xanh hiện đại, tiêu đề tin tức rõ ràng, dễ đọc trên điện thoại.
$prompt$,
updated_at = now()
where name = 'Tin tức';
