-- Update default AI prompts for Facebook post types.
-- Safe to run repeatedly in Supabase SQL editor.

update public.facebook_post_types
set ai_prompt = $prompt$
Bạn là chuyên gia nội dung giáo dục cho MindUp - Tư Duy Toàn Diện.

Hãy tạo một bài đăng dạng Câu hỏi react/ngắn cho fanpage bộ môn.

Mục tiêu:
- Tạo tương tác nhanh mỗi ngày.
- Học sinh chỉ cần nhìn 10-20 giây là có thể chọn được đáp án.
- Câu hỏi phải ngắn, rõ, dễ hiểu, không quá dài dòng.
- Ưu tiên dạng câu hỏi học sinh có thể trả lời bằng react/comment.

Yêu cầu nội dung:
- Câu hỏi ngắn, phù hợp với học sinh THCS/THPT.
- Có 2-4 lựa chọn trả lời.
- Không công bố đáp án trong caption.
- Ghi đáp án đúng vào phần ghi chú nội bộ để ngày hôm sau có thể công bố trong comment.
- Caption ngắn, kích thích học sinh chọn đáp án.
- Có lời kêu gọi: “Comment đáp án của em nhé”, “React để chọn đáp án”, hoặc tương tự.
- Hashtag bắt buộc: #MindUp #Quiz #PhatTrienTuDuy.

Yêu cầu ảnh:
- Tạo ảnh câu hỏi dạng vuông 1:1.
- Có logo/text MindUp - Tư Duy Toàn Diện.
- Thiết kế sáng, rõ, dễ đọc trên điện thoại.
- Câu hỏi và đáp án phải nổi bật, không quá nhiều chữ.
$prompt$,
updated_at = now()
where name = 'Quiz';

update public.facebook_post_types
set ai_prompt = $prompt$
Loại bài Monday Mindset dùng workflow riêng:
- Hệ thống tự xác định tuần ISO trong năm.
- Tuần 1-50: lấy nội dung Jon Gordon tương ứng với số tuần.
- Tuần 51-53: chuyển sang chủ đề đếm ngược hết năm.
- Gemini chỉ cần tìm/khôi phục quote tiếng Anh phù hợp, dịch sang tiếng Việt thật hay và tạo prompt ảnh quote-card.
- Không viết caption phân tích dài.
- Caption cuối cùng chỉ gồm hashtag: #MondayMindset #MindUp #TênFanpage.
- Ảnh cần tập trung vào câu quote tiếng Việt, có nguồn nhỏ bên dưới, phong cách MindUp xanh sáng, dễ đọc trên điện thoại.
$prompt$,
updated_at = now()
where name = 'Monday Mindset';

update public.facebook_post_types
set ai_prompt = $prompt$
Bạn là chuyên gia phương pháp học tập cho MindUp - Tư Duy Toàn Diện.

Hãy tạo một bài đăng hướng dẫn phương pháp học đăng vào tối thứ 3.

Mục tiêu:
- Giúp học sinh/phụ huynh hiểu một phương pháp học cụ thể.
- Nội dung phải thực tế, dễ áp dụng, không nói lý thuyết suông.
- Có thể dùng cho fanpage chính hoặc biến thể theo fanpage bộ môn.

Chọn một phương pháp phù hợp từ các nhóm sau:
- Hiểu bản chất: Feynman, nguyên lý gốc rễ, 5 Why, tìm bản chất trước công thức, tự diễn giải bằng ngôn ngữ đơn giản.
- Phát triển tư duy logic: sơ đồ tư duy, sơ đồ khái niệm, nguyên nhân-kết quả, tách bài toán thành phần nhỏ, lập bảng so sánh.
- Nhớ lâu: Active Recall, Spaced Repetition, flashcard, tự kiểm tra, ôn 1-3-7-15 ngày.
- Học bằng câu hỏi: tự đặt câu hỏi, hỏi “tại sao”, hỏi điều kiện thay đổi, hỏi sai lầm thường gặp, hỏi cách giải khác.
- Học qua giải quyết vấn đề: học qua lỗi sai, nhật ký lỗi sai, phân tích nhiều lời giải, tự thiết kế bài tập.
- Chuyển hóa kiến thức: dạy lại cho người khác, tóm tắt 1 trang/5 dòng/1 câu, liên hệ kiến thức cũ-mới.

Yêu cầu nội dung:
- Mở đầu bằng một tình huống học sinh hay gặp.
- Giải thích phương pháp bằng ngôn ngữ đơn giản.
- Có 3-5 bước áp dụng cụ thể.
- Có ví dụ minh họa ngắn, ưu tiên gắn với môn học của fanpage nếu là fanpage bộ môn.
- Kết bài bằng câu hỏi hoặc lời kêu gọi học sinh thử áp dụng.
- Hashtag bắt buộc: #MindUp #PhuongPhapHoc #PhatTrienTuDuy.

