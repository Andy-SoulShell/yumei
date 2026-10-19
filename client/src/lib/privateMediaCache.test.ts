/** 退出清理旧缓存时只移除私人媒体，不影响静态资源和其他应用。 */
import { afterEach, expect, it, vi } from "vitest";
import { clearPrivateMediaCaches } from "./privateMediaCache";

afterEach(() => vi.unstubAllGlobals());

it("removes private and external bytes from legacy caches", async () => {
  const requests = [
    "/files/photo.jpg",
    "/assets/app.js",
    "https://external.test/audio.mp3",
  ].map(path => ({ url: new URL(path, "https://yumei.test").href }));
  const cache = {
    keys: vi.fn().mockResolvedValue(requests),
    delete: vi.fn().mockResolvedValue(true),
  };
  const open = vi.fn().mockResolvedValue(cache);
  vi.stubGlobal("location", { origin: "https://yumei.test" });
  vi.stubGlobal("caches", {
    keys: vi.fn().mockResolvedValue(["yumei-v1", "unrelated-app"]),
    open,
  });
  await clearPrivateMediaCaches();
  expect(open.mock.calls).toEqual([["yumei-v1"]]);
  expect(cache.delete.mock.calls).toEqual([[requests[0]], [requests[2]]]);
});
