(function () {
  const exactMap = new Map([
    ["Game thi Ä‘áº¥u", "Game thi đấu"],
    ["Äáº¥u trÆ°á»ng tri thá»©c", "Đấu trường tri thức"],
    ["Biáº¿n viá»‡c luyá»‡n Ä‘á» thÃ nh má»™t tráº­n Ä‘áº¥u tháº­t sá»±. Há»c sinh cÃ³ thá»ƒ táº¡o phÃ²ng, má»i báº¡n vÃ o thi, tráº£ lá»i cÃ¢u há»i nhanh Ä‘á»ƒ leo háº¡ng vÃ  xem báº£ng xáº¿p háº¡ng ngay trong phÃ²ng.", "Biến việc luyện đề thành một trận đấu thật sự. Học sinh có thể tạo phòng, mời bạn vào thi, trả lời câu hỏi nhanh để leo hạng và xem bảng xếp hạng ngay trong phòng."],
    ["+ Táº¡o phÃ²ng má»›i", "+ Tạo phòng mới"],
    ["GhÃ©p nhanh", "Ghép nhanh"],
    ["Táº£i láº¡i", "Tải lại"],
    ["Nháº­p mÃ£ phÃ²ng", "Nhập mã phòng"],
    ["VÃ o phÃ²ng", "Vào phòng"],
    ["TÃ¬m theo tÃªn phÃ²ng hoáº·c mÃ£ phÃ²ng", "Tìm theo tên phòng hoặc mã phòng"],
    ["Táº¥t cáº£ khá»‘i", "Tất cả khối"],
    ["Táº¥t cáº£ mÃ´n", "Tất cả môn"],
    ["Má»i cháº¿ Ä‘á»™", "Mọi chế độ"],
    ["Äáº¥u nhanh", "Đấu nhanh"],
    ["PhÃ²ng báº¡n bÃ¨", "Phòng bạn bè"],
    ["Leo háº¡ng", "Leo hạng"],
    ["Sinh tá»“n", "Sinh tồn"],
    ["Äua tá»‘c Ä‘á»™", "Đua tốc độ"],
    ["Má»i kiá»ƒu phÃ²ng", "Mọi kiểu phòng"],
    ["CÃ´ng khai", "Công khai"],
    ["RiÃªng tÆ°", "Riêng tư"],
    ["PhÃ¹ há»£p nháº¥t", "Phù hợp nhất"],
    ["Äang Ä‘Ã´ng", "Đang đông"],
    ["Má»›i nháº¥t", "Mới nhất"],
    ["CÃ²n nhiá»u chá»—", "Còn nhiều chỗ"],
    ["Táº¥t cáº£ tráº¡ng thÃ¡i", "Tất cả trạng thái"],
    ["Äang chá»", "Đang chờ"],
    ["Äang Ä‘áº¥u", "Đang đấu"],
    ["ÄÃ£ káº¿t thÃºc", "Đã kết thúc"],
    ["ChÆ°a cÃ³ phÃ²ng nÃ o phÃ¹ há»£p", "Chưa có phòng nào phù hợp"],
    ["HÃ£y Ä‘á»•i bá»™ lá»c hoáº·c táº¡o má»™t phÃ²ng má»›i Ä‘á»ƒ báº¯t Ä‘áº§u thi Ä‘áº¥u.", "Hãy đổi bộ lọc hoặc tạo một phòng mới để bắt đầu thi đấu."],
    ["LÃ¡Â»â€¹ch sÃ¡Â»Â­ thi Ã„â€˜Ã¡ÂºÂ¥u gÃ¡ÂºÂ§n Ã„â€˜ÃƒÂ¢y", "Lịch sử thi đấu gần đây"],
    ["BÃ¡ÂºÂ£ng xÃ¡ÂºÂ¿p hÃ¡ÂºÂ¡ng", "Bảng xếp hạng"],
    ["HÃƒÂ´m nay", "Hôm nay"],
    ["TuÃ¡ÂºÂ§n", "Tuần"],
    ["ThÃƒÂ¡ng", "Tháng"],
    ["Táº¡o phÃ²ng thi Ä‘áº¥u", "Tạo phòng thi đấu"],
    ["ÄÃ³ng", "Đóng"],
    ["TÃªn phÃ²ng", "Tên phòng"],
    ["MÃ£ phÃ²ng", "Mã phòng"],
    ["Äá»ƒ trá»‘ng sáº½ tá»± táº¡o", "Để trống sẽ tự tạo"],
    ["Sá»‘ ngÆ°á»i tá»‘i Ä‘a", "Số người tối đa"],
    ["Lá»›p liÃªn káº¿t", "Lớp liên kết"],
    ["Khá»‘i", "Khối"],
    ["MÃ´n", "Môn"],
    ["Sá»‘ cÃ¢u há»i", "Số câu hỏi"],
    ["GiÃ¢y cho má»—i cÃ¢u", "Giây cho mỗi câu"],
    ["MÃ´ táº£", "Mô tả"],
    ["VÃ­ dá»¥: Thi Ä‘áº¥u 10 cÃ¢u ToÃ¡n 12 trong 1 lÆ°á»£t, ai nhanh vÃ  chÃ­nh xÃ¡c hÆ¡n sáº½ tháº¯ng.", "Ví dụ: Thi đấu 10 câu Toán 12 trong 1 lượt, ai nhanh và chính xác hơn sẽ thắng."],
    ["Báº£n Ä‘áº§u tiÃªn sáº½ dÃ¹ng láº¡i cÃ¢u há»i tá»« NgÃ¢n hÃ ng cÃ¢u há»i, Æ°u tiÃªn cÃ¡c cÃ¢u tráº¯c nghiá»‡m, Ä‘Ãºng/sai vÃ  tráº£ lá»i ngáº¯n. Tá»± luáº­n sáº½ chÆ°a Ä‘Æ°a vÃ o game Ä‘á»ƒ giá»¯ nhá»‹p thi Ä‘áº¥u nhanh.", "Bản đầu tiên sẽ dùng lại câu hỏi từ Ngân hàng câu hỏi, ưu tiên các câu trắc nghiệm, đúng/sai và trả lời ngắn. Tự luận sẽ chưa đưa vào game để giữ nhịp thi đấu nhanh."],
    ["Há»§y", "Hủy"],
    ["PhÃ²ng thi Ä‘áº¥u", "Phòng thi đấu"],
    ["â† Quay láº¡i", "← Quay lại"],
    ["Sáºµn sÃ ng", "Sẵn sàng"],
    ["Rá»i phÃ²ng", "Rời phòng"],
    ["Báº¯t Ä‘áº§u tráº­n", "Bắt đầu trận"],
    ["ThÃ´ng tin phÃ²ng", "Thông tin phòng"],
    ["NgÆ°á»i chÆ¡i trong phÃ²ng", "Người chơi trong phòng"],
    ["Má»i báº¡n bÃ¨", "Mời bạn bè"],
    ["Cháº¿ Ä‘á»™", "Chế độ"],
    ["Hiá»ƒn thá»‹", "Hiển thị"],
    ["Sao chÃ©p mÃ£", "Sao chép mã"],
    ["Sao chÃ©p lá»i má»i", "Sao chép lời mời"],
    ["CÃ¢u há»i", "Câu hỏi"],
    ["CÃ²n láº¡i", "Còn lại"],
    ["Tiáº¿n Ä‘á»™ tráº­n Ä‘áº¥u", "Tiến độ trận đấu"],
    ["ÄÃ¡p Ã¡n cá»§a báº¡n", "Đáp án của bạn"],
    ["Äiá»ƒm cá»§a báº¡n", "Điểm của bạn"],
    ["Háº¡ng hiá»‡n táº¡i", "Hạng hiện tại"],
    ["Combo hiá»‡n táº¡i", "Combo hiện tại"],
    ["Chuá»—i tá»‘t nháº¥t", "Chuỗi tốt nhất"],
    ["Káº¿t quáº£ tráº­n Ä‘áº¥u", "Kết quả trận đấu"],
    ["Chi tiáº¿t tráº­n Ä‘áº¥u", "Chi tiết trận đấu"],
    ["KhÃ´ng táº£i Ä‘Æ°á»£c phÃ²ng thi Ä‘áº¥u", "Không tải được phòng thi đấu"],
    ["ÄÃ£ cÃ³ lá»—i xáº£y ra.", "Đã có lỗi xảy ra."],
    ["Lá»›p:", "Lớp:"],
    ["KhÃ´ng gáº¯n lá»›p", "Không gắn lớp"],
    ["NgÆ°á»i chÆ¡i", "Người chơi"],
    ["MÃ£ phÃ²ng:", "Mã phòng:"],
    ["KhÃ´ng tÃ¬m tháº¥y phÃ²ng nÃ y.", "Không tìm thấy phòng này."],
    ["PhÃ²ng nÃ y chá»‰ dÃ nh cho há»c sinh hoáº·c giÃ¡o viÃªn cá»§a lá»›p Ä‘Æ°á»£c liÃªn káº¿t.", "Phòng này chỉ dành cho học sinh hoặc giáo viên của lớp được liên kết."],
    ["PhÃ²ng nÃ y Ä‘Ã£ Ä‘áº§y.", "Phòng này đã đầy."],
    ["KhÃ´ng thá»ƒ tham gia phÃ²ng:", "Không thể tham gia phòng:"],
    ["ChÆ°a cÃ³ phÃ²ng Ä‘áº¥u nhanh phÃ¹ há»£p. MÃ¬nh Ä‘Ã£ má»Ÿ sáºµn form táº¡o phÃ²ng Ä‘áº¥u nhanh cho báº¡n.", "Chưa có phòng đấu nhanh phù hợp. Mình đã mở sẵn form tạo phòng đấu nhanh cho bạn."],
    ["HÃ£y nháº­p mÃ£ phÃ²ng trÆ°á»›c.", "Hãy nhập mã phòng trước."],
    ["KhÃ´ng tÃ¬m tháº¥y phÃ²ng vá»›i mÃ£ nÃ y.", "Không tìm thấy phòng với mã này."],
    ["KhÃ´ng thá»ƒ cáº­p nháº­t tráº¡ng thÃ¡i:", "Không thể cập nhật trạng thái:"],
    ["Báº¡n muá»‘n rá»i phÃ²ng nÃ y?", "Bạn muốn rời phòng này?"],
    ["KhÃ´ng thá»ƒ rá»i phÃ²ng:", "Không thể rời phòng:"],
    ["mÃ£ phÃ²ng", "mã phòng"],
    ["ÄÃ£ sao chÃ©p mÃ£ phÃ²ng.", "Đã sao chép mã phòng."],
    ["ÄÃ£ sao chÃ©p lá»i má»i.", "Đã sao chép lời mời."],
    ["Má»i", "Mời"],
    ["Má»i ra", "Mời ra"],
    ["Má»i ngÆ°á»i chÆ¡i ra khá»i phÃ²ng:", "Mời người chơi ra khỏi phòng:"],
    ["KhÃ´ng thá»ƒ má»i ngÆ°á»i chÆ¡i ra khá»i phÃ²ng:", "Không thể mời người chơi ra khỏi phòng:"],
    ["KhÃ´ng táº£i Ä‘Æ°á»£c phÃ²ng:", "Không tải được phòng:"],
    ["Táº¡o lÃºc", "Tạo lúc"],
    ["Má»i báº¡n bÃ¨ cÃ¹ng vÃ o phÃ²ng, khi Ä‘á»§ ngÆ°á»i thÃ¬ chá»§ phÃ²ng báº¯t Ä‘áº§u tráº­n.", "Mời bạn bè cùng vào phòng, khi đủ người thì chủ phòng bắt đầu trận."],
    ["PhÃ²ng Ä‘Ã£ Ä‘á»§ Ä‘iá»u kiá»‡n Ä‘á»ƒ báº¯t Ä‘áº§u tráº­n.", "Phòng đã đủ điều kiện để bắt đầu trận."],
    ["Cáº§n Ã­t nháº¥t 2 ngÆ°á»i chÆ¡i vÃ  táº¥t cáº£ ngÆ°á»i chÆ¡i cÃ²n láº¡i pháº£i sáºµn sÃ ng.", "Cần ít nhất 2 người chơi và tất cả người chơi còn lại phải sẵn sàng."],
    ["Báº¡n Ä‘Ã£ sáºµn sÃ ng. HÃ£y chá» chá»§ phÃ²ng báº¯t Ä‘áº§u tráº­n.", "Bạn đã sẵn sàng. Hãy chờ chủ phòng bắt đầu trận."],
    ["Nháº¥n Sáºµn sÃ ng Ä‘á»ƒ bÃ¡o chá»§ phÃ²ng ráº±ng báº¡n Ä‘Ã£ chuáº©n bá»‹ xong.", "Nhấn Sẵn sàng để báo chủ phòng rằng bạn đã chuẩn bị xong."],
    ["ChÆ°a cÃ³ ngÆ°á»i chÆ¡i nÃ o trong phÃ²ng.", "Chưa có người chơi nào trong phòng."],
    ["Chá»§ phÃ²ng", "Chủ phòng"],
    ["PhÃ²ng riÃªng tÆ°", "Phòng riêng tư"],
    ["CÃ³ thá»ƒ vÃ o báº±ng mÃ£", "Có thể vào bằng mã"],
    ["Báº¡n bÃ¨", "Bạn bè"],
    ["KhÃ´ng cÃ²n báº¡n bÃ¨ nÃ o Ä‘á»ƒ má»i vÃ o phÃ²ng nÃ y.", "Không còn bạn bè nào để mời vào phòng này."],
    ["NgÆ°á»i chÆ¡i", "Người chơi"],
    ["Cáº§n Ã­t nháº¥t 2 ngÆ°á»i chÆ¡i vÃ  táº¥t cáº£ ngÆ°á»i chÆ¡i cÃ²n láº¡i pháº£i sáºµn sÃ ng.", "Cần ít nhất 2 người chơi và tất cả người chơi còn lại phải sẵn sàng."],
    ["ChÆ°a Ä‘á»§ cÃ¢u há»i phÃ¹ há»£p trong NgÃ¢n hÃ ng cÃ¢u há»i Ä‘á»ƒ báº¯t Ä‘áº§u tráº­n.", "Chưa đủ câu hỏi phù hợp trong Ngân hàng câu hỏi để bắt đầu trận."],
    ["KhÃ´ng thá»ƒ chuáº©n bá»‹ cÃ¢u há»i:", "Không thể chuẩn bị câu hỏi:"],
    ["KhÃ´ng thá»ƒ báº¯t Ä‘áº§u tráº­n:", "Không thể bắt đầu trận:"],
    ["Äang chuáº©n bá»‹ cÃ¢u há»i...", "Đang chuẩn bị câu hỏi..."],
    ["Sinh tá»“n", "Sinh tồn"],
    ["Tiáº¿n Ä‘á»™", "Tiến độ"],
    ["Xem ná»™i dung cÃ¢u há»i.", "Xem nội dung câu hỏi."],
    ["Báº¡n Ä‘Ã£ háº¿t máº¡ng trong tráº­n sinh tá»“n nÃ y.", "Bạn đã hết mạng trong trận sinh tồn này."],
    ["Báº¡n ghi Ä‘iá»ƒm á»Ÿ cÃ¢u nÃ y.", "Bạn ghi điểm ở câu này."],
    ["Báº¡n Ä‘Ã£ gá»­i Ä‘Ã¡p Ã¡n.", "Bạn đã gửi đáp án."],
    ["Má»—i cÃ¢u chá»‰ Ä‘Æ°á»£c tráº£ lá»i má»™t láº§n. HÃ£y chá»n tháº­t cháº¯c trÆ°á»›c khi xÃ¡c nháº­n.", "Mỗi câu chỉ được trả lời một lần. Hãy chọn thật chắc trước khi xác nhận."],
    ["Ä‘iá»ƒm", "điểm"],
    ["Tráº­n rank tháº¯ng", "trận rank thắng"],
    ["Háº¡ng", "Hạng"],
    ["Tá»‰ lá»‡ tháº¯ng", "Tỉ lệ thắng"],
    ["Chuá»—i tháº¯ng", "Chuỗi thắng"],
    ["Äiá»ƒm rank", "Điểm rank"],
    ["Tráº­n Ä‘Ã£ chÆ¡i", "Trận đã chơi"],
    ["Tráº­n tháº¯ng", "Trận thắng"],
    ["Äiá»ƒm cao nháº¥t", "Điểm cao nhất"],
    ["Tá»•ng Ä‘iá»ƒm", "Tổng điểm"],
    ["Äiá»ƒm trung bÃ¬nh", "Điểm trung bình"],
    ["PhÃ²ng thi Ä‘áº¥u", "Phòng thi đấu"],
    ["Xem chi tiáº¿t", "Xem chi tiết"],
    ["Báº¡n chÆ°a cÃ³ tráº­n nÃ o hoÃ n thÃ nh.", "Bạn chưa có trận nào hoàn thành."],
    ["ChÆ°a cÃ³ dá»¯ liá»‡u báº£ng xáº¿p háº¡ng cho má»‘c thá»i gian nÃ y.", "Chưa có dữ liệu bảng xếp hạng cho mốc thời gian này."],
    ["Báº¡n", "Bạn"],
    ["CÃ¢u Ä‘Ãºng", "Câu đúng"],
    ["Äá»™ chÃ­nh xÃ¡c", "Độ chính xác"],
    ["Báº£ng xáº¿p háº¡ng tráº­n", "Bảng xếp hạng trận"],
    ["Chi tiáº¿t tá»«ng cÃ¢u", "Chi tiết từng câu"],
    ["Sai", "Sai"],
    ["ÄÃºng", "Đúng"],
    ["ChÆ°a tráº£ lá»i", "Chưa trả lời"],
    ["Äiá»ƒm nháº­n Ä‘Æ°á»£c", "Điểm nhận được"],
    ["Tráº£ lá»i ngáº¯n", "Trả lời ngắn"],
    ["Tráº¯c nghiá»‡m", "Trắc nghiệm"],
    ["ÄÃºng / Sai", "Đúng / Sai"]
  ]);

  function sanitizeText(input) {
    let text = String(input ?? "");
    for (const [bad, good] of exactMap.entries()) {
      text = text.split(bad).join(good);
    }
    return text;
  }

  function sanitizeNodeTree(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => {
      const next = sanitizeText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });
    root.querySelectorAll?.("input[placeholder], textarea[placeholder], option, button, label, h1, h2, h3, h4, p, span, strong, small, div").forEach((el) => {
      if (el.placeholder) {
        const next = sanitizeText(el.placeholder);
        if (next !== el.placeholder) el.placeholder = next;
      }
      if (el.childNodes.length === 1 && el.firstChild.nodeType === Node.TEXT_NODE) {
        const next = sanitizeText(el.textContent);
        if (next !== el.textContent) el.textContent = next;
      }
    });
  }

  function applyStaticOverrides() {
    document.title = "Game thi đấu";
    sanitizeNodeTree(document.body);
  }

  const nativeAlert = window.alert;
  window.alert = function (message) {
    return nativeAlert.call(window, sanitizeText(message));
  };

  const nativeConfirm = window.confirm;
  window.confirm = function (message) {
    return nativeConfirm.call(window, sanitizeText(message));
  };

  const nativePrompt = window.prompt;
  window.prompt = function (message, value) {
    return nativePrompt.call(window, sanitizeText(message), sanitizeText(value));
  };

  document.addEventListener("DOMContentLoaded", applyStaticOverrides);
  if (document.readyState !== "loading") applyStaticOverrides();

  const observer = new MutationObserver(() => applyStaticOverrides());
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
