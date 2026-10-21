import { DEFAULT_PROACTIVE_PREFERENCES } from "./testProductConfig";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { girlfriends } from "../drizzle/schema";

import { getCompanionPreferences } from "./aiTaskRuntime";
import { saveCompanionPreferences } from "./companionPreferences";
import { getDb } from "./database";
import { createTestGirlfriend, createTestUser } from "./testFixtures";

it("starts opt-out and prevents concurrent preference overwrites", async () => {
  const userId = await createTestUser();
  expect(await getCompanionPreferences(userId)).toMatchObject({
    proactiveEnabled: false,
    hidePrivatePreview: true,
    revision: 0,
  });
  const result = await Promise.allSettled([
    saveCompanionPreferences(userId, 0, {
      ...DEFAULT_PROACTIVE_PREFERENCES,
      proactiveEnabled: true,
    }),
    saveCompanionPreferences(userId, 0, {
      ...DEFAULT_PROACTIVE_PREFERENCES,
      frequencyDays: 3,
    }),
  ]);
  expect(result.filter(item => item.status === "fulfilled")).toHaveLength(1);
  const rejected = result.find(
    item => item.status === "rejected"
  ) as PromiseRejectedResult;
  expect(rejected.reason).toMatchObject({ code: "CONFLICT" });
});
it("shares the memory timezone and invalidates prepared role contexts", async () => {
  const userId = await createTestUser();
  const gf = await createTestGirlfriend({
    userId,
    name: "test",
    personality: "test",
    appearance: "test",
    referenceImageKey: "preferences-ref",
    referenceImageUrl: "/files/preferences-ref",
  });
  await saveCompanionPreferences(userId, 0, {
    ...DEFAULT_PROACTIVE_PREFERENCES,
    timeZone: "Asia/Shanghai",
  });
  expect((await getCompanionPreferences(userId)).timeZone).toBe(
    "Asia/Shanghai"
  );
  const [role] = await (await getDb())!
    .select()
    .from(girlfriends)
    .where(eq(girlfriends.id, gf.id));
  expect(role.memoryEpoch).toBe(gf.memoryEpoch + 1);
  await expect(
    saveCompanionPreferences(userId, 1, {
      ...DEFAULT_PROACTIVE_PREFERENCES,
      timeZone: "Mars/Unknown",
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