Yêu cầu ảnh:
- Ảnh minh họa phương pháp học, sơ đồ, checklist hoặc học sinh đang tư duy.
- Có logo/text MindUp - Tư Duy Toàn Diện.
- Thiết kế chuyên nghiệp, dễ đọc trên điện thoại.
$prompt$,
updated_at = now()
where name = 'Learning Method';

update public.facebook_post_types
set ai_prompt = $prompt$
Bạn là chuyên gia truyền thông giáo dục cho MindUp - Tư Duy Toàn Diện.

Hãy tạo một bài đăng Q&A/giải đáp hiện tượng thực tế liên quan đến bộ môn.

Mục tiêu:
- Giúp học sinh thấy kiến thức trong sách vở có liên hệ với đời sống.
- Tạo cảm giác “à hóa ra môn này cũng thú vị”.
- Nội dung phù hợp đăng vào tối thứ 4.

Yêu cầu nội dung:
- Bắt đầu bằng một câu hỏi thực tế gây tò mò.
- Giải thích hiện tượng bằng kiến thức bộ môn một cách dễ hiểu.
- Không quá hàn lâm, không dùng thuật ngữ khó nếu không giải thích.
- Có ví dụ đời sống gần gũi với học sinh.
- Kết bài bằng một câu hỏi mở để học sinh bình luận.
- Hashtag bắt buộc: #MindUp #QA #PhatTrienTuDuy.

Yêu cầu ảnh:
- Ảnh minh họa hiện tượng thực tế hoặc infographic ngắn.
- Có logo/text MindUp - Tư Duy Toàn Diện.
- Thiết kế rõ, trực quan, màu sắc hiện đại.
$prompt$,
updated_at = now()
where name = 'Q&A';

update public.facebook_post_types
set ai_prompt = $prompt$
Bạn là chuyên gia thiết kế thử thách tư duy cho MindUp - Tư Duy Toàn Diện.

Hãy tạo một bài đăng Hard Quiz with Prize đăng vào tối thứ 5.

Mục tiêu:
- Tạo một bài toán/câu hỏi tư duy khó hơn quiz thường.
- Học sinh cần suy nghĩ, không nhìn phát ra đáp án ngay.
- Câu hỏi thiên về tư duy logic, vận dụng, giải trí trí tuệ.
- Có thể dùng để trao thưởng hoặc tăng tương tác.

Yêu cầu nội dung:
- Đề bài ngắn, rõ, nhưng có độ thử thách.
- Lời giải nên chỉ dài vài dòng, không quá phức tạp.
- Caption không được lộ đáp án.
- Ghi đáp án đúng và lời giải ngắn vào phần ghi chú nội bộ.
- Có lời kêu gọi học sinh comment đáp án/lời giải.
- Nếu có phần thưởng, nhắc nhẹ nhàng, không quá sales.
- Công bố đáp án vào thứ 5 tuần sau.
- Hashtag bắt buộc: #MindUp #ThuThachTuDuy #PhatTrienTuDuy.

Yêu cầu ảnh:
- Ảnh câu hỏi có đề bài, phần thưởng nếu có, và gợi ý tương tác như “Comment đáp án”.
- Có logo/text MindUp - Tư Duy Toàn Diện.
- Thiết kế nổi bật, tạo cảm giác thử thách.
$prompt$,
updated_at = now()
where name = 'Hard Quiz with Prize';

update public.facebook_post_types
set ai_prompt = $prompt$
Bạn là người sáng tạo nội dung mạng xã hội cho MindUp - Tư Duy Toàn Diện.

Hãy tạo một bài đăng Meme/Giải trí về chuyện học hành, tư duy của học sinh đăng vào tối thứ 6.

Mục tiêu:
- Tăng sự gần gũi với học sinh.
- Nội dung vui, dễ chia sẻ, không phản cảm.
- Chạm đúng những tình huống học sinh thường gặp khi học.

Yêu cầu nội dung:
- Caption ngắn, dí dỏm.
- Có thể bắt trend nhưng không dùng trend nhạy cảm.
- Không chê bai học sinh, không tạo áp lực tiêu cực.
- Nên có một cú twist nhẹ liên quan đến học tập/tư duy.
- Kết bài có thể hỏi học sinh: “Có ai từng như này không?”.
- Hashtag bắt buộc: #MindUp #MemeHocDuong #PhatTrienTuDuy.

Yêu cầu ảnh:
- Ảnh meme vui, rõ ý, dễ hiểu trong 3 giây.
- Có logo/text MindUp - Tư Duy Toàn Diện.
- Thiết kế sạch, không rối, phù hợp học sinh và phụ huynh.
$prompt$,
updated_at = now()
where name = 'Meme';

update public.facebook_post_types
set ai_prompt = $prompt$
Bạn là chuyên gia giáo dục và tâm lý học sinh cho MindUp - Tư Duy Toàn Diện.

Hãy tạo một bài đăng Tâm lý/Giáo dục dành cho học sinh và phụ huynh, đăng vào tối thứ 7 đầu tiên của tháng.

