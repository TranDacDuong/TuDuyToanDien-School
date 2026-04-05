const SUPABASE_URL = "https://lgydjaaqfxqzgbdpqvkp.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxneWRqYWFxZnhxemdiZHBxdmtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxODY2NDQsImV4cCI6MjA4Nzc2MjY0NH0.l6ojk0fH5wYMK4H_RIGTepatUd1Uy2KHOTiRfAS1JD4";

  const sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const originalGetUser = sb.auth.getUser.bind(sb.auth);
  sb.auth.getUser = async (...args) => {
    try {
      return await originalGetUser(...args);
    } catch (error) {
      try {
        const { data } = await sb.auth.getSession();
        if (data?.session?.user) {
          return { data: { user: data.session.user }, error: null };
        }
      } catch (_) {
        // Ignore fallback errors and rethrow the original failure below.
      }
      throw error;
    }
  };

  window.sb = sb;
  window.AppAuth = (function () {
    async function getUser() {
      try {
        const { data } = await sb.auth.getSession();
        if (data?.session?.user) return data.session.user;
      } catch (_) {
        // Fall back to getUser below.
      }

      const { data } = await sb.auth.getUser();
      return data?.user || null;
    }

    async function getAccessToken() {
      try {
        const { data } = await sb.auth.getSession();
        return data?.session?.access_token || "";
      } catch (_) {
        return "";
      }
    }

    async function getEdgeFunctionHeaders(extraHeaders = {}) {
      const token = await getAccessToken();
      return {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token || SUPABASE_KEY}`,
        ...extraHeaders,
      };
    }

    function getAnonEdgeFunctionHeaders(extraHeaders = {}) {
      return {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        ...extraHeaders,
      };
    }

    return {
      getUser,
      getAccessToken,
      getEdgeFunctionHeaders,
      getAnonEdgeFunctionHeaders,
    };
  })();

  window.QuestionAnswerFormat = (function () {
    function getTrueFalseCount(answer, fallback = 4) {
      const direct = String(answer || "").trim();
      if (!direct) return Math.max(1, Number(fallback) || 4);
      const dense = direct.toUpperCase().replace(/[^TF]/g, "");
      if (dense) return Math.max(1, dense.length, Number(fallback) || 0);
      const pairMatches = [...direct.matchAll(/([a-z])\s*([TF])/gi)];
      if (pairMatches.length) return Math.max(1, pairMatches.length, Number(fallback) || 0);
      const letters = [...new Set(direct.toLowerCase().match(/[a-z]/g) || [])]
        .map((letter) => letter.charCodeAt(0) - 96)
        .filter((index) => index >= 1);
      return Math.max(1, ...(letters.length ? letters : [0]), Number(fallback) || 0);
    }

    function normalizeTrueFalseAnswer(answer, fallback = 4) {
      const source = String(answer || "").trim();
      if (!source) return "";
      const count = getTrueFalseCount(source, fallback);

      const dense = source.toUpperCase().replace(/[^TF]/g, "");
      if (dense && dense.length >= count) {
        return dense.slice(0, count);
      }

      const pairMap = new Map();
      [...source.matchAll(/([a-z])\s*([TF])/gi)].forEach(([, label, value]) => {
        pairMap.set(label.toLowerCase(), value.toUpperCase());
      });
      if (pairMap.size) {
        let result = "";
        for (let i = 0; i < count; i++) {
          const label = String.fromCharCode(97 + i);
          result += pairMap.get(label) || "F";
        }
        return result;
      }

      const trueLetters = new Set(
        [...new Set(source.toLowerCase().match(/[a-z]/g) || [])]
          .map((letter) => letter.toLowerCase())
      );
      if (!trueLetters.size) return "";
      let result = "";
      for (let i = 0; i < count; i++) {
        const label = String.fromCharCode(97 + i);
        result += trueLetters.has(label) ? "T" : "F";
      }
      return result;
    }

    function isTrueFalseStatementTrue(answer, index, fallback = 4) {
      const normalized = normalizeTrueFalseAnswer(answer, fallback);
      if (!normalized) return false;
      return normalized[index] === "T";
    }

    function encodeTrueFalseSelections(values, fallback = 4) {
      const arr = Array.isArray(values) ? values : [];
      const count = Math.max(Number(fallback) || 0, arr.length, 1);
      let result = "";
      for (let i = 0; i < count; i++) {
        result += String(arr[i] || "F").toUpperCase() === "T" ? "T" : "F";
      }
      return result;
    }

    return {
      getTrueFalseCount,
      normalizeTrueFalseAnswer,
      isTrueFalseStatementTrue,
      encodeTrueFalseSelections,
    };
  })();

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
        const authUser = await window.AppAuth?.getUser?.();
        const userId = authUser?.id;
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
        if (result?.error) throw result.error;
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
