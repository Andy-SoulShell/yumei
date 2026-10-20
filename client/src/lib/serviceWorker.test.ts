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
      .mockResolvedValue([
        "yumei-v1",
        "other-app",
        "yumei-static-v2",
        "yumei-static-v3",
        "yumei-static-v4",
      ]),
    delete: vi.fn().mockResolvedValue(true),
    match: vi.fn().mockResolvedValue(new Response("stale private bytes")),
    open: vi.fn().mockResolvedValue(cache),
  };
  const fetch = vi.fn().mockResolvedValue(new Response("fresh static bytes"));
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const client = {
    navigate: vi.fn().mockResolvedValue(undefined),
    focus: vi.fn().mockResolvedValue(undefined),
  };
  const clients = {
    claim: vi.fn(),
    matchAll: vi.fn().mockResolvedValue([client]),
    openWindow: vi.fn().mockResolvedValue(undefined),
  };
  runInNewContext(readFileSync("client/public/sw.js", "utf8"), {
    self: {
      addEventListener: (name: string, handler: any) =>
        handlers.set(name, handler),
      location: { origin: "https://yumei.test" },
      clients,
      registration: { showNotification },
    },
    caches,
    fetch,
    URL,
    clients,
  });
  return { handlers, caches, cache, fetch, showNotification, clients, client };
}

describe("private media cache policy", () => {
  it("never intercepts private media, signed external images or API reads", () => {
    const w = worker();
    for (const path of [
      "/files/private.jpg",
      "/files/audio.mp3?token=secret",
      "/api/trpc/auth.me",
      "/reset-password?token=secret",
      "/verify-email?token=secret",
      "/login?next=%2Fsettings",
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
    expect(w.caches.delete.mock.calls).toEqual([
      ["yumei-v1"],
      ["yumei-static-v2"],
      ["yumei-static-v3"],
      ["yumei-static-v4"],
    ]);
  });
  it("drops expired pushes and uses the same visible tag on retry", async () => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    const emit = (payload: object) =>
      w.handlers.get("push")!({
        data: { json: () => payload },
        waitUntil: (value: Promise<unknown>) => {
          pending = value;
        },
      });
    emit({ title: "expired", expiresAt: "2000-01-01T00:00:00Z" });
    expect(w.showNotification).not.toHaveBeenCalled();
    for (let i = 0; i < 2; i++) {
      emit({
        title: "YUMEI",
        body: "new message",
        tag: "proactive:test-id",
        expiresAt: "2099-01-01T00:00:00Z",
        notificationId: 123,
        url: "/chats?notification=123",
      });
      await pending;
    }
    expect(
      w.showNotification.mock.calls.every(
        call =>
          call[1].tag === "proactive:test-id" && call[1].renotify === false
      )
    ).toBe(true);
    expect(w.showNotification.mock.calls[0][1].data.url).toBe(
      "/chats?notification=123"
    );
  });
  it("keeps notification navigation on the app origin", async () => {
    const w = worker();
    let pending!: Promise<unknown>;
    w.handlers.get("notificationclick")!({
      notification: {
        close: vi.fn(),
        data: { url: "https://other.test/private" },
      },
      waitUntil: (value: Promise<unknown>) => {
        pending = value;
      },
    });
    await pending;
    expect(w.client.navigate).toHaveBeenCalledWith("/");
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
