import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Preference = {
  user_id: string;
  timezone: string;
};

type UserProfile = {
  id: string;
  role: string | null;
  full_name: string | null;
  email: string | null;
  created_at?: string | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  due_at: string | null;
  action_url: string | null;
  available_on: string;
  source_id: string | null;
  source_type: string | null;
  metadata: Record<string, unknown> | null;
};

type Assignment = {
  id: string;
  user_id: string;
  status: string;
  task: Task;
  assignee: UserProfile | null;
};

type PushSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type CustomNotification = {
  email?: string;
  userId?: string;
  title?: string;
  message?: string;
  targetUrl?: string;
  type?: string;
};

type Candidate = {
  kind: string;
  type: string;
  message: string;
  task?: Task;
  targetUrl?: string;
};

type ScheduledCandidate = Candidate & { userId: string };
type ClassRow = { id: string; class_name: string; hidden: boolean | null };
type ScheduleRow = { id: number; class_id: string; session_no: number | null; weekday: number; start_time: string; end_time: string; effective_from: string | null };
type ClassStudentRow = { class_id: string; student_id: string; joined_at: string | null; left_at: string | null };
type StudentScheduleRow = { class_id: string; student_id: string; schedule_id: number };
type ParentLinkRow = { parent_id: string; student_id: string };
type TeacherLinkRow = { class_id: string; teacher_id: string };
type TrialRow = {
  id: string;
  student_name: string;
  trial_class_id: string | null;
  teacher_id: string | null;
  trial_session_1_at: string | null;
  trial_session_2_at: string | null;
  status: string | null;
};
type ClassExamRow = { class_id: string; exam_id: string | null; pdf_exam_id: string | null; starts_at: string | null; ends_at: string | null };
type ClassSessionPracticeRow = { class_id: string; exam_id: string | null; pdf_exam_id: string | null; session_date: string; starts_at: string | null; ends_at: string | null };
type CourseRow = { id: string; name: string; start_date: string | null; created_at: string };
type CourseSessionRow = { id: string; course_id: string; exam_id: string | null; pdf_exam_id: string | null; open_day: number | null };
type CourseEnrollmentRow = { course_id: string; student_id: string; enrolled_at: string | null };
type SubmissionRow = { student_id: string; exam_id?: string | null; pdf_exam_id?: string | null; submitted_at: string | null; score_total?: number | null };

function env(name: string) {
  return Deno.env.get(name) || "";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceHeaders(extra: Record<string, string> = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function rest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: { ...serviceHeaders(), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.error || response.statusText);
  return body as T;
}

async function authorize(req: Request) {
  const secret = req.headers.get("x-cron-secret") || "";
  if (secret && secret === env("TASK_CRON_SECRET")) return;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (token === env("SUPABASE_SERVICE_ROLE_KEY")) return;
  if (!token) throw new Error("Unauthorized");
  const response = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: `Bearer ${token}` },
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw new Error("Unauthorized");
  const rows = await rest<Array<{ role: string }>>(`users?id=eq.${user.id}&select=role&limit=1`);
  if (rows[0]?.role !== "admin") throw new Error("Admin only");
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { date: `${map.year}-${map.month}-${map.day}`, time: `${map.hour}:${map.minute}` };
}

const APP_TIMEZONE = "Asia/Ho_Chi_Minh";

function addLocalDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isoWeekday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function localDateOf(value?: string | null) {
  if (!value) return "";
  return localParts(new Date(value), APP_TIMEZONE).date;
}

function localDateTime(date: string, time: string) {
  return new Date(`${date}T${String(time || "00:00").slice(0, 8)}+07:00`);
}

function shortTime(value?: string | null) {
  return String(value || "").slice(0, 5);
}

function distinctCount(values: Array<string | null | undefined>) {
  return new Set(values.filter(Boolean)).size;
}

function isActiveClassStudent(item: ClassStudentRow, date: string) {
  const joined = localDateOf(item.joined_at) || "0000-00-00";
  const left = localDateOf(item.left_at) || "9999-99-99";
  return joined <= date && left >= date;
}

