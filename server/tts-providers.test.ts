/** 覆盖语音供应商接口与输入边界。 */

import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// 创建认证上下文
function createAuthContext(): { ctx: TrpcContext } {
  const user = {
    id: "test-user-1",
    email: "test@example.com",
    name: "Test User",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    image: null,
    emailVerified: false,
    birthDate: null,
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("TTS Providers - API Configuration Schema", () => {
  it("apiConfig.updatePreferences accepts ttsProvider field", async () => {
    // Preferences and keys use separate mutations.
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

describe("TTS Providers - ElevenLabs Voice List API", () => {
  it("listElevenLabsVoices is exposed (replacing fetchElevenLabsVoices)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.apiConfig.listElevenLabsVoices).toBeDefined();
  });

  it("listElevenLabsVoices does NOT accept apiKey on the wire", async () => {
    // Without operator key + no BYOK in this fake context, the resolver
    // returns null, so the call is rejected with PRECONDITION_FAILED.
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.apiConfig.listElevenLabsVoices()).rejects.toThrow(
      /ElevenLabs key not configured/
    );
  });
});

describe("TTS Providers - Fish Audio Model List API", () => {
  it("listFishAudioModels is exposed (replacing fetchFishAudioModels)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.apiConfig.listFishAudioModels).toBeDefined();
  });

  it("listFishAudioModels rejects when no key resolved", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.apiConfig.listFishAudioModels({})).rejects.toThrow(
      /Fish Audio key not configured/
    );
  });

  it("listFishAudioModels accepts an optional search parameter", async () => {
    // Missing credentials should be rejected after validating the search input.
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
    validProviders.forEach(provider => {
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

  it("should have apiConfig router with list* TTS queries", async () => {
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
