// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { downloadImage } from "./downloadImage";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("does not download HTTP errors or non-image responses", async () => {
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(["error"], { type: "text/html" }),
      })
  );
  await expect(downloadImage("/failed", 1)).rejects.toThrow();
  await expect(downloadImage("/invalid", 2)).rejects.toThrow();
  expect(click).not.toHaveBeenCalled();
});
it("uses the actual image extension and releases the blob after initiating download", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["image"], { type: "image/jpeg" }),
    })
  );
  const revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn(() => "blob:photo"),
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: revoke,
    configurable: true,
  });
  let filename = "";
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    filename = this.download;
    expect(this.isConnected).toBe(true);
  });
  await downloadImage("/photo", 9);
  expect(filename).toBe("selfie-9.jpg");
  expect(document.querySelector("a[download]")).toBeNull();
  expect(revoke).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalledWith("blob:photo");
});
