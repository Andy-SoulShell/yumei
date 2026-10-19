import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encrypt,
  decrypt,
  pack,
  unpack,
  encryptToString,
  decryptFromString,
  EncryptionUnconfiguredError,
  maskKey,
  lastFour,
  _resetEncryptionForTests,
} from "./encryption";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  _resetEncryptionForTests();
  process.env.KEY_ENCRYPTION_KEY =
    "test-master-key-for-vitest-must-be-32-chars-or-more";
});

afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
  _resetEncryptionForTests();
});

describe("encryption (issue #2)", () => {
  it("round-trips a simple string", async () => {
    const blob = await encrypt("sk-or-v1-abcdef123456");
    const back = await decrypt(blob);
    expect(back).toBe("sk-or-v1-abcdef123456");
  });

  it("emits a fresh nonce for every encryption (so identical inputs differ)", async () => {
    const a = await encrypt("hello");
    const b = await encrypt("hello");
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it("packs and unpacks losslessly", async () => {
    const blob = await encrypt("some-key");
    const packed = pack(blob);
    const back = unpack(packed);
    expect(back.nonce.equals(blob.nonce)).toBe(true);
    expect(back.tag.equals(blob.tag)).toBe(true);
    expect(back.ciphertext.equals(blob.ciphertext)).toBe(true);
  });

  it("encryptToString / decryptFromString round-trip", async () => {
    const out = await encryptToString("a longer api-key-that-still-works-fine");
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(20);
    expect(await decryptFromString(out)).toBe(
      "a longer api-key-that-still-works-fine"
    );
  });

  it("rejects tampered ciphertext (GCM auth fails)", async () => {
    const blob = await encrypt("super-secret-key");
    // Flip a bit in the ciphertext.
    const tampered = Buffer.from(blob.ciphertext);
    tampered[0] ^= 0x01;
    await expect(decrypt({ ...blob, ciphertext: tampered })).rejects.toThrow();
  });

  it("rejects tampered tag", async () => {
    const blob = await encrypt("super-secret-key");
    const tag = Buffer.from(blob.tag);
    tag[0] ^= 0x01;
    await expect(decrypt({ ...blob, tag })).rejects.toThrow();
  });

  it("throws EncryptionUnconfiguredError when master key is missing", async () => {
    delete process.env.KEY_ENCRYPTION_KEY;
    _resetEncryptionForTests();
    await expect(encrypt("foo")).rejects.toBeInstanceOf(
      EncryptionUnconfiguredError
    );
  });

  it("throws EncryptionUnconfiguredError when master key is too short", async () => {
    process.env.KEY_ENCRYPTION_KEY = "short";
    _resetEncryptionForTests();
    await expect(encrypt("foo")).rejects.toBeInstanceOf(
      EncryptionUnconfiguredError
    );
  });

  it("decrypting with a different master key fails", async () => {
    const blob = await encrypt("payload");
    process.env.KEY_ENCRYPTION_KEY =
      "DIFFERENT-master-key-for-vitest-must-be-32-chars-or-more";
    _resetEncryptionForTests();
    await expect(decrypt(blob)).rejects.toThrow();
  });

  it("unpack rejects too-short input", () => {
    expect(() => unpack("aGk")).toThrow(/too short/);
  });

  it("handles unicode payloads", async () => {
    const out = await encryptToString("中文 + emoji 🥰 + sk-key-末尾");
    expect(await decryptFromString(out)).toBe(
      "中文 + emoji 🥰 + sk-key-末尾"
    );
  });
});

describe("maskKey / lastFour", () => {
  it("masks a normal-length secret", () => {
    expect(maskKey("sk-or-v1-abcdef123456789")).toBe("sk***6789");
  });
  it("masks a short secret to ***", () => {
    expect(maskKey("short")).toBe("***");
    expect(maskKey("abcdef")).toBe("***");
  });
  it("lastFour returns last 4 chars", () => {
    expect(lastFour("sk-or-v1-abcdef123456789")).toBe("6789");
    expect(lastFour("abc")).toBe("abc");
  });
});
