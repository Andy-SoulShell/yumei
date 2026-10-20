/** 通过真实路由验证首次并发保存、分区字段合并和账号隔离。 */
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { apiConfigs } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./database";
import { getUserApiConfig } from "./repositories/apiConfig";
import { appRouter } from "./routers";
import { createTestUser } from "./testFixtures";

it("merges concurrent first saves from independent settings sections without losing a section", async () => {
  const userId = await createTestUser();
  const caller = appRouter.createCaller({
    user: { id: userId },
    req: {},
    res: {},
  } as TrpcContext);
  const patches = [
    { llmModel: "test/model" },
    { ttsProvider: "elevenlabs" as const },
    { elevenlabsVoiceId: "test-voice" },
    { elevenlabsVoiceName: "Test Voice" },
    { fishAudioModelId: "fish-voice" },
    { globalPrompt: "请自然地交流" },
    { replyLanguage: "中文" },
    { replyLengthLimit: "100字" },
  ];
  const results = await Promise.allSettled(
    patches.map(patch => caller.apiConfig.updatePreferences(patch))
  );
  expect(results.map(result => result.status)).toEqual(
    patches.map(() => "fulfilled")
  );
  expect(await getUserApiConfig(userId)).toMatchObject(
    Object.assign({}, ...patches)
  );
  const db = (await getDb())!;
  expect(
    await db.select().from(apiConfigs).where(eq(apiConfigs.userId, userId))
  ).toHaveLength(1);
});

it("preserves other settings fields and another account when updating one section", async () => {
  const [userId, otherId] = await Promise.all([
    createTestUser(),
    createTestUser(),
  ]);
  const caller = (id: string) =>
    appRouter.createCaller({ user: { id }, req: {}, res: {} } as TrpcContext);
  await caller(userId).apiConfig.updatePreferences({
    globalPrompt: "原始提示词",
    replyLanguage: "中文",
  });
  await caller(otherId).apiConfig.updatePreferences({
    globalPrompt: "其他账号",
  });
  await Promise.all([
    caller(userId).apiConfig.updatePreferences({ llmModel: "test/new-model" }),
    caller(userId).apiConfig.updatePreferences({ ttsProvider: "fishaudio" }),
  ]);
  expect(await getUserApiConfig(userId)).toMatchObject({
    globalPrompt: "原始提示词",
    replyLanguage: "中文",
    llmModel: "test/new-model",
    ttsProvider: "fishaudio",
  });
  expect((await getUserApiConfig(otherId))?.globalPrompt).toBe("其他账号");
});
