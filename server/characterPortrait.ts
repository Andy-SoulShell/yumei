/** 创建角色时只以文字生成形象，选项素材不参与模型输入。 */
import { TRPCError } from "@trpc/server";
import { buildPortraitPrompt } from "../shared/characterPrompt";
import { METERS } from "../shared/quotas";
import {
  generateProviderImage,
  resolveImageProvider,
} from "./_core/imageProvider";
import { log, providerErrorSummary } from "./_core/log";
import {
  checkRateLimit,
  monthUTC,
  refundPeriodMeter,
  todayUTC,
  tryConsumePeriodMeter,
} from "./_core/quota";
import { getTierLimits, isBillingEnforced } from "./billing";
import { ensureAgeConfirmed } from "./routers/guards";

export async function createWithPortrait<T>(
  user: { id: string; birthDate: Date | string | null },
  appearance: string,
  save: (image: Buffer) => Promise<T>
): Promise<T> {
  ensureAgeConfirmed(user);
  await checkRateLimit(user.id, "selfie");
  const provider = await resolveImageProvider(user.id);
  if (!provider.configured)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Image generation is not configured. Configure an image provider in Settings.",
    });
  const tier = await getTierLimits(user.id);
  const limit = tier.limits.dailySelfies ?? tier.limits.monthlySelfies;
  const period = tier.limits.dailySelfies !== null ? todayUTC() : monthUTC();
  const metered = isBillingEnforced() && !provider.isByok && limit !== null;
  if (metered) {
    const result = await tryConsumePeriodMeter(
      user.id,
      METERS.selfie,
      limit!,
      period
    );
    if (!result.allowed)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Image generation limit reached.",
      });
  }
  try {
    const image = await generateProviderImage(provider, {
      mode: "text",
      references: [],
      prompt: buildPortraitPrompt(appearance),
    });
    if (
      image.length > 25 * 1024 * 1024 ||
      !image
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error("Invalid generated portrait");
    return await save(image);
  } catch (error) {
    if (metered)
      await refundPeriodMeter(user.id, METERS.selfie, period).catch(
        refundError =>
          log.error(
            "[portrait] quota refund failed",
            providerErrorSummary(refundError)
          )
      );
    throw error;
  }
}
