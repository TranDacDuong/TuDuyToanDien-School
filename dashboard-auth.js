(function () {
  async function loadProfile(client, userId, options = {}) {
    const timeoutMs = options.timeoutMs ?? 10000;
    const wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    let refreshed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      let timer;
      let result;
      try {
        result = await Promise.race([
          client.from("users").select("*").eq("id", userId)
            .abortSignal(controller.signal).maybeSingle(),
          new Promise(resolve => {
            timer = setTimeout(() => {
              resolve({ error: { code: "PROFILE_TIMEOUT", message: "Profile request timed out" } });
              controller.abort();
            }, timeoutMs);
          }),
        ]);
      } catch (_) {
        result = { error: { code: "PROFILE_NETWORK", message: "Profile request failed" } };
      } finally {
        clearTimeout(timer);
      }
      if (!result.error) {
        if (result.data?.id === userId && result.data?.role) return { profile: result.data };
        return { kind: "missing", code: "PROFILE_MISSING" };
      }
      const status = Number(result.status || result.error.status || 0);
      const code = result.error.code || (status ? `HTTP_${status}` : "PROFILE_NETWORK");
      if (status === 401 && !refreshed) {
        refreshed = true;
        let refreshTimer;
        try {
          const refresh = await Promise.race([
            client.auth.refreshSession(),
            new Promise(resolve => { refreshTimer = setTimeout(() => resolve({ error: true }), timeoutMs); }),
          ]);
          if (!refresh.error && refresh.data?.session?.user?.id === userId) continue;
        } catch (_) { /* Keep the existing session available for manual recovery. */ }
        finally { clearTimeout(refreshTimer); }
        return { kind: "session", code };
      }
      const transient = !status || status === 408 || status === 429 || status >= 500;
      if (!transient || attempt === 2) return { kind: status === 401 ? "session" : "unavailable", code };
      await wait(500 * (attempt + 1));
    }
    return { kind: "unavailable", code: "PROFILE_UNAVAILABLE" };
  }
  window.DashboardAuth = { loadProfile };
})();
