import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createMessage } from "./db";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    // users.id is varchar(255) since the Better-Auth migration (0013).
    id: String(userId),
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
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

describe("conversation.search", () => {
  it("should search conversations by keyword", async () => {
    const { ctx } = createAuthContext(55555);
    const caller = appRouter.createCaller(ctx);

    // 先确保有默认女友
    const gf = await caller.girlfriend.ensureDefault();

    // 创建一个对话并发送消息
    const convo = await caller.conversation.create({
      girlfriendId: gf.id,
      title: "搜索测试对话",
    });

    // 直接写入一条包含特定关键词的消息（不走 chat.sendMessage —
    // M1-3 起该路径要求配置 OpenRouter key，且测试不应触网）
    await createMessage({
      conversationId: convo.id,
      role: "user",
      content: "今天天气真好，我们去公园散步吧",
    });

    // 搜索 "公园"
    const results = await caller.conversation.search({ keyword: "公园" });

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    // 应该能找到包含 "公园" 的对话
    expect(results.length).toBeGreaterThan(0);

    const found = results.find((r) => r.id === convo.id);
    expect(found).toBeDefined();
    expect(found?.matchedMessage).toContain("公园");
  });

  it("should return empty array for non-matching keyword", async () => {
    const { ctx } = createAuthContext(55555);
    const caller = appRouter.createCaller(ctx);

    const results = await caller.conversation.search({
      keyword: "xyznonexistentkeyword12345",
    });

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});

describe("mood system", () => {
  it("should update mood after sending a positive message", async () => {
    const { ctx } = createAuthContext(44401);
    const caller = appRouter.createCaller(ctx);

    // 先确保有默认女友
    const gf = await caller.girlfriend.ensureDefault();

    // 更新心情 - 发送积极消息
    const result = await caller.mood.update({
      girlfriendId: gf.id,
      messageContent: "我好喜欢你，你真可爱！",
      isUserMessage: true,
    });

    expect(result).toBeDefined();
    expect(result.userId).toBe("44401");
    expect(result.girlfriendId).toBe(gf.id);
    expect(result.moodScore).toBeGreaterThanOrEqual(70); // 积极消息应该维持或提高分数
    expect(result.totalMessages).toBeGreaterThanOrEqual(1);
    expect(result.todayMessages).toBeGreaterThanOrEqual(1);
    expect(["excited", "happy", "content", "neutral", "lonely", "sad"]).toContain(result.mood);
  });

  it("should decrease mood score for negative messages", async () => {
    const { ctx } = createAuthContext(33301);
    const caller = appRouter.createCaller(ctx);

    const gf = await caller.girlfriend.ensureDefault();

    // 先发一条正常消息建立基线
    const baseline = await caller.mood.update({
      girlfriendId: gf.id,
      messageContent: "你好",
      isUserMessage: true,
    });

    // 发送消极消息
    const result = await caller.mood.update({
      girlfriendId: gf.id,
      messageContent: "我讨厌你，真无聊",
      isUserMessage: true,
    });

    // 消极消息后分数应该下降或持平
    expect(result.moodScore).toBeLessThanOrEqual(baseline.moodScore + 5);
    expect(result.totalMessages).toBeGreaterThanOrEqual(2);
  });

  it("should get mood for a specific girlfriend", async () => {
    const { ctx } = createAuthContext(44401);
    const caller = appRouter.createCaller(ctx);

    const gf = await caller.girlfriend.ensureDefault();

    const mood = await caller.mood.get({ girlfriendId: gf.id });

    expect(mood).toBeDefined();
    expect(mood?.userId).toBe("44401");
    expect(mood?.girlfriendId).toBe(gf.id);
    expect(mood?.mood).toBeDefined();
    expect(mood?.moodScore).toBeGreaterThanOrEqual(0);
    expect(mood?.moodScore).toBeLessThanOrEqual(100);
  });

  it("should get all moods for a user", async () => {
    const { ctx } = createAuthContext(44401);
    const caller = appRouter.createCaller(ctx);

    const moods = await caller.mood.getAll();

    expect(moods).toBeDefined();
    expect(Array.isArray(moods)).toBe(true);
    expect(moods.length).toBeGreaterThan(0);
  });

  it("should increment message counts correctly", async () => {
    const { ctx } = createAuthContext(22201);
    const caller = appRouter.createCaller(ctx);

    const gf = await caller.girlfriend.ensureDefault();

    // 发送多条消息
    const r1 = await caller.mood.update({
      girlfriendId: gf.id,
      messageContent: "消息1",
      isUserMessage: true,
    });

    const r2 = await caller.mood.update({
      girlfriendId: gf.id,
      messageContent: "消息2",
      isUserMessage: true,
    });

    const r3 = await caller.mood.update({
      girlfriendId: gf.id,
      messageContent: "消息3",
      isUserMessage: true,
    });

    // 每次消息计数应该递增
    expect(r2.totalMessages).toBeGreaterThan(r1.totalMessages);
    expect(r3.totalMessages).toBeGreaterThan(r2.totalMessages);
    expect(r3.todayMessages).toBeGreaterThanOrEqual(3);
  });
});
