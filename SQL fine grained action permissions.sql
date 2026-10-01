-- MindUp fine-grained permissions by menu, feature, and action.
-- Run after "SQL detailed staff permissions.sql". Idempotent.

ALTER TABLE public.app_permissions
  ADD COLUMN IF NOT EXISTS subgroup_key text,
  ADD COLUMN IF NOT EXISTS subgroup_label text,
  ADD COLUMN IF NOT EXISTS action_key text;

CREATE TEMP TABLE mindup_permission_seed (
  permission_key text PRIMARY KEY,
  section text NOT NULL,
  label text NOT NULL,
  description text NOT NULL,
  sort_order integer NOT NULL,
  group_key text NOT NULL,
  group_label text NOT NULL,
  subgroup_key text NOT NULL,
  subgroup_label text NOT NULL,
  action_key text NOT NULL,
  access_level text NOT NULL,
  is_sensitive boolean NOT NULL DEFAULT false
) ON COMMIT DROP;

INSERT INTO mindup_permission_seed VALUES
-- Dashboard and home
('ops.overview.view','Bảng điều hành','Xem tổng quan vận hành','Xem các chỉ số vận hành chung.',11,'page.ops_center','Bảng điều hành','ops.overview','Tổng quan','view','view',false),
('ops.learning.view','Bảng điều hành','Xem số liệu học tập','Xem số liệu lớp, buổi học và học sinh.',12,'page.ops_center','Bảng điều hành','ops.learning','Học tập','view','view',false),
('ops.staff.view','Bảng điều hành','Xem hoạt động nhân viên','Xem tổng quan hoạt động của nhân viên.',13,'page.ops_center','Bảng điều hành','ops.staff','Nhân sự','view','full',true),
('home.info.view','Trang chủ','Xem thông tin','Xem nội dung thông tin trên trang chủ.',21,'page.home','Trang chủ','home.info','Thông tin','view','view',false),
('home.info.update','Trang chủ','Sửa thông tin','Cập nhật nội dung hiển thị trên trang chủ.',22,'page.home','Trang chủ','home.info','Thông tin','update','basic',false),
('home.discussion.view','Trang chủ','Xem thảo luận','Xem nội dung thảo luận.',23,'page.home','Trang chủ','home.discussion','Thảo luận','view','view',false),
('home.discussion.create','Trang chủ','Đăng thảo luận','Đăng nội dung thảo luận mới.',24,'page.home','Trang chủ','home.discussion','Thảo luận','create','basic',false),
('home.discussion.moderate','Trang chủ','Kiểm duyệt thảo luận','Sửa hoặc xóa nội dung của người khác.',25,'page.home','Trang chủ','home.discussion','Thảo luận','moderate','full',true),

-- Courses
('courses.assigned.view','Khóa học','Xem khóa được phân công','Xem các khóa học được phân công.',31,'page.courses','Khóa học','courses.data','Khóa học','view_assigned','view',false),
('courses.all.view','Khóa học','Xem toàn bộ khóa học','Xem tất cả khóa học trong trung tâm.',32,'page.courses','Khóa học','courses.data','Khóa học','view_all','full',true),
('courses.create','Khóa học','Thêm khóa học','Tạo khóa học mới.',33,'page.courses','Khóa học','courses.data','Khóa học','create','basic',false),
('courses.update','Khóa học','Sửa khóa học','Sửa thông tin và cấu hình khóa học.',34,'page.courses','Khóa học','courses.data','Khóa học','update','basic',false),
('courses.delete','Khóa học','Xóa khóa học','Xóa khóa học và dữ liệu liên quan.',35,'page.courses','Khóa học','courses.data','Khóa học','delete','full',true),
('courses.sessions.view','Khóa học','Xem buổi học','Xem nội dung và lịch buổi học.',36,'page.courses','Khóa học','courses.sessions','Buổi học và nội dung','view','view',false),
('courses.sessions.manage','Khóa học','Quản lý buổi học','Thêm, sửa và sắp xếp nội dung buổi học.',37,'page.courses','Khóa học','courses.sessions','Buổi học và nội dung','manage','basic',false),
('courses.enrollments.view','Khóa học','Xem học viên','Xem danh sách học viên của khóa.',38,'page.courses','Khóa học','courses.enrollments','Học viên','view','view',false),
('courses.enrollments.manage','Khóa học','Quản lý học viên','Thêm, duyệt hoặc loại học viên.',39,'page.courses','Khóa học','courses.enrollments','Học viên','manage','full',true),
('courses.results.view','Khóa học','Xem kết quả','Xem kết quả học tập trong khóa.',40,'page.courses','Khóa học','courses.results','Kết quả','view','full',true),

