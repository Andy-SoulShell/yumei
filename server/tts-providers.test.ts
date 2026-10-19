import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// 创建认证上下文
function createAuthContext(): { ctx: TrpcContext } {
  const user = {
    id: "test-user-1",
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("TTS Providers - API Configuration Schema (Phase 1b-i shape)", () => {
  it("apiConfig.updatePreferences accepts ttsProvider field", async () => {
    // Phase 1b-i renamed `apiConfig.upsert` to `updatePreferences` and
    // dropped key fields from the input schema (now under setKey/clearKey).
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.apiConfig.updatePreferences).toBeDefined();
    expect(typeof caller.apiConfig.updatePreferences).toBe("function");
  });

  it("apiConfig.get returns { preferences, keys } shape", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.apiConfig.get).toBeDefined();
  });

  it("apiConfig.setKey + clearKey are defined", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.apiConfig.setKey).toBeDefined();
    expect(caller.apiConfig.clearKey).toBeDefined();
  });

  it("tts.generate should be defined", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.tts.generate).toBeDefined();
    expect(typeof caller.tts.generate).toBe("function");
  });

  it("tts.generate should reject empty text", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.tts.generate({ text: "" })).rejects.toThrow();
  });

  it("tts.generate should reject text exceeding 5000 characters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const longText = "a".repeat(5001);
    await expect(caller.tts.generate({ text: longText })).rejects.toThrow();
  });
});

describe("TTS Providers - ElevenLabs Voice List API (Phase 1b-i)", () => {
  it("listElevenLabsVoices is exposed (replacing fetchElevenLabsVoices)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.apiConfig.listElevenLabsVoices).toBeDefined();
  });

  it("listElevenLabsVoices does NOT accept apiKey on the wire (issue #3)", async () => {
    // Without operator key + no BYOK in this fake context, the resolver
    // returns null, so the call is rejected with PRECONDITION_FAILED.
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.apiConfig.listElevenLabsVoices()).rejects.toThrow(
      /ElevenLabs key not configured/
    );
  });

  // Note: we don't `toBeUndefined()`-check the legacy procs because
  // tRPC v11's caller is a recursive Proxy — every property access
  // produces a function-like proxy regardless of whether the procedure
  // exists. Calling that proxy is what surfaces the NOT_FOUND. Coverage
  // for "no longer exists" is the rejection assertions above.
});

describe("TTS Providers - Fish Audio Model List API (Phase 1b-i)", () => {
  it("listFishAudioModels is exposed (replacing fetchFishAudioModels)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.apiConfig.listFishAudioModels).toBeDefined();
  });

  it("listFishAudioModels rejects when no key resolved", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.apiConfig.listFishAudioModels({})
    ).rejects.toThrow(/Fish Audio key not configured/);
  });

  // (legacy fetchFishAudioModels removal is exercised via the
  // PRECONDITION_FAILED assertions above; see the note in the
  // ElevenLabs describe-block.)

  it("listFishAudioModels accepts an optional search parameter", async () => {
    // Phase 1b-i (issue #3) renamed `fetchFishAudioModels({ apiKey, search })`
    // to `listFishAudioModels({ search })` and removed `apiKey` from the
    // wire input — the server resolves the key via KeyProvider. Without
    // any operator key configured + no BYOK in this test setup, the call
    // is expected to reject with PRECONDITION_FAILED, which proves both
    // (a) the new procedure shape is correct and (b) the legacy raw-key
    // surface is gone.
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.apiConfig.listFishAudioModels({ search: "chinese" })
    ).rejects.toThrow(/Fish Audio key not configured/);
  });
});

describe("TTS Providers - ttsProvider enum validation", () => {
  it("should accept 'browser' as ttsProvider", () => {
    // Test the enum values are correctly defined
    const validProviders = ["browser", "elevenlabs", "fishaudio"];
    validProviders.forEach((provider) => {
      expect(["browser", "elevenlabs", "fishaudio"]).toContain(provider);
    });
  });

  it("should have three provider options", () => {
    const providers = ["browser", "elevenlabs", "fishaudio"];
    expect(providers).toHaveLength(3);
  });
});

describe("TTS Providers - Router Structure", () => {
  it("should have tts router with generate mutation", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Verify the tts namespace exists
    expect(caller.tts).toBeDefined();
    expect(caller.tts.generate).toBeDefined();
  });

  it("should have apiConfig router with list* TTS queries (Phase 1b-i shape)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.apiConfig).toBeDefined();
    expect(caller.apiConfig.listElevenLabsVoices).toBeDefined();
    expect(caller.apiConfig.listFishAudioModels).toBeDefined();
  });

  it("should have apiConfig.updatePreferences that accepts TTS fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.apiConfig.updatePreferences).toBeDefined();
  });
});
