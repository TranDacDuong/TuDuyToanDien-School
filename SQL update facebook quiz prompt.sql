-- SQL cập nhật Prompt AI cho Loại bài Quiz (Câu hỏi bẫy / lừa bám sát SGK Kết nối tri thức).
-- Chạy script này trong Supabase SQL Editor để áp dụng prompt mới cho database.

UPDATE public.facebook_post_types
SET ai_prompt = 'Loại bài Quiz dùng cho câu hỏi bẫy / câu hỏi lừa làm nhanh 10-30 giây.
- BẮT BUỘC KHỚP CHƯƠNG TRÌNH SGK KẾT NỐI TRI THỨC VỚI CUỘC SỐNG:
  + Lấy đúng bài/chương đang học trên lớp theo thời gian thực (tháng/tuần trong năm học).
  + Khối lớp theo ngày đăng: Thứ 2 (Lớp 6), Thứ 3 (Lớp 7), Thứ 4 (Lớp 8), Thứ 5 (Lớp 9), Thứ 6 (Lớp 10), Thứ 7 (Lớp 11), Chủ nhật (Lớp 12).
- BẢN CHẤT CÂU HỎI BẪY / CÂU HỎI LỪA KHẾN HỌC SINH RẤT DỄ SAI:
  + Gài bẫy khái niệm, đọc lướt, thiếu điều kiện nghiệm, nhầm đơn vị hoặc nhầm dấu mà học sinh rất dễ chọn sai do ẩu.
  + Có 2-4 đáp án ngắn. Đáp án lừa chứa đúng kết quả của sai lầm phổ biến nhất.
- ĐỊNH DẠNG & QUY TẮC:
  + Công thức toán/hóa phải dùng định dạng LaTeX giữa 2 dấu $ (ví dụ $x^2+1=0$).
  + Caption không được lộ đáp án; đáp án đúng và phân tích bẫy để trong ghi chú nội bộ.
  + Ảnh tự động dựng theo template Quiz của MindUp (tự chèn câu hỏi + 2-4 ô đáp án).
- HASHTAG GỢI Ý: #MindUp #Quiz #KetNoiTriThuc #CauHoiBay #PhatTrienTuDuy.',
    updated_at = NOW()
WHERE LOWER(TRIM(name)) = 'quiz';
