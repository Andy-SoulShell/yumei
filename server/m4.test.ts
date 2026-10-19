import { afterEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { SELFIE_POSES, getPose, posesForLevel } from "../shared/selfiePoses";
import {
  isPushConfigured,
  getVapidPublicKey,
  savePushSubscription,
  hasPushSubscription,
  removePushSubscription,
} from "./push";
import { getDb, createGirlfriend, createConversation } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: string): { ctx: TrpcContext } {
  const user = {
    id: userId,
    openId: null,
    email: `${userId}@example.com`,
    emailVerified: true,
    image: null,
    name: "M4 Tester",
    loginMethod: null,
    role: "user",
    birthDate: new Date("1990-01-01"),
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as AuthenticatedUser;
  return {
    ctx: {
      user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    },
  };
}

async function seedGirlfriendAndConversation(userId: string, intimacyLevel = 1) {
  const gf = await createGirlfriend({
    userId,
    name: "M4Test",
    personality: "test",
    appearance: "test",
    referenceImageUrl: "https://example.com/ref.png",
    referenceImageKey: "m4-ref",
    intimacyLevel,
    isActive: true,
  });
  const convo = await createConversation({ userId, girlfriendId: gf.id });
  return { gf, convo };
}

afterEach(() => {
  delete process.env.BILLING_PROVIDER;
});

describe("selfie pose library (M4-1)", () => {
  it("exposes the intimacy-promised poses at the right levels", () => {
    expect(getPose("aegyo")?.minLevel).toBe(2); // 解锁「撒娇」Lv2
    expect(getPose("intimate")?.minLevel).toBe(3); // 解锁「亲密」Lv3
    expect(getPose("alluring")?.minLevel).toBe(5); // 解锁「诱惑」Lv5
  });

  it("posesForLevel filters by level and grows with it", () => {
    const lvl1 = posesForLevel(1);
    const lvl10 = posesForLevel(10);
    expect(lvl1.every(p => p.minLevel <= 1)).toBe(true);
    expect(lvl1.length).toBeGreaterThanOrEqual(2);
    expect(lvl10.length).toBe(SELFIE_POSES.length);
  });

  it("rejects a locked pose server-side (LEVEL_LOCKED)", async () => {
    if (!(await getDb())) return;
    const userId = `m4-user-${nanoid(8)}`;
    const { convo } = await seedGirlfriendAndConversation(userId, 1);
    const caller = appRouter.createCaller(createAuthContext(userId).ctx);

    await expect(
      caller.selfie.generate({
        conversationId: convo.id,
        userContext: "",
        poseId: "alluring", // requires level 5
      })
    ).rejects.toThrowError(/LEVEL_LOCKED/);
  });

  it("rejects unknown pose ids", async () => {
    if (!(await getDb())) return;
    const userId = `m4-user-${nanoid(8)}`;
    const { convo } = await seedGirlfriendAndConversation(userId, 1);
    const caller = appRouter.createCaller(createAuthContext(userId).ctx);

    await expect(
      caller.selfie.generate({
        conversationId: convo.id,
        userContext: "",
        poseId: "no-such-pose",
      })
    ).rejects.toThrowError(/Unknown pose/);
  });
});

describe("couple photo gating (M4-2)", () => {
  it("requires pro tier when billing is enforced", async () => {
    if (!(await getDb())) return;
    process.env.BILLING_PROVIDER = "free"; // everyone free, no BYOK
    const userId = `m4-user-${nanoid(8)}`;
    const { convo } = await seedGirlfriendAndConversation(userId, 1);
    const caller = appRouter.createCaller(createAuthContext(userId).ctx);

    await expect(
      caller.selfie.generateCouple({
        conversationId: convo.id,
        userPhotoBase64: "aGVsbG8=",
        userPhotoMimeType: "image/png",
      })
    ).rejects.toThrowError(/UPGRADE_REQUIRED/);
  });

  it("rejects unsupported photo formats before any spend", async () => {
    if (!(await getDb())) return;
    // self-host mode: no tier gate, format check is the next stop
    process.env.BILLING_PROVIDER = "none";
    const userId = `m4-user-${nanoid(8)}`;
    const { convo } = await seedGirlfriendAndConversation(userId, 1);
    const caller = appRouter.createCaller(createAuthContext(userId).ctx);

    await expect(
      caller.selfie.generateCouple({
        conversationId: convo.id,
        userPhotoBase64: "aGVsbG8=",
        userPhotoMimeType: "image/gif",
      })
    ).rejects.toThrowError(/Unsupported photo format|fal.ai key/);
  });
});

describe("web push (M4-4)", () => {
  it("is dormant without VAPID keys", () => {
    expect(isPushConfigured()).toBe(false);
    expect(getVapidPublicKey()).toBeNull();
  });

  it("saves, reports, and removes subscriptions with ownership", async () => {
    if (!(await getDb())) return;
    const userId = `m4-push-${nanoid(8)}`;
    const endpoint = `https://push.example.com/ep/${nanoid(12)}`;

    expect(await hasPushSubscription(userId)).toBe(false);
    await savePushSubscription(userId, {
      endpoint,
      keys: { p256dh: "p-key", auth: "a-key" },
    });
    expect(await hasPushSubscription(userId)).toBe(true);

    // Someone else cannot remove it.
    await removePushSubscription("someone-else", endpoint);
    expect(await hasPushSubscription(userId)).toBe(true);

    // The owner can.
    await removePushSubscription(userId, endpoint);
    expect(await hasPushSubscription(userId)).toBe(false);
  });

  it("upserts on duplicate endpoints", async () => {
    if (!(await getDb())) return;
    const userId = `m4-push-${nanoid(8)}`;
    const endpoint = `https://push.example.com/ep/${nanoid(12)}`;
    await savePushSubscription(userId, {
      endpoint,
      keys: { p256dh: "k1", auth: "a1" },
    });
    await savePushSubscription(userId, {
      endpoint,
      keys: { p256dh: "k2", auth: "a2" },
    });
    expect(await hasPushSubscription(userId)).toBe(true);
  });
});
