// Supabase Edge Function: auto-session-evaluations
// Auto-evaluates normal/steady students between 23:00 - 23:59 daily
// MindUp - Tư Duy Toàn Diện

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_TEMPLATES = [
  "Kính gửi {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} học tập rất ngoan, chú ý nghe giảng và theo kịp bài giảng của thầy cô. Con hoàn thành tốt các bài tập trên lớp theo đúng tiến độ.",
  "Kính gửi {ten_phu_huynh}, thầy/cô gửi nhận xét buổi học môn {mon_hoc} ngày {ngay_hoc}: Em {ten_hoc_sinh} tiếp thu bài ổn định, tự giác làm bài tập và nắm chắc các kiến thức trọng tâm trong buổi học hôm nay.",
  "Kính gửi {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} ghi nhận em {ten_hoc_sinh} có thái độ học tập nghiêm túc, tập trung lắng nghe hướng dẫn và ghi chép bài đầy đủ.",
  "Kính gửi {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} theo sát bài học, hiểu bài tốt và thực hành các dạng bài tập cẩn thận.",
  "Kính gửi {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} duy trì phong độ học tập tốt, hoàn thành đầy đủ các bài tập được giao trên lớp và hiểu rõ kiến thức mới.",
  "Kính gửi {ten_phu_huynh}, thầy/cô gửi thông tin buổi học môn {mon_hoc} ngày {ngay_hoc}: Em {ten_hoc_sinh} học tập chăm chỉ, hợp tác tốt với thầy cô và các bạn trong lớp, nắm vững nội dung bài học.",
  "Kính gửi {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} chủ động làm bài, theo kịp tiến độ bài giảng của lớp và hoàn thành bài tập đạt yêu cầu.",
  "Kính gửi {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} của em {ten_hoc_sinh} diễn ra rất thuận lợi. Con nắm vững các lý thuyết và dạng bài cơ bản của buổi học.",
  "Kính gửi {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} tập trung cao độ, chịu khó tư duy và hoàn thành tốt phần luyện tập tại lớp.",
  "Kính gửi {ten_phu_huynh}, thầy/cô ghi nhận em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} có ý thức học tập tốt, tiếp thu bài đều đặn và thao tác làm bài ngày càng vững vàng.",
  "Kính gửi {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} lắng nghe giảng bài chu đáo, khi gặp dạng bài mới con chủ động theo dõi ví dụ mẫu và vận dụng làm bài rất ổn định.",
  "Kính gửi {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} ghi nhận em {ten_hoc_sinh} học tập nghiêm túc, làm bài tập thực hành đạt kết quả tốt và hiểu rõ phương pháp giải.",
  "Kính gửi {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} có thái độ tích cực, tập trung làm bài và nắm trọn vẹn các ý chính của bài học.",
  "Kính gửi {ten_phu_huynh}, thầy/cô đánh giá em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} giữ nhịp độ học tập ổn định, nghe giảng tốt và áp dụng kiến thức vào bài tập thành thạo.",
  "Kính gửi {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} ghi chép bài cẩn thận, làm đủ các bài tập tự luyện và tiếp thu nội dung bài mới rất tự nhiên.",
  "Kính gửi {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} của em {ten_hoc_sinh} diễn ra tích cực. Con tiếp thu kiến thức nhanh, hoàn thành bài tập nhẹ nhàng và chính xác.",
  "Kính gửi {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} chấp hành tốt nội quy lớp học, tập trung nghe thầy cô chữa bài và nắm chắc các bước giải.",
  "Kính gửi {ten_phu_huynh}, thầy/cô ghi nhận em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} học tập cẩn thận, luôn kiên nhẫn hoàn thành đầy đủ các câu hỏi trong phiếu bài tập.",
  "Kính gửi {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} tiếp thu bài đều đặn, tích cực lắng nghe bài giảng và thực hành đúng yêu cầu của giáo viên.",
  "Kính gửi {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} nắm chắc phương pháp bài học, trình bày cẩn thận và hoàn thành bài tập đúng thời gian.",
  "Kính gửi {ten_phu_huynh}, thầy/cô phản hồi buổi học môn {mon_hoc} ngày {ngay_hoc}: Em {ten_hoc_sinh} tự tin làm bài, đạt đầy đủ các mục tiêu kiến thức của buổi học hôm nay.",
  "Kính gửi {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} tập trung chú ý, duy trì thói quen làm bài cẩn thận và tiếp thu kiến thức khá tốt.",
  "Kính gửi {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} của em {ten_hoc_sinh} diễn ra ổn định. Con chăm chú nghe giảng và giải các bài tập luyện tập tại lớp suôn sẻ.",
  "Kính gửi {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} theo sát mạch bài giảng, nắm được các quy tắc/công thức chính và vận dụng vào bài tập chuẩn xác.",
  "Kính gửi {ten_phu_huynh}, thầy/cô gửi nhận xét em {ten_hoc_sinh} buổi học môn {mon_hoc} ngày {ngay_hoc}: Con đi học đúng giờ, tập trung trong suốt giờ học và hoàn thành tốt phần luyện tập tại lớp.",
  "Kính gửi {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} tiếp thu tốt nội dung cốt lõi của bài học, thái độ học tập ngoan và rất hợp tác.",
  "Kính gửi {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} ghi nhận em {ten_hoc_sinh} theo dõi kỹ phần giáo viên chữa bài, chữa lại các lỗi sai nhỏ và nắm chắc kiến thức.",
  "Kính gửi {ten_phu_huynh}, em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} tiếp tục duy trì phong độ học tập đều đặn, nghe giảng chú ý và làm bài tập đầy đủ.",
  "Kính gửi {ten_phu_huynh}, thầy/cô đánh giá em {ten_hoc_sinh} trong buổi học môn {mon_hoc} ngày {ngay_hoc} tiếp thu lý thuyết nhanh và vận dụng giải các câu hỏi trên lớp mượt mà.",
  "Kính gửi {ten_phu_huynh}, trong buổi học môn {mon_hoc} ngày {ngay_hoc}, em {ten_hoc_sinh} học tập tích cực, tập trung làm xong các phiếu bài tập và có tinh thần tự giác cao.",
  "Kính gửi {ten_phu_huynh}, buổi học môn {mon_hoc} ngày {ngay_hoc} của em {ten_hoc_sinh} diễn ra trọn vẹn và hiệu quả. Con nắm vững toàn bộ kiến thức trọng tâm của buổi học."
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return Deno.env.get(name) || "";
}

