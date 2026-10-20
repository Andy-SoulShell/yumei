/** 覆盖内置预设、图片读取及套餐数量约束。 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHARACTER_PRESETS } from "../shared/characterPresets";
import * as companionsDb from "./repositories/companions";
import { appRouter } from "./routers";
import * as storage from "./storage";

const caller = appRouter.createCaller({
  user: { id: "preset-test-user" },
  req: {},
  res: {},
} as any);
const profile = { name: "自定义名字", personality: "温柔", appearance: "黑发" };

beforeEach(() => {
  vi.stubEnv("BILLING_PROVIDER", "none");
  vi.spyOn(storage, "storagePut").mockImplementation(async key => ({
    key,
    url: `http://app/files/${key}`,
  }));
  vi.spyOn(companionsDb, "createGirlfriend").mockImplementation(
    async data => ({ id: 1, ...data }) as any
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("character preset creation", () => {
  it("creates every preset with bundled JPEG bytes in the user's storage, preserving edited fields", async () => {
    for (const preset of CHARACTER_PRESETS) {
      const result = await caller.girlfriend.create({
        ...profile,
        presetId: preset.id,
        customPrompt: "自然一点",
      });
      expect(result).toMatchObject({
        ...profile,
        userId: "preset-test-user",
        customPrompt: "自然一点",
      });
      expect(result.referenceImageKey).toMatch(/^girlfriend-preset-test-user-/);
      expect(result.referenceImageUrl).toMatch(/^http:\/\/app\/files\//);
      const call = vi.mocked(storage.storagePut).mock.calls.at(-1)!;
      expect(Buffer.from(call[1]).subarray(0, 2)).toEqual(
        Buffer.from([255, 216])
      );
      expect(call[2]).toBe("image/jpeg");
    }
  });

  it("rejects unknown or traversal preset IDs and incomplete uploads before writing storage", async () => {
    for (const imageInput of [
      {},
      { presetId: "../../.env" },
      { presetId: "missing" },
      { presetId: "xiaotao", referenceImageBase64: "abc" },
      { referenceImageMimeType: "image/png" },
    ]) {
      await expect(
        caller.girlfriend.create({ ...profile, ...imageInput } as any)
      ).rejects.toThrow();
    }
    expect(storage.storagePut).not.toHaveBeenCalled();
    expect(companionsDb.createGirlfriend).not.toHaveBeenCalled();
  });

  it("allows an uploaded reference to replace a preset reference", async () => {
    const image = Buffer.from([137, 80, 78, 71]);
    await caller.girlfriend.create({
      ...profile,
      presetId: "xiaotao",
      referenceImageBase64: image.toString("base64"),
      referenceImageMimeType: "image/png",
    });
    expect(storage.storagePut).toHaveBeenCalledWith(
      expect.stringMatching(/\.png$/),
      image,
      "image/png"
    );
  });

  it("keeps the plan's companion limit for preset creation", async () => {
    vi.stubEnv("BILLING_PROVIDER", "free");
    vi.spyOn(companionsDb, "getUserGirlfriends").mockResolvedValue([
      { id: 2 },
    ] as any);
    await expect(
      caller.girlfriend.create({ ...profile, presetId: "aoi" })
    ).rejects.toThrow("UPGRADE_REQUIRED");
    expect(storage.storagePut).not.toHaveBeenCalled();
  });
});