-- Classes
('classes.assigned.view','Lớp học','Xem lớp được phân công','Xem các lớp được phân công.',41,'page.classes','Lớp học','classes.data','Lớp học','view_assigned','view',false),
('classes.all.view','Lớp học','Xem toàn bộ lớp','Xem tất cả lớp trong trung tâm.',42,'page.classes','Lớp học','classes.data','Lớp học','view_all','full',true),
('classes.create','Lớp học','Thêm lớp','Tạo lớp học mới.',43,'page.classes','Lớp học','classes.data','Lớp học','create','basic',false),
('classes.update','Lớp học','Sửa lớp','Sửa thông tin và cấu hình lớp.',44,'page.classes','Lớp học','classes.data','Lớp học','update','basic',false),
('classes.delete','Lớp học','Xóa lớp','Xóa lớp và dữ liệu liên quan.',45,'page.classes','Lớp học','classes.data','Lớp học','delete','full',true),
('classes.staff.assign','Lớp học','Phân công nhân sự','Phân công giáo viên và trợ giảng.',46,'page.classes','Lớp học','classes.staff','Nhân sự lớp','assign','full',true),
('class.sessions.view','Lớp học','Xem buổi học','Xem các buổi học của lớp.',47,'page.classes','Lớp học','classes.sessions','Buổi học','view','view',false),
('class.sessions.create','Lớp học','Tạo buổi học','Tạo buổi học mới.',48,'page.classes','Lớp học','classes.sessions','Buổi học','create','basic',false),
('class.sessions.update','Lớp học','Sửa buổi học','Sửa thông tin buổi học.',49,'page.classes','Lớp học','classes.sessions','Buổi học','update','basic',false),
('class.sessions.delete','Lớp học','Hủy hoặc xóa buổi học','Hủy hoặc xóa buổi học.',50,'page.classes','Lớp học','classes.sessions','Buổi học','delete','full',true),
('class.attendance.view','Lớp học','Xem điểm danh','Xem dữ liệu điểm danh.',51,'page.classes','Lớp học','classes.attendance','Điểm danh','view','view',false),
('class.attendance.take','Lớp học','Thực hiện điểm danh','Điểm danh buổi học hiện tại.',52,'page.classes','Lớp học','classes.attendance','Điểm danh','create','basic',false),
('class.attendance.update','Lớp học','Sửa điểm danh','Sửa dữ liệu điểm danh đã lưu.',53,'page.classes','Lớp học','classes.attendance','Điểm danh','update','full',true),
('class.evaluations.view','Lớp học','Xem nhận xét','Xem nhận xét buổi học.',54,'page.classes','Lớp học','classes.evaluations','Nhận xét','view','view',false),
('class.evaluations.update','Lớp học','Nhập và sửa nhận xét','Tạo hoặc sửa nhận xét học tập.',55,'page.classes','Lớp học','classes.evaluations','Nhận xét','update','basic',false),
('class.evaluations.send','Lớp học','Gửi nhận xét','Gửi nhận xét cho phụ huynh.',56,'page.classes','Lớp học','classes.evaluations','Nhận xét','send','full',true),
('class.students.view','Lớp học','Xem học sinh trong lớp','Xem danh sách học sinh của lớp.',57,'page.classes','Lớp học','classes.students','Học sinh trong lớp','view','view',false),
('class.students.add','Lớp học','Thêm học sinh vào lớp','Thêm học sinh vào lớp.',58,'page.classes','Lớp học','classes.students','Học sinh trong lớp','create','basic',false),
('class.students.transfer','Lớp học','Chuyển lớp','Chuyển học sinh sang lớp khác.',59,'page.classes','Lớp học','classes.students','Học sinh trong lớp','transfer','full',true),
('class.students.remove','Lớp học','Xóa học sinh khỏi lớp','Xóa học sinh khỏi danh sách lớp.',60,'page.classes','Lớp học','classes.students','Học sinh trong lớp','delete','full',true),
('class.content.view','Lớp học','Xem tài liệu và bài tập','Xem nội dung học tập của lớp.',61,'page.classes','Lớp học','classes.content','Tài liệu và bài tập','view','view',false),
('class.content.manage','Lớp học','Quản lý tài liệu và bài tập','Thêm, sửa hoặc xóa nội dung học tập.',62,'page.classes','Lớp học','classes.content','Tài liệu và bài tập','manage','basic',false),

-- Tasks and schedules
('tasks.self.view','Công việc','Xem công việc của mình','Xem công việc được giao.',71,'page.tasks','Công việc','tasks.self','Công việc của tôi','view','view',false),
('tasks.self.update','Công việc','Cập nhật công việc của mình','Cập nhật tiến độ và kết quả.',72,'page.tasks','Công việc','tasks.self','Công việc của tôi','update','basic',false),
('tasks.staff_overview','Công việc','Xem công việc nhân viên','Xem tiến độ của toàn bộ nhân viên.',73,'page.tasks','Công việc','tasks.staff','Công việc nhân viên','view','full',true),
('tasks.create','Công việc','Tạo công việc','Tạo công việc mới.',74,'page.tasks','Công việc','tasks.staff','Công việc nhân viên','create','basic',false),
('tasks.assign','Công việc','Giao công việc','Giao công việc cho nhân viên.',75,'page.tasks','Công việc','tasks.staff','Công việc nhân viên','assign','full',true),
('tasks.update','Công việc','Sửa công việc','Sửa công việc đã tạo.',76,'page.tasks','Công việc','tasks.staff','Công việc nhân viên','update','basic',false),
('tasks.delete','Công việc','Hủy hoặc xóa công việc','Hủy hoặc xóa công việc.',77,'page.tasks','Công việc','tasks.staff','Công việc nhân viên','delete','full',true),
('tasks.templates.view','Công việc','Xem mẫu công việc','Xem danh sách mẫu công việc.',78,'page.tasks','Công việc','tasks.templates','Mẫu công việc','view','view',false),
('tasks.templates.manage','Công việc','Quản lý mẫu công việc','Thêm, sửa hoặc xóa mẫu công việc.',79,'page.tasks','Công việc','tasks.templates','Mẫu công việc','manage','full',true),
('teacher_schedule.assigned.view','Giáo viên và TKB','Xem lịch được phân công','Xem lịch giảng dạy liên quan.',81,'page.teacher_schedule','Giáo viên và TKB','teacher_schedule.data','Thời khóa biểu','view_assigned','view',false),
('teacher_schedule.all.view','Giáo viên và TKB','Xem toàn bộ lịch','Xem thời khóa biểu toàn trung tâm.',82,'page.teacher_schedule','Giáo viên và TKB','teacher_schedule.data','Thời khóa biểu','view_all','full',true),