function restHeaders() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_ANON_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabaseUrl = env("SUPABASE_URL");
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...restHeaders(), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { message?: string })?.message || res.statusText);
  return data as T;
}

function todayVietnamDateStr(): string {
  const d = new Date();
  // GMT+7 adjustment
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const vnDate = new Date(utc + (3600000 * 7));
  const yyyy = vnDate.getFullYear();
  const mm = String(vnDate.getMonth() + 1).padStart(2, "0");
  const dd = String(vnDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateVi(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({})) || {};
    }

    const targetDate = String(body.target_date || body.date || todayVietnamDateStr()).slice(0, 10);

    // 1. Fetch all class_sessions for targetDate
    const sessions = await fetchJson<Array<{
      id: string;
      class_id: string;
      session_date: string;
      lesson_id?: string;
    }>>(`class_sessions?session_date=eq.${targetDate}&select=id,class_id,session_date,lesson_id`);

    if (!sessions || !sessions.length) {
      return jsonResponse({
        success: true,
        message: `Không có buổi học nào trong ngày ${targetDate}.`,
        targetDate,
        processedSessions: 0,
        evaluatedCount: 0,
      });
    }

    // 2. Fetch templates from DB or fallback
    const dbTemplates = await fetchJson<Array<{ content: string }>>(
      `evaluation_message_templates?section_type=eq.auto_normal&active=eq.true&select=content`,
    ).catch(() => []);

    const templatePool = (dbTemplates && dbTemplates.length)
      ? dbTemplates.map(t => t.content)
      : DEFAULT_TEMPLATES;

    let totalEvaluated = 0;
    let totalNotifications = 0;
    const sessionSummaries: Array<{ sessionId: string; classId: string; evaluated: number }> = [];

    for (const session of sessions) {
      const classId = session.class_id;
      const sessionId = session.id;

      // Fetch class info
      const classes = await fetchJson<Array<{ class_name: string; subjects?: { name: string } }>>(
        `classes?id=eq.${encodeURIComponent(classId)}&select=class_name,subjects(name)&limit=1`,
      ).catch(() => []);
      const className = classes[0]?.class_name || "Lớp học";
      const subjectName = classes[0]?.subjects?.name || "bài học";

      // Fetch active students in class
      const links = await fetchJson<Array<{ student_id: string; joined_at?: string; left_at?: string }>>(
        `class_students?class_id=eq.${encodeURIComponent(classId)}&select=student_id,joined_at,left_at`,
      ).catch(() => []);

      const activeStudentIds = (links || []).filter(link => {
        return (!link.joined_at || link.joined_at.slice(0, 10) <= targetDate)
          && (!link.left_at || link.left_at.slice(0, 10) >= targetDate);
      }).map(l => l.student_id).filter(Boolean);

      if (!activeStudentIds.length) continue;

      // Fetch existing sent evaluations for this session
      const existingSent = await fetchJson<Array<{ student_id: string; state: string }>>(
        `session_student_evaluations?class_session_id=eq.${encodeURIComponent(sessionId)}&state=eq.sent&select=student_id,state`,
      ).catch(() => []);

      const sentStudentIds = new Set((existingSent || []).map(e => e.student_id));
      const unsentStudentIds = activeStudentIds.filter(id => !sentStudentIds.has(id));

      if (!unsentStudentIds.length) {
        sessionSummaries.push({ sessionId, classId, evaluated: 0 });
        continue;
      }

      // Fetch student details
      const studentUsers = await fetchJson<Array<{ id: string; full_name: string }>>(
        `users?id=in.(${unsentStudentIds.join(",")})&select=id,full_name`,
      ).catch(() => []);
      const studentMap = new Map((studentUsers || []).map(u => [u.id, u.full_name || "học sinh"]));

      // Fetch parent links
      const parentLinks = await fetchJson<Array<{ parent_id: string; student_id: string }>>(
        `parent_students?student_id=in.(${unsentStudentIds.join(",")})&revoked_at=is.null&select=parent_id,student_id`,
      ).catch(() => []);

      const parentIdsByStudent = new Map<string, string[]>();
      const allParentIdsSet = new Set<string>();
      (parentLinks || []).forEach(pl => {
        if (!parentIdsByStudent.has(pl.student_id)) parentIdsByStudent.set(pl.student_id, []);
        parentIdsByStudent.get(pl.student_id)!.push(pl.parent_id);
        allParentIdsSet.add(pl.parent_id);
      });

      // Fetch parent user names
      const parentUsers = allParentIdsSet.size
        ? await fetchJson<Array<{ id: string; full_name: string }>>(
            `users?id=in.(${[...allParentIdsSet].join(",")})&select=id,full_name`,
          ).catch(() => [])
        : [];
      const parentNameMap = new Map((parentUsers || []).map(u => [u.id, u.full_name || "Quý phụ huynh"]));

      let sessionEvaluated = 0;

      for (const studentId of unsentStudentIds) {
        const studentName = studentMap.get(studentId) || "học sinh";
        const studentParentIds = parentIdsByStudent.get(studentId) || [];
        const firstParentId = studentParentIds[0];
        const parentName = firstParentId ? parentNameMap.get(firstParentId) || "Quý phụ huynh" : "Quý phụ huynh";

        // Pick template pseudo-randomly based on studentId + targetDate hash
        const templateIdx = stringHash(`${studentId}_${targetDate}`) % templatePool.length;
        const rawTemplate = templatePool[templateIdx];

        const formattedMsg = rawTemplate
          .replace(/\{ten_phu_huynh\}/g, parentName)
          .replace(/\{ten_hoc_sinh\}/g, studentName)
          .replace(/\{mon_hoc\}/g, subjectName)
          .replace(/\{ngay_hoc\}/g, formatDateVi(targetDate))
          .replace(/\{ten_lop\}/g, className)
          .replace(/\{ten_giao_vien\}/g, "Giáo viên MindUp");

        // Upsert into session_student_evaluations
        const evalPayload = {
          class_session_id: sessionId,
          class_id: classId,
          student_id: studentId,
          generated_message: formattedMsg,
          final_message: formattedMsg,
          template_selection: { auto_generated: true, template_index: templateIdx },
          state: "sent",
          sent_at: new Date().toISOString(),
        };

        const upsertRes = await fetchJson<Array<{ id: string }>>(
          `session_student_evaluations`,
          {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=representation" },
            body: JSON.stringify([evalPayload]),
          },
        ).catch(() => []);

        const evalId = upsertRes[0]?.id || null;
        sessionEvaluated += 1;
        totalEvaluated += 1;

        // Insert notifications for parent IDs
        if (studentParentIds.length) {
          const notifications = studentParentIds.map(parentId => ({
            user_id: parentId,
            type: "session_evaluation",
            title: "MindUp - Tư duy Toàn Diện",
            message: formattedMsg,
            target_url: `class.html?openClassId=${encodeURIComponent(classId)}&className=${encodeURIComponent(className)}`,
            meta: {
              student_id: studentId,
              class_id: classId,
              class_session_id: sessionId,
              evaluation_id: evalId,
              session_date: targetDate,
              auto_generated: true,
              sender_name: "MindUp - Tư duy Toàn Diện",
              sender_avatar: "pwa-icon-192.png",
              branded_sender: true,
            },
          }));

          await fetchJson(`notifications`, {
            method: "POST",
            body: JSON.stringify(notifications),
          }).then(() => {
            totalNotifications += notifications.length;
          }).catch(() => {});
        }
      }

      sessionSummaries.push({ sessionId, classId, evaluated: sessionEvaluated });
    }

    return jsonResponse({
      success: true,
      message: `Đã tự động gửi đánh giá cho ${totalEvaluated} học sinh bình thường trong ${sessions.length} buổi học ngày ${targetDate}.`,
      targetDate,
      totalSessions: sessions.length,
      evaluatedCount: totalEvaluated,
      notificationsSent: totalNotifications,
      sessionSummaries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto session evaluation failed";
    return jsonResponse({ error: message }, 500);
  }
});
