/** 清除旧版 Worker 遗留的私人媒体缓存，保持静态资源和其他应用缓存。 */
export async function clearPrivateMediaCaches(): Promise<void> {
  if (!("caches" in globalThis)) return;
  const names = await caches.keys();
  for (const name of names.filter(name => name.startsWith("yumei-"))) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/files/") || url.origin !== location.origin)
        await cache.delete(request);
    }
  }
}
