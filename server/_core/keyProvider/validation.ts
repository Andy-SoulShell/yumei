import type { KeyName } from "./types";

/**
 * Lightweight format-only validation for BYOK keys (Phase 1b-i, issue #3).
 *
 * Real "is this key valid for that provider" validation requires a live
 * test call to the provider. For the initial cut we just enforce shape
 * (prefix, length) so obviously bad values don't get persisted. Phase 1b-i+
 * can replace this with real `verify()` calls per provider once the
 * Provider abstraction (Phase 3, issue #22) lands and gives us a clean
 * place to put them.
 *
 * Throws with a user-readable message on failure.
 */
export async function validateProviderKey(
  name: KeyName,
  value: string
): Promise<void> {
  const trimmed = value.trim();
  if (trimmed !== value) {
    throw new Error("Key contains leading/trailing whitespace");
  }
  if (trimmed.length < 8) {
    throw new Error("Key looks too short for any provider");
  }

  switch (name) {
    case "openrouter":
      // OpenRouter keys are `sk-or-v1-...` per their docs.
      if (!/^sk-or-/.test(trimmed)) {
        throw new Error(
          "OpenRouter keys start with `sk-or-` — check that you copied the right one"
        );
      }
      break;
    case "openai":
      if (!/^sk-/.test(trimmed)) {
        throw new Error("OpenAI keys start with `sk-`");
      }
      break;
    case "fal":
      // fal.ai keys are `<id>:<secret>` style.
      if (!/^[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?$/.test(trimmed)) {
        throw new Error(
          "fal.ai keys are usually `id:secret`; the value you provided doesn't match"
        );
      }
      break;
    case "elevenlabs":
      // ElevenLabs uses opaque tokens — just length sanity.
      if (trimmed.length < 20) {
        throw new Error("ElevenLabs keys are typically 20+ characters");
      }
      break;
    case "fish-audio":
      // Fish Audio uses opaque bearer tokens — just length sanity.
      if (trimmed.length < 16) {
        throw new Error("Fish Audio keys are typically 16+ characters");
      }
      break;
    default: {
      // Exhaustiveness: if a new KeyName is added without a case here,
      // this lets TypeScript's never-narrowing flag it at compile time.
      const _exhaustive: never = name;
      void _exhaustive;
    }
  }
}
