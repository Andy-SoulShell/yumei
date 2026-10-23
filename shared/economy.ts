/** 金币规则以发布快照执行；迁移已有站点时默认保留原额度，运营可明确切换。 */
import { z } from "zod";
const coins = z.number().int().min(0).max(10000000);
const checkout = z
  .string()
  .url()
  .max(1000)
  .refine(value => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.endsWith(".lemonsqueezy.com")
    );
  })
  .nullable();
export const economySchema = z
  .object({
    enabled: z.boolean().default(false),
    welcomeCoins: coins.default(55),
    costs: z
      .object({
        chat: coins,
        selfie: coins,
        couple: coins,
        video: coins,
        character: coins,
      })
      .strict()
      .default({ chat: 1, selfie: 5, couple: 10, video: 50, character: 5 }),
    packs: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]{1,64}$/),
            coins: coins.positive(),
            priceCents: coins.positive(),
            currency: z.literal("USD"),
            variantId: z.string().regex(/^\d+$/).nullable(),
            checkoutUrl: checkout,
            enabled: z.boolean(),
          })
          .strict()
      )
      .max(30)
      .default([]),
    planCoins: z.record(z.string(), coins).default({}),
    referralReward: coins.default(100),
    inviteeReward: coins.default(25),
    creatorShareBps: z.number().int().min(0).max(8000).default(2000),
    creatorHoldDays: z.number().int().min(7).max(180).default(30),
    coinsPerUsd: z.number().int().min(1).max(100000).default(100),
    minimumPayoutCents: z.number().int().min(100).max(10000000).default(5000),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const key of ["id", "variantId"] as const) {
      const ids = value.packs.map(pack => pack[key]).filter(Boolean);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: "custom", message: `金币包 ${key} 不能重复` });
    }
  });
export const DEFAULT_ECONOMY = economySchema.parse({});
export type EconomyPolicy = z.infer<typeof economySchema>;
export type CoinAllocation = { orderId: string; coins: number };
export type CommunitySnapshot = {
  name: string;
  summary: string;
  scenario: string;
  personality: string;
  appearance: string;
  interests: string;
  imageUrl: string;
  imageKey: string;
  behavior: import("./companionBehavior").CompanionBehavior | null;
};

/** 收益以固定货币精度结算：10000 单位 = 1 美分，与后续金币定价无关。 */
export const EARNING_UNITS_PER_CENT = 10000;