-- Public exams and game
('public_exam.create','Đề thi','Thêm đề thi','Tạo đề thi công khai.',91,'page.public_exam','Đề thi','public_exam.data','Đề thi','create','basic',false),
('public_exam.update','Đề thi','Sửa đề thi','Sửa nội dung đề thi.',92,'page.public_exam','Đề thi','public_exam.data','Đề thi','update','basic',false),
('public_exam.delete','Đề thi','Xóa đề thi','Xóa đề thi công khai.',93,'page.public_exam','Đề thi','public_exam.data','Đề thi','delete','full',true),
('public_exam.publish','Đề thi','Công khai hoặc thu hồi','Thay đổi trạng thái phát hành đề.',94,'page.public_exam','Đề thi','public_exam.data','Đề thi','publish','full',true),
('public_exam.results.view','Đề thi','Xem kết quả','Xem kết quả thi của học sinh.',95,'page.public_exam','Đề thi','public_exam.results','Kết quả','view','full',true),
('public_exam.results.manage','Đề thi','Xử lý kết quả','Chỉnh sửa hoặc xử lý bài làm.',96,'page.public_exam','Đề thi','public_exam.results','Kết quả','manage','full',true),
('game.play','Game','Tham gia Game','Tham gia các trò chơi học tập.',101,'page.game','Game','game.play','Người chơi','use','view',false),
('game.rooms.create','Game','Tạo phòng','Tạo phòng chơi mới.',102,'page.game','Game','game.rooms','Phòng chơi','create','basic',false),
('game.rooms.manage','Game','Điều hành phòng','Bắt đầu, mời hoặc loại người chơi.',103,'page.game','Game','game.rooms','Phòng chơi','manage','basic',false),
('game.content.create','Game','Thêm nội dung','Tạo cấu hình hoặc nội dung game.',104,'page.game','Game','game.content','Nội dung Game','create','basic',false),
('game.content.update','Game','Sửa nội dung','Sửa cấu hình hoặc nội dung game.',105,'page.game','Game','game.content','Nội dung Game','update','basic',false),
('game.content.delete','Game','Xóa nội dung','Xóa cấu hình hoặc nội dung game.',106,'page.game','Game','game.content','Nội dung Game','delete','full',true),
('game.rounds.manage','Game','Quản lý vòng chơi','Tạo, sửa và áp dụng vòng chơi.',107,'page.game','Game','game.rounds','Vòng chơi','manage','full',true),
('game.history.view','Game','Xem lịch sử toàn hệ thống','Xem lịch sử chơi của mọi người.',108,'page.game','Game','game.history','Lịch sử','view','full',true),

-- Tuition
('tuition.view_assigned','Học phí','Xem học phí lớp phụ trách','Xem học phí lớp được phân công.',111,'page.tuition','Học phí','tuition.data','Dữ liệu học phí','view_assigned','view',true),
('tuition.view_all','Học phí','Xem toàn bộ học phí','Xem học phí toàn trung tâm.',112,'page.tuition','Học phí','tuition.data','Dữ liệu học phí','view_all','full',true),
('tuition.collect','Học phí','Thu tiền thủ công','Ghi nhận khoản tiền đã thu.',113,'page.tuition','Học phí','tuition.payments','Thu và hoàn tiền','create','basic',true),
('tuition.refund','Học phí','Hoàn tiền','Ghi nhận hoàn tiền.',114,'page.tuition','Học phí','tuition.payments','Thu và hoàn tiền','refund','full',true),
('tuition.notes.manage','Học phí','Sửa ghi chú','Thêm và sửa ghi chú học phí.',115,'page.tuition','Học phí','tuition.data','Dữ liệu học phí','update','basic',false),
('tuition.notify','Học phí','Gửi thông báo học phí','Gửi thông báo học phí trên web/app.',116,'page.tuition','Học phí','tuition.notifications','Thông báo','send','basic',true),
('tuition.zalo_queue.manage','Học phí','Quản lý gửi Zalo','Xếp hàng, hủy và gửi lại qua Zalo.',117,'page.tuition','Học phí','tuition.notifications','Thông báo','manage','full',true),
('tuition.transactions.view','Học phí','Xem giao dịch chưa khớp','Xem giao dịch ngân hàng chưa khớp.',118,'page.tuition','Học phí','tuition.transactions','Giao dịch ngân hàng','view','full',true),
('tuition.transactions.manage','Học phí','Xử lý giao dịch chưa khớp','Đánh dấu hoặc xóa giao dịch.',119,'page.tuition','Học phí','tuition.transactions','Giao dịch ngân hàng','manage','full',true),
('tuition.surplus.manage','Học phí','Chuyển tiền nộp dư','Chuyển tiền dư sang kỳ tiếp theo.',120,'page.tuition','Học phí','tuition.payments','Thu và hoàn tiền','transfer','full',true),
('tuition.invoice','Học phí','In hóa đơn','Tạo và in hóa đơn.',121,'page.tuition','Học phí','tuition.documents','Hóa đơn và báo cáo','print','basic',false),
('tuition.lock','Học phí','Chốt hoặc mở học phí','Khóa, mở hoặc tính lại học phí.',122,'page.tuition','Học phí','tuition.period','Kỳ học phí','lock','full',true),

