/** 界面偏好通过真实路由及独立测试库验证持久化、部分更新和账号隔离。 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createTestUser } from "./testFixtures";
import type { TrpcContext } from "./_core/context";
import { DEFAULT_PREFERENCES } from "../shared/preferences";

async function caller() {
  const userId = await createTestUser();
  return {
    userId,
    api: appRouter.createCaller({
      user: { id: userId },
      req: {},
      res: {},
    } as TrpcContext),
  };
}

describe("interface preferences", () => {
  it("uses system defaults for a new account and requires authentication", async () => {
    const { userId, api } = await caller();
    expect(await api.preferences.get()).toEqual({
      userId,
      ...DEFAULT_PREFERENCES,
      initialized: false,
    });
    const anonymous = appRouter.createCaller({
      user: null,
      req: {},
      res: {},
    } as TrpcContext);
    await expect(anonymous.preferences.get()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      anonymous.preferences.update({ theme: "sakura" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("persists choices, preserves other fields and isolates accounts", async () => {
    const a = await caller();
    const b = await caller();
    await a.api.preferences.update({
      language: "en",
      theme: "sakura",
      colorMode: "dark",
    });
    await a.api.preferences.update({ theme: "pearl" });
    expect(await a.api.preferences.get()).toMatchObject({
      language: "en",
      theme: "pearl",
      colorMode: "dark",
    });
    expect(await b.api.preferences.get()).toEqual({
      userId: b.userId,
      ...DEFAULT_PREFERENCES,
      initialized: false,
    });
    await a.api.preferences.update({
      language: "zh-CN",
      userId: b.userId,
    } as any);
    expect(await b.api.preferences.get()).toEqual({
      userId: b.userId,
      ...DEFAULT_PREFERENCES,
      initialized: false,
    });
  });
  it("atomically creates preferences during simultaneous first updates", async () => {
    const { api } = await caller();
    await Promise.all([
      api.preferences.update({ language: "en" }),
      api.preferences.update({ theme: "midnight" }),
      api.preferences.update({ colorMode: "dark" }),
    ]);
    expect(await api.preferences.get()).toMatchObject({
      language: "en",
      theme: "midnight",
      colorMode: "dark",
    });
  });
  it("rejects unsupported identifiers and empty updates", async () => {
    const { api } = await caller();
    for (const patch of [
      { theme: "unknown" },
      { language: "fr" },
      { colorMode: "auto" },
      {},
    ])
      await expect(api.preferences.update(patch as any)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
  });
});
