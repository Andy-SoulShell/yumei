/**
 * PWA 静态资源缓存、离线页面回退及 Web Push 展示。
 *
 * @remarks 只缓存应用静态资源；私人媒体、API 和跨来源请求始终走网络。
 */
const CACHE_NAME = "yumei-static-v5";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
];

// 安装时缓存入口页面、图标和 Manifest。
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 激活时移除其他缓存版本。
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith("yumei-") && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// 按请求类型选择网络优先或缓存优先策略。
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // 写请求不进入离线缓存。
  if (request.method !== "GET") return;

  // 不读取旧缓存，也不缓存带有私人内容或外部服务凭证的请求。
  if (url.origin !== self.location.origin || url.pathname.startsWith("/files/"))
    return;

  // API 始终交给网络处理。
  if (url.pathname.startsWith("/api/")) return;

  // 认证回调可能带有一次性令牌，既不读取旧缓存，也不保存这些页面地址。
  if (
    /^\/(?:login|register|forgot-password|reset-password|verify-email|magic-link)(?:\/|$)/.test(
      url.pathname
    )
  )
    return;

  // 跳过 WebSocket 与包含 OAuth 标记的请求。
  if (url.pathname.startsWith("/ws") || url.pathname.includes("oauth")) return;

  // 页面导航优先使用网络，离线时回退到已缓存页面。
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

  // 静态资源优先使用缓存，首次获取后保存。
  if (
    STATIC_ASSETS.includes(url.pathname) ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/characters/")
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

  // 其余请求交给浏览器网络栈，不把未知内容纳入离线存储。
});

// 推送载荷包含标题、正文及可选的点击跳转地址。
function safeNotificationUrl(value) {
  try {
    const target = new URL(
      typeof value === "string" ? value : "/",
      self.location.origin
    );
    return target.origin === self.location.origin
      ? target.pathname + target.search + target.hash
      : "/";
  } catch {
    return "/";
  }
}

self.addEventListener("push", event => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  if (!data || typeof data !== "object") return;
  if (
    data.expiresAt &&
    (!Number.isFinite(Date.parse(data.expiresAt)) ||
      Date.parse(data.expiresAt) <= Date.now())
  )
    return;
  event.waitUntil(
    self.registration.showNotification(data.title || "YUMEI", {
      body: data.body || "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      renotify: false,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: {
        url: safeNotificationUrl(data.url),
        notificationId: data.notificationId,
      },
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = safeNotificationUrl(
    event.notification.data && event.notification.data.url
  );
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async list => {
        for (const client of list) {
          if ("focus" in client) {
            await client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
