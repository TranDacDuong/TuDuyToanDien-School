import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  title: string | null;
  message: string | null;
  target_url: string | null;
  meta: Record<string, unknown> | null;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return Deno.env.get(name) || "";
}

function restHeaders(serviceRole = false, accessToken = "") {
  const key = serviceRole ? env("SUPABASE_SERVICE_ROLE_KEY") : env("SUPABASE_ANON_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${accessToken || key}`,
    "Content-Type": "application/json",
  };
}

async function requireAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const supabaseUrl = env("SUPABASE_URL");
  if (!accessToken || !supabaseUrl || !env("SUPABASE_ANON_KEY")) {
    throw new Error("Authentication required");
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: restHeaders(false, accessToken),
  });
  const user = await res.json().catch(() => ({}));
  if (!res.ok || !user?.id) throw new Error("Authentication required");
  return { user, accessToken };
}

async function fetchJson<T>(path: string, init: RequestInit = {}) {
  const supabaseUrl = env("SUPABASE_URL");
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...restHeaders(true), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { message?: string })?.message || res.statusText);
  return data as T;
}

async function getUserRole(userId: string) {
  const rows = await fetchJson<Array<{ role: string }>>(
    `users?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,
  );
  return rows[0]?.role || "";
}

function isPrivileged(role: string) {
  return role === "admin" || role === "teacher";
}

function assertVapidConfigured() {
  const subject = env("VAPID_SUBJECT") || "mailto:admin@mindup.edu.vn";
  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) throw new Error("Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || "").trim()).filter(Boolean))];
}

async function getNotifications(ids: string[]) {
  if (!ids.length) return [];
  const encoded = ids.map(id => `"${id.replace(/"/g, "")}"`).join(",");
  return fetchJson<NotificationRow[]>(
    `notifications?id=in.(${encoded})&select=id,user_id,actor_id,type,title,message,target_url,meta`,
  );
}

async function getActiveSubscriptions() {
  return fetchJson<PushSubscriptionRow[]>(
    "push_subscriptions?revoked_at=is.null&select=id,user_id,endpoint,p256dh,auth",
  );
}

async function revokeSubscription(id: string) {
  await fetchJson(
    `push_subscriptions?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    },
  );
}

function buildPayload(input: {
  title?: string;
  message?: string;
  targetUrl?: string;
  type?: string;
  notificationId?: string;
}) {
  return JSON.stringify({
    title: input.title || "MindUp",
    body: input.message || "Bạn có thông báo mới.",
    url: input.targetUrl || "notifications.html",
    type: input.type || "system",
    notificationId: input.notificationId || null,
    icon: "/pwa-icon-192.png",
    badge: "/pwa-icon-192.png",
  });
}

async function sendToSubscription(subscription: PushSubscriptionRow, payload: string) {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      payload,
      {
        TTL: 60 * 60 * 24 * 7,
        urgency: "high",
      },
    );
    return { ok: true };
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await revokeSubscription(subscription.id);
      return { ok: false, revoked: true };
    }
    console.error("Push send failed", error);
    return { ok: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    assertVapidConfigured();

    const { user } = await requireAuthenticatedUser(req);
    const role = await getUserRole(user.id);
    const body = await req.json().catch(() => ({}));
    const notificationIds = normalizeIds([
      ...(body.notificationId ? [body.notificationId] : []),
      ...(Array.isArray(body.notificationIds) ? body.notificationIds : []),
    ]);
    const directUserIds = normalizeIds(body.userIds);

    const subscriptions = await getActiveSubscriptions();
    let sent = 0;
    let attempted = 0;
    let revoked = 0;

    if (notificationIds.length) {
      const notifications = await getNotifications(notificationIds);
      for (const notification of notifications) {
        if (!isPrivileged(role) && notification.actor_id !== user.id) {
          continue;
        }

        const payload = buildPayload({
          title: notification.title || "MindUp",
          message: notification.message || undefined,
          targetUrl: notification.target_url || "notifications.html",
          type: notification.type,
          notificationId: notification.id,
        });

        const targets = subscriptions.filter(item => item.user_id === notification.user_id);
        for (const subscription of targets) {
          attempted += 1;
          const result = await sendToSubscription(subscription, payload);
          if (result.ok) sent += 1;
          if (result.revoked) revoked += 1;
        }
      }
      return jsonResponse({ ok: true, attempted, sent, revoked });
    }

    if (!isPrivileged(role)) {
      return jsonResponse({ error: "Only admins or teachers can send direct push notifications" }, 403);
    }
    if (!directUserIds.length) return jsonResponse({ error: "Missing notificationId or userIds" }, 400);

    const payload = buildPayload({
      title: String(body.title || "MindUp"),
      message: String(body.message || "Bạn có thông báo mới."),
      targetUrl: String(body.targetUrl || "notifications.html"),
      type: String(body.type || "system"),
    });

    const targetSet = new Set(directUserIds);
    const targets = subscriptions.filter(item => targetSet.has(item.user_id));
    for (const subscription of targets) {
      attempted += 1;
      const result = await sendToSubscription(subscription, payload);
      if (result.ok) sent += 1;
      if (result.revoked) revoked += 1;
    }

    return jsonResponse({ ok: true, attempted, sent, revoked });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Cannot send push notification";
    const status = message.includes("Authentication") ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