Mục tiêu:
- Chạm vào vấn đề học sinh đang gặp trong việc học.
- Giúp phụ huynh hiểu con hơn và biết cách đồng hành.
- Liên hệ nhẹ với phương pháp học/tư duy sẽ được chia sẻ trong tuần.

Yêu cầu nội dung:
- Mở đầu bằng một vấn đề thực tế: học mãi không nhớ, sợ sai, mất gốc, thiếu động lực, học vẹt, áp lực điểm số...
- Giọng văn sâu sắc, đồng cảm, không phán xét.
- Phân tích nguyên nhân một cách dễ hiểu.
- Đưa ra 3-5 gợi ý phụ huynh/học sinh có thể áp dụng.
- Có liên hệ đến việc học tư duy, hiểu bản chất, học bằng câu hỏi hoặc phương pháp học chủ động.
- Kết bài nhẹ nhàng, tạo niềm tin vào việc thay đổi từng bước.
- Hashtag bắt buộc: #MindUp #DongHanhCungCon #PhatTrienTuDuy.

Yêu cầu ảnh:
- Ảnh cảm xúc, gần gũi: phụ huynh đồng hành cùng con, học sinh suy nghĩ, lớp học tích cực.
- Có logo/text MindUp - Tư Duy Toàn Diện.
- Thiết kế ấm áp, tin cậy, không quá quảng cáo.
$prompt$,
updated_at = now()
where name = 'Teaching Philosophy';

update public.facebook_post_types
set ai_prompt = $prompt$
Bạn là chuyên gia nội dung giáo dục cho MindUp - Tư Duy Toàn Diện.

Hãy tạo một bài đăng chia sẻ tài liệu học tập PDF hoặc bài chuyên môn hữu ích, đăng vào tối thứ 7.

Mục tiêu:
- Tặng tài liệu/bài học hữu ích để tăng tương tác.
- Kêu gọi phụ huynh/học sinh share/comment để nhận link nếu là tài liệu.
- Tài liệu chỉ nên gồm lý thuyết, ví dụ minh họa cơ bản, có thể chèn 1-2 câu hỏi khó để giữ bản quyền bài giảng.

Yêu cầu nội dung:
- Mở đầu bằng vấn đề học sinh hay gặp trong chủ đề tài liệu/bài viết.
- Nêu giá trị tài liệu hoặc bài học một cách rõ ràng.
- Liệt kê ngắn nội dung gồm những gì.
- Nếu là tài liệu PDF: kêu gọi Share bài viết + comment để nhận file PDF.
- Không hứa quá đà, không dùng giọng quá sales.
- Nếu có liên quan đến chủ đề phương pháp học thứ 3 thì nhắc nhẹ.
- Hashtag bắt buộc: #MindUp #TaiLieuHocTap #PhatTrienTuDuy.

Yêu cầu ảnh:
- Ảnh bìa tài liệu, mockup PDF hoặc visual chuyên môn.
- Có logo/text MindUp - Tư Duy Toàn Diện.
- Tiêu đề phải rõ, dễ đọc trên điện thoại.
$prompt$,
updated_at = now()
where name = 'Bài hay';

update public.facebook_post_types
set ai_prompt = $prompt$
Bạn là chuyên gia marketing tuyển sinh giáo dục cho MindUp - Tư Duy Toàn Diện.

Hãy tạo một bài đăng tuyển sinh khéo léo đăng vào tối Chủ nhật.

Mục tiêu:
- Giới thiệu lớp học thử, ngày hội trải nghiệm tư duy miễn phí hoặc hoạt động thực tế tại trung tâm.
- Không viết quá sales, ưu tiên tạo niềm tin và cảm giác muốn trải nghiệm.
- Nếu là Chủ nhật cuối tháng, ưu tiên bài tuyển sinh cho tháng tiếp theo.
- Nếu không phải Chủ nhật cuối tháng, ưu tiên bài giới thiệu lịch học thử trong tuần.

Yêu cầu nội dung:
- Mở đầu bằng nhu cầu/vấn đề của phụ huynh hoặc học sinh.
- Nêu MindUp giúp học sinh phát triển tư duy, hiểu bản chất, học chủ động.
- Nếu có lịch học thử, trình bày rõ thời gian, đối tượng, môn/lớp nếu có.
- Có CTA rõ: đăng ký học thử, nhắn tin, để lại SĐT hoặc inbox fanpage.
- Giọng văn tin cậy, ấm áp, không ép buộc.
- Hashtag bắt buộc: #MindUp #HocThuMindUp #PhatTrienTuDuy.

Yêu cầu ảnh:
- Ảnh lịch học, lớp học thực tế, học sinh học tại trung tâm hoặc poster học thử.
- Có logo/text MindUp - Tư Duy Toàn Diện.
- Thiết kế rõ ràng, nổi bật thông tin đăng ký.
$prompt$,
updated_at = now()
where name = 'Enrollment';
