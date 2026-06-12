(function () {
  function getSb() {
    if (window.sb) return window.sb;
    if (typeof sb !== "undefined") return sb;
    throw new Error("Supabase chưa sẵn sàng");
  }

  async function getCurrentUserId() {
    const { data: { user } } = await getSb().auth.getUser();
    return user?.id || null;
  }

  function normalizeMeta(meta) {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
    return meta;
  }

  function normalizeUrl(targetUrl, fallbackRefId) {
    if (targetUrl) return targetUrl;
    if (fallbackRefId) return "";
    return "";
  }

  async function invokePushFunction(payload) {
    try {
      const { data: { session } } = await getSb().auth.getSession();
      if (!session?.access_token) return { skipped: true };

      const supabaseUrl = window.SUPABASE_URL || "";
      const functionUrl = `${supabaseUrl}/functions/v1/send-push-notification`;
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "apikey": window.SUPABASE_KEY || "",
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Push notification failed");
      return body;
    } catch (error) {
      console.warn("MindUp push send skipped:", error);
      return { skipped: true, error };
    }
  }

  async function sendPushForNotification(notificationId) {
    if (!notificationId) return { skipped: true };
    return invokePushFunction({ notificationId });
  }

  async function sendPushForNotifications(notificationIds) {
    const ids = Array.isArray(notificationIds) ? notificationIds.filter(Boolean) : [];
    if (!ids.length) return { skipped: true };
    return invokePushFunction({ notificationIds: ids });
  }

  async function sendPushToUsers(options) {
    const {
      userIds = [],
      title = "MindUp",
      message = "",
      targetUrl = "notifications.html",
      type = "system"
    } = options || {};
    return invokePushFunction({ userIds, title, message, targetUrl, type });
  }

  async function createNotification(options) {
    const {
      userId,
      type,
      title = "",
      message = "",
      refId = null,
      targetUrl = "",
      meta = {},
      allowSelf = false,
      push = true
    } = options || {};

    if (!userId || !type) return { skipped: true };

    const actorId = await getCurrentUserId();
    if (!actorId) throw new Error("Không xác định được người gửi thông báo.");
    if (!allowSelf && actorId === userId) return { skipped: true };

    const payload = {
      user_id: userId,
      actor_id: actorId,
      type,
      title: title || null,
      message: message || null,
      ref_id: refId || null,
      target_url: normalizeUrl(targetUrl, refId) || null,
      meta: normalizeMeta(meta)
    };

    const { data, error } = await getSb()
      .from("notifications")
      .insert(payload)
      .select("id")
      .single();

    if (error) throw error;
    if (push !== false) sendPushForNotification(data.id);
    return data;
  }

  async function createBulkNotifications(items, { allowSelf = false, push = true } = {}) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return { count: 0 };

    const actorId = await getCurrentUserId();
    if (!actorId) throw new Error("Không xác định được người gửi thông báo.");

    const payloads = rows
      .filter(item => item?.userId && item?.type)
      .filter(item => allowSelf || item.userId !== actorId)
      .map(item => ({
        user_id: item.userId,
        actor_id: actorId,
        type: item.type,
        title: item.title || null,
        message: item.message || null,
        ref_id: item.refId || null,
        target_url: normalizeUrl(item.targetUrl, item.refId) || null,
        meta: normalizeMeta(item.meta)
      }));

    if (!payloads.length) return { count: 0 };

    const chunkSize = 100;
    const insertedIds = [];
    for (let i = 0; i < payloads.length; i += chunkSize) {
      const chunk = payloads.slice(i, i + chunkSize);
      const { data, error } = await getSb().from("notifications").insert(chunk).select("id");
      if (error) throw error;
      insertedIds.push(...((data || []).map(item => item.id).filter(Boolean)));
    }

    if (push !== false && insertedIds.length) sendPushForNotifications(insertedIds);
    return { count: payloads.length };
  }

  async function getCourseStudentIds(courseId) {
    if (!courseId) return [];
    const { data, error } = await getSb()
      .from("course_enrollments")
      .select("student_id")
      .eq("course_id", courseId);
    if (error) throw error;
    return [...new Set((data || []).map(item => item.student_id).filter(Boolean))];
  }

  async function getClassStudentIds(classId) {
    if (!classId) return [];
    const { data, error } = await getSb()
      .from("class_students")
      .select("student_id")
      .eq("class_id", classId)
      .is("left_at", null);
    if (error) throw error;
    return [...new Set((data || []).map(item => item.student_id).filter(Boolean))];
  }

  async function getAllStudentIds() {
    const { data, error } = await getSb()
      .from("users")
      .select("id")
      .eq("role", "student");
    if (error) throw error;
    return [...new Set((data || []).map(item => item.id).filter(Boolean))];
  }

  function resolveNotificationBuilder(buildItem) {
    if (typeof buildItem === "function") return buildItem;
    const staticPayload = buildItem && typeof buildItem === "object" ? buildItem : {};
    return () => ({ ...staticPayload });
  }

  async function notifyCourseStudents(courseId, buildItem) {
    const builder = resolveNotificationBuilder(buildItem);
    const studentIds = await getCourseStudentIds(courseId);
    const items = studentIds.map(studentId => {
      const built = builder(studentId) || {};
      return { ...built, userId: built.userId || studentId };
    });
    return createBulkNotifications(items);
  }

  async function notifyClassStudents(classId, buildItem) {
    const builder = resolveNotificationBuilder(buildItem);
    const studentIds = await getClassStudentIds(classId);
    const items = studentIds.map(studentId => {
      const built = builder(studentId) || {};
      return { ...built, userId: built.userId || studentId };
    });
    return createBulkNotifications(items);
  }

  async function notifyAllStudents(buildItem) {
    const builder = resolveNotificationBuilder(buildItem);
    const studentIds = await getAllStudentIds();
    const items = studentIds.map(studentId => {
      const built = builder(studentId) || {};
      return { ...built, userId: built.userId || studentId };
    });
    return createBulkNotifications(items);
  }

  window.NotificationHelper = {
    createNotification,
    createBulkNotifications,
    getCourseStudentIds,
    getClassStudentIds,
    getAllStudentIds,
    notifyCourseStudents,
    notifyClassStudents,
    notifyAllStudents,
    sendPushForNotification,
    sendPushForNotifications,
    sendPushToUsers
  };
})();