-- Income
('income.self.view','Thu nhập và thu chi','Xem thu nhập của mình','Xem lương và thu nhập cá nhân.',131,'page.income','Thu nhập và thu chi','income.self','Thu nhập cá nhân','view','view',true),
('income.all.view','Thu nhập và thu chi','Xem toàn bộ thu chi','Xem dữ liệu toàn trung tâm.',132,'page.income','Thu nhập và thu chi','income.ledger','Sổ thu chi','view','full',true),
('income.ledger.create','Thu nhập và thu chi','Thêm khoản thủ công','Bổ sung khoản thu hoặc chi thủ công.',133,'page.income','Thu nhập và thu chi','income.ledger','Sổ thu chi','create','full',true),
('income.ledger.update','Thu nhập và thu chi','Sửa mô tả giao dịch','Cập nhật mô tả giao dịch.',134,'page.income','Thu nhập và thu chi','income.ledger','Sổ thu chi','update','full',true),
('income.ledger.delete','Thu nhập và thu chi','Xóa khoản thủ công','Xóa khoản thu chi thủ công.',135,'page.income','Thu nhập và thu chi','income.ledger','Sổ thu chi','delete','full',true),
('income.reconcile','Thu nhập và thu chi','Đối soát số dư','Tạo mốc và đối chiếu số dư.',136,'page.income','Thu nhập và thu chi','income.ledger','Sổ thu chi','reconcile','full',true),
('income.payroll.view','Thu nhập và thu chi','Xem bảng lương','Xem bảng lương nhân viên.',137,'page.income','Thu nhập và thu chi','income.payroll','Bảng lương','view','full',true),
('income.payroll.configure','Thu nhập và thu chi','Cấu hình lương','Thay đổi cấu hình tính lương.',138,'page.income','Thu nhập và thu chi','income.payroll','Bảng lương','configure','full',true),
('income.payroll.calculate','Thu nhập và thu chi','Tính và chốt lương','Tính, điều chỉnh và chốt lương.',139,'page.income','Thu nhập và thu chi','income.payroll','Bảng lương','manage','full',true),
('income.bonus.manage','Thu nhập và thu chi','Quản lý thưởng phạt','Thêm, sửa hoặc xóa thưởng phạt.',140,'page.income','Thu nhập và thu chi','income.payroll','Bảng lương','bonus','full',true),

-- Resources, questions, exams, trials
('resources.view','Tài liệu tham khảo','Xem tài liệu','Xem tài liệu tham khảo.',151,'page.resources','Tài liệu tham khảo','resources.data','Tài liệu','view','view',false),
('resources.create','Tài liệu tham khảo','Thêm tài liệu','Tạo tài liệu mới.',152,'page.resources','Tài liệu tham khảo','resources.data','Tài liệu','create','basic',false),
('resources.update','Tài liệu tham khảo','Sửa tài liệu','Sửa tài liệu hiện có.',153,'page.resources','Tài liệu tham khảo','resources.data','Tài liệu','update','basic',false),
('resources.delete','Tài liệu tham khảo','Xóa tài liệu','Xóa tài liệu khỏi hệ thống.',154,'page.resources','Tài liệu tham khảo','resources.data','Tài liệu','delete','full',true),
('question.own.view','Ngân hàng câu hỏi','Xem câu hỏi của mình','Xem câu hỏi do mình quản lý.',161,'page.question_bank','Ngân hàng câu hỏi','question.data','Câu hỏi','view_own','view',false),
('question.all.view','Ngân hàng câu hỏi','Xem toàn bộ câu hỏi','Xem câu hỏi của mọi người.',162,'page.question_bank','Ngân hàng câu hỏi','question.data','Câu hỏi','view_all','full',true),
('question.create','Ngân hàng câu hỏi','Thêm câu hỏi','Tạo câu hỏi mới.',163,'page.question_bank','Ngân hàng câu hỏi','question.data','Câu hỏi','create','basic',false),
('question.update','Ngân hàng câu hỏi','Sửa câu hỏi','Sửa câu hỏi được phép.',164,'page.question_bank','Ngân hàng câu hỏi','question.data','Câu hỏi','update','basic',false),
('question.archive','Ngân hàng câu hỏi','Lưu trữ và khôi phục','Lưu trữ hoặc khôi phục câu hỏi.',165,'page.question_bank','Ngân hàng câu hỏi','question.data','Câu hỏi','archive','basic',false),
('question.delete_permanent','Ngân hàng câu hỏi','Xóa vĩnh viễn','Xóa vĩnh viễn câu hỏi.',166,'page.question_bank','Ngân hàng câu hỏi','question.data','Câu hỏi','delete','full',true),
('question.import','Ngân hàng câu hỏi','Nhập câu hỏi','Nhập câu hỏi từ tệp.',167,'page.question_bank','Ngân hàng câu hỏi','question.tools','Công cụ','import','basic',false),
('question.ai.generate','Ngân hàng câu hỏi','Tạo câu hỏi bằng AI','Sử dụng AI để tạo câu hỏi.',168,'page.question_bank','Ngân hàng câu hỏi','question.tools','Công cụ','generate','basic',true),
('exam.own.view','Đề kiểm tra','Xem đề của mình','Xem đề do mình quản lý.',171,'page.exam_editor','Đề kiểm tra','exam.data','Đề kiểm tra','view_own','view',false),
('exam.all.view','Đề kiểm tra','Xem toàn bộ đề','Xem đề của mọi người.',172,'page.exam_editor','Đề kiểm tra','exam.data','Đề kiểm tra','view_all','full',true),
('exam.create','Đề kiểm tra','Thêm đề','Tạo đề kiểm tra mới.',173,'page.exam_editor','Đề kiểm tra','exam.data','Đề kiểm tra','create','basic',false),
('exam.update','Đề kiểm tra','Sửa đề','Sửa đề kiểm tra.',174,'page.exam_editor','Đề kiểm tra','exam.data','Đề kiểm tra','update','basic',false),
('exam.clone','Đề kiểm tra','Nhân bản đề','Tạo bản sao từ đề có sẵn.',175,'page.exam_editor','Đề kiểm tra','exam.data','Đề kiểm tra','clone','basic',false),
('exam.delete','Đề kiểm tra','Xóa đề','Xóa đề kiểm tra.',176,'page.exam_editor','Đề kiểm tra','exam.data','Đề kiểm tra','delete','full',true),
('exam.pdf.manage','Đề kiểm tra','Quản lý đề PDF','Tải lên, sửa hoặc xóa đề PDF.',177,'page.exam_editor','Đề kiểm tra','exam.pdf','Đề PDF','manage','basic',false),
('exam.questions.manage','Đề kiểm tra','Quản lý câu hỏi trong đề','Thêm, xóa hoặc sắp xếp câu hỏi.',178,'page.exam_editor','Đề kiểm tra','exam.questions','Câu hỏi trong đề','manage','basic',false),
('exam.results.view','Đề kiểm tra','Xem kết quả','Xem kết quả làm bài.',179,'page.exam_editor','Đề kiểm tra','exam.results','Kết quả','view','full',true),
('trial.view','Đăng ký học thử','Xem đăng ký','Xem danh sách đăng ký học thử.',181,'page.trial_requests','Đăng ký học thử','trial.data','Đăng ký học thử','view','view',true),
('trial.create','Đăng ký học thử','Thêm đăng ký','Tạo đăng ký học thử.',182,'page.trial_requests','Đăng ký học thử','trial.data','Đăng ký học thử','create','basic',true),
('trial.update','Đăng ký học thử','Sửa đăng ký','Cập nhật đăng ký và lịch học thử.',183,'page.trial_requests','Đăng ký học thử','trial.data','Đăng ký học thử','update','basic',true),
('trial.delete','Đăng ký học thử','Xóa đăng ký','Xóa đăng ký học thử.',184,'page.trial_requests','Đăng ký học thử','trial.data','Đăng ký học thử','delete','full',true),
('trial.account.manage','Đăng ký học thử','Tạo hoặc liên kết tài khoản','Tạo và liên kết tài khoản học sinh.',185,'page.trial_requests','Đăng ký học thử','trial.account','Tài khoản học sinh','manage','full',true),
('trial.class.assign','Đăng ký học thử','Xếp vào lớp','Thêm học sinh học thử vào lớp.',186,'page.trial_requests','Đăng ký học thử','trial.class','Xếp lớp','assign','full',true),
('push_debug.send','Kiểm tra thông báo','Gửi thông báo thử','Gửi thông báo kiểm tra tới thiết bị.',191,'page.push_debug','Kiểm tra thông báo','push_debug.tools','Công cụ kiểm tra','send','full',true),

