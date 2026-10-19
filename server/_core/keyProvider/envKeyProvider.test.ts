/** 覆盖环境默认凭据、用户密钥回退及加密存储输入。 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { _resetEncryptionForTests } from "../encryption";
import { EnvKeyProvider } from "./envKeyProvider";
import { and, eq } from "drizzle-orm";
import { userKeys } from "../../../drizzle/schema";
import * as dbModule from "../../db";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  _resetEncryptionForTests();
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
  // Ensure encryption is configured.
  process.env.KEY_ENCRYPTION_KEY =
    "test-master-key-for-vitest-must-be-32-chars-or-more";
});

afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
  _resetEncryptionForTests();
});

describe("EnvKeyProvider — operator key resolution", () => {
  it("returns the env value when set", async () => {
    process.env.OPERATOR_OPENROUTER_KEY = "sk-or-operator-test";
    const kp = new EnvKeyProvider();
    expect(await kp.get("operator", "openrouter")).toBe("sk-or-operator-test");
  });

  it("returns null when the env var is unset", async () => {
    delete process.env.OPERATOR_OPENROUTER_KEY;
    const kp = new EnvKeyProvider();
    expect(await kp.get("operator", "openrouter")).toBeNull();
  });

  it("returns null when the env var is empty string", async () => {
    process.env.OPERATOR_OPENROUTER_KEY = "";
    const kp = new EnvKeyProvider();
    expect(await kp.get("operator", "openrouter")).toBeNull();
  });

  it("each KeyName maps to its own env var", async () => {
    process.env.OPERATOR_OPENROUTER_KEY = "or-key";
    process.env.OPERATOR_FAL_KEY = "fal-key";
    process.env.OPERATOR_ELEVENLABS_KEY = "el-key";
    process.env.OPERATOR_FISH_AUDIO_KEY = "fish-key";
    process.env.OPERATOR_OPENAI_KEY = "oai-key";
    const kp = new EnvKeyProvider();
    expect(await kp.get("operator", "openrouter")).toBe("or-key");
    expect(await kp.get("operator", "fal")).toBe("fal-key");
    expect(await kp.get("operator", "elevenlabs")).toBe("el-key");
    expect(await kp.get("operator", "fish-audio")).toBe("fish-key");
    expect(await kp.get("operator", "openai")).toBe("oai-key");
  });
});

describe("EnvKeyProvider — user-scoped fallback to operator", () => {
  it("falls back to operator key when user has no BYOK and no DB", async () => {
    process.env.OPERATOR_FAL_KEY = "fal-operator-fallback";
    // Force getDb to return null (the test-mode silent path).
    vi.spyOn(dbModule, "getDb").mockResolvedValue(null as any);
    const kp = new EnvKeyProvider();
    expect(await kp.get({ userId: "test-user-42" }, "fal")).toBe(
      "fal-operator-fallback"
    );
  });

  it("returns null when neither user key nor operator key is set", async () => {
    delete process.env.OPERATOR_FAL_KEY;
    vi.spyOn(dbModule, "getDb").mockResolvedValue(null as any);
    const kp = new EnvKeyProvider();
    expect(await kp.get({ userId: "test-user-1" }, "fal")).toBeNull();
  });
});

describe("EnvKeyProvider — describeUserKeys (no DB)", () => {
  it("returns isSet:false for every known key when DB is unavailable", async () => {
    vi.spyOn(dbModule, "getDb").mockResolvedValue(null as any);
    const kp = new EnvKeyProvider();
    const desc = await kp.describeUserKeys("test-user-1");
    expect(desc.openrouter.isSet).toBe(false);
    expect(desc.fal.isSet).toBe(false);
    expect(desc.elevenlabs.isSet).toBe(false);
    expect(desc["fish-audio"].isSet).toBe(false);
    expect(desc.openai.isSet).toBe(false);
  });
});

describe("EnvKeyProvider — input validation", () => {
  it("setUserKey rejects empty plaintext", async () => {
    const kp = new EnvKeyProvider();
    await expect(kp.setUserKey("1", "openrouter", "")).rejects.toThrow();
  });

  it("setUserKey rejects unknown key name", async () => {
    const kp = new EnvKeyProvider();
    await expect(
      // @ts-expect-error  intentionally bad input
      kp.setUserKey(1, "stripe", "x")
    ).rejects.toThrow(/Unknown key name/);
  });
});

describe("BYOK provenance (DB)", () => {
  it("returns user provenance, then operator provenance after removal", async () => {
    const userId = `provenance-${crypto.randomUUID()}`;
    process.env.OPERATOR_OPENROUTER_KEY = "operator-secret";
    const kp = new EnvKeyProvider();
    await kp.setUserKey(userId, "openrouter", "sk-or-v1-user-secret");
    expect(await kp.resolve({ userId }, "openrouter")).toEqual({
      value: "sk-or-v1-user-secret",
      source: "user",
    });
    await kp.clearUserKey(userId, "openrouter");
    expect(await kp.resolve({ userId }, "openrouter")).toEqual({
      value: "operator-secret",
      source: "operator",
    });
  });
  it("rejects corrupt saved keys instead of spending operator credentials", async () => {
    const db = await dbModule.getDb();
    if (!db) throw new Error("DATABASE_URL required");
    const userId = `corrupt-${crypto.randomUUID()}`;
    process.env.OPERATOR_OPENROUTER_KEY = "operator-secret";
    const kp = new EnvKeyProvider();
    await db.insert(userKeys).values({
      userId,
      name: "openrouter",
      encryptedValue: "invalid",
      lastFour: "fake",
    });
    await expect(kp.resolve({ userId }, "openrouter")).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await expect(kp.get({ userId }, "openrouter")).rejects.toThrow(
      "BYOK_KEY_UNREADABLE"
    );
    await db
      .delete(userKeys)
      .where(and(eq(userKeys.userId, userId), eq(userKeys.name, "openrouter")));
  });
});
