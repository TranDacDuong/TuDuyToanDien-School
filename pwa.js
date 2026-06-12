(function registerMindUpPwa(){
  const VAPID_PUBLIC_KEY = "BFeo1qo3R-OG_92Fh36HtY12Gae0G27neKtmXn2KS9KoG_gbOS3BRPKUH7uWij7544kuU0a4VL4x3EP4iwYsu2o";
  const DISMISSED_KEY = "mindup_push_prompt_dismissed_at";
  const INSTALL_DISMISSED_KEY = "mindup_install_prompt_dismissed_at";
  const INSTALL_ACCEPTED_KEY = "mindup_install_prompt_accepted";
  const PROMPT_DELAY_MS = 1400;

  let serviceWorkerRegistrationPromise = null;
  let deferredInstallPrompt = null;

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

    const subscription = await ensurePushSubscription(user.id, { forceNew: true, repairRevoked: true });
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
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    } else if (options.repairRevoked) {
      const saved = await getSavedSubscription(subscription.endpoint);
      if (saved?.revoked_at) {
        await subscription.unsubscribe().catch(() => false);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
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
    if (!user?.id || !isPushSupported() || !isPushConfigured()) return false;
    if (Notification.permission !== "default") return false;
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    return !dismissedAt || Date.now() - dismissedAt > 7 * 24 * 60 * 60 * 1000;
  }

  function shouldShowInstallPrompt(user) {
    try {
      if (window.top !== window) return false;
    } catch (error) {
      return false;
    }
    if (!user?.id || isStandaloneApp() || !isMobileDevice()) return false;
    if (localStorage.getItem(INSTALL_ACCEPTED_KEY) === "1") return false;
    if (!deferredInstallPrompt && !isIosDevice()) return false;
    const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISSED_KEY) || 0);
    return !dismissedAt || Date.now() - dismissedAt > 3 * 24 * 60 * 60 * 1000;
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
    prompt.innerHTML = isIos ? `
      <strong>Cai MindUp ve man hinh chinh</strong>
      <p>Mo MindUp nhu mot ung dung rieng tren dien thoai de hoc va nhan thong bao nhanh hon.</p>
      <ol class="mindup-install-steps">
        <li>Cham nut Chia se trong Safari.</li>
        <li>Chon Them vao man hinh chinh.</li>
        <li>Mo MindUp tu icon moi tao.</li>
      </ol>
      <div class="mindup-push-actions">
        <button class="mindup-push-later" type="button">De sau</button>
        <button class="mindup-push-enable" type="button">Da hieu</button>
      </div>
    ` : `
      <strong>Cai app MindUp?</strong>
      <p>Them MindUp vao dien thoai de mo nhanh nhu app va tiep tuc su dung thuan tien hon sau khi dang nhap.</p>
      <div class="mindup-push-actions">
        <button class="mindup-push-later" type="button">De sau</button>
        <button class="mindup-push-enable" type="button">Cai app</button>
      </div>
    `;

    prompt.querySelector(".mindup-push-later").addEventListener("click", () => {
      localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
      removeInstallPrompt();
      window.setTimeout(initPushPrompt, 500);
    });
    prompt.querySelector(".mindup-push-enable").addEventListener("click", async () => {
      if (isIos) {
        localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
        removeInstallPrompt();
        window.setTimeout(initPushPrompt, 500);
        return;
      }
      if (!deferredInstallPrompt) return;
      const installEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      installEvent.prompt();
      const outcome = await installEvent.userChoice.catch(() => null);
      if (outcome?.outcome === "accepted") {
        localStorage.setItem(INSTALL_ACCEPTED_KEY, "1");
      } else {
        localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
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
    prompt.innerHTML = `
      <strong>Bật thông báo MindUp?</strong>
      <p>Nhận nhắc học phí, lịch học và trạng thái mới ngay cả khi bạn không mở trang.</p>
      <div class="mindup-push-actions">
        <button class="mindup-push-later" type="button">Để sau</button>
        <button class="mindup-push-enable" type="button">Bật thông báo</button>
      </div>
      <div class="mindup-push-status" hidden></div>
    `;

    const status = prompt.querySelector(".mindup-push-status");
    prompt.querySelector(".mindup-push-later").addEventListener("click", () => {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
      removePrompt();
    });
    prompt.querySelector(".mindup-push-enable").addEventListener("click", async () => {
      status.hidden = true;
      try {
        const result = await enablePushNotifications();
        if (!result.ok) {
          status.textContent = "Bạn có thể bật lại thông báo trong cài đặt trình duyệt.";
          status.hidden = false;
        }
      } catch (error) {
        console.warn("MindUp push subscription failed:", error);
        const detail = [error?.name, error?.message].filter(Boolean).join(": ");
        status.textContent = detail
          ? `Chưa bật được thông báo: ${detail}`
          : "Chưa bật được thông báo. Vui lòng thử lại sau.";
        status.hidden = false;
      }
    });

    document.body.appendChild(prompt);
  }

  async function initPushPrompt() {
    const user = await getCurrentUser();
    if (user?.id && Notification.permission === "granted") {
      await ensurePushSubscription(user.id, { repairRevoked: true }).catch((error) => {
        console.warn("MindUp push auto repair failed:", error);
      });
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
