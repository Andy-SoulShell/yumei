/** 使用真实 Worker 源码验证媒体不缓存、版本迁移及静态离线回退。 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const handlers = new Map<string, (event: any) => void>();
  const cache = { put: vi.fn(), addAll: vi.fn().mockResolvedValue(undefined) };
  const caches = {
    keys: vi
      .fn()
      .mockResolvedValue(["yumei-v1", "other-app", "yumei-static-v2"]),
    delete: vi.fn().mockResolvedValue(true),
    match: vi.fn().mockResolvedValue(new Response("stale private bytes")),
    open: vi.fn().mockResolvedValue(cache),
  };
  const fetch = vi.fn().mockResolvedValue(new Response("fresh static bytes"));
  runInNewContext(readFileSync("client/public/sw.js", "utf8"), {
    self: {
      addEventListener: (name: string, handler: any) =>
        handlers.set(name, handler),
      location: { origin: "https://yumei.test" },
      clients: { claim: vi.fn() },
    },
    caches,
    fetch,
    URL,
  });
  return { handlers, caches, cache, fetch };
}

describe("private media cache policy", () => {
  it("never intercepts private media, signed external images or API reads", () => {
    const w = worker();
    for (const path of [
      "/files/private.jpg",
      "/files/audio.mp3?token=secret",
      "/api/trpc/auth.me",
      "https://other.test/private.jpg",
    ]) {
      const respondWith = vi.fn();
      w.handlers.get("fetch")!({
        request: {
          method: "GET",
          url: new URL(path, "https://yumei.test").href,
        },
        respondWith,
      });
      expect(respondWith).not.toHaveBeenCalled();
    }
    expect(w.caches.match).not.toHaveBeenCalled();
    expect(w.cache.put).not.toHaveBeenCalled();
  });

  it("deletes legacy app caches during activation and preserves other applications", async () => {
    const w = worker();
    let pending!: Promise<unknown>;
    w.handlers.get("activate")!({
      waitUntil: (promise: Promise<unknown>) => (pending = promise),
    });
    await pending;
    expect(w.caches.delete.mock.calls).toEqual([["yumei-v1"]]);
  });

  it("keeps bundled static resources available from cache", async () => {
    const w = worker();
    let pending!: Promise<Response>;
    w.handlers.get("fetch")!({
      request: { method: "GET", url: "https://yumei.test/assets/app.js" },
      respondWith: (promise: Promise<Response>) => (pending = promise),
    });
    expect(await (await pending).text()).toBe("stale private bytes");
    expect(w.fetch).not.toHaveBeenCalled();
  });
});
