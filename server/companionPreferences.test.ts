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

it("confirms a new account's detected timezone without authorizing contact", async () => {
  const { initializeCompanionTimeZone } =
    await import("./companionPreferences");
  const id = await createTestUser();
  expect((await getCompanionPreferences(id)).timeZoneInitialized).toBe(false);
  const saved = await initializeCompanionTimeZone(id, "Asia/Shanghai");
  expect(saved).toMatchObject({
    timeZone: "Asia/Shanghai",
    timeZoneInitialized: true,
    proactiveEnabled: false,
    revision: 1,
  });
  expect(await getCompanionPreferences(id)).toMatchObject(saved);
  expect(await initializeCompanionTimeZone(id, "Asia/Tokyo")).toMatchObject(
    saved
  );
});

it("records an explicit UTC choice and preserves saved preferences across devices", async () => {
  const { initializeCompanionTimeZone } =
    await import("./companionPreferences");
  const id = await createTestUser();
  await initializeCompanionTimeZone(id, "UTC");
  expect((await getCompanionPreferences(id)).timeZoneInitialized).toBe(true);
  expect((await initializeCompanionTimeZone(id, "Asia/Tokyo")).timeZone).toBe(
    "UTC"
  );
  const other = await createTestUser();
  await saveCompanionPreferences(other, 0, {
    ...DEFAULT_PROACTIVE_PREFERENCES,
    timeZone: "Europe/London",
    proactiveEnabled: true,
    frequencyDays: 7,
  });
  expect(
    await initializeCompanionTimeZone(other, "Asia/Shanghai")
  ).toMatchObject({
    timeZone: "Europe/London",
    proactiveEnabled: true,
    frequencyDays: 7,
    revision: 1,
  });
});

it("initializes once under concurrent devices and rejects invalid zones without a write", async () => {
  const { initializeCompanionTimeZone } =
    await import("./companionPreferences");
  const id = await createTestUser();
  await expect(
    initializeCompanionTimeZone(id, "Invalid/Zone")
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect((await getCompanionPreferences(id)).timeZoneInitialized).toBe(false);
  const saved = await Promise.all([
    initializeCompanionTimeZone(id, "Asia/Shanghai"),
    initializeCompanionTimeZone(id, "Asia/Tokyo"),
  ]);
  expect(saved[0].timeZone).toBe(saved[1].timeZone);
  expect(saved.map(v => v.revision)).toEqual([1, 1]);
});
