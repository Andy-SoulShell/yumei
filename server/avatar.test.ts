import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: "test-user-1",
    openId: "avatar-test-user",
    email: "avatar@example.com",
    name: "Avatar Test User",
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

// 1x1 pixel transparent PNG in base64
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("girlfriend.uploadAvatar", () => {
  it("should upload avatar for an existing girlfriend", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // 先创建一个女友
    const gf = await caller.girlfriend.create({
      name: "Avatar Test Girl",
      personality: "温柔体贴",
      appearance: "长发飘逸",
      referenceImageBase64: TINY_PNG_BASE64,
      referenceImageMimeType: "image/png",
    });

    // 上传头像
    const result = await caller.girlfriend.uploadAvatar({
      girlfriendId: gf.id,
      imageBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
    });

    expect(result).toBeDefined();
    expect(result.avatarUrl).toBeDefined();
    expect(typeof result.avatarUrl).toBe("string");
    expect(result.avatarUrl.length).toBeGreaterThan(0);
    expect(result.avatarKey).toBeDefined();
    expect(result.avatarKey).toContain("avatar-");
  });

  it("should support JPEG format", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const gf = await caller.girlfriend.create({
      name: "JPEG Avatar Girl",
      personality: "活泼开朗",
      appearance: "短发可爱",
      referenceImageBase64: TINY_PNG_BASE64,
      referenceImageMimeType: "image/png",
    });

    const result = await caller.girlfriend.uploadAvatar({
      girlfriendId: gf.id,
      imageBase64: TINY_PNG_BASE64,
      mimeType: "image/jpeg",
    });

    expect(result.avatarKey).toContain(".jpg");
  });

  it("should support WebP format", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const gf = await caller.girlfriend.create({
      name: "WebP Avatar Girl",
      personality: "知性优雅",
      appearance: "卷发飘逸",
      referenceImageBase64: TINY_PNG_BASE64,
      referenceImageMimeType: "image/png",
    });

    const result = await caller.girlfriend.uploadAvatar({
      girlfriendId: gf.id,
      imageBase64: TINY_PNG_BASE64,
      mimeType: "image/webp",
    });

    expect(result.avatarKey).toContain(".webp");
  });

  it("should support GIF format", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const gf = await caller.girlfriend.create({
      name: "GIF Avatar Girl",
      personality: "搞怪有趣",
      appearance: "双马尾",
      referenceImageBase64: TINY_PNG_BASE64,
      referenceImageMimeType: "image/png",
    });

    const result = await caller.girlfriend.uploadAvatar({
      girlfriendId: gf.id,
      imageBase64: TINY_PNG_BASE64,
      mimeType: "image/gif",
    });

    expect(result.avatarKey).toContain(".gif");
  });

  it("should reject unsupported image formats", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const gf = await caller.girlfriend.create({
      name: "Bad Format Girl",
      personality: "温柔",
      appearance: "美丽",
      referenceImageBase64: TINY_PNG_BASE64,
      referenceImageMimeType: "image/png",
    });

    await expect(
      caller.girlfriend.uploadAvatar({
        girlfriendId: gf.id,
        imageBase64: TINY_PNG_BASE64,
        // @ts-expect-error - testing invalid mime type
        mimeType: "image/bmp",
      })
    ).rejects.toThrow();
  });

  it("should reject oversized images", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const gf = await caller.girlfriend.create({
      name: "Big Image Girl",
      personality: "温柔",
      appearance: "美丽",
      referenceImageBase64: TINY_PNG_BASE64,
      referenceImageMimeType: "image/png",
    });

    // 生成一个超过 10MB 的 base64 字符串
    const oversizedBase64 = "A".repeat(14 * 1024 * 1024); // ~14MB base64

    await expect(
      caller.girlfriend.uploadAvatar({
        girlfriendId: gf.id,
        imageBase64: oversizedBase64,
        mimeType: "image/png",
      })
    ).rejects.toThrow("图片文件过大");
  });
});

describe("girlfriend.update with avatar fields", () => {
  it("should update girlfriend with avatar fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const gf = await caller.girlfriend.create({
      name: "Update Avatar Girl",
      personality: "温柔",
      appearance: "美丽",
      referenceImageBase64: TINY_PNG_BASE64,
      referenceImageMimeType: "image/png",
    });

    // 更新头像字段
    const result = await caller.girlfriend.update({
      id: gf.id,
      avatarUrl: "https://example.com/avatar.png",
      avatarKey: "avatar-test-key.png",
    });

    expect(result.success).toBe(true);
  });

  it("should clear avatar by setting null", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const gf = await caller.girlfriend.create({
      name: "Clear Avatar Girl",
      personality: "温柔",
      appearance: "美丽",
      referenceImageBase64: TINY_PNG_BASE64,
      referenceImageMimeType: "image/png",
    });

    // 先设置头像
    await caller.girlfriend.update({
      id: gf.id,
      avatarUrl: "https://example.com/avatar.png",
      avatarKey: "avatar-test-key.png",
    });

    // 清除头像
    const result = await caller.girlfriend.update({
      id: gf.id,
      avatarUrl: null,
      avatarKey: null,
    });

    expect(result.success).toBe(true);
  });
});

describe("girlfriend avatar in list", () => {
  it("should include avatarUrl in girlfriend list response", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // 创建一个女友
    const gf = await caller.girlfriend.create({
      name: "List Avatar Girl",
      personality: "温柔",
      appearance: "美丽",
      referenceImageBase64: TINY_PNG_BASE64,
      referenceImageMimeType: "image/png",
    });

    // 上传头像
    await caller.girlfriend.uploadAvatar({
      girlfriendId: gf.id,
      imageBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
    });

    // 获取列表
    const list = await caller.girlfriend.list();
    const found = list.find((g) => g.id === gf.id);

    expect(found).toBeDefined();
    expect(found?.avatarUrl).toBeDefined();
    expect(found?.avatarUrl).not.toBeNull();
  });
});