-- System subtabs
('system.rooms.view','Hệ thống','Xem phòng học','Xem danh sách phòng học.',201,'page.system','Hệ thống','system.rooms','Phòng học','view','view',false),
('system.rooms.create','Hệ thống','Thêm phòng học','Tạo phòng học mới.',202,'page.system','Hệ thống','system.rooms','Phòng học','create','basic',false),
('system.rooms.update','Hệ thống','Sửa phòng học','Sửa thông tin phòng học.',203,'page.system','Hệ thống','system.rooms','Phòng học','update','basic',false),
('system.rooms.delete','Hệ thống','Xóa phòng học','Xóa phòng học.',204,'page.system','Hệ thống','system.rooms','Phòng học','delete','full',true),
('system.grades.view','Hệ thống','Xem khối','Xem danh sách khối.',211,'page.system','Hệ thống','system.grades','Khối','view','view',false),
('system.grades.create','Hệ thống','Thêm khối','Tạo khối mới.',212,'page.system','Hệ thống','system.grades','Khối','create','basic',false),
('system.grades.update','Hệ thống','Sửa khối','Sửa tên khối.',213,'page.system','Hệ thống','system.grades','Khối','update','basic',false),
('system.grades.delete','Hệ thống','Xóa khối','Xóa khối.',214,'page.system','Hệ thống','system.grades','Khối','delete','full',true),
('system.subjects.view','Hệ thống','Xem môn học','Xem danh sách môn học.',221,'page.system','Hệ thống','system.subjects','Môn học','view','view',false),
('system.subjects.create','Hệ thống','Thêm môn học','Tạo môn học mới.',222,'page.system','Hệ thống','system.subjects','Môn học','create','basic',false),
('system.subjects.update','Hệ thống','Sửa môn học','Sửa thông tin môn học.',223,'page.system','Hệ thống','system.subjects','Môn học','update','basic',false),
('system.subjects.delete','Hệ thống','Xóa môn học','Xóa môn học.',224,'page.system','Hệ thống','system.subjects','Môn học','delete','full',true),
('system.topics.view','Hệ thống','Xem chủ đề','Xem danh sách chủ đề.',231,'page.system','Hệ thống','system.topics','Chủ đề','view','view',false),
('system.topics.create','Hệ thống','Thêm chủ đề','Tạo chủ đề mới.',232,'page.system','Hệ thống','system.topics','Chủ đề','create','basic',false),
('system.topics.update','Hệ thống','Sửa chủ đề','Sửa thông tin chủ đề.',233,'page.system','Hệ thống','system.topics','Chủ đề','update','basic',false),
('system.topics.delete','Hệ thống','Xóa chủ đề','Xóa chủ đề.',234,'page.system','Hệ thống','system.topics','Chủ đề','delete','full',true),
('system.staff.view','Hệ thống','Xem giáo viên','Xem danh sách giáo viên và nhân viên.',241,'page.system','Hệ thống','system.staff','Giáo viên','view','view',true),
('system.staff.create','Hệ thống','Thêm giáo viên','Tạo tài khoản giáo viên.',242,'page.system','Hệ thống','system.staff','Giáo viên','create','full',true),
('system.staff.update','Hệ thống','Sửa giáo viên','Cập nhật hồ sơ và chức vụ.',243,'page.system','Hệ thống','system.staff','Giáo viên','update','full',true),
('system.staff.reset_password','Hệ thống','Đặt lại mật khẩu giáo viên','Đặt lại thông tin đăng nhập.',244,'page.system','Hệ thống','system.staff','Giáo viên','reset_password','full',true),
('system.students.view','Hệ thống','Xem học sinh','Xem học sinh và phụ huynh.',251,'page.system','Hệ thống','system.students','Học sinh','view','view',true),
('system.students.create','Hệ thống','Thêm học sinh','Tạo tài khoản học sinh.',252,'page.system','Hệ thống','system.students','Học sinh','create','basic',true),
('system.students.update','Hệ thống','Sửa học sinh','Cập nhật học sinh và phụ huynh.',253,'page.system','Hệ thống','system.students','Học sinh','update','basic',true),
('system.students.delete','Hệ thống','Xóa học sinh','Xóa tài khoản học sinh.',254,'page.system','Hệ thống','system.students','Học sinh','delete','full',true),
('system.students.import','Hệ thống','Nhập Excel','Nhập học sinh hàng loạt.',255,'page.system','Hệ thống','system.students','Học sinh','import','basic',true),
('system.students.export','Hệ thống','Xuất Excel','Xuất danh sách học sinh.',256,'page.system','Hệ thống','system.students','Học sinh','export','full',true),
('system.students.reset_password','Hệ thống','Đặt lại mật khẩu học sinh','Đặt lại thông tin đăng nhập của học sinh.',257,'page.system','Hệ thống','system.students','Học sinh','reset_password','full',true),
('system.parent_links.manage','Hệ thống','Liên kết phụ huynh','Tạo hoặc hủy liên kết phụ huynh-học sinh.',258,'page.system','Hệ thống','system.students','Học sinh','link','full',true),
('system.zalo.manage','Hệ thống','Kết nối Zalo phụ huynh','Chạy kết nối và đồng bộ Zalo.',259,'page.system','Hệ thống','system.students','Học sinh','zalo','full',true),
('system.evaluation_templates.view','Hệ thống','Xem mẫu nhận xét','Xem danh sách mẫu nhận xét.',261,'page.system','Hệ thống','system.evaluation_templates','Mẫu nhận xét','view','view',false),
('system.evaluation_templates.create','Hệ thống','Thêm mẫu nhận xét','Tạo mẫu nhận xét.',262,'page.system','Hệ thống','system.evaluation_templates','Mẫu nhận xét','create','basic',false),
('system.evaluation_templates.update','Hệ thống','Sửa mẫu nhận xét','Sửa mẫu nhận xét.',263,'page.system','Hệ thống','system.evaluation_templates','Mẫu nhận xét','update','basic',false),
('system.evaluation_templates.delete','Hệ thống','Xóa mẫu nhận xét','Xóa mẫu nhận xét.',264,'page.system','Hệ thống','system.evaluation_templates','Mẫu nhận xét','delete','full',true),
('system.message_templates.view','Hệ thống','Xem tin nhắn tự động','Xem mẫu tin nhắn tự động.',271,'page.system','Hệ thống','system.message_templates','Tin nhắn tự động','view','view',true),
('system.message_templates.update','Hệ thống','Sửa tin nhắn tự động','Cập nhật nội dung và trạng thái mẫu.',272,'page.system','Hệ thống','system.message_templates','Tin nhắn tự động','update','full',true),
('system.logs.view','Hệ thống','Xem nhật ký vận hành','Xem nhật ký hệ thống.',281,'page.system','Hệ thống','system.logs','Nhật ký vận hành','view','view',true),
('system.logs.delete','Hệ thống','Xóa nhật ký','Xóa các dòng nhật ký đã chọn.',282,'page.system','Hệ thống','system.logs','Nhật ký vận hành','delete','full',true),
('system.permissions.view','Hệ thống','Xem phân quyền','Xem quyền của nhân viên.',291,'page.system','Hệ thống','system.permissions','Phân quyền','view','full',true),
('system.appearance.view','Hệ thống','Xem cấu hình giao diện','Xem giao diện đang áp dụng.',301,'page.system','Hệ thống','system.appearance','Giao diện','view','view',false),
('system.appearance.update','Hệ thống','Sửa giao diện','Áp dụng giao diện toàn hệ thống.',302,'page.system','Hệ thống','system.appearance','Giao diện','update','full',true),

