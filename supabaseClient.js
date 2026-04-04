const SUPABASE_URL = "https://lgydjaaqfxqzgbdpqvkp.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxneWRqYWFxZnhxemdiZHBxdmtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxODY2NDQsImV4cCI6MjA4Nzc2MjY0NH0.l6ojk0fH5wYMK4H_RIGTepatUd1Uy2KHOTiRfAS1JD4";

  const sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  window.sb = sb;

  window.AppAdminTools = (function () {
    let cachedProfile = null;
    let profileLoadedAt = 0;

    function normalizeError(error, fallback = "Đã xảy ra lỗi không xác định.") {
      const raw = String(error?.message || error || "").trim();
      return raw || fallback;
    }

    async function getCurrentProfile(force = false) {
      const now = Date.now();
      if (!force && cachedProfile && now - profileLoadedAt < 60_000) {
        return cachedProfile;
      }
      try {
        const { data: authData } = await sb.auth.getUser();
        const userId = authData?.user?.id;
        if (!userId) {
          cachedProfile = null;
          profileLoadedAt = now;
          return null;
        }
        const { data } = await sb
          .from("users")
          .select("id, role, full_name, email")
          .eq("id", userId)
          .maybeSingle();
        cachedProfile = data || null;
        profileLoadedAt = now;
        return cachedProfile;
      } catch (_) {
        return cachedProfile;
      }
    }

    async function recordAudit(action, details = {}, status = "success") {
      try {
        const profile = await getCurrentProfile();
        if (!profile || !["admin", "teacher"].includes(profile.role)) return;
        await sb.from("admin_action_logs").insert({
          actor_id: profile.id,
          action,
          target_type: details.target_type || null,
          target_id: details.target_id || null,
          status,
          details,
        });
      } catch (_) {
        // Audit log must never block the UI.
      }
    }

    async function runAdminAction(config) {
      const {
        action,
        details = {},
        operation,
        successMessage = "",
        errorPrefix = "Không thể thực hiện thao tác",
      } = config || {};
      try {
        const result = await operation();
        await recordAudit(action, details, "success");
        if (successMessage) alert(successMessage);
        return { ok: true, result };
      } catch (error) {
        const message = normalizeError(error, errorPrefix);
        await recordAudit(
          action,
          {
            ...details,
            error_message: message,
          },
          "error"
        );
        alert(`${errorPrefix}: ${message}`);
        return { ok: false, error };
      }
    }

    return {
      normalizeError,
      getCurrentProfile,
      recordAudit,
      runAdminAction,
    };
  })();
