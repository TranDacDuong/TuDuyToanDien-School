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

  async function createNotification(options) {
    const {
      userId,
      type,
      title = "",
      message = "",
      refId = null,
      targetUrl = "",
      meta = {},
      allowSelf = false
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
    return data;
  }

  async function createBulkNotifications(items, { allowSelf = false } = {}) {
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
    for (let i = 0; i < payloads.length; i += chunkSize) {
      const chunk = payloads.slice(i, i + chunkSize);
      const { error } = await getSb().from("notifications").insert(chunk);
      if (error) throw error;
    }

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
    notifyAllStudents
  };
})();