-- Facebook
('facebook.assigned.view','Đăng bài Facebook','Xem fanpage được phân công','Xem lịch của fanpage được phân công.',311,'page.facebook','Đăng bài Facebook','facebook.pages','Fanpage','view_assigned','view',false),
('facebook.all.view','Đăng bài Facebook','Xem toàn bộ fanpage','Xem mọi fanpage của trung tâm.',312,'page.facebook','Đăng bài Facebook','facebook.pages','Fanpage','view_all','full',true),
('facebook.drafts.create','Đăng bài Facebook','Thêm bài nháp','Tạo bài đăng mới.',313,'page.facebook','Đăng bài Facebook','facebook.drafts','Bài đăng','create','basic',false),
('facebook.drafts.update','Đăng bài Facebook','Sửa bài nháp','Sửa nội dung bài đăng.',314,'page.facebook','Đăng bài Facebook','facebook.drafts','Bài đăng','update','basic',false),
('facebook.drafts.delete','Đăng bài Facebook','Xóa bài nháp','Xóa nội dung bài đăng.',315,'page.facebook','Đăng bài Facebook','facebook.drafts','Bài đăng','delete','full',true),
('facebook.ai.text','Đăng bài Facebook','Tạo nội dung AI','Tạo caption bằng AI.',316,'page.facebook','Đăng bài Facebook','facebook.ai','Công cụ AI','generate_text','basic',true),
('facebook.ai.image','Đăng bài Facebook','Tạo ảnh Quiz','Tạo hoặc sửa ảnh Quiz.',317,'page.facebook','Đăng bài Facebook','facebook.ai','Công cụ AI','generate_image','basic',true),
('facebook.ai.video','Đăng bài Facebook','Tạo video','Tạo Reel hoặc video dài.',318,'page.facebook','Đăng bài Facebook','facebook.ai','Công cụ AI','generate_video','full',true),
('facebook.schedule','Đăng bài Facebook','Hẹn lịch','Hẹn hoặc cập nhật lịch Facebook.',319,'page.facebook','Đăng bài Facebook','facebook.publishing','Đăng và hẹn lịch','schedule','full',true),
('facebook.publish','Đăng bài Facebook','Đăng ngay','Đăng bài ngay lên Facebook.',320,'page.facebook','Đăng bài Facebook','facebook.publishing','Đăng và hẹn lịch','publish','full',true),
('facebook.schedule.cancel','Đăng bài Facebook','Hủy lịch','Hủy bài đã hẹn lịch.',321,'page.facebook','Đăng bài Facebook','facebook.publishing','Đăng và hẹn lịch','cancel','full',true),
('facebook.post_types.manage','Đăng bài Facebook','Quản lý loại bài','Thêm, sửa hoặc xóa loại bài đăng.',322,'page.facebook','Đăng bài Facebook','facebook.config','Cấu hình nội dung','post_types','full',true),
('facebook.templates.manage','Đăng bài Facebook','Quản lý lịch mẫu','Thêm, sửa hoặc xóa lịch mẫu.',323,'page.facebook','Đăng bài Facebook','facebook.config','Cấu hình nội dung','templates','full',true),
('facebook.pages.manage','Đăng bài Facebook','Quản lý fanpage','Cập nhật fanpage và token.',324,'page.facebook','Đăng bài Facebook','facebook.config','Cấu hình nội dung','pages','full',true),
('facebook.assignments.manage','Đăng bài Facebook','Phân công fanpage','Phân công nhân viên phụ trách fanpage.',325,'page.facebook','Đăng bài Facebook','facebook.config','Cấu hình nội dung','assign','full',true),
('facebook.cleanup','Đăng bài Facebook','Dọn dữ liệu đã đăng','Xóa nội dung và ảnh sau khi đăng.',326,'page.facebook','Đăng bài Facebook','facebook.config','Cấu hình nội dung','cleanup','full',true);

