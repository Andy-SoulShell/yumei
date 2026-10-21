/** 管理发布后的角色限制、情绪与分页由真实业务执行，前端读取同一对象。 */
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { configured } from "./testConfiguredProduct";
import { productFixture } from "./testProductConfig";
import {
  initializeProductConfig,
  getPublishedProductConfig,
} from "./repositories/productConfig";
import { createGirlfriend } from "./repositories/companions";
import {
  createConversation,
  createMessage,
} from "./repositories/conversations";
import { buildChatSystemPrompt } from "../shared/chatPrompt";
import { localizeProductConfig } from "../shared/productConfig";
import { withUserTransaction } from "./database";
import { applyMessageRelationship } from "./relationship";
import { getGirlfriendMood } from "./repositories/moods";
beforeAll(initializeProductConfig);
afterEach(() => vi.restoreAllMocks());
const profile = {
  name: "配置复查",
  personality: "自然",
  appearance: "自然",
  referenceImageKey: "ref",
  referenceImageUrl: "https://example.test/ref",
};
it("shares new character defaults and field limits between actual profile updates and prompt preview", () =>
  configured(async ({ userId, admin, publish }) => {
    const config = structuredClone(productFixture);
    config.characters.defaultBehavior.expression = "direct";
    config.characters.limits.customPrompt = 600;
    await publish(config);
    const role = await createGirlfriend({ ...profile, userId });
    expect(role.behavior?.expression).toBe("direct");
    const customPrompt = "API专属设定".repeat(70);
    await admin.girlfriend.update({ id: role.id, customPrompt });
    const saved = (await admin.girlfriend.list()).find(
      item => item.id === role.id
    )!;
    expect(
      buildChatSystemPrompt(await getPublishedProductConfig(), saved)
    ).toContain(customPrompt);
    config.characters.limits.customPrompt = 5;
    await publish(config);
    await expect(
      admin.girlfriend.update({ id: role.id, customPrompt: "超过五个字符" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }));
it("uses published emotion scores and the same localized mood definition", () =>
  configured(async ({ userId, publish }) => {
    const config = structuredClone(productFixture);
    Object.assign(config.emotion, { baseline: 50, minScore: 0, maxScore: 100 });
    config.emotion.deltas.affection = 10;
    config.emotion.thresholds = { happy: 55, excited: 90 };
    config.emotion.moods.happy.label = { "zh-CN": "自在开心" };
    await publish(config);
    const role = await createGirlfriend({ ...profile, userId });
    const conversation = await createConversation({
      userId,
      girlfriendId: role.id,
    });
    const message = await createMessage({
      conversationId: conversation.id,
      role: "user",
      content: "我爱你",
      generationStatus: "succeeded",
    });
    await withUserTransaction(userId, tx =>
      applyMessageRelationship(tx, userId, role.id, message)
    );
    const mood = await getGirlfriendMood(userId, role.id);
    expect(mood).toMatchObject({ mood: "happy", moodScore: 60 });
    expect(
      localizeProductConfig(await getPublishedProductConfig(), "en").emotion
        .moods[mood!.mood].label
    ).toBe("自在开心");
  }));
it("executes published default page sizes and recent character count without client-side clipping", () =>
  configured(async ({ userId, admin, publish }) => {
    const config = structuredClone(productFixture);
    Object.assign(config.experience.pagination, {
      conversations: 1,
      messages: 1,
      recentCharacters: 1,
    });
    await publish(config);
    for (let i = 0; i < 2; i++) {
      const role = await createGirlfriend({ ...profile, userId });
      const conversation = await createConversation({
        userId,
        girlfriendId: role.id,
      });
      await createMessage({
        conversationId: conversation.id,
        role: "user",
        content: "第一条",
        generationStatus: "succeeded",
      });
      await createMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: "第二条",
        generationStatus: "succeeded",
      });
      expect(
        await admin.conversation.getMessages({
          conversationId: conversation.id,
        })
      ).toHaveLength(1);
    }
    expect(await admin.conversation.listWithDetails()).toHaveLength(1);
    expect(await admin.girlfriend.recent()).toHaveLength(1);
  }));
