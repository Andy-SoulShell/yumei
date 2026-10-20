/** 用真实订阅记录覆盖账号切换、密钥轮换与迟到的失效清理。 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pushSubscriptions } from "../drizzle/schema";
import { getDb } from "./database";
import {
  hasPushSubscription,
  removePushSubscription,
  savePushSubscription,
  sendPushToUser,
} from "./push";
import { createTestUser } from "./testFixtures";

const mock = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: mock.send },
}));
beforeEach(() => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "test-public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private");
  mock.send.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function seed() {
  const userId = await createTestUser();
  const endpoint = `https://push.example.test/${crypto.randomUUID()}`;
  await savePushSubscription(userId, {
    endpoint,
    keys: { p256dh: "old-public", auth: "old-auth" },
  });
  return { userId, endpoint, db: (await getDb())! };
}
it.each(["transferred", "rotated"])(
  "preserves a %s subscription when the previous delivery returns 410",
  async change => {
    const a = await seed();
    const newOwner =
      change === "transferred" ? await createTestUser() : a.userId;
    mock.send.mockImplementationOnce(async () => {
      await savePushSubscription(newOwner, {
        endpoint: a.endpoint,
        keys: { p256dh: "new-public", auth: "new-auth" },
      });
      throw Object.assign(new Error("expired"), { statusCode: 410 });
    });
    expect(
      await sendPushToUser(a.userId, { title: "Test", body: "Message" })
    ).toBe(0);
    expect(await hasPushSubscription(newOwner)).toBe(true);
    const [row] = await a.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, a.endpoint));
    expect(row).toMatchObject({
      userId: newOwner,
      p256dh: "new-public",
      auth: "new-auth",
    });
  }
);
it.each([404, 410])(
  "removes an unchanged expired endpoint on HTTP %s",
  async statusCode => {
    const a = await seed();
    const b = await seed();
    mock.send.mockRejectedValueOnce(
      Object.assign(new Error("expired"), { statusCode })
    );
    expect(
      await sendPushToUser(a.userId, { title: "Test", body: "Message" })
    ).toBe(0);
    expect(await hasPushSubscription(a.userId)).toBe(false);
    expect(await hasPushSubscription(b.userId)).toBe(true);
  }
);
it("does not remove the new owner's endpoint when ownership changes before the delete executes", async () => {
  const a = await seed();
  const newOwner = await createTestUser();
  const deleteRow = a.db.delete.bind(a.db);
  vi.spyOn(a.db, "delete").mockImplementationOnce(table => {
    const query = deleteRow(table);
    const where = query.where.bind(query);
    query.where = ((condition: Parameters<typeof where>[0]) =>
      savePushSubscription(newOwner, {
        endpoint: a.endpoint,
        keys: { p256dh: "new-public", auth: "new-auth" },
      }).then(() => where(condition))) as typeof query.where;
    return query;
  });
  await removePushSubscription(a.userId, a.endpoint);
  expect(await hasPushSubscription(newOwner)).toBe(true);
});
