(function registerMindUpPwa(){
  const VAPID_PUBLIC_KEY = "BFeo1qo3R-OG_92Fh36HtY12Gae0G27neKtmXn2KS9KoG_gbOS3BRPKUH7uWij7544kuU0a4VL4x3EP4iwYsu2o";
  const INSTALL_ACCEPTED_KEY = "mindup_install_prompt_accepted";
  const LOCAL_NOTIFY_ENABLED_KEY = "mindup_local_notifications_enabled";
  const LOCAL_NOTIFY_LAST_SEEN_KEY = "mindup_local_notifications_last_seen_at";
  const LOCAL_NOTIFY_POLL_MS = 30000;
  const PROMPT_DELAY_MS = 1400;

  let serviceWorkerRegistrationPromise = null;
  let deferredInstallPrompt = null;
  let localNotificationPollTimer = null;

  window.addEventListener("beforeinstallprompt", function(event){
    event.preventDefault();
    deferredInstallPrompt = event;
    window.setTimeout(initInstallPrompt, 400);
  });

  window.addEventListener("appinstalled", function(){
    localStorage.setItem(INSTALL_ACCEPTED_KEY, "1");
    removeInstallPrompt();
    deferredInstallPrompt = null;
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function(){
      serviceWorkerRegistrationPromise = navigator.serviceWorker
        .register("service-worker.js")
        .catch(function(error){
          console.warn("MindUp PWA service worker registration failed:", error);
          return null;
        });
    });
  }

  function isPushConfigured() {
    return VAPID_PUBLIC_KEY && !VAPID_PUBLIC_KEY.includes("REPLACE_WITH");
  }

  function isPushSupported() {
    return (
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      window.isSecureContext
    );
  }

  function isStandaloneApp() {
    return Boolean(
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone
    );
  }

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 820;
  }

  function isIosDevice() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent);
  }

  function waitForSupabase(timeoutMs = 8000) {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        if (window.sb?.auth) return resolve(window.sb);
        if (Date.now() - startedAt > timeoutMs) return resolve(null);
        window.setTimeout(tick, 120);
      };
      tick();
    });
  }

  async function getCurrentUser() {
    const client = await waitForSupabase();
    if (!client) return null;
    try {
      const { data } = await client.auth.getUser();
      if (data?.user) return data.user;
    } catch (error) {}
    try {
      const { data } = await client.auth.getSession();
      return data?.session?.user || null;
    } catch (error) {
      return null;
    }
  }

  function urlBase64ToUint8Array(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
    return output;
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function isPushServiceError(error) {
    const text = [error?.name, error?.message].filter(Boolean).join(" ");
    return /AbortError|push service|Registration failed/i.test(text);
  }

  function getFriendlyPushError(error) {
    if (isPushServiceError(error) && isAndroidDevice()) {
      return "Chrome/Android chưa đăng ký được với dịch vụ thông báo. Vui lòng cập nhật Chrome, bật Google Play Services, mở MindUp lại rồi bấm Bật thông báo thêm một lần.";
    }
    return error?.message || "Chưa bật được thông báo. Vui lòng thử lại sau.";
  }

  async function subscribeBrowserPush(registration) {
    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }

  function subscriptionToRow(userId, subscription) {
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error("Push subscription is missing browser keys");
    }
    return {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      expiration_time: json.expirationTime ? new Date(json.expirationTime).toISOString() : null,
      user_agent: navigator.userAgent || null,
      revoked_at: null,
      last_seen_at: new Date().toISOString()
    };
  }

  async function saveSubscription(userId, subscription) {
    const client = await waitForSupabase();
    if (!client) throw new Error("Supabase is not ready");

    const { error } = await client
      .from("push_subscriptions")
      .upsert(subscriptionToRow(userId, subscription), { onConflict: "endpoint" });

    if (error) throw error;
  }

  function normalizeLocalNotificationUrl(value) {
    try {
      const url = new URL(value || "notifications.html", window.location.origin);
      if (url.origin !== window.location.origin) return "notifications.html";
      return `${url.pathname}${url.search}${url.hash}`.replace(/^\//, "") || "notifications.html";
    } catch (error) {
      return "notifications.html";
    }
  }

  function showLocalNotification(item) {
    if (!item || Notification.permission !== "granted") return;
    const notification = new Notification(item.title || "MindUp", {
      body: item.message || "Bạn có thông báo mới.",
      icon: "pwa-icon-192.png",
      badge: "pwa-icon-192.png",
      tag: item.id || `mindup-local-${Date.now()}`
    });
    notification.onclick = function(){
      window.focus();
      window.location.href = normalizeLocalNotificationUrl(item.target_url);
      notification.close();
    };
  }

  async function pollLocalNotifications(userId) {
    if (!userId || Notification.permission !== "granted" || localStorage.getItem(LOCAL_NOTIFY_ENABLED_KEY) !== "1") return;
    const client = await waitForSupabase();
    if (!client) return;

    const lastSeenAt = localStorage.getItem(LOCAL_NOTIFY_LAST_SEEN_KEY);
    if (!lastSeenAt) {
      localStorage.setItem(LOCAL_NOTIFY_LAST_SEEN_KEY, new Date().toISOString());
      return;
    }

    const { data, error } = await client
      .from("notifications")
      .select("id,title,message,target_url,created_at,is_read")
      .eq("user_id", userId)
      .eq("is_read", false)
      .gt("created_at", lastSeenAt)
      .order("created_at", { ascending: true })
      .limit(8);
    if (error) return;

    (data || []).forEach(showLocalNotification);
    const newest = (data || []).at(-1)?.created_at;
    if (newest) localStorage.setItem(LOCAL_NOTIFY_LAST_SEEN_KEY, newest);
  }

  function startLocalNotificationPolling(userId) {
    if (!userId || localNotificationPollTimer) return;
    pollLocalNotifications(userId).catch(() => {});
    localNotificationPollTimer = window.setInterval(() => {
      pollLocalNotifications(userId).catch(() => {});
    }, LOCAL_NOTIFY_POLL_MS);
  }

  function enableLocalNotifications(userId, resetSeen = false) {
    localStorage.setItem(LOCAL_NOTIFY_ENABLED_KEY, "1");
    if (resetSeen || !localStorage.getItem(LOCAL_NOTIFY_LAST_SEEN_KEY)) {
      localStorage.setItem(LOCAL_NOTIFY_LAST_SEEN_KEY, new Date().toISOString());
    }
    startLocalNotificationPolling(userId);
  }

  async function getSavedSubscription(endpoint) {
    const client = await waitForSupabase();
    if (!client || !endpoint) return null;
    const { data, error } = await client
      .from("push_subscriptions")
      .select("id, revoked_at")
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (error) return null;
    return data || null;
  }

  async function getServiceWorkerRegistration() {
    if (serviceWorkerRegistrationPromise) {
      const registered = await serviceWorkerRegistrationPromise;
      if (registered) return registered;
    }
    return navigator.serviceWorker.ready;
  }

  async function enablePushNotifications() {
    if (!isPushSupported()) throw new Error("Push notifications are not supported");
    if (!isPushConfigured()) throw new Error("Missing VAPID public key");

    const user = await getCurrentUser();
    if (!user?.id) throw new Error("User is not signed in");

    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, permission };

    let subscription = null;
    try {
      subscription = await ensurePushSubscription(user.id, { forceNew: true, repairRevoked: true });
    } catch (error) {
      if (!isPushServiceError(error)) throw error;
      enableLocalNotifications(user.id, true);
      removePrompt();
      return { ok: true, permission, localOnly: true };
    }
    enableLocalNotifications(user.id);
    removePrompt();
    return { ok: Boolean(subscription), permission };
  }

  async function ensurePushSubscription(userId, options = {}) {
    if (!isPushSupported() || !isPushConfigured() || Notification.permission !== "granted") return null;

    const registration = await getServiceWorkerRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && options.forceNew) {
      await subscription.unsubscribe().catch(() => false);
      subscription = null;
    }

    if (!subscription) {
      try {
        subscription = await subscribeBrowserPush(registration);
      } catch (error) {
        if (!isPushServiceError(error)) throw error;
        await registration.update().catch(() => null);
        await delay(600);
        subscription = await subscribeBrowserPush(registration);
      }
    } else if (options.repairRevoked) {
      const saved = await getSavedSubscription(subscription.endpoint);
      if (saved?.revoked_at) {
        await subscription.unsubscribe().catch(() => false);
        try {
          subscription = await subscribeBrowserPush(registration);
        } catch (error) {
          if (!isPushServiceError(error)) throw error;
          await registration.update().catch(() => null);
          await delay(600);
          subscription = await subscribeBrowserPush(registration);
        }
      }
    }

    await saveSubscription(userId, subscription);
    return subscription;
  }

  function shouldShowPrompt(user) {
    try {
      if (window.top !== window) return false;
    } catch (error) {
      return false;
    }
    if (!user?.id || !isMobileDevice() || !isPushSupported() || !isPushConfigured()) return false;
    return Notification.permission !== "granted";
  }

  function shouldShowInstallPrompt(user) {
    try {
      if (window.top !== window) return false;
    } catch (error) {
      return false;
    }
    return Boolean(user?.id && isMobileDevice() && !isStandaloneApp());
  }

  function ensurePromptStyles() {
    if (document.getElementById("mindupPushPromptStyles")) return;
    const style = document.createElement("style");
    style.id = "mindupPushPromptStyles";
    style.textContent = `
      .mindup-push-prompt {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 9999;
        width: min(360px, calc(100vw - 28px));
        padding: 16px;
        border: 1px solid rgba(15,31,61,.12);
        border-radius: 12px;
        background: rgba(255,255,255,.97);
        color: #1a2340;
        box-shadow: 0 18px 50px rgba(15,31,61,.16);
        font-family: var(--font-body, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      }
      .mindup-push-prompt strong {
        display: block;
        margin-bottom: 6px;
        color: #0f1f3d;
        font-size: .95rem;
      }
      .mindup-push-prompt p {
        margin: 0 0 12px;
        color: #4a5578;
        font-size: .86rem;
        line-height: 1.5;
      }
      .mindup-push-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }
      .mindup-push-actions button {
        min-height: 38px;
        border-radius: 8px;
        padding: 9px 13px;
        border: 1px solid rgba(15,31,61,.16);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .mindup-push-later {
        background: #fff;
        color: #4a5578;
      }
      .mindup-push-enable {
        border-color: #0f1f3d;
        background: #0f1f3d;
        color: #fff;
      }
      .mindup-push-status {
        margin-top: 10px;
        color: #b45309;
        font-size: .78rem;
      }
      .mindup-install-steps {
        margin: 0 0 12px;
        padding-left: 18px;
        color: #4a5578;
        font-size: .84rem;
        line-height: 1.5;
      }
      .mindup-install-steps li { margin: 2px 0; }
      @media (max-width: 640px) {
        .mindup-push-prompt {
          left: 14px;
          right: 14px;
          bottom: 14px;
          width: auto;
        }
        .mindup-push-actions button { flex: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  function removePrompt() {
    document.getElementById("mindupPushPrompt")?.remove();
  }

  function removeInstallPrompt() {
    document.getElementById("mindupInstallPrompt")?.remove();
  }

  function showInstallPrompt() {
    if (document.getElementById("mindupInstallPrompt") || isStandaloneApp()) return;
    ensurePromptStyles();

    const prompt = document.createElement("div");
    prompt.id = "mindupInstallPrompt";
    prompt.className = "mindup-push-prompt mindup-install-prompt";
    const isIos = isIosDevice();
    const canUseNativeInstall = Boolean(deferredInstallPrompt);
    prompt.innerHTML = isIos ? `
      <strong>Cài MindUp về màn hình chính</strong>
      <p>Mở MindUp như một ứng dụng riêng trên điện thoại để học, xem lịch học và nhận thông báo thuận tiện hơn.</p>
      <ol class="mindup-install-steps">
        <li>Chạm nút Chia sẻ trong Safari.</li>
        <li>Chọn Thêm vào màn hình chính.</li>
        <li>Mở MindUp từ biểu tượng mới tạo.</li>
      </ol>
      <div class="mindup-push-actions">
        <button class="mindup-push-later" type="button">Để sau</button>
        <button class="mindup-push-enable" type="button">Đã hiểu</button>
      </div>
    ` : `
      <strong>Cài app MindUp trên điện thoại</strong>
      <p>Thêm MindUp vào màn hình chính để mở nhanh như app, học thuận tiện hơn và nhận thông tin học tập kịp thời.</p>
      ${canUseNativeInstall ? "" : `
        <ol class="mindup-install-steps">
          <li>Chạm menu ba chấm của Chrome.</li>
          <li>Chọn Cài đặt ứng dụng hoặc Thêm vào màn hình chính.</li>
          <li>Mở MindUp từ biểu tượng mới tạo.</li>
        </ol>
      `}
      <div class="mindup-push-actions">
        <button class="mindup-push-later" type="button">Để sau</button>
        <button class="mindup-push-enable" type="button">${canUseNativeInstall ? "Cài app" : "Đã hiểu"}</button>
      </div>
    `;

    prompt.querySelector(".mindup-push-later").addEventListener("click", () => {
      removeInstallPrompt();
      window.setTimeout(initPushPrompt, 500);
    });
    prompt.querySelector(".mindup-push-enable").addEventListener("click", async () => {
      if (isIos || !deferredInstallPrompt) {
        removeInstallPrompt();
        window.setTimeout(initPushPrompt, 500);
        return;
      }
      const installEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      installEvent.prompt();
      const outcome = await installEvent.userChoice.catch(() => null);
      if (outcome?.outcome === "accepted") {
        localStorage.setItem(INSTALL_ACCEPTED_KEY, "1");
      }
      removeInstallPrompt();
      window.setTimeout(initPushPrompt, 500);
    });

    document.body.appendChild(prompt);
  }

  function showPrompt() {
    if (document.getElementById("mindupPushPrompt")) return;
    ensurePromptStyles();

    const prompt = document.createElement("div");
    prompt.id = "mindupPushPrompt";
    prompt.className = "mindup-push-prompt";
    const blocked = Notification.permission === "denied";
    const androidHint = isAndroidDevice()
      ? " Nếu đang dùng Android, hãy kiểm tra thêm quyền thông báo của Chrome và app MindUp trong Cài đặt điện thoại."
      : "";
    prompt.innerHTML = `
      <strong>Bật thông báo MindUp</strong>
      <p>Cho phép thông báo để nhận thông tin học tập, lịch học, học phí và trạng thái mới kịp thời.</p>
      ${blocked ? `<p>Thông báo đang bị chặn trên trình duyệt hoặc hệ điều hành.${androidHint}</p>` : ""}
      <div class="mindup-push-actions">
        <button class="mindup-push-later" type="button">Để sau</button>
        <button class="mindup-push-enable" type="button">Bật thông báo</button>
      </div>
      <div class="mindup-push-status" hidden></div>
    `;

    const status = prompt.querySelector(".mindup-push-status");
    prompt.querySelector(".mindup-push-later").addEventListener("click", () => {
      removePrompt();
    });
    prompt.querySelector(".mindup-push-enable").addEventListener("click", async () => {
      status.hidden = true;
      if (Notification.permission === "denied") {
        status.textContent = "Thông báo đang bị chặn. Vui lòng mở Cài đặt của Chrome hoặc app MindUp, sau đó bật quyền Thông báo.";
        status.hidden = false;
        return;
      }
      try {
        const result = await enablePushNotifications();
        if (!result.ok) {
          status.textContent = "Bạn có thể bật lại thông báo trong cài đặt trình duyệt hoặc cài đặt app MindUp.";
          status.hidden = false;
        }
      } catch (error) {
        console.warn("MindUp push subscription failed:", error);
        const detail = [error?.name, error?.message].filter(Boolean).join(": ");
        const friendly = getFriendlyPushError(error);
        status.textContent = isPushServiceError(error)
          ? friendly
          : (detail ? `Chưa bật được thông báo: ${detail}` : friendly);
        status.hidden = false;
      }
    });

    document.body.appendChild(prompt);
  }

  async function initPushPrompt() {
    const user = await getCurrentUser();
    if (!user?.id || !isPushSupported()) return;
    if (Notification.permission === "granted") {
      const subscription = await ensurePushSubscription(user.id, { repairRevoked: true }).catch((error) => {
        console.warn("MindUp push auto repair failed:", error);
        if (isPushServiceError(error)) enableLocalNotifications(user.id);
        return null;
      });
      if (subscription) enableLocalNotifications(user.id);
      if (!subscription && localStorage.getItem(LOCAL_NOTIFY_ENABLED_KEY) !== "1") showPrompt();
      return;
    }
    if (document.getElementById("mindupInstallPrompt")) return;
    if (shouldShowPrompt(user)) showPrompt();
  }

  async function initInstallPrompt() {
    const user = await getCurrentUser();
    if (shouldShowInstallPrompt(user)) showInstallPrompt();
  }

  async function watchAuthForPrompts() {
    const client = await waitForSupabase();
    if (!client?.auth?.onAuthStateChange) return;
    client.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" || !session?.user) return;
      window.setTimeout(initInstallPrompt, 500);
      window.setTimeout(initPushPrompt, 1800);
    });
  }

  window.MindUpPush = {
    enable: enablePushNotifications,
    isConfigured: isPushConfigured,
    isSupported: isPushSupported
  };

  window.addEventListener("load", function(){
    window.setTimeout(initInstallPrompt, PROMPT_DELAY_MS);
    window.setTimeout(initPushPrompt, PROMPT_DELAY_MS + 1600);
    watchAuthForPrompts();
  });
})();
