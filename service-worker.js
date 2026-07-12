const CACHE_VERSION = "mindup-pwa-v29";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const PUSH_RECEIPT_CACHE = `${CACHE_VERSION}-push-receipts`;
const PUSH_RECEIPT_KEY = "/__mindup_last_push_receipt__";

const APP_SHELL = [
  "dashboard.html",
  "tasks.html",
  "tasks.js",
  "offline.html",
  "theme.css?v=20260615-ios1",
  "supabaseClient.js",
  "pwa.js?v=20260709-notification-fix1",
  "push_debug.html",
  "manifest.webmanifest",
  "favicon.png",
  "apple-touch-icon.png",
  "pwa-icon-192.png",
  "pwa-icon-512.png",
  "pwa-icon-maskable-512.png"
];

const CACHEABLE_DESTINATIONS = new Set([
  "document",
  "script",
  "style",
  "image",
  "font",
  "manifest"
]);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("mindup-pwa-") && ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (
    url.pathname.endsWith("/pwa.js") ||
    url.pathname.endsWith("/supabaseClient.js") ||
    url.pathname.endsWith("/service-worker.js")
  ) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  if (CACHEABLE_DESTINATIONS.has(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("push", event => {
  const payload = readPushPayload(event);
  const title = payload.title || "MindUp";
  const options = {
    body: payload.body || payload.message || "Bạn có thông báo mới.",
    icon: payload.icon || "pwa-icon-192.png",
    badge: payload.badge || "pwa-icon-192.png",
    tag: payload.tag || payload.notificationId || `mindup-${Date.now()}`,
    renotify: payload.renotify !== false,
    timestamp: Date.now(),
    vibrate: payload.vibrate || [160, 80, 160],
    data: {
      url: payload.url || payload.target_url || "messages.html",
      notificationId: payload.notificationId || payload.id || null,
      receivedAt: new Date().toISOString()
    }
  };

  event.waitUntil((async () => {
    await rememberPushReceipt(payload, options).catch(() => null);
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = normalizeClientUrl(event.notification.data?.url || "messages.html");

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windowClients) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) return client.navigate(targetUrl);
        return;
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    return cached || caches.match("offline.html");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fresh = fetch(request)
    .then(response => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || fresh;
}

async function networkFirstAsset(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    return cache.match(request);
  }
}

function readPushPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch (error) {
    return { body: event.data.text() };
  }
}

function normalizeClientUrl(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return "messages.html";
    return url.href;
  } catch (error) {
    return "messages.html";
  }
}

async function rememberPushReceipt(payload, options) {
  const cache = await caches.open(PUSH_RECEIPT_CACHE);
  const receipt = {
    receivedAt: options.data.receivedAt,
    title: payload.title || "MindUp",
    body: payload.body || payload.message || "",
    notificationId: payload.notificationId || payload.id || null,
    type: payload.type || null,
    tag: options.tag,
    url: options.data.url,
    swVersion: CACHE_VERSION
  };
  await cache.put(PUSH_RECEIPT_KEY, new Response(JSON.stringify(receipt), {
    headers: { "Content-Type": "application/json" }
  }));
}
