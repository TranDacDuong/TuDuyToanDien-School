const CACHE_VERSION = "mindup-pwa-v4";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  "dashboard.html",
  "offline.html",
  "theme.css?v=20260604-mindup-navy1",
  "supabaseClient.js",
  "pwa.js",
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

  if (url.pathname.endsWith("/pwa.js") || url.pathname.endsWith("/service-worker.js")) {
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
    tag: payload.tag || payload.notificationId || payload.type || "mindup-notification",
    renotify: Boolean(payload.renotify),
    data: {
      url: payload.url || payload.target_url || "notifications.html",
      notificationId: payload.notificationId || payload.id || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = normalizeClientUrl(event.notification.data?.url || "notifications.html");

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
    if (url.origin !== self.location.origin) return "notifications.html";
    return url.href;
  } catch (error) {
    return "notifications.html";
  }
}
