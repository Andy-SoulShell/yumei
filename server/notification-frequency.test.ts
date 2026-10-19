/** 在任意应用时区下验证 UTC 通知频控及并发唯一生成。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestGirlfriend } from "./testFixtures";
import { checkAndCreateProactiveNotification, createNotification } from "./db";

afterEach(() => vi.useRealTimers());

describe("proactive frequency", () => {
  it("observes a UTC notification early in the day even in Asia/Shanghai", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T01:00:00Z"));
    const userId = `frequency-${crypto.randomUUID()}`;
    const gf = await createTestGirlfriend({
      userId,
      name: "YUMEI",
      personality: "自然",
      appearance: "自然",
      referenceImageKey: "test-ref",
      referenceImageUrl: "https://example.test/ref",
    });
    await createNotification({
      userId,
      girlfriendId: gf.id,
      title: "已有通知",
      content: "你好",
      createdAt: new Date(),
    });
    expect(await checkAndCreateProactiveNotification(userId)).toBeNull();
  });

  it("creates one notification across concurrent checks and allows the next UTC day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T23:59:00Z"));
    const userId = `frequency-${crypto.randomUUID()}`;
    await createTestGirlfriend({
      userId,
      name: "YUMEI",
      personality: "自然",
      appearance: "自然",
      referenceImageKey: "test-ref",
      referenceImageUrl: "https://example.test/ref",
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        checkAndCreateProactiveNotification(userId)
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    vi.setSystemTime(new Date("2026-10-20T00:01:00Z"));
    expect(await checkAndCreateProactiveNotification(userId)).not.toBeNull();
    expect(await checkAndCreateProactiveNotification(userId)).toBeNull();
  });
});
