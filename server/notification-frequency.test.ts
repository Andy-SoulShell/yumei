/** 验证主动联系显式同意、本地日期、六小时间隔及并发唯一创建。 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROACTIVE_PREFERENCES } from "../shared/proactiveContact";
import { saveCompanionPreferences } from "./companionPreferences";
import {
  checkAndCreateProactiveNotification,
  createNotification,
  markNotificationRead,
} from "./repositories/notifications";
import { createTestGirlfriend } from "./testFixtures";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubEnv("COMPANION_PROACTIVE_ENABLED", "1");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const dailyPreferences = {
  ...DEFAULT_PROACTIVE_PREFERENCES,
  proactiveMode: "daily" as const,
  quietStart: 0,
  quietEnd: 0,
};

async function fixture() {
  const userId = `frequency-${crypto.randomUUID()}`;
  const girlfriend = await createTestGirlfriend({
    userId,
    name: "YUMEI",
    personality: "自然",
    appearance: "自然",
    referenceImageKey: "test-ref",
    referenceImageUrl: "https://example.test/ref",
  });
  return { userId, girlfriend };
}

describe("proactive frequency", () => {
  it("requires consent and excludes ordinary unread notifications from proactive backoff", async () => {
    vi.setSystemTime(new Date("2026-10-19T01:00:00Z"));
    const { userId, girlfriend } = await fixture();
    const preferences = { ...dailyPreferences, timeZone: "Asia/Shanghai" };
    const saved = await saveCompanionPreferences(userId, 0, preferences);
    await createNotification({
      userId,
      girlfriendId: girlfriend.id,
      title: { key: "notifications:title.random", values: { name: "Test" } },
      content: { key: "notifications:heyAreYouFreeIDLoveTo" },
      createdAt: new Date(),
    });
    expect(await checkAndCreateProactiveNotification(userId)).toBeNull();
    await saveCompanionPreferences(userId, saved.revision, {
      ...preferences,
      proactiveEnabled: true,
    });
    expect(await checkAndCreateProactiveNotification(userId)).not.toBeNull();
  });

  it("creates once concurrently and preserves the six-hour floor across local midnight", async () => {
    vi.setSystemTime(new Date("2026-10-19T23:59:00Z"));
    const { userId } = await fixture();
    await saveCompanionPreferences(userId, 0, {
      ...dailyPreferences,
      proactiveEnabled: true,
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        checkAndCreateProactiveNotification(userId)
      )
    );
    const created = results.filter(value => value !== null);
    expect(created).toHaveLength(1);
    await markNotificationRead(created[0]!.id, userId);
    vi.setSystemTime(new Date("2026-10-20T00:01:00Z"));
    expect(await checkAndCreateProactiveNotification(userId)).toBeNull();
    vi.setSystemTime(new Date("2026-10-20T08:00:00Z"));
    expect(await checkAndCreateProactiveNotification(userId)).not.toBeNull();
    expect(await checkAndCreateProactiveNotification(userId)).toBeNull();
  });
});
