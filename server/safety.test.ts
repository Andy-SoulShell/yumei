import { describe, expect, it } from "vitest";
import { detectSelfHarm, SAFETY_SYSTEM_CLAUSE } from "../shared/safety";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides?: Partial<AuthenticatedUser>): {
  ctx: TrpcContext;
} {
  const user = {
    id: "safety-test-user",
    openId: null,
    email: "safety@example.com",
    emailVerified: true,
    image: null,
    name: "Safety Tester",
    loginMethod: null,
    role: "user",
    birthDate: new Date("1990-01-01"),
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  } as AuthenticatedUser;

  return {
    ctx: {
      user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    },
  };
}

describe("detectSelfHarm (M1-6 / SB 243)", () => {
  it("flags Chinese crisis expressions", () => {
    expect(detectSelfHarm("我最近总觉得活不下去了")).toBe(true);
    expect(detectSelfHarm("有时候真的不想活了")).toBe(true);
    expect(detectSelfHarm("我想自杀")).toBe(true);
  });

  it("flags English crisis expressions", () => {
    expect(detectSelfHarm("sometimes I want to kill myself")).toBe(true);
    expect(detectSelfHarm("I've been thinking about suicide")).toBe(true);
  });

  it("does not flag ordinary conversation", () => {
    expect(detectSelfHarm("今天天气真好，我们去公园散步吧")).toBe(false);
    expect(detectSelfHarm("what should we have for dinner?")).toBe(false);
    expect(detectSelfHarm("")).toBe(false);
  });
});

describe("safety system clause", () => {
  it("forbids self-harm content and role-play bypasses", () => {
    expect(SAFETY_SYSTEM_CLAUSE).toContain("安全边界");
    expect(SAFETY_SYSTEM_CLAUSE).toContain("角色扮演");
  });
});

describe("age gate (M1-6)", () => {
  it("rejects under-18 birth dates in auth.confirmAge", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const seventeenYearsAgo = new Date();
    seventeenYearsAgo.setUTCFullYear(seventeenYearsAgo.getUTCFullYear() - 17);
    await expect(
      caller.auth.confirmAge({
        birthDate: seventeenYearsAgo.toISOString().slice(0, 10),
      })
    ).rejects.toThrowError(/18\+/);
  });

  it("rejects future birth dates", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.confirmAge({ birthDate: "2999-01-01" })
    ).rejects.toThrowError(/valid date/);
  });

  it("blocks chat.sendMessage until age is confirmed", async () => {
    const { ctx } = createAuthContext({ birthDate: null as any });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.chat.sendMessage({ conversationId: 1, content: "hi" })
    ).rejects.toThrowError(/AGE_CONFIRMATION_REQUIRED/);
  });

  it("blocks selfie.generate until age is confirmed", async () => {
    const { ctx } = createAuthContext({ birthDate: null as any });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.selfie.generate({ conversationId: 1, userContext: "selfie" })
    ).rejects.toThrowError(/AGE_CONFIRMATION_REQUIRED/);
  });
});
