/**
 * Usage quotas and rate limits (M1-3, tiers added in M3).
 *
 * Numbers follow ADR 0005. BYOK users bypass usage meters entirely
 * (ADR 0002) — their traffic never spends operator money — but
 * per-minute rate limits still apply to protect the server itself.
 */

export const TIERS = ["free", "plus", "pro"] as const;
export type Tier = (typeof TIERS)[number];

export type TierLimits = {
  /** Chat messages per UTC day (null = unlimited). */
  dailyMessages: number | null;
  /** Selfies per UTC day (free tier) — null when the tier meters monthly. */
  dailySelfies: number | null;
  /** Selfies per calendar month (paid tiers) — null when metered daily/unlimited. */
  monthlySelfies: number | null;
  /** Concurrent (non-deleted) companions (null = unlimited). */
  maxGirlfriends: number | null;
  /** Whisper voice transcription on the operator's key. */
  voiceTranscription: boolean;
  /** Premium TTS providers usable on the operator's keys. */
  ttsProviders: ReadonlyArray<"elevenlabs" | "fishaudio">;
  /** Free tier is locked to the cheap default model (ADR 0005). */
  modelLocked: boolean;
};

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    dailyMessages: 30,
    dailySelfies: 1,
    monthlySelfies: null,
    maxGirlfriends: 1,
    voiceTranscription: false,
    ttsProviders: [],
    modelLocked: true,
  },
  plus: {
    dailyMessages: 500,
    dailySelfies: null,
    monthlySelfies: 30,
    maxGirlfriends: 3,
    voiceTranscription: true,
    ttsProviders: ["elevenlabs"],
    modelLocked: false,
  },
  pro: {
    dailyMessages: null,
    dailySelfies: null,
    monthlySelfies: 100,
    maxGirlfriends: null,
    voiceTranscription: true,
    ttsProviders: ["elevenlabs", "fishaudio"],
    modelLocked: false,
  },
} as const;

export const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
};

/** Placeholder prices from ADR 0005 (confirmed at launch). */
export const TIER_PRICES: Record<Tier, string> = {
  free: "$0",
  plus: "$9.99/月",
  pro: "$19.99/月",
};

export const FREE_TIER_DEFAULT_MODEL = "openai/gpt-4o-mini";

/** @deprecated M3: use TIER_LIMITS.free — kept for existing imports. */
export const FREE_TIER = {
  dailyMessages: TIER_LIMITS.free.dailyMessages!,
  dailySelfies: TIER_LIMITS.free.dailySelfies!,
} as const;

/** Per-user, per-minute request caps on hot procedures (issue #5). */
export const RATE_LIMITS_PER_MINUTE = {
  chat: 20,
  selfie: 3,
  transcribe: 10,
  tts: 30,
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS_PER_MINUTE;

/** Meter names persisted in the usageMeters table. */
export const METERS = {
  chat: "chat",
  selfie: "selfie",
  /** Total intimacy points awarded today (caps at DAILY_POINTS_LIMIT). */
  intimacyPoints: "intimacy:points",
  /** Per-reason intimacy action counts, e.g. `intimacy:text_message`. */
  intimacyReason: (reason: string) => `intimacy:${reason}`,
} as const;
