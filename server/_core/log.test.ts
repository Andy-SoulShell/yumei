import { describe, it, expect } from "vitest";
import { redact } from "./log";

describe("log.redact (issue #11)", () => {
  it("masks API key fields by exact name", () => {
    const out = redact({
      llmApiKey: "sk-or-v1-abcdef123456789",
      openRouterKey: "sk-or-v1-abcdef123456789",
      elevenlabsApiKey: "el-1234567890abcdef",
      whisperApiKey: "wh-shortlived",
    }) as Record<string, string>;
    expect(out.llmApiKey).toBe("sk***89");
    expect(out.openRouterKey).toBe("sk***89");
    expect(out.elevenlabsApiKey).toBe("el***ef");
    expect(out.whisperApiKey).toBe("wh***ed");
  });

  it("masks key-like names by pattern (length-preserving)", () => {
    const out = redact({
      somethingApiKey: "secret-value-here",
      ourSecret: "topsecret",
      myToken: "abcdef",
    }) as Record<string, string>;
    expect(out.somethingApiKey).toMatch(/\*\*\*/);
    expect(out.somethingApiKey).not.toBe("secret-value-here");
    expect(out.ourSecret).toBe("to***et");
    expect(out.myToken).toBe("ab***ef");
  });

  it("strict-redacts ALWAYS_REDACT_KEYS to '***' (no length leak)", () => {
    const out = redact({
      access_token: "bearer-xyz",
      cookieSecret: "very-long-cookie-secret-value",
      Authorization: "Bearer eyJ...",
    }) as Record<string, string>;
    expect(out.access_token).toBe("***");
    expect(out.cookieSecret).toBe("***");
    expect(out.Authorization).toBe("***");
  });

  it("masks emails", () => {
    const out = redact({ email: "alice@example.com" }) as Record<string, string>;
    expect(out.email).toBe("a***@example.com");
  });

  it("redacts OAuth state and code", () => {
    const out = redact({
      state: "eyJyZWRpcmVjdFVyaSI6Ii8ifQ==",
      code: "auth-code-12345",
    }) as Record<string, string>;
    expect(out.state).toBe("***");
    expect(out.code).toBe("***");
  });

  it("flattens Error to { name, message } (drops stack)", () => {
    const e = new Error("Connection failed: sk-abc123");
    const out = redact(e) as { name: string; message: string; stack?: string };
    expect(out.name).toBe("Error");
    expect(out.message).toBe("Connection failed: sk-abc123");
    expect(out.stack).toBeUndefined();
  });

  it("handles nested objects", () => {
    const out = redact({
      user: { id: 1, email: "x@y.com", apiKey: "sk-deep" },
      config: { llmApiKey: "sk-config" },
    }) as any;
    expect(out.user.id).toBe(1);
    expect(out.user.email).toBe("x***@y.com");
    expect(out.user.apiKey).toBe("sk***ep");
    expect(out.config.llmApiKey).toBe("sk***ig");
  });

  it("truncates very long strings", () => {
    const long = "a".repeat(1000);
    const out = redact(long) as string;
    expect(out.length).toBeLessThan(1000);
    expect(out).toMatch(/\[truncated\]$/);
  });

  it("limits array size", () => {
    const big = Array.from({ length: 100 }, (_, i) => i);
    const out = redact(big) as unknown[];
    // 50 items + 1 marker
    expect(out.length).toBe(51);
    expect(out[50]).toBe("...[+50]");
  });

  it("stops at max depth", () => {
    let nested: any = "leaf";
    for (let i = 0; i < 20; i++) nested = { nested };
    const out = redact(nested);
    // Should produce a finite string somewhere indicating truncation.
    expect(JSON.stringify(out)).toContain("max-depth");
  });

  it("preserves null and undefined", () => {
    expect(redact(null)).toBe(null);
    expect(redact(undefined)).toBe(undefined);
  });

  it("does not mutate the input", () => {
    const input = { apiKey: "sk-secret", user: { email: "x@y.com" } };
    redact(input);
    expect(input.apiKey).toBe("sk-secret");
    expect(input.user.email).toBe("x@y.com");
  });
});
