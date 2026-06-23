(function registerMindUpPwa(){
  const VAPID_PUBLIC_KEY = "BFeo1qo3R-OG_92Fh36HtY12Gae0G27neKtmXn2KS9KoG_gbOS3BRPKUH7uWij7544kuU0a4VL4x3EP4iwYsu2o";
  const INSTALL_ACCEPTED_KEY = "mindup_install_prompt_accepted";
  const LOCAL_NOTIFY_ENABLED_KEY = "mindup_local_notifications_enabled";
  const LOCAL_NOTIFY_LAST_SEEN_KEY = "mindup_local_notifications_last_seen_at";
  const LOCAL_NOTIFY_POLL_MS = 30000;
  const PROMPT_DELAY_MS = 1400;
  const PUSH_RECEIPT_KEY = "/__mindup_last_push_receipt__";

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
        .then(function(registration){
          registration.update().catch(function(){});
          return registration;
        })
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
    const iosUserAgent = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const ipadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const localPreview = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
      && new URLSearchParams(location.search).get("ios_guide") === "1";
    return iosUserAgent || ipadDesktopMode || localPreview;
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

    const row = subscriptionToRow(userId, subscription);
    const { error } = await client.rpc("upsert_my_push_subscription", {
      p_endpoint: row.endpoint,
      p_p256dh: row.p256dh,
      p_auth: row.auth,
      p_expiration_time: row.expiration_time,
      p_user_agent: row.user_agent
    });

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

  async function showLocalNotification(item) {
    if (!item || Notification.permission !== "granted") return;
    const options = {
      body: item.message || "Bạn có thông báo mới.",
      icon: "pwa-icon-192.png",
      badge: "pwa-icon-192.png",
      tag: item.id || `mindup-local-${Date.now()}`,
      data: {
        url: normalizeLocalNotificationUrl(item.target_url),
        notificationId: item.id || null
      }
    };

    if ("serviceWorker" in navigator) {
      const registration = await getServiceWorkerRegistration().catch(() => null);
      if (registration?.showNotification) {
        await registration.showNotification(item.title || "MindUp", options);
        return;
      }
    }

    const notification = new Notification(item.title || "MindUp", options);
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

    await Promise.all((data || []).map((item) => showLocalNotification(item).catch(() => null)));
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

  async function getLastPushReceipt() {
    if (!("caches" in window)) return null;
    try {
      const response = await caches.match(PUSH_RECEIPT_KEY);
      if (!response) return null;
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async function showServiceWorkerTestNotification() {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      throw new Error("Notification permission is not granted");
    }
    const registration = await getServiceWorkerRegistration();
    if (!registration?.showNotification) throw new Error("Service worker notification is not ready");
    await registration.showNotification("MindUp kiểm tra hiển thị", {
      body: "Nếu thấy thông báo này, quyền hiển thị thông báo trên thiết bị đang hoạt động.",
      icon: "pwa-icon-192.png",
      badge: "pwa-icon-192.png",
      tag: `mindup-local-test-${Date.now()}`,
      renotify: true,
      timestamp: Date.now(),
      vibrate: [160, 80, 160],
      data: { url: "push_debug.html", notificationId: null }
    });
    return { ok: true };
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

    enableLocalNotifications(user.id, true);
    const subscription = await ensurePushSubscription(user.id, { repairRevoked: true });
    removePrompt();
    return { ok: Boolean(subscription), permission, endpoint: subscription?.endpoint || "" };
  }

  async function getPushDiagnostics() {
    const user = await getCurrentUser();
    const diagnostics = {
      userId: user?.id || null,
      supported: isPushSupported(),
      configured: isPushConfigured(),
      secureContext: window.isSecureContext,
      permission: "Notification" in window ? Notification.permission : "unsupported",
      hasServiceWorker: "serviceWorker" in navigator,
      hasPushManager: "PushManager" in window,
      hasNotificationApi: "Notification" in window,
      hasController: Boolean(navigator.serviceWorker?.controller),
      standalone: isStandaloneApp(),
      mobile: isMobileDevice(),
      android: isAndroidDevice(),
      localFallbackEnabled: localStorage.getItem(LOCAL_NOTIFY_ENABLED_KEY) === "1",
      subscription: null,
      savedSubscription: null,
      serviceWorker: null,
      lastPushReceipt: await getLastPushReceipt(),
      error: null
    };

    try {
      const registration = await getServiceWorkerRegistration();
      diagnostics.serviceWorker = {
        scope: registration.scope || "",
        activeState: registration.active?.state || null,
        waitingState: registration.waiting?.state || null,
        installingState: registration.installing?.state || null
      };
      if (!diagnostics.supported || diagnostics.permission !== "granted") return diagnostics;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return diagnostics;
      const json = subscription.toJSON();
      diagnostics.subscription = {
        endpoint: json.endpoint || "",
        hasP256dh: Boolean(json.keys?.p256dh),
        hasAuth: Boolean(json.keys?.auth),
        expirationTime: json.expirationTime || null
      };
      diagnostics.savedSubscription = await getSavedSubscription(json.endpoint);
    } catch (error) {
      diagnostics.error = [error?.name, error?.message].filter(Boolean).join(": ") || String(error || "");
    }
    return diagnostics;
  }

  async function sendTestPushToCurrentUser(options = {}) {
    const user = await getCurrentUser();
    if (!user?.id) throw new Error("User is not signed in");
    const client = await waitForSupabase();
    if (!client) throw new Error("Supabase is not ready");
    const headers = window.AppAuth?.getEdgeFunctionHeaders
      ? await window.AppAuth.getEdgeFunctionHeaders()
      : null;
    if (!headers) throw new Error("Missing session token");

    const response = await fetch(`${window.SUPABASE_URL || ""}/functions/v1/send-push-notification`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        userIds: [user.id],
        title: options.title || "MindUp test",
        message: options.message || "Thong bao day thu nghiem tu MindUp.",
        targetUrl: options.targetUrl || "notifications.html",
        type: options.type || "system",
        debug: true
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || "Push notification failed");
    return body;
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
    const localPreview = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
      && new URLSearchParams(location.search).get("ios_guide") === "1";
    if (localPreview) return !isStandaloneApp();
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
      .mindup-install-prompt.is-ios-guide {
        left: 50%;
        right: auto;
        bottom: max(12px, env(safe-area-inset-bottom));
        width: min(760px, calc(100vw - 24px));
        max-height: calc(100dvh - max(24px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
        padding: 0;
        overflow: hidden;
        transform: translateX(-50%);
        border-radius: 20px;
      }
      .mindup-ios-guide-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 18px 18px 12px;
        border-bottom: 1px solid rgba(15,31,61,.08);
        background: #fff;
      }
      .mindup-ios-guide-head strong {
        margin: 0 0 4px;
        font-size: 1.08rem;
      }
      .mindup-ios-guide-head p {
        margin: 0;
        font-size: .8rem;
      }
      .mindup-ios-guide-badge {
        flex: 0 0 auto;
        padding: 5px 9px;
        border-radius: 999px;
        background: #eef5ff;
        color: #1556a0;
        font-size: .72rem;
        font-weight: 800;
      }
      .mindup-ios-guide-scroll {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(190px, 1fr);
        gap: 10px;
        padding: 14px 14px 16px;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        background: #f4f7fb;
        -webkit-overflow-scrolling: touch;
      }
      .mindup-ios-guide-scroll::-webkit-scrollbar { display: none; }
      .mindup-ios-step {
        min-width: 0;
        padding: 10px;
        border: 1px solid rgba(15,31,61,.09);
        border-radius: 14px;
        background: #fff;
        scroll-snap-align: center;
      }
      .mindup-ios-step-number {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        margin-bottom: 8px;
        border-radius: 50%;
        background: #0f1f3d;
        color: #fff;
        font-size: .74rem;
        font-weight: 800;
      }
      .mindup-ios-step-title {
        min-height: 38px;
        color: #0f1f3d;
        font-size: .84rem;
        font-weight: 800;
        line-height: 1.35;
      }
      .mindup-ios-step-copy {
        min-height: 36px;
        margin: 4px 0 9px;
        color: #5f6b82;
        font-size: .72rem;
        line-height: 1.4;
      }
      .mindup-ios-picture {
        position: relative;
        height: 186px;
        overflow: hidden;
        border: 5px solid #182238;
        border-radius: 22px;
        background: #f7f9fc;
        box-shadow: 0 8px 20px rgba(15,31,61,.12);
      }
      .mindup-ios-picture::before {
        content: "";
        position: absolute;
        top: 4px;
        left: 50%;
        z-index: 3;
        width: 48px;
        height: 10px;
        transform: translateX(-50%);
        border-radius: 999px;
        background: #182238;
      }
      .mindup-ios-safari-bar {
        position: absolute;
        left: 7px;
        right: 7px;
        bottom: 7px;
        z-index: 2;
        display: grid;
        grid-template-columns: 24px 1fr 24px;
        align-items: center;
        gap: 5px;
        min-height: 35px;
        padding: 5px;
        border-radius: 11px;
        background: rgba(255,255,255,.98);
        box-shadow: 0 3px 12px rgba(15,31,61,.2);
      }
      .mindup-ios-address {
        overflow: hidden;
        color: #475569;
        font-size: .58rem;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mindup-ios-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 7px;
        color: #1269d3;
        font-size: 1rem;
        font-weight: 800;
      }
      .mindup-ios-icon-button.is-highlighted {
        background: #dbeafe;
        box-shadow: 0 0 0 3px rgba(37,99,235,.2);
      }
      .mindup-ios-site {
        position: absolute;
        inset: 0 0 42px;
        display: grid;
        place-items: center;
        padding: 20px 10px 8px;
        background: linear-gradient(155deg,#fff9eb,#eef6ff);
      }
      .mindup-ios-site-card {
        width: 86%;
        padding: 14px 8px;
        border-radius: 12px;
        background: #fff;
        color: #0f1f3d;
        box-shadow: 0 7px 18px rgba(15,31,61,.1);
        text-align: center;
      }
      .mindup-ios-logo {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        margin: 0 auto 7px;
        border-radius: 11px;
        background: linear-gradient(145deg,#10284c,#225a98);
        color: #f6b53b;
        font-family: Georgia, serif;
        font-size: 1.35rem;
        font-weight: 800;
      }
      .mindup-ios-site-card b { display: block; font-size: .72rem; }
      .mindup-ios-site-card span { color: #64748b; font-size: .56rem; }
      .mindup-ios-site-card .mindup-ios-logo { color: #f6b53b; font-size: 1.35rem; }
      .mindup-ios-sheet {
        position: absolute;
        inset: 25px 5px 5px;
        padding: 9px 7px;
        border-radius: 16px;
        background: #f7f7f9;
        box-shadow: 0 -8px 22px rgba(15,31,61,.18);
      }
      .mindup-ios-sheet-handle {
        width: 30px;
        height: 4px;
        margin: 0 auto 8px;
        border-radius: 999px;
        background: #c8ced8;
      }
      .mindup-ios-share-row {
        display: flex;
        gap: 7px;
        margin-bottom: 8px;
      }
      .mindup-ios-share-person {
        width: 31px;
        height: 31px;
        border-radius: 50%;
        background: #dce7f7;
      }
      .mindup-ios-menu-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 28px;
        padding: 0 8px;
        border-bottom: 1px solid #e3e6eb;
        background: #fff;
        color: #1f2937;
        font-size: .62rem;
      }
      .mindup-ios-menu-row:first-of-type { border-radius: 9px 9px 0 0; }
      .mindup-ios-menu-row:last-of-type { border-bottom: 0; border-radius: 0 0 9px 9px; }
      .mindup-ios-menu-row.is-highlighted {
        position: relative;
        z-index: 1;
        background: #eaf3ff;
        color: #075db8;
        font-weight: 800;
        box-shadow: 0 0 0 2px #60a5fa;
      }
      .mindup-ios-add-screen {
        position: absolute;
        inset: 0;
        padding: 22px 9px 9px;
        background: #f7f7f9;
      }
      .mindup-ios-add-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
        color: #1269d3;
        font-size: .62rem;
      }
      .mindup-ios-add-top b { color: #111827; font-size: .68rem; }
      .mindup-ios-add-top .is-highlighted {
        padding: 4px 7px;
        border-radius: 7px;
        background: #dbeafe;
        box-shadow: 0 0 0 2px #60a5fa;
        font-weight: 800;
      }
      .mindup-ios-app-preview {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 10px;
        border-radius: 11px;
        background: #fff;
      }
      .mindup-ios-app-preview .mindup-ios-logo {
        width: 39px;
        height: 39px;
        margin: 0;
        flex: 0 0 auto;
      }
      .mindup-ios-app-name { display: block; color: #111827; font-size: .7rem; font-weight: 800; }
      .mindup-ios-app-url { display: block; color: #64748b; font-size: .54rem; }
      .mindup-ios-home-screen {
        position: absolute;
        inset: 0;
        padding: 32px 14px 12px;
        background: linear-gradient(155deg,#d8ecff,#f8e6f0 55%,#fff1d6);
      }
      .mindup-ios-home-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 14px 9px;
      }
      .mindup-ios-home-app {
        display: grid;
        justify-items: center;
        gap: 4px;
        color: #334155;
        font-size: .5rem;
      }
      .mindup-ios-home-app i {
        width: 34px;
        height: 34px;
        border-radius: 9px;
        background: rgba(255,255,255,.82);
        box-shadow: 0 3px 8px rgba(15,31,61,.12);
      }
      .mindup-ios-home-app.mindup i {
        display: grid;
        place-items: center;
        background: linear-gradient(145deg,#10284c,#225a98);
        color: #f6b53b;
        font-family: Georgia, serif;
        font-size: 1rem;
        font-style: normal;
        font-weight: 800;
        box-shadow: 0 0 0 3px #fff, 0 0 0 5px #60a5fa;
      }
      .mindup-ios-guide-note {
        margin: 0;
        padding: 0 18px 12px;
        color: #5f6b82;
        font-size: .76rem;
        line-height: 1.45;
        background: #fff;
      }
      .mindup-install-prompt.is-ios-guide .mindup-push-actions {
        padding: 0 18px max(16px, env(safe-area-inset-bottom));
        background: #fff;
      }
      @media (max-width: 640px) {
        .mindup-push-prompt {
          left: 14px;
          right: 14px;
          bottom: 14px;
          width: auto;
        }
        .mindup-push-actions button { flex: 1; }
        .mindup-install-prompt.is-ios-guide {
          left: max(8px, env(safe-area-inset-left));
          right: max(8px, env(safe-area-inset-right));
          bottom: max(8px, env(safe-area-inset-bottom));
          width: auto;
          max-height: calc(100dvh - max(16px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
          transform: none;
          overflow-y: auto;
        }
        .mindup-ios-guide-head { padding: 14px 14px 10px; }
        .mindup-ios-guide-scroll {
          grid-auto-columns: minmax(78vw, 280px);
          padding: 12px;
        }
        .mindup-ios-picture { height: 200px; }
        .mindup-ios-guide-note { padding: 0 14px 10px; }
        .mindup-install-prompt.is-ios-guide .mindup-push-actions {
          position: sticky;
          bottom: 0;
          padding: 10px 14px max(12px, env(safe-area-inset-bottom));
          border-top: 1px solid rgba(15,31,61,.08);
        }
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
    if (isIos) prompt.classList.add("is-ios-guide");
    prompt.innerHTML = isIos ? `
      <div class="mindup-ios-guide-head">
        <div>
          <strong>Cài MindUp trên iPhone</strong>
          <p>Vuốt ngang qua từng hình và làm theo các bước dưới đây.</p>
        </div>
        <span class="mindup-ios-guide-badge">Safari</span>
      </div>
      <div class="mindup-ios-guide-scroll" aria-label="Hướng dẫn cài MindUp trên iPhone">
        <article class="mindup-ios-step">
          <span class="mindup-ios-step-number">1</span>
          <div class="mindup-ios-step-title">Mở MindUp bằng Safari</div>
          <div class="mindup-ios-step-copy">Nếu đang ở Chrome, hãy sao chép đường dẫn và mở lại trong Safari.</div>
          <div class="mindup-ios-picture" aria-label="Hình minh họa mở trang MindUp trong Safari">
            <div class="mindup-ios-site">
              <div class="mindup-ios-site-card">
                <span class="mindup-ios-logo">M</span>
                <b>MindUp</b>
                <span>www.mindup.edu.vn</span>
              </div>
            </div>
            <div class="mindup-ios-safari-bar">
              <span class="mindup-ios-icon-button">‹</span>
              <span class="mindup-ios-address">mindup.edu.vn</span>
              <span class="mindup-ios-icon-button">⋯</span>
            </div>
          </div>
        </article>
        <article class="mindup-ios-step">
          <span class="mindup-ios-step-number">2</span>
          <div class="mindup-ios-step-title">Nhấn nút Chia sẻ</div>
          <div class="mindup-ios-step-copy">Nút hình ô vuông có mũi tên hướng lên nằm trên thanh Safari.</div>
          <div class="mindup-ios-picture" aria-label="Hình minh họa nút Chia sẻ của Safari">
            <div class="mindup-ios-site">
              <div class="mindup-ios-site-card">
                <span class="mindup-ios-logo">M</span>
                <b>MindUp</b>
                <span>Trang học tập</span>
              </div>
            </div>
            <div class="mindup-ios-safari-bar">
              <span class="mindup-ios-icon-button">‹</span>
              <span class="mindup-ios-address">mindup.edu.vn</span>
              <span class="mindup-ios-icon-button is-highlighted">⇧</span>
            </div>
          </div>
        </article>
        <article class="mindup-ios-step">
          <span class="mindup-ios-step-number">3</span>
          <div class="mindup-ios-step-title">Chọn “Thêm vào Màn hình chính”</div>
          <div class="mindup-ios-step-copy">Kéo bảng Chia sẻ lên nếu chưa nhìn thấy lựa chọn này.</div>
          <div class="mindup-ios-picture" aria-label="Hình minh họa chọn Thêm vào Màn hình chính">
            <div class="mindup-ios-sheet">
              <div class="mindup-ios-sheet-handle"></div>
              <div class="mindup-ios-share-row">
                <span class="mindup-ios-share-person"></span>
                <span class="mindup-ios-share-person"></span>
                <span class="mindup-ios-share-person"></span>
              </div>
              <div class="mindup-ios-menu-row"><span>Sao chép</span><span>▣</span></div>
              <div class="mindup-ios-menu-row"><span>Thêm dấu trang</span><span>☆</span></div>
              <div class="mindup-ios-menu-row is-highlighted"><span>Thêm vào Màn hình chính</span><span>＋</span></div>
              <div class="mindup-ios-menu-row"><span>In</span><span>▤</span></div>
            </div>
          </div>
        </article>
        <article class="mindup-ios-step">
          <span class="mindup-ios-step-number">4</span>
          <div class="mindup-ios-step-title">Nhấn “Thêm”</div>
          <div class="mindup-ios-step-copy">Kiểm tra tên MindUp, sau đó nhấn Thêm ở góc trên bên phải.</div>
          <div class="mindup-ios-picture" aria-label="Hình minh họa nút Thêm ứng dụng MindUp">
            <div class="mindup-ios-add-screen">
              <div class="mindup-ios-add-top">
                <span>Hủy</span>
                <b>Thêm vào MH chính</b>
                <span class="is-highlighted">Thêm</span>
              </div>
              <div class="mindup-ios-app-preview">
                <span class="mindup-ios-logo">M</span>
                <span>
                  <span class="mindup-ios-app-name">MindUp</span>
                  <span class="mindup-ios-app-url">mindup.edu.vn</span>
                </span>
              </div>
            </div>
          </div>
        </article>
        <article class="mindup-ios-step">
          <span class="mindup-ios-step-number">✓</span>
          <div class="mindup-ios-step-title">Mở từ màn hình chính</div>
          <div class="mindup-ios-step-copy">Chạm biểu tượng MindUp. Sau đó bạn có thể bật thông báo trong app.</div>
          <div class="mindup-ios-picture" aria-label="Hình minh họa biểu tượng MindUp trên màn hình chính">
            <div class="mindup-ios-home-screen">
              <div class="mindup-ios-home-grid">
                <span class="mindup-ios-home-app"><i></i><span>Ảnh</span></span>
                <span class="mindup-ios-home-app"><i></i><span>Lịch</span></span>
                <span class="mindup-ios-home-app"><i></i><span>Ghi chú</span></span>
                <span class="mindup-ios-home-app"><i></i><span>Safari</span></span>
                <span class="mindup-ios-home-app mindup"><i>M</i><span>MindUp</span></span>
                <span class="mindup-ios-home-app"><i></i><span>Cài đặt</span></span>
              </div>
            </div>
          </div>
        </article>
      </div>
      <p class="mindup-ios-guide-note">iPhone không cho website tự mở nút cài đặt. Bạn chỉ cần thực hiện các bước này trong Safari một lần.</p>
      <div class="mindup-push-actions">
        <button class="mindup-push-later" type="button">Để sau</button>
        <button class="mindup-push-enable" type="button">Đã cài xong</button>
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
      enableLocalNotifications(user.id);
      const subscription = await ensurePushSubscription(user.id, { repairRevoked: true }).catch((error) => {
        console.warn("MindUp push auto repair failed:", error);
        return null;
      });
      if (!subscription) showPrompt();
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
    diagnostics: getPushDiagnostics,
    sendTestToCurrentUser: sendTestPushToCurrentUser,
    showServiceWorkerTest: showServiceWorkerTestNotification,
    isConfigured: isPushConfigured,
    isSupported: isPushSupported
  };

  window.addEventListener("load", function(){
    window.setTimeout(initInstallPrompt, PROMPT_DELAY_MS);
    window.setTimeout(initPushPrompt, PROMPT_DELAY_MS + 1600);
    watchAuthForPrompts();
  });
})();
