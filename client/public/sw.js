// v2 (M4-4): fixed icon filenames (issue #34 — the old list referenced
// /icon-192x192.png which never existed, so cache.addAll rejected and the
// service worker never installed), added Web Push handlers.
const CACHE_NAME = "yumei-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
];

// Install - cache static assets
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip API calls - always go to network
  if (url.pathname.startsWith("/api/")) return;

  // Skip WebSocket and OAuth
  if (url.pathname.startsWith("/ws") || url.pathname.includes("oauth")) return;

  // For navigation requests (HTML pages) - network first
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match("/"))
        )
    );
    return;
  }

  // For static assets - cache first, then network
  if (
    url.pathname.match(
      /\.(js|css|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot|ico)$/
    ) ||
    url.pathname.startsWith("/assets/")
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Default - network first
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Web Push (M4-4) — payload: { title, body, url? }
self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "YUMEI", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "YUMEI", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(list => {
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
