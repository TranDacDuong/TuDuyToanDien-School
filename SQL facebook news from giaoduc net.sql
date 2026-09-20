-- Document the dedicated runtime behavior for the Tin tức post type.
-- The Edge Function fetches and validates the source article before sending its body to the text model.

update public.facebook_post_types
set ai_prompt = $prompt$
Chỉ sử dụng tin giáo dục từ https://giaoduc.net.vn/.
- Backend phải đọc trang báo thật và chỉ chọn bài có thời gian xuất bản trong đúng 24 giờ gần nhất.
- Ưu tiên bài trong mục Đọc nhiều; nếu không có thì chọn bài mới có khả năng được học sinh, phụ huynh hoặc giáo viên quan tâm nhất.
- Tóm tắt trung thực nội dung bài báo thành caption Facebook 180-350 từ, có nguồn và URL bài gốc; không thêm dữ kiện ngoài nguồn.
- Sử dụng ảnh chính từ chính bài báo, chèn logo MindUp nhỏ và ghi nguồn ảnh; không tạo ảnh thay thế bằng AI.
- Nếu không có bài hợp lệ kèm ảnh dùng được trong 24 giờ gần nhất thì hủy bài Tin tức và không gọi AI.
$prompt$
where lower(trim(name)) in ('tin tức', 'tin tuc', 'news');
