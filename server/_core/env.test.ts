/** 覆盖启动环境变量校验及环境边界。 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  // Reset to a known-clean baseline. Tests opt-in to specific vars.
  for (const k of Object.keys(process.env)) {
    delete process.env[k];
  }
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    delete process.env[k];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("env validation", () => {
  it.each(["invalid", "ftp://comfy:8188", "http://user:password@comfy:8188"])(
    "rejects invalid ComfyUI addresses: %s",
    async url => {
      process.env.JWT_SECRET = "a".repeat(32);
      process.env.IMAGE_PROVIDER = "comfyui";
      process.env.COMFYUI_BASE_URL = url;
      const { initialProductConfig } = await import("../seeds/product");
      expect(() => initialProductConfig()).toThrow();
    }
  );

  it("rejects unsupported image providers", async () => {
    process.env.JWT_SECRET = "a".repeat(32);
    process.env.IMAGE_PROVIDER = "invalid";
    const { initialProductConfig } = await import("../seeds/product");
    expect(() => initialProductConfig()).toThrow();
  });

  it("rejects unsupported chat providers", async () => {
    process.env.JWT_SECRET = "a".repeat(32);
    process.env.LLM_PROVIDER = "invalid";
    const { initialProductConfig } = await import("../seeds/product");
    expect(() => initialProductConfig()).toThrow();
  });

  it("throws when JWT_SECRET is missing", async () => {
    process.env.DATABASE_URL = "mysql://x";
    await expect(import("./env")).rejects.toThrow(/JWT_SECRET is required/);
  });

  it("throws when JWT_SECRET is shorter than 32 characters", async () => {
    process.env.JWT_SECRET = "too-short";
    process.env.DATABASE_URL = "mysql://x";
    await expect(import("./env")).rejects.toThrow(
      /JWT_SECRET must be at least 32 characters/
    );
  });

  it("throws when DATABASE_URL is missing in development", async () => {
    process.env.JWT_SECRET = "a".repeat(32);
    process.env.KEY_ENCRYPTION_KEY = "b".repeat(32);
    process.env.NODE_ENV = "development";
    await expect(import("./env")).rejects.toThrow(/DATABASE_URL is required/);
  });

  it("throws when DATABASE_URL is empty string in production", async () => {
    process.env.JWT_SECRET = "a".repeat(32);
    process.env.KEY_ENCRYPTION_KEY = "b".repeat(32);
    process.env.DATABASE_URL = "";
    process.env.NODE_ENV = "production";
    await expect(import("./env")).rejects.toThrow(
      /DATABASE_URL must not be empty/
    );
  });

  it("does NOT require DATABASE_URL in test mode", async () => {
    process.env.JWT_SECRET = "a".repeat(32);
    process.env.NODE_ENV = "test";
    // No DATABASE_URL set.
    const { ENV } = await import("./env");
    expect(ENV.cookieSecret).toBe("a".repeat(32));
    expect(ENV.databaseUrl).toBe("");
    expect(ENV.isTest).toBe(true);
  });

  it("collects multiple violations into one error", async () => {
    // Force dev mode so both vars are required, then leave both unset.
    process.env.NODE_ENV = "development";
    let captured: Error | undefined;
    try {
      await import("./env");
    } catch (e) {
      captured = e as Error;
    }
    expect(captured).toBeDefined();
    expect(captured!.message).toMatch(/JWT_SECRET/);
    expect(captured!.message).toMatch(/DATABASE_URL/);
  });

  it("loads cleanly when all required vars are valid", async () => {
    process.env.JWT_SECRET = "x".repeat(64);
    process.env.KEY_ENCRYPTION_KEY = "y".repeat(64);
    process.env.DATABASE_URL = "mysql://root:devpass@127.0.0.1:3306/yumei";
    process.env.NODE_ENV = "development";
    const { ENV } = await import("./env");
    expect(ENV.cookieSecret).toBe("x".repeat(64));
    expect(ENV.keyEncryptionKey).toBe("y".repeat(64));
    expect(ENV.databaseUrl).toBe("mysql://root:devpass@127.0.0.1:3306/yumei");
    expect(ENV.isProduction).toBe(false);
    expect(ENV.isTest).toBe(false);
  });

  it("flags isProduction correctly", async () => {
    process.env.JWT_SECRET = "x".repeat(64);
    process.env.KEY_ENCRYPTION_KEY = "y".repeat(64);
    process.env.DATABASE_URL = "mysql://x";
    process.env.NODE_ENV = "production";
    // production also requires email config.
    process.env.EMAIL_FROM = "noreply@example.com";
    process.env.RESEND_API_KEY = "re_test_key";
    // production also requires the public deployment URL.
    process.env.BETTER_AUTH_URL = "https://yumei.example.com";
    const { ENV } = await import("./env");
    expect(ENV.isProduction).toBe(true);
    expect(ENV.isTest).toBe(false);
  });

  it("requires EMAIL_FROM in production", async () => {
    process.env.JWT_SECRET = "x".repeat(64);
    process.env.KEY_ENCRYPTION_KEY = "y".repeat(64);
    process.env.DATABASE_URL = "mysql://x";
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_test";
    // EMAIL_FROM intentionally missing.
    await expect(import("./env")).rejects.toThrow(
      /EMAIL_FROM is required in production/
    );
  });

  it("requires an email driver in production", async () => {
    process.env.JWT_SECRET = "x".repeat(64);
    process.env.KEY_ENCRYPTION_KEY = "y".repeat(64);
    process.env.DATABASE_URL = "mysql://x";
    process.env.NODE_ENV = "production";
    process.env.EMAIL_FROM = "noreply@example.com";
    // No RESEND_API_KEY, no SMTP config.
    await expect(import("./env")).rejects.toThrow(
      /Production requires either RESEND_API_KEY/
    );
  });

  it("accepts SMTP as the production email driver", async () => {
    process.env.JWT_SECRET = "x".repeat(64);
    process.env.KEY_ENCRYPTION_KEY = "y".repeat(64);
    process.env.DATABASE_URL = "mysql://x";
    process.env.NODE_ENV = "production";
    process.env.EMAIL_FROM = "noreply@example.com";
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.BETTER_AUTH_URL = "https://yumei.example.com";
    const { ENV } = await import("./env");
    expect(ENV.isProduction).toBe(true);
  });

  it("requires BETTER_AUTH_URL in production", async () => {
    process.env.JWT_SECRET = "x".repeat(64);
    process.env.KEY_ENCRYPTION_KEY = "y".repeat(64);
    process.env.DATABASE_URL = "mysql://x";
    process.env.NODE_ENV = "production";
    process.env.EMAIL_FROM = "noreply@example.com";
    process.env.RESEND_API_KEY = "re_test";
    // BETTER_AUTH_URL intentionally missing.
    await expect(import("./env")).rejects.toThrow(
      /BETTER_AUTH_URL: required in production/
    );
  });

  it("requires S3 config when STORAGE_DRIVER=s3", async () => {
    process.env.JWT_SECRET = "x".repeat(64);
    process.env.NODE_ENV = "test";
    process.env.STORAGE_DRIVER = "s3";
    // S3_BUCKET / S3_REGION intentionally missing.
    await expect(import("./env")).rejects.toThrow(
      /S3_BUCKET: required when STORAGE_DRIVER=s3/
    );
  });

  it("rejects KEY_ENCRYPTION_KEY equal to JWT_SECRET", async () => {
    const same = "z".repeat(64);
    process.env.JWT_SECRET = same;
    process.env.KEY_ENCRYPTION_KEY = same;
    process.env.DATABASE_URL = "mysql://x";
    process.env.NODE_ENV = "production";
    await expect(import("./env")).rejects.toThrow(
      /KEY_ENCRYPTION_KEY must NOT equal JWT_SECRET/
    );
  });

  it("rejects KEY_ENCRYPTION_KEY shorter than 32 chars in non-test mode", async () => {
    process.env.JWT_SECRET = "x".repeat(64);
    process.env.KEY_ENCRYPTION_KEY = "short";
    process.env.DATABASE_URL = "mysql://x";
    process.env.NODE_ENV = "development";
    await expect(import("./env")).rejects.toThrow(
      /KEY_ENCRYPTION_KEY must be at least 32 characters/
    );
  });

  it("does NOT require KEY_ENCRYPTION_KEY in test mode", async () => {
    process.env.JWT_SECRET = "a".repeat(32);
    process.env.NODE_ENV = "test";
    // No KEY_ENCRYPTION_KEY set.
    const { ENV } = await import("./env");
    expect(ENV.keyEncryptionKey).toBe("");
    expect(ENV.isTest).toBe(true);
  });

  it("attaches structured `issues` to the thrown error", async () => {
    let captured: any;
    try {
      await import("./env");
    } catch (e) {
      captured = e;
    }
    expect(captured?.name).toBe("EnvValidationError");
    expect(Array.isArray(captured?.issues)).toBe(true);
    expect(captured?.issues.length).toBeGreaterThan(0);
  });
});

it("validates business environment values only when importing initial configuration", async () => {
  process.env.JWT_SECRET = "a".repeat(32);
  process.env.AI_DAILY_TASK_LIMIT = "0";
  expect((await import("./env")).ENV.cookieSecret).toBe("a".repeat(32));
  const { initialProductConfig } = await import("../seeds/product");
  expect(() => initialProductConfig()).toThrow();
  delete process.env.AI_DAILY_TASK_LIMIT;
  process.env.COMPANION_PROACTIVE_ENABLED = "invalid";
  expect(() => initialProductConfig()).toThrow(/COMPANION_PROACTIVE_ENABLED/);
});