INSERT INTO public.app_permissions
  (permission_key, section, label, description, sort_order, group_key, group_label,
   subgroup_key, subgroup_label, action_key, access_level, is_sensitive, is_assignable)
SELECT permission_key, section, label, description, sort_order, group_key, group_label,
       subgroup_key, subgroup_label, action_key, access_level, is_sensitive, true
FROM mindup_permission_seed
ON CONFLICT (permission_key) DO UPDATE SET
  section=EXCLUDED.section, label=EXCLUDED.label, description=EXCLUDED.description,
  sort_order=EXCLUDED.sort_order, group_key=EXCLUDED.group_key, group_label=EXCLUDED.group_label,
  subgroup_key=EXCLUDED.subgroup_key, subgroup_label=EXCLUDED.subgroup_label,
  action_key=EXCLUDED.action_key, access_level=EXCLUDED.access_level,
  is_sensitive=EXCLUDED.is_sensitive, is_assignable=true;

-- Broad keys remain operational during rollout, but are hidden from the editor.
UPDATE public.app_permissions SET is_assignable=false
WHERE permission_key IN (
  'ops.financial.view','courses.manage','class.attendance','class.sessions.manage',
  'class.evaluations.manage','class.students.manage','classes.manage','tasks.manage',
  'public_exam.manage','game.manage','game.competition.manage','income.manage',
  'income.payroll.manage','resources.manage','question.manage','exam.manage','trial.manage',
  'system.catalogs.manage','system.students.manage','system.staff.manage','system.templates.manage',
  'system.appearance.manage','facebook.generate','facebook.manage','facebook.config.manage'
);

-- Reading or changing other employees' permissions remains an admin root ability.
UPDATE public.app_permissions SET is_assignable=false
WHERE permission_key IN ('system.permissions.view','system.permissions.manage');

