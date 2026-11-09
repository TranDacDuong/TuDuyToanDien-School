# Nhận công việc Zalo theo sự kiện

Website tiếp tục gọi RPC hoặc Edge Function hiện có để lưu yêu cầu. Trigger trên các bảng hàng đợi phát thông báo Realtime sau khi giao dịch được commit. Bot mở một kết nối WebSocket để nhận thông báo rồi gọi các hàm claim hiện có. Không cần mở cổng laptop ra Internet hoặc thay đổi quyền dữ liệu người dùng.

Thông báo chỉ có `kind` (dispatch, parents, groups, storage, links, all), không có nội dung tin nhắn, số điện thoại hay thông tin học phí. Topic là giá trị SHA-256 có miền riêng từ gateway token, được cấp qua gateway đã xác thực. Bảng cấu hình có RLS, chỉ service role được truy cập. Topic không được đưa vào API trạng thái, frontend hoặc log. Thông báo là gợi ý đánh thức; không mang quyền gửi và không thay thế xác thực, khóa hàng đợi, thời gian gửi tối thiểu 10 giây hoặc xác nhận kết quả gửi.

## Hoạt động

- Hàng đợi trống: mỗi nhóm worker kiểm tra dự phòng tối đa một lần mỗi giờ. Một lượt rà có thể gồm nhiều Edge Function, không phải toàn bot chỉ có một lời gọi mỗi giờ.
- Có việc mới: đánh thức đúng nhóm worker, gộp thông báo dồn dập và đợi tác vụ đang xử lý kết thúc. Tiếp tục lấy việc trong đợt đang hoạt động; trở lại chờ một giờ khi không lấy được việc.
- Bot khởi động, Zalo kết nối lại hoặc Realtime kết nối lại: rà tất cả hàng đợi ngay để bù thông báo bị bỏ lỡ.
- Tin nhắn/sự kiện Zalo đến: giữ đường xử lý theo sự kiện, lưu bền vững trên laptop rồi đồng bộ; không đợi lịch kiểm tra hàng giờ.
- HTTP 401/402/403/429: tất cả lời gọi gateway mới tạm dừng một giờ; không bỏ tin nhắn hoặc biên nhận đang chờ. Khôi phục theo lượt kiểm tra kế tiếp. Realtime không tự gỡ hạn chế quota của Supabase.
- Nếu mất Realtime nhưng Internet vẫn hoạt động, yêu cầu mới có thể chờ lượt rà dự phòng. Yêu cầu đọc lịch sử cũ có thời hạn ngắn có thể hết hạn và cần mở lại khi kết nối khôi phục.

Các timer nội bộ 0,5–1 giây chỉ kiểm tra biến trong RAM; không gọi Edge Function nếu chưa tới hạn hoặc chưa có thông báo. WebSocket heartbeat thuộc Realtime, không phải Edge Function invocation. Đồng bộ danh sách bạn bè Zalo và phục hồi phiên Zalo vẫn có lịch nội bộ riêng.

## Triển khai

1. Chạy `SQL Zalo realtime work wakeup.sql` sau các SQL hàng đợi hiện có; có thể chạy lại. 19 bảng hiện có được gắn trigger. Nếu tạo thêm bảng trong danh sách sau này, chạy lại SQL này.
2. Triển khai `supabase/functions/zalo-gateway/index.ts`. Action `workWakeupConfig` chỉ cung cấp project URL, anon key và topic cho bot có gateway token hợp lệ; tuyệt đối không cung cấp service-role key.
3. Cập nhật thư viện bot bằng `npm ci` tại `services/zalo-bot`, rồi chạy `start-bot.bat`. Script PowerShell cũng tự cài thư viện mới nếu thiếu Realtime SDK.
4. Kiểm tra `/api/status`: `workNotifications.status` là `SUBSCRIBED`, `fallbackIntervalSeconds` là 3600. Nếu quota đang bị chặn thì chỉ xác minh được bản cài và cooldown; kiểm chứng nhận việc thực tế cần chờ Supabase mở dịch vụ.

Kiểm tra hồi quy: `node --test tests/zalo-work-wakeup.node.cjs tests/local-zalo-storage.node.cjs services/zalo-bot/listener-relogin.test.cjs services/zalo-bot/session-recovery.test.cjs`.

## Xác minh ngày 09/11/2026

- Đã áp dụng SQL trên dự án `lgydjaaqfxqzgbdpqvkp`, kiểm tra có 19 trigger, và triển khai gateway qua Dashboard.
- Bot trên laptop đã khởi động: Zalo `connected`, khoảng kiểm tra dự phòng `3600`, khoảng gửi tối thiểu `10` giây. Gateway vẫn trả HTTP 402 do vượt quota; bot đang cooldown, giữ hàng đợi đồng bộ trên đĩa. Chưa thể xác minh luồng Realtime và gửi thực tế trên dịch vụ đang bị hạn chế.
- 22 kiểm tra liên quan đạt: Realtime, xác thực gateway, SQL trigger/quyền, hàng đợi theo giờ, hai lượt quét, khôi phục kết nối, lưu tin bền vững, báo học phí và khoảng cách gửi.
- Khi chạy rộng thêm `tuition-reminder-scheduler.test.js`, hai kiểm tra định dạng tin cũ thất bại: vẫn kỳ vọng `VNĐ` và dòng `Tháng MM/YYYY`, trong khi mẫu đã dùng `đ` và danh sách tháng theo yêu cầu trước đó. Scheduler, mẫu tin và file kiểm tra đó không thay đổi trong bản sửa này.
