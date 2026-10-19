/**
 * Symmetric encryption for at-rest secrets.
 *
 * Algorithm: AES-256-GCM (AEAD).
 *   - 256-bit key derived from `KEY_ENCRYPTION_KEY` via scrypt with a
 *     deployment-fixed salt (the salt is not a security boundary; the
 *     master key is). The deriver runs once per process.
 *   - 96-bit (12-byte) random nonce per encryption.
 *   - 128-bit GCM auth tag.
 *
 * Storage format (single buffer): `nonce || tag || ciphertext`.
 * Helpers `pack` / `unpack` convert between the structured form and a
 * single base64 string suitable for varbinary/text columns.
 *
 * Use this for secrets that must round-trip (BYOK API keys). DO NOT use
 * for password storage — those want a one-way KDF (scrypt/argon2/bcrypt).
 */

import { promisify } from "node:util";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCb,
} from "node:crypto";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

const ALGO = "aes-256-gcm";
const KEY_LEN = 32; // 256-bit
const NONCE_LEN = 12; // 96-bit GCM nonce
const TAG_LEN = 16; // 128-bit GCM tag

/**
 * Stable salt for the per-deployment KDF. The salt rotating doesn't help
 * us — every deployment already has one master key. Keeping it constant
 * means we can re-derive the same data key on every boot.
 */
const KDF_SALT = Buffer.from("yumei:key-encryption:v1");

let cachedKey: Buffer | null = null;

export class EncryptionUnconfiguredError extends Error {
  constructor() {
    super(
      "KEY_ENCRYPTION_KEY is not set. " +
        "Generate one with `openssl rand -hex 32` and add it to .env."
    );
    this.name = "EncryptionUnconfiguredError";
  }
}

/**
 * Derive (and cache) the data-encryption key from the master key in env.
 * Throws `EncryptionUnconfiguredError` if `KEY_ENCRYPTION_KEY` is missing
 * or shorter than 32 chars.
 */
async function getKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;
  const master = process.env.KEY_ENCRYPTION_KEY;
  if (!master || master.length < 32) {
    throw new EncryptionUnconfiguredError();
  }
  cachedKey = await scrypt(master, KDF_SALT, KEY_LEN);
  return cachedKey;
}

/** Test-only: forces the next `getKey()` to re-derive. */
export function _resetEncryptionForTests() {
  cachedKey = null;
}

export type EncryptedBlob = {
  nonce: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
};

/** Encrypts a UTF-8 string. Returns the structured blob. */
export async function encrypt(plaintext: string): Promise<EncryptedBlob> {
  const key = await getKey();
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGO, key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return { nonce, tag, ciphertext };
}

/** Decrypts a structured blob. Throws on tampered ciphertext (GCM auth). */
export async function decrypt(blob: EncryptedBlob): Promise<string> {
  const key = await getKey();
  const decipher = createDecipheriv(ALGO, key, blob.nonce);
  decipher.setAuthTag(blob.tag);
  const plaintext = Buffer.concat([
    decipher.update(blob.ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Pack a blob into a single base64url string for storage. */
export function pack(blob: EncryptedBlob): string {
  return Buffer.concat([blob.nonce, blob.tag, blob.ciphertext]).toString(
    "base64url"
  );
}

/** Inverse of `pack`. Throws on malformed input. */
export function unpack(packed: string): EncryptedBlob {
  const buf = Buffer.from(packed, "base64url");
  if (buf.length < NONCE_LEN + TAG_LEN + 1) {
    throw new Error("encrypted blob is too short");
  }
  return {
    nonce: buf.subarray(0, NONCE_LEN),
    tag: buf.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN),
    ciphertext: buf.subarray(NONCE_LEN + TAG_LEN),
  };
}

/** Convenience: encrypt + pack in one call. */
export async function encryptToString(plaintext: string): Promise<string> {
  return pack(await encrypt(plaintext));
}

/** Convenience: unpack + decrypt in one call. */
export async function decryptFromString(packed: string): Promise<string> {
  return decrypt(unpack(packed));
}

/** Mask a secret to "first2***last4" for safe display. */
export function maskKey(secret: string): string {
  if (secret.length <= 6) return "***";
  return `${secret.slice(0, 2)}***${secret.slice(-4)}`;
}

/** Last-four characters, for "set-or-not + which one" UI displays. */
export function lastFour(secret: string): string {
  if (secret.length <= 4) return secret;
  return secret.slice(-4);
}