-- Map old broad grants and overrides to their new children without changing effective access.
CREATE TEMP TABLE mindup_permission_map(old_key text, new_key text) ON COMMIT DROP;
INSERT INTO mindup_permission_map VALUES
('ops.financial.view','ops.overview.view'),('ops.financial.view','ops.learning.view'),('ops.financial.view','ops.staff.view'),
('courses.manage','courses.create'),('courses.manage','courses.update'),('courses.manage','courses.sessions.manage'),
('classes.manage','classes.create'),('classes.manage','classes.update'),('classes.manage','classes.staff.assign'),
('class.sessions.manage','class.sessions.view'),('class.sessions.manage','class.sessions.create'),('class.sessions.manage','class.sessions.update'),('class.sessions.manage','class.sessions.delete'),
('class.attendance','class.attendance.view'),('class.attendance','class.attendance.take'),('class.attendance','class.attendance.update'),
('class.evaluations.manage','class.evaluations.view'),('class.evaluations.manage','class.evaluations.update'),('class.evaluations.manage','class.evaluations.send'),
('class.students.manage','class.students.view'),('class.students.manage','class.students.add'),('class.students.manage','class.students.transfer'),('class.students.manage','class.students.remove'),
('tasks.manage','tasks.create'),('tasks.manage','tasks.assign'),('tasks.manage','tasks.update'),('tasks.manage','tasks.delete'),
('public_exam.manage','public_exam.create'),('public_exam.manage','public_exam.update'),('public_exam.manage','public_exam.delete'),('public_exam.manage','public_exam.publish'),
('game.manage','game.rooms.create'),('game.manage','game.rooms.manage'),('game.manage','game.content.create'),('game.manage','game.content.update'),
('game.competition.manage','game.rounds.manage'),('game.competition.manage','game.history.view'),('game.competition.manage','game.content.delete'),
('income.manage','income.ledger.create'),('income.manage','income.ledger.update'),('income.manage','income.ledger.delete'),('income.manage','income.reconcile'),
('income.payroll.manage','income.payroll.view'),('income.payroll.manage','income.payroll.configure'),('income.payroll.manage','income.payroll.calculate'),('income.payroll.manage','income.bonus.manage'),
('resources.manage','resources.create'),('resources.manage','resources.update'),('resources.manage','resources.delete'),
('question.manage','question.create'),('question.manage','question.update'),('question.manage','question.archive'),
('exam.manage','exam.create'),('exam.manage','exam.update'),('exam.manage','exam.clone'),('exam.manage','exam.delete'),('exam.manage','exam.questions.manage'),
('trial.manage','trial.create'),('trial.manage','trial.update'),('trial.manage','trial.delete'),('trial.manage','trial.account.manage'),('trial.manage','trial.class.assign'),
('system.catalogs.manage','system.rooms.view'),('system.catalogs.manage','system.rooms.create'),('system.catalogs.manage','system.rooms.update'),('system.catalogs.manage','system.rooms.delete'),
('system.catalogs.manage','system.grades.view'),('system.catalogs.manage','system.grades.create'),('system.catalogs.manage','system.grades.update'),('system.catalogs.manage','system.grades.delete'),
('system.catalogs.manage','system.subjects.view'),('system.catalogs.manage','system.subjects.create'),('system.catalogs.manage','system.subjects.update'),('system.catalogs.manage','system.subjects.delete'),
('system.catalogs.manage','system.topics.view'),('system.catalogs.manage','system.topics.create'),('system.catalogs.manage','system.topics.update'),('system.catalogs.manage','system.topics.delete'),
('system.students.manage','system.students.view'),('system.students.manage','system.students.create'),('system.students.manage','system.students.update'),('system.students.manage','system.students.delete'),('system.students.manage','system.students.import'),('system.students.manage','system.students.export'),('system.students.manage','system.students.reset_password'),('system.students.manage','system.parent_links.manage'),
('system.staff.manage','system.staff.view'),('system.staff.manage','system.staff.create'),('system.staff.manage','system.staff.update'),('system.staff.manage','system.staff.reset_password'),
('system.templates.manage','system.evaluation_templates.view'),('system.templates.manage','system.evaluation_templates.create'),('system.templates.manage','system.evaluation_templates.update'),('system.templates.manage','system.evaluation_templates.delete'),('system.templates.manage','system.message_templates.view'),('system.templates.manage','system.message_templates.update'),
('system.appearance.manage','system.appearance.view'),('system.appearance.manage','system.appearance.update'),
('facebook.generate','facebook.ai.text'),('facebook.generate','facebook.ai.image'),('facebook.generate','facebook.ai.video'),
('facebook.manage','facebook.drafts.create'),('facebook.manage','facebook.drafts.update'),('facebook.manage','facebook.drafts.delete'),
('facebook.config.manage','facebook.post_types.manage'),('facebook.config.manage','facebook.templates.manage'),('facebook.config.manage','facebook.pages.manage'),('facebook.config.manage','facebook.assignments.manage'),('facebook.config.manage','facebook.cleanup');

INSERT INTO public.role_permission_defaults(role_name, permission_key, allowed)
SELECT d.role_name, m.new_key, d.allowed
FROM public.role_permission_defaults d JOIN mindup_permission_map m ON m.old_key=d.permission_key
ON CONFLICT (role_name,permission_key) DO NOTHING;

INSERT INTO public.user_permission_overrides(user_id, permission_key, allowed, updated_by, updated_at)
SELECT o.user_id, m.new_key, o.allowed, o.updated_by, o.updated_at
FROM public.user_permission_overrides o JOIN mindup_permission_map m ON m.old_key=o.permission_key
ON CONFLICT (user_id,permission_key) DO NOTHING;

-- Page access implies the safe view permission of that page for existing roles.
INSERT INTO public.role_permission_defaults(role_name, permission_key, allowed)
SELECT d.role_name, s.permission_key, true
FROM public.role_permission_defaults d
JOIN mindup_permission_seed s ON s.group_key=d.permission_key AND s.action_key IN ('view','view_assigned','view_own','use')
WHERE d.permission_key LIKE 'page.%' AND d.allowed=true
ON CONFLICT (role_name,permission_key) DO NOTHING;

-- Admin remains full through mindup_is_admin; these rows make the editor summary complete.
INSERT INTO public.role_permission_defaults(role_name, permission_key, allowed)
SELECT 'admin', permission_key, true FROM mindup_permission_seed
ON CONFLICT (role_name,permission_key) DO UPDATE SET allowed=true;

-- Granular RLS for tables whose CRUD mapping is unambiguous.
DO $$
BEGIN
  IF to_regclass('public.reference_materials') IS NOT NULL THEN
    DROP POLICY IF EXISTS app_permission_reference_materials_insert ON public.reference_materials;
    DROP POLICY IF EXISTS app_permission_reference_materials_update ON public.reference_materials;
    DROP POLICY IF EXISTS app_permission_reference_materials_delete ON public.reference_materials;
    CREATE POLICY app_permission_reference_materials_insert ON public.reference_materials AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_app_permission('resources.create'));
    CREATE POLICY app_permission_reference_materials_update ON public.reference_materials AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_app_permission('resources.update')) WITH CHECK (public.has_app_permission('resources.update'));
    CREATE POLICY app_permission_reference_materials_delete ON public.reference_materials AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_app_permission('resources.delete'));
  END IF;
  IF to_regclass('public.trial_lesson_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS app_permission_trial_requests_insert ON public.trial_lesson_requests;
    DROP POLICY IF EXISTS app_permission_trial_requests_update ON public.trial_lesson_requests;
    DROP POLICY IF EXISTS app_permission_trial_requests_delete ON public.trial_lesson_requests;
    CREATE POLICY app_permission_trial_requests_insert ON public.trial_lesson_requests AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_app_permission('trial.create'));
    CREATE POLICY app_permission_trial_requests_update ON public.trial_lesson_requests AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_app_permission('trial.update')) WITH CHECK (public.has_app_permission('trial.update'));
    CREATE POLICY app_permission_trial_requests_delete ON public.trial_lesson_requests AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_app_permission('trial.delete'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
