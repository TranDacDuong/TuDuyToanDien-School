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
    return json({ ok: true, created, pushed, users: preferences.length });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Task notification failed";
    return json({ error: message }, message.includes("Unauthorized") || message.includes("Admin only") ? 401 : 500);
  }
});
