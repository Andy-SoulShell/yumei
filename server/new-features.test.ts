import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { storageRead } from "./storage";
import { readDefaultReference } from "./characterPresets";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    // Better-Auth uses string user IDs.
    id: String(userId),
    email: `test${userId}@example.com`,
    name: "Test User",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    image: null,
    emailVerified: false,
    birthDate: null,
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("girlfriend.ensureDefault", () => {
  it("should create default girlfriend YUMEI for new user", async () => {
    const { ctx } = createAuthContext(88888);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.girlfriend.ensureDefault();

    expect(result).toBeDefined();
    expect(result.name).toBe("YUMEI");
    expect(result.personality).toContain("活泼开朗");
    expect(result.userId).toBe("88888");
    expect(result.isActive).toBe(true);
    expect(result.referenceImageKey).toMatch(/^default-yumei-88888-.*\.jpg$/);
    expect(result.referenceImageUrl).toContain(
      `/files/${result.referenceImageKey}`
    );
    const storedReference = await storageRead(result.referenceImageKey);
    expect(storedReference).toEqual(await readDefaultReference());
    expect(storedReference.subarray(0, 2)).toEqual(Buffer.from([255, 216]));
  });

  it("should return existing girlfriend if one already exists", async () => {
    const { ctx } = createAuthContext(88888);
    const caller = appRouter.createCaller(ctx);

    const existing = await caller.girlfriend.ensureDefault();
    const result = await caller.girlfriend.ensureDefault();

    expect(result.id).toBe(existing.id);
    expect(result.referenceImageKey).toBe(existing.referenceImageKey);
    expect(result.name).toBe("YUMEI");
  });
});

describe("girlfriend.delete", () => {
  it("should create and then delete a girlfriend", async () => {
    const { ctx } = createAuthContext(77777);
    const caller = appRouter.createCaller(ctx);

    // 先创建一个女友
    const gf = await caller.girlfriend.create({
      name: "测试删除",
      personality: "温柔",
      appearance: "长发",
      referenceImageBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      referenceImageMimeType: "image/png",
    });

    expect(gf).toBeDefined();
    expect(gf.name).toBe("测试删除");

    // 删除女友
    const result = await caller.girlfriend.delete({ id: gf.id });
    expect(result).toEqual({ success: true });

    // 验证已删除 - 列表中不应包含该女友
    const list = await caller.girlfriend.list();
    const found = list.find(g => g.id === gf.id);
    expect(found).toBeUndefined();
  });
});

describe("conversation.listWithDetails", () => {
  it("should return conversations with last message info", async () => {
    const { ctx } = createAuthContext(66666);
    const caller = appRouter.createCaller(ctx);

    // 先确保有默认女友
    const gf = await caller.girlfriend.ensureDefault();

    // 创建一个对话
    const convo = await caller.conversation.create({
      girlfriendId: gf.id,
      title: "测试对话",
    });

    expect(convo).toBeDefined();

    // 获取带详情的对话列表
    const list = await caller.conversation.listWithDetails();

    expect(list).toBeDefined();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);

    const found = list.find(c => c.id === convo.id);
    expect(found).toBeDefined();
    expect(found?.girlfriendName).toBe("YUMEI");
  });
});
