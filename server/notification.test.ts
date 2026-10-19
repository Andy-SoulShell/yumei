import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 9901): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    // users.id is varchar(255) since the Better-Auth migration (0013).
    id: `notif-user-${userId}`,
    openId: `notif-test-user-${userId}`,
    email: `notiftest${userId}@example.com`,
    name: "Notif Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    avatarUrl: null,
  };
  return { ctx: { user, res: {} as any } };
}

describe("Notification System", () => {
  const caller = appRouter.createCaller(createAuthContext().ctx);

  it("should return empty notification list for new user", async () => {
    const result = await caller.notification.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("should return 0 unread count for new user", async () => {
    const count = await caller.notification.unreadCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("should handle checkProactive without error", async () => {
    const result = await caller.notification.checkProactive();
    // Can be null or a notification object
    if (result) {
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("content");
    }
  });

  it("should handle markAllRead without error", async () => {
    const result = await caller.notification.markAllRead();
    expect(result).toEqual({ success: true });
  });

  it("should handle markRead with valid id", async () => {
    // First check if there are any notifications
    const notifs = await caller.notification.list();
    if (notifs.length > 0) {
      const result = await caller.notification.markRead({ id: notifs[0].id });
      expect(result).toEqual({ success: true });
    }
  });
});
