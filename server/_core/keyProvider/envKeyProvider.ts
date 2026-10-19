import { and, eq } from "drizzle-orm";
import { userKeys } from "../../../drizzle/schema";
import { getDb } from "../../db";
import {
  decryptFromString,
  encryptToString,
  lastFour as computeLastFour,
} from "../encryption";
import {
  KEY_NAMES,
  type KeyDescription,
  type KeyName,
  type KeyProvider,
  type KeyScope,
} from "./types";

/**
 * EnvKeyProvider — operator keys come from environment variables; user
 * BYOK keys come from the encrypted `userKeys` table.
 *
 * Operator env-var convention:
 *   `OPERATOR_OPENROUTER_KEY`, `OPERATOR_FAL_KEY`, `OPERATOR_ELEVENLABS_KEY`,
 *   `OPERATOR_FISH_AUDIO_KEY`, `OPERATOR_OPENAI_KEY`.
 *
 * In dev, these are typically blank; the chat / image / TTS / STT routes
 * then have nothing to call and surface a clear "operator key not
 * configured" error to the user (Phase 1c will add subscription gating
 * around this UX).
 *
 * For commercial deployment, a `KmsKeyProvider` driver will replace this
 * one — same interface, master keys read from AWS KMS or GCP KMS instead
 * of process.env. Selection is via the `KEY_PROVIDER` env var (Phase 1c).
 */

const OPERATOR_ENV: Record<KeyName, string> = {
  openrouter: "OPERATOR_OPENROUTER_KEY",
  fal: "OPERATOR_FAL_KEY",
  elevenlabs: "OPERATOR_ELEVENLABS_KEY",
  "fish-audio": "OPERATOR_FISH_AUDIO_KEY",
  openai: "OPERATOR_OPENAI_KEY",
};

export class EnvKeyProvider implements KeyProvider {
  async get(scope: KeyScope, name: KeyName): Promise<string | null> {
    if (scope === "operator") {
      return readOperatorKey(name);
    }
    // User-scoped: BYOK first, fall back to operator default.
    const userValue = await readUserKey(scope.userId, name);
    if (userValue) return userValue;
    return readOperatorKey(name);
  }

  async setUserKey(
    userId: string,
    name: KeyName,
    plaintext: string
  ): Promise<void> {
    // Input validation runs before any DB lookup so misuse surfaces with
    // a meaningful error even in environments where the DB isn't wired
    // (test mode, misconfigured deployment).
    if (!plaintext) {
      throw new Error("Cannot store an empty key. Use clearUserKey instead.");
    }
    if (!KEY_NAMES.includes(name)) {
      throw new Error(`Unknown key name: ${name}`);
    }

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const encryptedValue = await encryptToString(plaintext);
    const lastFour = computeLastFour(plaintext);

    // MySQL upsert: insert; on conflict (userId, name), update value.
    await db
      .insert(userKeys)
      .values({ userId, name, encryptedValue, lastFour })
      .onDuplicateKeyUpdate({
        set: { encryptedValue, lastFour },
      });
  }

  async clearUserKey(userId: string, name: KeyName): Promise<void> {
    const db = await getDb();
    if (!db) return; // silent no-op in test mode (no DB)
    await db
      .delete(userKeys)
      .where(and(eq(userKeys.userId, userId), eq(userKeys.name, name)));
  }

  async describeUserKeys(
    userId: string
  ): Promise<Record<KeyName, KeyDescription>> {
    const db = await getDb();
    const result: Record<KeyName, KeyDescription> = {} as any;
    for (const n of KEY_NAMES) {
      result[n] = { isSet: false, lastFour: null, setAt: null };
    }

    if (!db) return result;

    const rows = await db
      .select()
      .from(userKeys)
      .where(eq(userKeys.userId, userId));

    for (const row of rows) {
      const n = row.name as KeyName;
      if (!KEY_NAMES.includes(n)) continue;
      result[n] = {
        isSet: true,
        lastFour: row.lastFour ?? null,
        setAt: row.createdAt ?? null,
      };
    }
    return result;
  }
}

// ---- helpers ---------------------------------------------------------------

function readOperatorKey(name: KeyName): string | null {
  const envVar = OPERATOR_ENV[name];
  const value = process.env[envVar];
  return value && value.length > 0 ? value : null;
}

async function readUserKey(
  userId: string,
  name: KeyName
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const row = await db
    .select({ encryptedValue: userKeys.encryptedValue })
    .from(userKeys)
    .where(and(eq(userKeys.userId, userId), eq(userKeys.name, name)))
    .limit(1);

  if (!row[0]?.encryptedValue) return null;

  try {
    return await decryptFromString(row[0].encryptedValue);
  } catch {
    // Tampered ciphertext, wrong master key, or anything else — treat as
    // "no key available" rather than crash the request. The error already
    // means BYOK can't be honored; downstream code will fall back to
    // operator key (or 402 / "no key configured" upstream).
    return null;
  }
}

/** Singleton — the rest of the server imports this directly. */
export const keyProvider: KeyProvider = new EnvKeyProvider();
