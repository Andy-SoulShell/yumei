/**
 * Server-side credential resolver. User BYOK keys override operator keys
 * and are encrypted in the userKeys table.
 */

/**
 * Logical key names. Adding a provider = add a name + a server-side
 * resolver that knows how to fetch the operator default for it.
 *
 * Treat the strings as stable identifiers — they're persisted in the
 * `userKeys.name` column and crossed against env vars.
 */
export const KEY_NAMES = [
  "openrouter", // LLM (default chat provider)
  "fal", // image generation
  "elevenlabs", // TTS provider 1
  "fish-audio", // TTS provider 2
  "openai", // OpenAI Whisper transcription
] as const;

export type KeyName = (typeof KEY_NAMES)[number];

export type KeyScope = "operator" | { userId: string };

export type KeyDescription = {
  /** Whether the user has uploaded a BYOK key for this provider. */
  isSet: boolean;
  /** Last 4 chars of the user's BYOK key, for UI display. Null if unset. */
  lastFour: string | null;
  /** When the user last set this key. Null if never set. */
  setAt: Date | null;
};

export interface KeyProvider {
  /**
   * Resolve a key. Resolution order:
   *   1. If `scope = { userId }` and the user has a BYOK key for `name`,
   *      decrypt and return it.
   *   2. Else if the operator has set the key for `name`,
   *      return it.
   *   3. Else return null.
   *
   * Callers wanting BYOK-or-fallback semantics should pass the user
   * scope; this method handles the fallback internally.
   *
   * Pass `scope: "operator"` only if you explicitly need the operator
   * default regardless of any per-user override (rare — almost always
   * you want the user-scoped resolution).
   */
  get(scope: KeyScope, name: KeyName): Promise<string | null>;

  /**
   * Store an encrypted BYOK key for the given user. Replaces any
   * existing key under the same name.
   */
  setUserKey(userId: string, name: KeyName, plaintext: string): Promise<void>;

  /**
   * Remove a user's BYOK key. After this call, `get({ userId }, name)`
   * falls back to the operator key (if any).
   */
  clearUserKey(userId: string, name: KeyName): Promise<void>;

  /**
   * Describe a user's keys for safe display. Returns one entry per known
   * KeyName; no plaintext is ever returned.
   */
  describeUserKeys(userId: string): Promise<Record<KeyName, KeyDescription>>;
}
