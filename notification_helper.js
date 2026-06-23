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

  const PARENT_VISIBLE_TYPES = new Set([
    "course_enrolled",
    "course_request_approved",
    "course_request_rejected",
    "course_session_added",
    "course_session_updated",
    "class_session_added",
    "class_session_updated",
    "class_exam_added",
    "session_evaluation",
    "task_assigned",
    "task_daily_digest",
    "task_due_reminder",
    "task_overdue",
    "tuition_due",
    "tuition_reminder",
    "trial_lesson_request"
  ]);

  async function getLinkedParentsForStudents(studentIds) {
    const ids = [...new Set((studentIds || []).filter(Boolean))];
    if (!ids.length) return [];
    try {
      const { data, error } = await getSb()
        .from("parent_students")
        .select("parent_id,student_id")
        .in("student_id", ids)
        .is("revoked_at", null);
      if (error) return [];
      return data || [];
    } catch (error) {
      return [];
    }
  }

  async function expandParentNotifications(payloads) {
    const rows = Array.isArray(payloads) ? payloads : [];
    const studentIds = rows
      .filter(item => PARENT_VISIBLE_TYPES.has(item.type))
      .map(item => item.user_id)
      .filter(Boolean);
    const parentLinks = await getLinkedParentsForStudents(studentIds);
    if (!parentLinks.length) return rows;

    const linksByStudent = parentLinks.reduce((acc, link) => {
      if (!acc[link.student_id]) acc[link.student_id] = [];
      acc[link.student_id].push(link.parent_id);
      return acc;
    }, {});

    const expanded = [...rows];
    rows.forEach(item => {
      if (!PARENT_VISIBLE_TYPES.has(item.type)) return;
      (linksByStudent[item.user_id] || []).forEach(parentId => {
        if (!parentId || parentId === item.actor_id || parentId === item.user_id) return;
        expanded.push({
          ...item,
          user_id: parentId,
          meta: {
            ...(item.meta || {}),
            student_id: item.user_id,
            parent_copy: true
          }
        });
      });
    });
    return expanded;
  }

  async function invokePushFunction(payload) {
    try {
      const headers = window.AppAuth?.getEdgeFunctionHeaders
        ? await window.AppAuth.getEdgeFunctionHeaders()
        : null;
      if (!headers) return { skipped: true };

      const supabaseUrl = window.SUPABASE_URL || "";
      const functionUrl = `${supabaseUrl}/functions/v1/send-push-notification`;
      const response = await fetch(functionUrl, {
        method: "POST",
        headers,
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

  function isRowLevelSecurityError(error) {
    const message = String(error?.message || error || "");
    return error?.code === "42501" || /row-level security|violates row-level security/i.test(message);
  }

  function canFallbackToDirectPush(rows) {
    return rows.length && rows.every(item => item.user_id);
  }

  async function sendDirectPushFallback(rows) {
    if (!canFallbackToDirectPush(rows)) return false;
    for (const row of rows) {
      await sendPushToUsers({
        userIds: [row.user_id],
        title: row.title || "MindUp",
        message: row.message || "",
        targetUrl: row.target_url || "notifications.html",
        type: row.type
      });
    }
    return true;
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

    const expandedPayload = await expandParentNotifications([payload]);
    if (canFallbackToDirectPush(expandedPayload)) {
      const { error } = await getSb()
        .from("notifications")
        .insert(expandedPayload);

      if (error) {
        if (push !== false && isRowLevelSecurityError(error) && await sendDirectPushFallback(expandedPayload)) {
          console.warn("MindUp notification insert blocked by RLS; sent session evaluation push directly.", error);
          return { directPushOnly: true };
        }
        throw error;
      }
      if (push !== false) sendDirectPushFallback(expandedPayload);
      return { inserted: true };
    }

    const { data, error } = await getSb()
      .from("notifications")
      .insert(expandedPayload)
      .select("id");

    if (error) {
      if (push !== false && isRowLevelSecurityError(error) && await sendDirectPushFallback(expandedPayload)) {
        console.warn("MindUp notification insert blocked by RLS; sent session evaluation push directly.", error);
        return { directPushOnly: true };
      }
      throw error;
    }
    const ids = (data || []).map(item => item.id).filter(Boolean);
    if (push !== false && ids.length) sendPushForNotifications(ids);
    return data?.[0] || null;
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

    const expandedPayloads = await expandParentNotifications(payloads);

    const chunkSize = 100;
    const insertedIds = [];
    for (let i = 0; i < expandedPayloads.length; i += chunkSize) {
      const chunk = expandedPayloads.slice(i, i + chunkSize);
      if (canFallbackToDirectPush(chunk)) {
        const { error } = await getSb().from("notifications").insert(chunk);
        if (error) {
          if (push !== false && isRowLevelSecurityError(error) && await sendDirectPushFallback(chunk)) {
            console.warn("MindUp notification insert blocked by RLS; sent session evaluation push directly.", error);
            continue;
          }
          throw error;
        }
        if (push !== false) sendDirectPushFallback(chunk);
        continue;
      }

      const { data, error } = await getSb().from("notifications").insert(chunk).select("id");
      if (error) {
        if (push !== false && isRowLevelSecurityError(error) && await sendDirectPushFallback(chunk)) {
          console.warn("MindUp notification insert blocked by RLS; sent session evaluation push directly.", error);
          continue;
        }
        throw error;
      }
      insertedIds.push(...((data || []).map(item => item.id).filter(Boolean)));
    }

    if (push !== false && insertedIds.length) sendPushForNotifications(insertedIds);
    return { count: payloads.length, expandedCount: expandedPayloads.length, insertedCount: insertedIds.length };
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
