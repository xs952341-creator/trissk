// public/sw.js — Service Worker com cache offline + Push Notifications

const CACHE_NAME = "playbookhub-v2";

// ── Install & Activate ──────────────────────────────────────────────────────
self.addEventListener("install",  () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// ── Fetch (cache-first para assets estáticos) ───────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isAsset = /\.(js|css|woff2?|png|jpg|svg|ico)$/.test(url.pathname);

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      if (isSameOrigin && isAsset) {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req).catch(() => null);
        if (res?.ok) cache.put(req, res.clone());
        return res || Response.error();
      }
      return fetch(req).catch(() => cache.match(req) || Response.error());
    })
  );
});

// ── Push Notifications ──────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Playbook Hub", body: event.data.text() };
  }

  const { title = "Playbook Hub", body = "", url = "/" } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  "/icon-192.png",
      badge: "/icon-192.png",
      data:  { url },
      vibrate: [200, 100, 200],
      tag: `ph-${Date.now()}`,
      requireInteraction: false,
    })
  );
});

// ── Notification Click ──────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url === url && "focus" in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