function effectiveSchedulesForClass(rows: ScheduleRow[], classId: string, date: string) {
  const eligible = rows.filter(item => item.class_id === classId && String(item.effective_from || "2000-01-01").slice(0, 10) <= date);
  if (!eligible.length) return [];
  const latest = eligible.reduce((value, item) => {
    const next = String(item.effective_from || "2000-01-01").slice(0, 10);
    return next > value ? next : value;
  }, "2000-01-01");
  return eligible.filter(item => String(item.effective_from || "2000-01-01").slice(0, 10) === latest);
}

function minutes(value: string) {
  const [hour, minute] = String(value || "00:00").slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function isWithinWindow(current: string, target: string, windowMinutes = 15) {
  const diff = minutes(current) - minutes(target);
  return diff >= 0 && diff < windowMinutes;
}

function isEveryThreeHoursWindow(current: string) {
  const [hour, minute] = current.split(":").map(Number);
  return hour % 3 === 0 && minute >= 0 && minute < 15;
}

function isTeacherLike(role?: string | null) {
  return role === "teacher" || role === "assistant";
}

function isTeacherOrAdmin(role?: string | null) {
  return role === "teacher" || role === "admin";
}

function shortTaskList(assignments: Assignment[], limit = 3) {
  const names = assignments.slice(0, limit).map(item => item.task.title);
  const rest = assignments.length - names.length;
  return rest > 0 ? `${names.join("; ")}; và ${rest} việc khác` : names.join("; ");
}

async function hasLog(userId: string, kind: string, date: string, taskId?: string) {
  const taskFilter = taskId ? `&task_id=eq.${taskId}` : "&task_id=is.null";
  const rows = await rest<Array<{ id: string }>>(
    `task_notification_logs?user_id=eq.${userId}&notification_kind=eq.${kind}&notification_date=eq.${date}${taskFilter}&select=id&limit=1`,
  );
  return rows.length > 0;
}

async function getAdminActorId() {
  const rows = await rest<Array<{ id: string }>>("users?role=eq.admin&select=id&order=created_at.asc&limit=1");
  if (!rows[0]?.id) throw new Error("No admin actor found");
  return rows[0].id;
}

async function insertNotification(input: {
  userId: string;
  actorId: string;
  type: string;
  title: string;
  message: string;
  taskId?: string;
  targetUrl?: string;
}) {
  const rows = await rest<Array<{ id: string }>>("notifications?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: input.userId,
      actor_id: input.actorId,
      type: input.type,
      title: input.title,
      message: input.message,
      ref_id: input.taskId || null,
      target_url: input.targetUrl || "tasks.html",
      meta: {
        task_id: input.taskId || null,
        branded_sender: true,
        sender_name: "MindUp - Tư duy Toàn Diện",
        sender_avatar: "pwa-icon-192.png",
      },
    }),
  });
  return rows[0]?.id || null;
}

async function insertLog(userId: string, kind: string, date: string, taskId: string | null, notificationId: string | null) {
  await rest("task_notification_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      notification_kind: kind,
      notification_date: date,
      task_id: taskId,
      notification_id: notificationId,
    }),
  });
}

function configureVapid() {
  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@mindup.edu.vn", publicKey, privateKey);
  return true;
}

