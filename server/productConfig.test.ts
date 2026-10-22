/** 在回滚事务中验证管理 API 与真实套餐、姿势、奖励执行共用发布配置。 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import {
  girlfriends,
  productConfiguration,
  subscriptions,
  conversations,
  generationRequests,
} from "../drizzle/schema";
import {
  localizeProductConfig,
  type ProductConfig,
} from "../shared/productConfig";
import { detectSelfieRequest } from "../shared/selfieRequest";
import { METERS } from "../shared/quotas";
import * as database from "./database";
import { appRouter } from "./routers";
import { createTestUser } from "./testFixtures";
import { productFixture } from "./testProductConfig";
import {
  getPublishedProductConfig,
  initializeProductConfig,
} from "./repositories/productConfig";
import { getTierLimits } from "./billing";
import { checkRateLimit, getDailyMeter } from "./_core/quota";
import { awardIntimacy } from "./relationship";
import { reserveGenerationInTransaction } from "./generations";
import { getActiveGirlfriend } from "./repositories/companions";
import { generateConversationSelfie } from "./selfieGeneration";
import * as imageProvider from "./_core/imageProvider";
import { buildImagePrompt } from "./testAiConfig";
import { initializeDiscovery } from "./repositories/discovery";

const guest = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
const caller = (id: string, role = "admin") =>
  appRouter.createCaller({
    user: { id, role, birthDate: new Date("1990-01-01") },
    administrator: role === "admin" ? { id: "management" } : null,
    req: {},
    res: {},
  } as never);

beforeAll(async () => {
  await initializeProductConfig();
  await initializeDiscovery();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

/** 全部修改随外层事务回滚，其他测试连接只能读到原发布配置。 */
async function isolated(
  work: (
    tx: database.DbTransaction,
    admin: ReturnType<typeof caller>,
    userId: string
  ) => Promise<void>
) {
  const db = (await database.getDb())!;
  const rollback = new Error("rollback product configuration fixture");
  try {
    await db.transaction(
      async tx => {
        const spy = vi.spyOn(database, "getDb").mockResolvedValue(tx as never);
        try {
          const userId = await createTestUser();
          await work(tx, caller(userId), userId);
        } finally {
          spy.mockRestore();
        }
        throw rollback;
      },
      { isolationLevel: "read committed" }
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function publish(
  admin: ReturnType<typeof caller>,
  config: ProductConfig
) {
  const state = await admin.productConfig.admin.getDraft();
  const saved = await admin.productConfig.admin.save({
    expectedRevision: state.revision,
    config,
  });
  return admin.productConfig.admin.publish({
    expectedRevision: saved.revision,
  });
}
it("publishes independent video action edits while keeping selfie names, prompts and levels intact", () =>
  isolated(async (_tx, admin) => {
    const config = structuredClone(productFixture);
    const selfies = structuredClone(config.selfies);
    config.videos.presets = [
      {
        ...config.videos.presets[0],
        id: "operator-wave",
        label: { "zh-CN": "自定义招手" },
        minLevel: 3,
        promptFragment: "连续招手两次，镜头缓慢推进",
      },
    ];
    await publish(admin, config);
    const live = await guest.productConfig.get();
    expect(live.videos).toEqual(config.videos);
    expect(live.selfies).toEqual(selfies);
    const draft = await admin.productConfig.admin.getDraft();
    const invalid = structuredClone(config);
    invalid.videos.presets[0].minLevel = invalid.intimacy.levels.length + 1;
    await expect(
      admin.productConfig.admin.save({
        expectedRevision: draft.revision,
        config: invalid,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await guest.productConfig.get()).videos).toEqual(config.videos);
  }));

it("migrates video actions without replacing custom rules or changing an in-flight task's captured prompt", () =>
  isolated(async (tx, _admin, userId) => {
    const { conversationId } = await roleFixture(tx, userId);
    const config = structuredClone(productFixture);
    config.videos.presets[0].promptFragment = "运营自定义视频动作";
    config.selfies.poses[0].promptFragment = "运营自定义自拍画面";
    const { videos: _videos, ...oldDraft } = config;
    await tx
      .update(productConfiguration)
      .set({ draft: oldDraft as never, published: config });
    const id = crypto.randomUUID();
    const legacyTask = {
      input: {
        clientRequestId: crypto.randomUUID(),
        conversationId,
        mode: "text",
        prompt: "",
        poseId: "casual",
        durationSeconds: 5,
        referenceMessageId: null,
      },
      prompt: "接收时已渲染的视频提示词",
      preset: { label: { "zh-CN": "旧预设" }, emoji: "😊" },
      phase: "running",
      promptId: "remote-existing",
      baseUrl: "http://comfy.test",
      runtime: config.runtime.video,
      workflow: config.models.video.workflows.text,
      frames: 124,
      fps: 24,
      referenceKey: null,
    };
    await tx.insert(generationRequests).values({
      id,
      userId,
      conversationId,
      kind: "video",
      videoTask: legacyTask as never,
      expiresAt: new Date(Date.now() + 60000),
    });
    const migration = await readFile(
      new URL("../drizzle/0003_video_actions.sql", import.meta.url),
      "utf8"
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await tx.execute(sql.raw(statement));
    const [after] = await tx.select().from(productConfiguration);
    expect(after.draft.videos).toEqual(productFixture.videos);
    expect(after.draft.selfies).toEqual(config.selfies);
    expect(after.published.videos).toEqual(config.videos);
    expect(after.published.selfies).toEqual(config.selfies);
    const [task] = await tx
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, id));
    expect(task.videoTask).toMatchObject({
      prompt: legacyTask.prompt,
      preset: legacyTask.preset,
      promptId: "remote-existing",
      phase: "running",
      input: { presetId: "casual" },
    });
    expect(task.videoTask!.input).not.toHaveProperty("poseId");
  }));
async function roleFixture(
  tx: database.DbTransaction,
  userId: string,
  points = 0
) {
  const [result] = await tx.insert(girlfriends).values({
    userId,
    name: "配置测试",
    personality: "自然",
    appearance: "自然",
    intimacyPoints: points,
    intimacyLevel: 10,
    referenceImageKey: "test-ref",
    referenceImageUrl: "https://example.test/ref.png",
  });
  const girlfriendId = Number(result.insertId);
  const [conversation] = await tx
    .insert(conversations)
    .values({ userId, girlfriendId });
  return { girlfriendId, conversationId: Number(conversation.insertId) };
}
function rewardConfig() {
  const config = structuredClone(productFixture);
  for (const rule of Object.values(config.intimacy.rules)) rule.enabled = false;
  config.intimacy.minimumTextLength = 4;
  Object.assign(config.intimacy.rules.text_message, {
    enabled: true,
    basePoints: 7,
    bonusPoints: 4,
    bonusThreshold: 8,
    cooldownMinutes: 0,
    dailyLimit: 2,
  });
  return config;
}

describe("published product configuration", () => {
  it("rejects official drafts beyond the published field limits without changing saved or live content", () =>
    isolated(async (_tx, admin) => {
      await publish(admin, structuredClone(productFixture));
      const draft = await admin.discovery.admin.getDraft();
      const live = await guest.discovery.get();
      const source = draft.characters.find(item => !item.archived)!.data;
      for (const change of [
        (character: typeof source) => {
          character.behavior.userNickname = "称".repeat(41);
        },
        (character: typeof source) => {
          character.behavior.examples = Array.from({ length: 6 }, () => ({
            user: "你好",
            assistant: "你好",
          }));
        },
        (character: typeof source) => {
          character.behavior.examples = [
            { user: "字".repeat(301), assistant: "你好" },
          ];
        },
      ]) {
        const character = structuredClone(source);
        change(character);
        await expect(
          admin.discovery.admin.saveCharacter({
            expectedRevision: draft.revision,
            character,
          })
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          message: expect.stringContaining(source.id),
        });
      }
      expect(await admin.discovery.admin.getDraft()).toEqual(draft);
      expect(await guest.discovery.get()).toEqual(live);
    }));

  it("revalidates official publication against rules changed after the character draft was saved", () =>
    isolated(async (_tx, admin) => {
      const config = structuredClone(productFixture);
      config.characters.limits.nickname = 60;
      await publish(admin, config);
      let draft = await admin.discovery.admin.getDraft();
      const character = structuredClone(
        draft.characters.find(item => !item.archived)!.data
      );
      character.behavior.userNickname = "称".repeat(50);
      await admin.discovery.admin.saveCharacter({
        expectedRevision: draft.revision,
        character,
      });
      const live = await guest.discovery.get();
      config.characters.limits.nickname = 40;
      await publish(admin, config);
      draft = await admin.discovery.admin.getDraft();
      await expect(
        admin.discovery.admin.publish({ expectedRevision: draft.revision })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await guest.discovery.get()).toEqual(live);
      expect(await admin.discovery.admin.getDraft()).toEqual(draft);
      character.behavior.userNickname = "称".repeat(40);
      const saved = await admin.discovery.admin.saveCharacter({
        expectedRevision: draft.revision,
        character,
      });
      await admin.discovery.admin.publish({ expectedRevision: saved.revision });
      expect(
        (await guest.discovery.get()).characters.find(
          item => item.id === character.id
        )?.behavior.userNickname
      ).toHaveLength(40);
    }));

  it("keeps incompatible business limits in draft until live official characters have been updated", () =>
    isolated(async (_tx, admin) => {
      const config = structuredClone(productFixture);
      await publish(admin, config);
      const content = await admin.discovery.admin.getDraft();
      const character = structuredClone(
        content.characters.find(item => !item.archived)!.data
      );
      character.behavior.userNickname = "称".repeat(40);
      const savedCharacter = await admin.discovery.admin.saveCharacter({
        expectedRevision: content.revision,
        character,
      });
      await admin.discovery.admin.publish({
        expectedRevision: savedCharacter.revision,
      });
      const liveConfig = await guest.productConfig.get();
      const liveContent = await guest.discovery.get();
      config.characters.limits.nickname = 39;
      const draft = await admin.productConfig.admin.getDraft();
      const saved = await admin.productConfig.admin.save({
        expectedRevision: draft.revision,
        config,
      });
      const pending = await admin.productConfig.admin.getDraft();
      await expect(
        admin.productConfig.admin.publish({ expectedRevision: saved.revision })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await admin.productConfig.admin.getDraft()).toEqual(pending);
      expect(await guest.productConfig.get()).toEqual(liveConfig);
      expect(await guest.discovery.get()).toEqual(liveContent);
      character.behavior.userNickname = "称".repeat(39);
      const next = await admin.discovery.admin.getDraft();
      const updated = await admin.discovery.admin.saveCharacter({
        expectedRevision: next.revision,
        character,
      });
      await admin.discovery.admin.publish({
        expectedRevision: updated.revision,
      });
      await admin.productConfig.admin.publish({
        expectedRevision: saved.revision,
      });
      expect((await guest.productConfig.get()).characters.limits.nickname).toBe(
        39
      );
    }));

  it("seeds once, hides drafts, and denies every management operation without admin permission", () =>
    isolated(async (_tx, admin, userId) => {
      const initial = await guest.productConfig.get();
      expect(initial.billing.plans.map(p => p.id)).toEqual([
        "free",
        "plus",
        "pro",
      ]);
      expect(initial.selfies.poses).toHaveLength(9);
      expect(initial.intimacy.levels).toHaveLength(10);
      expect(initial).not.toHaveProperty("draft");
      expect(initial).not.toHaveProperty("updatedBy");
      const config = structuredClone(productFixture);
      config.billing.plans[0].label = { "zh-CN": "保存但未发布" };
      const draft = await admin.productConfig.admin.getDraft();
      await admin.productConfig.admin.save({
        expectedRevision: draft.revision,
        config,
      });
      await initializeProductConfig();
      const pending = await admin.productConfig.admin.getDraft();
      expect(pending.published).toEqual(draft.published);
      expect(pending.published.billing).toEqual(initial.billing);
      expect((await admin.productConfig.admin.getDraft()).config).toEqual(
        config
      );
      expect((await guest.productConfig.get()).billing).toEqual(
        initial.billing
      );
      for (const denied of [guest, caller(userId, "user")]) {
        await expect(
          denied.productConfig.admin.getDraft()
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          denied.productConfig.admin.save({ expectedRevision: 1, config })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          denied.productConfig.admin.publish({ expectedRevision: 1 })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    }));

  it("rejects stale edits and invalid cross-domain references without changing published rules", () =>
    isolated(async (_tx, admin) => {
      const initial = await guest.productConfig.get();
      const draft = await admin.productConfig.admin.getDraft();
      const saved = await admin.productConfig.admin.save({
        expectedRevision: draft.revision,
        config: productFixture,
      });
      await expect(
        admin.productConfig.admin.publish({ expectedRevision: draft.revision })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        admin.productConfig.admin.save({
          expectedRevision: draft.revision,
          config: productFixture,
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      for (const change of [
        (c: ProductConfig) => {
          c.selfies.defaultPoseId = "missing";
        },
        (c: ProductConfig) => {
          c.intimacy.levels[1].requiredPoints = 0;
        },
        (c: ProductConfig) => {
          c.selfies.poses[0].minLevel = 100;
        },
        (c: ProductConfig) => {
          c.billing.plans[0].enabled = false;
        },
        (c: ProductConfig) => {
          c.billing.plans[1].lemonVariantId =
            c.billing.plans[2].lemonVariantId = "123";
        },
      ]) {
        const invalid = structuredClone(productFixture);
        change(invalid);
        await expect(
          admin.productConfig.admin.save({
            expectedRevision: saved.revision,
            config: invalid,
          })
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
      expect(await guest.productConfig.get()).toEqual(initial);
    }));

  it("publishes new theme IDs and validates actual persisted preferences against enabled themes", () =>
    isolated(async (_tx, admin, userId) => {
      const config = structuredClone(productFixture);
      config.themes.items = [
        {
          ...config.themes.items[0],
          id: "ocean",
          name: { "zh-CN": "海洋" },
          light: "#123456",
        },
      ];
      config.themes.defaultThemeId = "ocean";
      await publish(admin, config);
      const user = caller(userId, "user");
      expect(await user.preferences.get()).toMatchObject({ theme: "ocean" });
      await user.preferences.update({ theme: "ocean" });
      expect(await user.preferences.get()).toMatchObject({
        theme: "ocean",
        initialized: true,
      });
      await expect(
        user.preferences.update({ theme: "sakura" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(
        localizeProductConfig(await guest.productConfig.get(), "en").themes
          .items[0]
      ).toMatchObject({ id: "ocean", name: "海洋", light: "#123456" });
    }));

  it("publishes arbitrary plan IDs, prices and actual quota limits together", () =>
    isolated(async (tx, admin, userId) => {
      const config = structuredClone(productFixture);
      config.billing.mode = "lemonsqueezy";
      const paid = structuredClone(config.billing.plans[1]);
      Object.assign(paid, {
        id: "studio",
        label: { "zh-CN": "创作年卡" },
        price: { amount: 49, currency: "CNY", period: "year" },
        checkoutUrl: "https://checkout.example.test/studio",
        lemonVariantId: "7001",
      });
      paid.limits.dailyMessages = 1;
      paid.limits.dailySelfies = null;
      paid.limits.monthlySelfies = null;
      paid.limits.couplePhoto = true;
      config.billing.plans = [config.billing.plans[0], paid];
      config.billing.selfHostedTierId = "studio";
      config.billing.rateLimits.tts = 1;
      config.billing.rateLimits.selfie = 0;
      await publish(admin, config);
      await tx.insert(subscriptions).values({
        userId,
        plan: "studio",
        status: "active",
        lsSubscriptionId: crypto.randomUUID(),
      });
      const user = caller(userId, "user");
      const info = await user.billing.getInfo();
      expect(info.tier).toBe("studio");
      expect(info.plans[1]).toEqual(paid);
      expect(info.limits).toEqual(paid.limits);
      expect(info.usage.chatLimit).toBe(1);
      expect(info.checkoutUrls.studio).toBe(paid.checkoutUrl);
      expect((await getTierLimits(userId)).limits).toEqual(paid.limits);
      expect(await user.selfie.quota()).toMatchObject({
        unlimited: true,
        remaining: null,
      });
      const role = await roleFixture(tx, userId);
      const reserve = () =>
        tx.transaction(inner =>
          reserveGenerationInTransaction(inner, {
            userId,
            conversationId: role.conversationId,
            kind: "chat",
            meter: {
              name: METERS.chat,
              period: "day",
              limit: info.limits.dailyMessages!,
              what: "messages",
            },
          })
        );
      await reserve();
      await expect(reserve()).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
      expect(await getDailyMeter(userId, METERS.chat)).toBe(1);
      await checkRateLimit(userId, "tts");
      await expect(checkRateLimit(userId, "tts")).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
      await expect(checkRateLimit(userId, "selfie")).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
      expect(await getDailyMeter(userId, METERS.selfie)).toBe(0);
    }));

  it("uses active dynamic pose IDs, aliases, prompts and current points for unlock enforcement", () =>
    isolated(async (tx, admin, userId) => {
      const config = structuredClone(productFixture);
      config.intimacy.levels = config.intimacy.levels.slice(0, 3);
      config.videos.presets = [];
      config.intimacy.levels[1].requiredPoints = 10;
      config.intimacy.levels[2].requiredPoints = 20;
      config.selfies.poses = [
        { ...config.selfies.poses[0], id: "base", minLevel: 1 },
        {
          ...config.selfies.poses[0],
          id: "orbit",
          minLevel: 3,
          label: { "zh-CN": "新姿势" },
          aliases: ["星轨姿势"],
          promptFragment: "dynamic orbit composition",
        },
      ];
      config.selfies.defaultPoseId = "base";
      await publish(admin, config);
      const role = await roleFixture(tx, userId, 15);
      expect(
        detectSelfieRequest(
          "给我发一张星轨姿势自拍",
          config.selfies.poses,
          config.selfies.defaultPoseId
        )?.poseId
      ).toBe("orbit");
      expect(
        localizeProductConfig(config, "en").intimacy.levels[2].unlocks
      ).toEqual(["新姿势"]);
      expect(
        buildImagePrompt({
          userContext: "",
          generationMode: "reference",
          appearance: "自然",
          pose: config.selfies.poses[1],
        }).prompt
      ).toContain("dynamic orbit composition");
      const input = {
        conversationId: role.conversationId,
        poseId: "orbit",
        userContext: "",
        generationMode: "reference" as const,
      };
      const user = { id: userId, birthDate: new Date("1990-01-01") };
      await expect(
        generateConversationSelfie(user, input)
      ).rejects.toMatchObject({ code: "FORBIDDEN", message: "LEVEL_LOCKED" });
      expect(
        (await getActiveGirlfriend(userId, role.girlfriendId))?.intimacyLevel
      ).toBe(2);
      config.intimacy.levels[2].requiredPoints = 15;
      await publish(admin, config);
      vi.spyOn(imageProvider, "resolveImageProvider").mockResolvedValue({
        name: "fal",
        configured: false,
        isByok: false,
      } as never);
      await expect(
        generateConversationSelfie(user, input)
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(
        (
          await caller(userId, "user").girlfriend.getIntimacy({
            girlfriendId: role.girlfriendId,
          })
        ).intimacyLevel
      ).toBe(3);
      config.selfies.poses[1].enabled = false;
      await publish(admin, config);
      await expect(
        generateConversationSelfie(user, input)
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Unknown pose" });
      expect(
        localizeProductConfig(config, "zh-CN").intimacy.levels[2].unlocks
      ).toEqual([]);
    }));

  it("settles configurable text eligibility, bonuses, daily frequency and disabled rules", () =>
    isolated(async (tx, admin, userId) => {
      const config = rewardConfig();
      config.intimacy.dailyPointsLimit = 30;
      config.intimacy.levels[1].requiredPoints = 9;
      await publish(admin, config);
      const { girlfriendId } = await roleFixture(tx, userId);
      const award = (textLength: number) =>
        tx.transaction(inner =>
          awardIntimacy(inner, girlfriendId, userId, "text_message", {
            textLength,
          })
        );
      expect((await award(3)).pointsAdded).toBe(0);
      expect((await award(8)).pointsAdded).toBe(7);
      expect(await award(9)).toMatchObject({
        pointsAdded: 11,
        intimacyPoints: 18,
        intimacyLevel: 2,
        leveledUp: true,
      });
      expect((await award(9)).pointsAdded).toBe(0);
      expect(
        await getDailyMeter(
          userId,
          METERS.intimacyReason(girlfriendId, "text_message")
        )
      ).toBe(2);
      config.intimacy.rules.text_message.dailyLimit = null;
      config.intimacy.rules.text_message.enabled = false;
      await publish(admin, config);
      expect((await award(9)).pointsAdded).toBe(0);
    }));

  it("applies cooldown and first-selfie bonuses, and leaves all counters unchanged when the daily XP budget refuses a group", () =>
    isolated(async (tx, admin, userId) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
      const config = rewardConfig();
      config.intimacy.rules.text_message.enabled = false;
      Object.assign(config.intimacy.rules.selfie, {
        enabled: true,
        basePoints: 6,
        bonusPoints: 4,
        cooldownMinutes: 1,
        dailyLimit: 4,
      });
      config.intimacy.dailyPointsLimit = 9;
      await publish(admin, config);
      const { girlfriendId } = await roleFixture(tx, userId);
      const award = () =>
        tx.transaction(inner =>
          awardIntimacy(inner, girlfriendId, userId, "selfie")
        );
      expect((await award()).pointsAdded).toBe(0);
      expect(
        await getDailyMeter(
          userId,
          METERS.intimacyReason(girlfriendId, "selfie")
        )
      ).toBe(0);
      config.intimacy.dailyPointsLimit = 16;
      await publish(admin, config);
      expect((await award()).pointsAdded).toBe(10);
      expect((await award()).pointsAdded).toBe(0);
      vi.setSystemTime(new Date("2026-10-21T12:01:00Z"));
      expect((await award()).pointsAdded).toBe(6);
      vi.setSystemTime(new Date("2026-10-21T12:02:00Z"));
      expect((await award()).pointsAdded).toBe(0);
      expect(
        await getDailyMeter(userId, METERS.intimacyPoints(girlfriendId))
      ).toBe(16);
      expect(
        await getDailyMeter(
          userId,
          METERS.intimacyReason(girlfriendId, "selfie")
        )
      ).toBe(2);
    }));

  it("awards one daily and one night bonus per transaction from configured streak and timezone", () =>
    isolated(async (tx, admin, userId) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-21T15:00:00Z"));
      const config = rewardConfig();
      config.intimacy.night = {
        timeZone: "Asia/Shanghai",
        startHour: 22,
        endHour: 6,
      };
      Object.assign(config.intimacy.rules.daily_first, {
        enabled: true,
        basePoints: 10,
        bonusPoints: 20,
        bonusThreshold: 3,
      });
      Object.assign(config.intimacy.rules.night_chat, {
        enabled: true,
        basePoints: 4,
        dailyLimit: 1,
      });
      Object.assign(config.intimacy.rules.voice_message, {
        enabled: true,
        basePoints: 5,
        bonusPoints: 2,
        bonusThreshold: 1000,
      });
      await publish(admin, config);
      const { girlfriendId } = await roleFixture(tx, userId);
      await tx
        .update(girlfriends)
        .set({
          lastInteractionAt: new Date("2026-10-20T15:00:00Z"),
          consecutiveDays: 2,
        })
        .where(eq(girlfriends.id, girlfriendId));
      await tx.transaction(async inner => {
        const text = await awardIntimacy(
          inner,
          girlfriendId,
          userId,
          "text_message",
          { textLength: 4 }
        );
        expect(text.pointsAdded).toBe(41);
        const voice = await awardIntimacy(
          inner,
          girlfriendId,
          userId,
          "voice_message",
          { durationMs: 1001 }
        );
        expect(voice.pointsAdded).toBe(7);
      });
      expect(
        await getDailyMeter(
          userId,
          METERS.intimacyReason(girlfriendId, "daily_first")
        )
      ).toBe(1);
      expect(
        await getDailyMeter(
          userId,
          METERS.intimacyReason(girlfriendId, "night_chat")
        )
      ).toBe(1);
      expect(
        await getDailyMeter(userId, METERS.intimacyPoints(girlfriendId))
      ).toBe(48);
    }));

  it("holds one snapshot during settlement while later transactions see the next publication", () =>
    isolated(async (tx, admin) => {
      const before = await getPublishedProductConfig(tx);
      const config = structuredClone(productFixture);
      config.intimacy.dailyPointsLimit = 51;
      await publish(admin, config);
      expect(
        (await getPublishedProductConfig(tx)).intimacy.dailyPointsLimit
      ).toBe(before.intimacy.dailyPointsLimit);
      expect(
        (await getPublishedProductConfig()).intimacy.dailyPointsLimit
      ).toBe(51);
      const [row] = await tx
        .select()
        .from(productConfiguration)
        .where(eq(productConfiguration.id, "main"));
      expect(row.published.intimacy.dailyPointsLimit).toBe(51);
    }));
});
