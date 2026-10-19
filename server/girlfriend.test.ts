import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: "test-user-1",
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("girlfriend.create", () => {
  it("should create a girlfriend with valid input", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.girlfriend.create({
      name: "小雨",
      personality: "温柔体贴，善解人意",
      appearance: "长发飘逸，皮肤白皙",
      interests: "看电影、听音乐",
      referenceImageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      referenceImageMimeType: "image/png",
    });

    expect(result).toBeDefined();
    expect(result.name).toBe("小雨");
    expect(result.personality).toBe("温柔体贴，善解人意");
    expect(result.userId).toBe(ctx.user!.id);
  });

  it("should reject creation without required fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.girlfriend.create({
        name: "",
        personality: "",
        appearance: "",
        referenceImageBase64: "",
        referenceImageMimeType: "image/png",
      })
    ).rejects.toThrow();
  });
});

describe("girlfriend.getActive", () => {
  it("should return active girlfriend for authenticated user", async () => {
    // 使用唯一用户 ID 避免数据污染
    const { ctx } = createAuthContext();
    ctx.user!.id = "test-user-88888";
    ctx.user!.openId = "test-getactive-user";
    const caller = appRouter.createCaller(ctx);

    // 先创建一个女友
    await caller.girlfriend.create({
      name: "小雨",
      personality: "温柔体贴",
      appearance: "长发飘逸",
      referenceImageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      referenceImageMimeType: "image/png",
    });

    // 获取活跃女友
    const result = await caller.girlfriend.getActive();

    expect(result).toBeDefined();
    expect(result?.name).toBe("小雨");
  });

  it("should return null when no girlfriend exists", async () => {
    const { ctx } = createAuthContext();
    // 使用不同的用户 ID 确保没有女友配置
    ctx.user!.id = "test-user-999999";
    const caller = appRouter.createCaller(ctx);

    const result = await caller.girlfriend.getActive();

    expect(result).toBeUndefined();
  });
});