async function sendPush(subscription: PushSubscription, payload: string) {
  try {
    await webpush.sendNotification({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    }, payload, { TTL: 60 * 60 * 24 * 2, urgency: "high" });
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) {
      await rest(`push_subscriptions?id=eq.${subscription.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      });
    }
    console.error("Task push failed", error);
    return false;
  }
}

async function pushNotificationToUser(
  userId: string,
  subscriptions: PushSubscription[],
  notificationId: string,
  title: string,
  message: string,
  targetUrl: string,
  type: string,
) {
  const payload = JSON.stringify({
    title,
    body: message,
    url: targetUrl,
    type,
    notificationId,
    icon: "/pwa-icon-192.png",
    badge: "/pwa-icon-192.png",
  });
  let pushed = 0;
  for (const subscription of subscriptions.filter(item => item.user_id === userId)) {
    if (await sendPush(subscription, payload)) pushed += 1;
  }
  return pushed;
}

function buildCandidates(userTasks: Assignment[], clock: { date: string; time: string }, now: Date, force: boolean) {
  const candidates: Candidate[] = [];
  const role = userTasks[0]?.assignee?.role || "";
  const todayTasks = userTasks.filter(item => item.task.available_on === clock.date);
  const scheduleTasks = todayTasks.filter(item => item.task.task_type === "class_schedule");
  const attendanceTasks = todayTasks.filter(item => item.task.task_type === "attendance");
  const evaluationTasks = todayTasks.filter(item => item.task.task_type === "session_evaluation");
  const gradingTasks = userTasks.filter(item => item.task.task_type === "exam_grading");
  const sessionStartById = new Map<string, string>();

  for (const item of scheduleTasks) {
    if (item.task.source_id && item.task.due_at) sessionStartById.set(item.task.source_id, item.task.due_at);
  }

  if (isTeacherLike(role) && scheduleTasks.length) {
    for (const target of ["07:00", "13:00"]) {
      if (force || isWithinWindow(clock.time, target)) {
        const suffix = target.replace(":", "");
        candidates.push({
          kind: `teacher_schedule_${suffix}`,
          type: "task_daily_digest",
          message: `Hôm nay bạn có ${scheduleTasks.length} buổi học phụ trách: ${shortTaskList(scheduleTasks)}.`,
          targetUrl: "teacher_schedule.html",
        });
      }
    }
  }

  if (isTeacherLike(role)) {
    for (const item of attendanceTasks) {
      const startAt = item.task.source_id ? sessionStartById.get(item.task.source_id) : null;
      if (!startAt) continue;
      const diffMinutes = (new Date(startAt).getTime() - now.getTime()) / 60000;
      if (force || (diffMinutes >= 0 && diffMinutes <= 15)) {
        candidates.push({
          kind: "attendance_15m",
          type: "task_due_reminder",
          message: `Sắp đến giờ học. Bạn cần điểm danh lớp: ${item.task.title.replace(/^Điểm danh lớp\s*/i, "")}.`,
          task: item.task,
          targetUrl: item.task.action_url || "teacher_schedule.html",
        });
      }
    }
  }

  if (isTeacherLike(role) && evaluationTasks.length && (force || isWithinWindow(clock.time, "22:00"))) {
    candidates.push({
      kind: "session_evaluation_2200",
      type: "task_due_reminder",
      message: `Bạn còn ${evaluationTasks.length} buổi học hôm nay cần nhận xét/đánh giá: ${shortTaskList(evaluationTasks)}.`,
      targetUrl: "tasks.html?tab=evaluation",
    });
  }

  if (isTeacherOrAdmin(role) && gradingTasks.length && (force || isEveryThreeHoursWindow(clock.time))) {
    const hour = clock.time.slice(0, 2);
    candidates.push({
      kind: `exam_grading_${hour}`,
      type: "task_due_reminder",
      message: `Bạn còn ${gradingTasks.length} bài tự luận cần chấm: ${shortTaskList(gradingTasks)}.`,
      targetUrl: gradingTasks[0]?.task.action_url || "tasks.html?tab=grading",
    });
  }

  return candidates;
}

async function buildRoleScheduledCandidates(now: Date, force = false) {
  const clock = localParts(now, APP_TIMEZONE);
  const inMorningWindow = force || isWithinWindow(clock.time, "07:00");
  const inAfternoonWindow = force || isWithinWindow(clock.time, "13:00");
  const inEveningWindow = force || isWithinWindow(clock.time, "21:00");
  const needsScheduleData = inMorningWindow || inAfternoonWindow || inEveningWindow || force;
  if (!needsScheduleData && !force) {
    const minute = minutes(clock.time);
    if (minute % 15 !== 0) return [] as ScheduledCandidate[];
  }

  const [
    users,
    classes,
    schedules,
    classStudents,
    studentSchedules,
    parentLinks,
    teacherLinks,
    trials,
    classExams,
    classSessions,
    courses,
    courseSessions,
    courseEnrollments,
    examResults,
    pdfResults,
    courseRequests,
  ] = await Promise.all([
    rest<UserProfile[]>("users?select=id,role,full_name,email,created_at"),
    rest<ClassRow[]>("classes?select=id,class_name,hidden"),
    rest<ScheduleRow[]>("class_schedules?select=id,class_id,session_no,weekday,start_time,end_time,effective_from"),
    rest<ClassStudentRow[]>("class_students?select=class_id,student_id,joined_at,left_at"),
    rest<StudentScheduleRow[]>("class_student_schedules?select=class_id,student_id,schedule_id"),
    rest<ParentLinkRow[]>("parent_students?revoked_at=is.null&select=parent_id,student_id"),
    rest<TeacherLinkRow[]>("class_teachers?select=class_id,teacher_id"),
    rest<TrialRow[]>("trial_lesson_requests?select=id,student_name,trial_class_id,teacher_id,trial_session_1_at,trial_session_2_at,status"),
    rest<ClassExamRow[]>("class_exams?select=class_id,exam_id,pdf_exam_id,starts_at,ends_at"),
    rest<ClassSessionPracticeRow[]>("class_sessions?select=class_id,exam_id,pdf_exam_id,session_date,starts_at,ends_at"),
    rest<CourseRow[]>("courses?select=id,name,start_date,created_at"),
    rest<CourseSessionRow[]>("course_sessions?select=id,course_id,exam_id,pdf_exam_id,open_day"),
    rest<CourseEnrollmentRow[]>("course_enrollments?select=course_id,student_id,enrolled_at"),
    rest<SubmissionRow[]>("exam_results?select=student_id,exam_id,submitted_at,score_total"),
    rest<SubmissionRow[]>("pdf_exam_results?select=student_id,pdf_exam_id,submitted_at,score_total"),
    rest<Array<{ id: string; status: string }>>("course_registration_requests?select=id,status"),
  ]);

  const candidates: ScheduledCandidate[] = [];
  const userById = new Map(users.map(item => [item.id, item]));
  const classById = new Map(classes.map(item => [item.id, item]));
  const visibleClassIds = new Set(classes.filter(item => item.hidden !== true).map(item => item.id));
  const choicesByStudentClass = new Map<string, Set<number>>();
  for (const item of studentSchedules) {
    const key = `${item.student_id}:${item.class_id}`;
    if (!choicesByStudentClass.has(key)) choicesByStudentClass.set(key, new Set());
    choicesByStudentClass.get(key)!.add(Number(item.schedule_id));
  }

  const occurrencesForStudent = (studentId: string, date: string) => {
    const memberships = classStudents.filter(item => item.student_id === studentId && visibleClassIds.has(item.class_id) && isActiveClassStudent(item, date));
    const weekday = isoWeekday(date);
    const result: Array<{ schedule: ScheduleRow; className: string }> = [];
    for (const membership of memberships) {
      let rows = effectiveSchedulesForClass(schedules, membership.class_id, date).filter(item => Number(item.weekday) === weekday);
      const selected = choicesByStudentClass.get(`${studentId}:${membership.class_id}`);
      if (selected?.size) rows = rows.filter(item => selected.has(Number(item.id)));
      for (const schedule of rows) {
        result.push({ schedule, className: classById.get(schedule.class_id)?.class_name || "Lớp học" });
      }
    }
    return result.sort((a, b) => String(a.schedule.start_time).localeCompare(String(b.schedule.start_time)));
  };

  if (inMorningWindow || inAfternoonWindow) {
    const slot = inMorningWindow ? "0700" : "1300";
    const yesterday = addLocalDays(clock.date, -1);
    const studentsCreatedYesterday = users.filter(item => item.role === "student" && localDateOf(item.created_at) === yesterday).length;
    const classStudentsAddedYesterday = distinctCount(classStudents.filter(item => localDateOf(item.joined_at) === yesterday).map(item => item.student_id));
    const courseStudentsAddedYesterday = distinctCount(courseEnrollments.filter(item => localDateOf(item.enrolled_at) === yesterday).map(item => item.student_id));
    const todayWeekday = isoWeekday(clock.date);
    const todaySchedules = schedules.filter(item => visibleClassIds.has(item.class_id)
      && Number(item.weekday) === todayWeekday
      && effectiveSchedulesForClass(schedules, item.class_id, clock.date).some(active => active.id === item.id));
    const todayClassCount = distinctCount(todaySchedules.map(item => item.class_id));
    const todayStudentIds = new Set<string>();
    for (const student of users.filter(item => item.role === "student")) {
      if (occurrencesForStudent(student.id, clock.date).length) todayStudentIds.add(student.id);
    }
    const trialToday = trials.filter(item => localDateOf(item.trial_session_1_at) === clock.date || localDateOf(item.trial_session_2_at) === clock.date);
    const trialNeedsReview = trials.filter(item => {
      const status = String(item.status || "");
      return item.trial_session_2_at && new Date(item.trial_session_2_at) < now && !["enrolled", "cancelled", "closed"].includes(status);
    });
    const pendingGrading = examResults.filter(item => item.submitted_at && item.score_total == null).length;
    const pendingCourseRequests = courseRequests.filter(item => item.status === "pending").length;
    const pendingTrialScheduling = trials.filter(item => ["new", "contacted", "pending_schedule"].includes(String(item.status || ""))).length;
    const adminMessage = `Hôm qua có ${studentsCreatedYesterday} tài khoản học sinh mới, ${classStudentsAddedYesterday} học sinh được thêm vào lớp và ${courseStudentsAddedYesterday} học sinh được thêm vào khóa học. Hôm nay có ${todaySchedules.length} ca học thuộc ${todayClassCount} lớp với ${todayStudentIds.size} học sinh; ${trialToday.length} học sinh học thử. Hiện còn ${pendingGrading} bài tự luận cần chấm, ${trialNeedsReview.length} học sinh học thử cần đánh giá, ${pendingCourseRequests} yêu cầu khóa học và ${pendingTrialScheduling} đăng ký học thử cần xử lý.`;
    for (const admin of users.filter(item => item.role === "admin")) {
      candidates.push({ userId: admin.id, kind: `admin_system_digest_${slot}`, type: "task_daily_digest", message: adminMessage, targetUrl: "tasks.html" });
    }

    const staff = users.filter(item => item.role === "teacher" || item.role === "assistant");
    for (const person of staff) {
      const assignedClassIds = new Set(teacherLinks.filter(item => item.teacher_id === person.id).map(item => item.class_id));
      const relevantTrials = trials.filter(item => item.teacher_id === person.id || (item.trial_class_id && assignedClassIds.has(item.trial_class_id)));
      const todayItems = relevantTrials.flatMap(item => [
        item.trial_session_1_at && localDateOf(item.trial_session_1_at) === clock.date ? { item, at: item.trial_session_1_at, no: 1 } : null,
        item.trial_session_2_at && localDateOf(item.trial_session_2_at) === clock.date ? { item, at: item.trial_session_2_at, no: 2 } : null,
      ].filter(Boolean) as Array<{ item: TrialRow; at: string; no: number }>);
      const remaining = todayItems.filter(item => new Date(item.at) >= now);
      const reviewCount = relevantTrials.filter(item => item.trial_session_2_at && new Date(item.trial_session_2_at) < now
        && !["enrolled", "cancelled", "closed"].includes(String(item.status || ""))).length;
      if (!todayItems.length && !reviewCount) continue;
      const details = remaining.slice(0, 3).map(entry => {
        const className = entry.item.trial_class_id ? classById.get(entry.item.trial_class_id)?.class_name : null;
        return `${entry.item.student_name} (${className || "chưa xếp lớp"}, buổi ${entry.no} lúc ${shortTime(localParts(new Date(entry.at), APP_TIMEZONE).time)})`;
      });
      const extra = Math.max(0, remaining.length - details.length);
      const detailText = details.length ? ` Các ca còn lại: ${details.join("; ")}${extra ? `; và ${extra} ca khác` : ""}.` : "";
      candidates.push({
        userId: person.id,
        kind: `staff_trial_digest_${slot}`,
        type: "task_daily_digest",
        message: `Hôm nay bạn có ${todayItems.length} lượt học thử, còn ${remaining.length} lượt từ thời điểm hiện tại; ${reviewCount} học sinh đã học thử xong cần đánh giá.${detailText}`,
        targetUrl: "trial_requests.html",
      });
    }
  }

  const studentUsers = users.filter(item => item.role === "student");
  for (const student of studentUsers) {
    const todayOccurrences = occurrencesForStudent(student.id, clock.date);
    for (const occurrence of todayOccurrences) {
      const startsAt = localDateTime(clock.date, occurrence.schedule.start_time);
      const diffMinutes = (startsAt.getTime() - now.getTime()) / 60000;
      if (!force && (diffMinutes < 45 || diffMinutes > 75)) continue;
      candidates.push({
        userId: student.id,
        kind: `student_class_1h_${occurrence.schedule.id}_${clock.date}`,
        type: "task_due_reminder",
        message: `Còn khoảng 1 giờ nữa bạn có buổi học ${occurrence.className} lúc ${shortTime(occurrence.schedule.start_time)}.`,
        targetUrl: `class.html?openClassId=${occurrence.schedule.class_id}`,
      });
    }
  }

  if (inEveningWindow) {
    const tomorrow = addLocalDays(clock.date, 1);
    const regularSubmitted = new Set(examResults.filter(item => item.submitted_at).map(item => `${item.student_id}:${item.exam_id}`));
    const pdfSubmitted = new Set(pdfResults.filter(item => item.submitted_at).map(item => `${item.student_id}:${item.pdf_exam_id}`));
    const courseById = new Map(courses.map(item => [item.id, item]));
    const classMembershipsByStudent = new Map<string, Set<string>>();
    for (const item of classStudents.filter(item => isActiveClassStudent(item, clock.date))) {
      if (!classMembershipsByStudent.has(item.student_id)) classMembershipsByStudent.set(item.student_id, new Set());
      classMembershipsByStudent.get(item.student_id)!.add(item.class_id);
    }
    const courseMembershipsByStudent = new Map<string, Set<string>>();
    for (const item of courseEnrollments) {
      if (!courseMembershipsByStudent.has(item.student_id)) courseMembershipsByStudent.set(item.student_id, new Set());
      courseMembershipsByStudent.get(item.student_id)!.add(item.course_id);
    }

    const unfinishedCount = (studentId: string) => {
      const keys = new Set<string>();
      const classIds = classMembershipsByStudent.get(studentId) || new Set<string>();
      for (const item of classExams.filter(row => classIds.has(row.class_id))) {
        const isOpen = (!item.starts_at || new Date(item.starts_at) <= now) && (!item.ends_at || new Date(item.ends_at) >= now);
        if (!isOpen) continue;
        if (item.exam_id && !regularSubmitted.has(`${studentId}:${item.exam_id}`)) keys.add(`exam:${item.exam_id}`);
        if (item.pdf_exam_id && !pdfSubmitted.has(`${studentId}:${item.pdf_exam_id}`)) keys.add(`pdf:${item.pdf_exam_id}`);
      }
      for (const item of classSessions.filter(row => classIds.has(row.class_id) && String(row.session_date).slice(0, 10) <= clock.date)) {
        const isOpen = (!item.starts_at || new Date(item.starts_at) <= now) && (!item.ends_at || new Date(item.ends_at) >= now);
        if (!isOpen) continue;
        if (item.exam_id && !regularSubmitted.has(`${studentId}:${item.exam_id}`)) keys.add(`exam:${item.exam_id}`);
        if (item.pdf_exam_id && !pdfSubmitted.has(`${studentId}:${item.pdf_exam_id}`)) keys.add(`pdf:${item.pdf_exam_id}`);
      }
      const courseIds = courseMembershipsByStudent.get(studentId) || new Set<string>();
      for (const item of courseSessions.filter(row => courseIds.has(row.course_id))) {
        const course = courseById.get(item.course_id);
        if (!course) continue;
        const baseDate = String(course.start_date || course.created_at).slice(0, 10);
        const openDate = addLocalDays(baseDate, Math.max(1, Number(item.open_day || 1)) - 1);
        if (openDate > clock.date) continue;
        if (item.exam_id && !regularSubmitted.has(`${studentId}:${item.exam_id}`)) keys.add(`exam:${item.exam_id}`);
        if (item.pdf_exam_id && !pdfSubmitted.has(`${studentId}:${item.pdf_exam_id}`)) keys.add(`pdf:${item.pdf_exam_id}`);
      }
      return keys.size;
    };

    const studentDigest = new Map<string, { scheduleCount: number; practiceCount: number; scheduleText: string }>();
    for (const student of studentUsers) {
      const tomorrowItems = occurrencesForStudent(student.id, tomorrow);
      const practiceCount = unfinishedCount(student.id);
      if (!tomorrowItems.length && !practiceCount) continue;
      const scheduleText = tomorrowItems.slice(0, 3).map(item => `${item.className} lúc ${shortTime(item.schedule.start_time)}`).join("; ");
      const extra = Math.max(0, tomorrowItems.length - 3);
      const message = `${tomorrowItems.length ? `Ngày mai bạn có ${tomorrowItems.length} buổi học: ${scheduleText}${extra ? `; và ${extra} buổi khác` : ""}.` : "Ngày mai bạn không có buổi học."}${practiceCount ? ` Bạn còn ${practiceCount} bài luyện tập chưa hoàn thành.` : ""}`;
      studentDigest.set(student.id, { scheduleCount: tomorrowItems.length, practiceCount, scheduleText });
      candidates.push({ userId: student.id, kind: "student_evening_digest_2100", type: "task_daily_digest", message, targetUrl: "class.html" });
    }

    const linksByParent = new Map<string, string[]>();
    for (const link of parentLinks) {
      if (!linksByParent.has(link.parent_id)) linksByParent.set(link.parent_id, []);
      linksByParent.get(link.parent_id)!.push(link.student_id);
    }
    for (const [parentId, childIds] of linksByParent) {
      const parts = childIds.map(childId => {
        const digest = studentDigest.get(childId);
        if (!digest) return "";
        const name = userById.get(childId)?.full_name || "Học sinh";
        return `${name}: ${digest.scheduleCount} buổi học ngày mai, ${digest.practiceCount} bài luyện tập chưa hoàn thành`;
      }).filter(Boolean);
      if (!parts.length) continue;
      candidates.push({ userId: parentId, kind: "parent_evening_digest_2100", type: "task_daily_digest", message: parts.join("; ") + ".", targetUrl: "class.html" });
    }
  }

  const parentsByStudent = new Map<string, string[]>();
  for (const link of parentLinks) {
    if (!parentsByStudent.has(link.student_id)) parentsByStudent.set(link.student_id, []);
    parentsByStudent.get(link.student_id)!.push(link.parent_id);
  }
  const studentOneHourCandidates = candidates.filter(item => item.kind.startsWith("student_class_1h_"));
  for (const item of studentOneHourCandidates) {
    const childName = userById.get(item.userId)?.full_name || "Học sinh";
    for (const parentId of parentsByStudent.get(item.userId) || []) {
      candidates.push({ ...item, userId: parentId, kind: item.kind.replace("student_", `parent_${item.userId}_`), message: item.message.replace("bạn có", `${childName} có`) });
    }
  }

  return candidates;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    await authorize(req);
    const input = await req.json().catch(() => ({}));
    const now = new Date();
    const custom = input.customNotification as CustomNotification | undefined;
    if (custom) {
      const message = String(custom.message || "").trim();
      if (!message || (!custom.userId && !custom.email)) {
        return json({ error: "customNotification requires message and userId or email" }, 400);
      }
      const userFilter = custom.userId
        ? `id=eq.${encodeURIComponent(custom.userId)}`
        : `email=eq.${encodeURIComponent(String(custom.email).trim().toLowerCase())}`;
      const users = await rest<Array<{ id: string }>>(`users?${userFilter}&select=id&limit=1`);
      if (!users[0]?.id) return json({ error: "Target user not found" }, 404);
      const actorId = await getAdminActorId();
      const title = String(custom.title || "MindUp - Tư duy Toàn Diện").trim();
      const targetUrl = String(custom.targetUrl || "tasks.html").trim();
      const type = String(custom.type || "task_assigned").trim();
      const notificationId = await insertNotification({
        userId: users[0].id,
        actorId,
        type,
        title,
        message,
        targetUrl,
      });
      const subscriptions = await rest<PushSubscription[]>(
        `push_subscriptions?user_id=eq.${users[0].id}&revoked_at=is.null&select=id,user_id,endpoint,p256dh,auth`,
      );
      const pushReady = configureVapid();
      const pushed = pushReady && notificationId
        ? await pushNotificationToUser(users[0].id, subscriptions, notificationId, title, message, targetUrl, type)
        : 0;
      return json({ ok: true, notificationId, pushed, subscriptions: subscriptions.length });
    }

    await rest("rpc/refresh_daily_tasks", { method: "POST", body: JSON.stringify({ p_user_id: null }) });
    const [preferences, assignments, subscriptions] = await Promise.all([
      rest<Preference[]>("task_preferences?select=user_id,timezone"),
      rest<Assignment[]>("task_assignments?status=in.(open,in_progress)&select=id,user_id,status,assignee:users!task_assignments_user_id_fkey(id,role,full_name,email),task:daily_tasks(id,title,description,task_type,priority,due_at,action_url,available_on,source_id,source_type,metadata)"),
      rest<PushSubscription[]>("push_subscriptions?revoked_at=is.null&select=id,user_id,endpoint,p256dh,auth"),
    ]);
    const actorId = await getAdminActorId();
    const assignmentsByUser = new Map<string, Assignment[]>();
    for (const item of assignments) {
      if (!item.task) continue;
      if (!assignmentsByUser.has(item.user_id)) assignmentsByUser.set(item.user_id, []);
      assignmentsByUser.get(item.user_id)!.push(item);
    }

    const targetUserIds = Array.isArray(input.userIds) ? input.userIds.map(String) : [];
    const pushReady = configureVapid();
    let created = 0;
    let pushed = 0;
    for (const preference of preferences) {
      if (targetUserIds.length && !targetUserIds.includes(preference.user_id)) continue;
      const clock = localParts(now, preference.timezone);
      const userTasks = assignmentsByUser.get(preference.user_id) || [];
      if (!userTasks.length) continue;

      const candidates = buildCandidates(userTasks, clock, now, input.force === true);
      for (const candidate of candidates) {
        if (await hasLog(preference.user_id, candidate.kind, clock.date, candidate.task?.id)) continue;
        const targetUrl = candidate.targetUrl || candidate.task?.action_url || "tasks.html";
        const notificationId = await insertNotification({
          userId: preference.user_id,
          actorId,
          type: candidate.type,
          title: "MindUp - Tư duy Toàn Diện",
          message: candidate.message,
          taskId: candidate.task?.id,
          targetUrl,
        });
        await insertLog(preference.user_id, candidate.kind, clock.date, candidate.task?.id || null, notificationId);
        created += 1;
        if (pushReady && notificationId) {
          pushed += await pushNotificationToUser(
            preference.user_id,
            subscriptions,
            notificationId,
            "MindUp - Tư duy Toàn Diện",
            candidate.message,
            targetUrl,
            candidate.type,
          );
        }
      }
    }

    const roleCandidates = await buildRoleScheduledCandidates(now, input.force === true);
    for (const candidate of roleCandidates) {
      if (targetUserIds.length && !targetUserIds.includes(candidate.userId)) continue;
      const clock = localParts(now, APP_TIMEZONE);
      if (await hasLog(candidate.userId, candidate.kind, clock.date)) continue;
      const targetUrl = candidate.targetUrl || "notifications.html";
      const notificationId = await insertNotification({
        userId: candidate.userId,
        actorId,
        type: candidate.type,
        title: "MindUp - Tư duy Toàn Diện",
        message: candidate.message,
        targetUrl,
      });
      await insertLog(candidate.userId, candidate.kind, clock.date, null, notificationId);
      created += 1;
      if (pushReady && notificationId) {
        pushed += await pushNotificationToUser(
          candidate.userId,
          subscriptions,
          notificationId,
          "MindUp - Tư duy Toàn Diện",
          candidate.message,
          targetUrl,
          candidate.type,
        );
      }
    }
    return json({ ok: true, created, pushed, users: preferences.length });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Task notification failed";
    return json({ error: message }, message.includes("Unauthorized") || message.includes("Admin only") ? 401 : 500);
  }
});
