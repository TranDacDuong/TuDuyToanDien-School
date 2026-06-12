(function registerMindUpPwa(){
  const VAPID_PUBLIC_KEY = "REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY";
  const DISMISSED_KEY = "mindup_push_prompt_dismissed_at";
  const PROMPT_DELAY_MS = 1400;

  let serviceWorkerRegistrationPromise = null;

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
    return {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh || null,
      auth: json.keys?.auth || null,
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

    const registration = await getServiceWorkerRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    await saveSubscription(user.id, subscription);
    removePrompt();
    return { ok: true, permission };
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
        status.textContent = "Chưa bật được thông báo. Vui lòng thử lại sau.";
        status.hidden = false;
      }
    });

    document.body.appendChild(prompt);
  }

  async function initPushPrompt() {
    const user = await getCurrentUser();
    if (shouldShowPrompt(user)) showPrompt();
  }

  window.MindUpPush = {
    enable: enablePushNotifications,
    isConfigured: isPushConfigured,
    isSupported: isPushSupported
  };

  window.addEventListener("load", function(){
    window.setTimeout(initPushPrompt, PROMPT_DELAY_MS);
  });
})();
