/** 覆盖会话搜索与心情变化。 */

import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { createMessage } from "./repositories/conversations";
import { appRouter } from "./routers";
import { createTestUser } from "./testFixtures";

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

describe("conversation.search", () => {
  it("should search conversations by keyword", async () => {
    const { ctx } = createAuthContext(55555);
    await createTestUser(ctx.user!.id);
    const caller = appRouter.createCaller(ctx);

    // 先确保有默认女友
    const gf = await caller.girlfriend.ensureDefault();

    // 创建一个对话并发送消息
    const convo = await caller.conversation.create({
      girlfriendId: gf.id,
      title: "搜索测试对话",
    });

    // 直接写入一条包含特定关键词的消息（不走 chat.sendMessage —
    // 起该路径要求配置 OpenRouter key，且测试不应触网）
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

    const found = results.find(r => r.id === convo.id);
    expect(found).toBeDefined();
    expect(found?.matchedMessage).toContain("公园");
  });

  it("should return empty array for non-matching keyword", async () => {
    const { ctx } = createAuthContext(55555);
    await createTestUser(ctx.user!.id);
    const caller = appRouter.createCaller(ctx);

    const results = await caller.conversation.search({
      keyword: "xyznonexistentkeyword12345",
    });

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});
