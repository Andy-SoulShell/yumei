import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWithPortrait } from "./characterPortrait";
import {
  generateProviderImage,
  resolveImageProvider,
} from "./_core/imageProvider";
import {
  checkRateLimit,
  refundPeriodMeter,
  tryConsumePeriodMeter,
} from "./_core/quota";
import { getTierLimits, isBillingEnforced } from "./billing";
vi.mock("./_core/imageProvider", () => ({
  generateProviderImage: vi.fn(),
  resolveImageProvider: vi.fn(),
}));
vi.mock("./_core/quota", () => ({
  checkRateLimit: vi.fn(),
  refundPeriodMeter: vi.fn(),
  tryConsumePeriodMeter: vi.fn(),
  todayUTC: () => "2026-10-20",
  monthUTC: () => "2026-10",
}));
vi.mock("./billing", () => ({
  getTierLimits: vi.fn(),
  isBillingEnforced: vi.fn(),
}));
const user = { id: "portrait-user", birthDate: "1999-01-01" };
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveImageProvider).mockResolvedValue({
    name: "comfyui",
    apiKey: null,
    isByok: false,
    configured: true,
  });
  vi.mocked(generateProviderImage).mockResolvedValue(png);
  vi.mocked(getTierLimits).mockResolvedValue({
    limits: { dailySelfies: 1, monthlySelfies: null },
  } as any);
  vi.mocked(isBillingEnforced).mockReturnValue(true);
  vi.mocked(tryConsumePeriodMeter).mockResolvedValue({
    allowed: true,
    count: 1,
    limit: 1,
  });
  vi.mocked(refundPeriodMeter).mockResolvedValue();
});
describe("original character portrait", () => {
  it("generates with only text and saves the provider output", async () => {
    const save = vi.fn().mockResolvedValue({ id: 7 });
    expect(
      await createWithPortrait(user, "成年女性，黑色马尾，写实", save)
    ).toEqual({ id: 7 });
    expect(generateProviderImage).toHaveBeenCalledWith(expect.anything(), {
      mode: "text",
      references: [],
      prompt: expect.stringContaining("黑色马尾"),
    });
    expect(save).toHaveBeenCalledWith(png);
    expect(tryConsumePeriodMeter).toHaveBeenCalledWith(
      user.id,
      "selfie",
      1,
      "2026-10-20"
    );
    expect(refundPeriodMeter).not.toHaveBeenCalled();
  });
  it("requires confirmed age before touching a provider or quota", async () => {
    await expect(
      createWithPortrait({ ...user, birthDate: null }, "adult", vi.fn())
    ).rejects.toThrow("AGE_CONFIRMATION_REQUIRED");
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(generateProviderImage).not.toHaveBeenCalled();
  });
  it("does not generate when provider configuration or quota is unavailable", async () => {
    vi.mocked(resolveImageProvider).mockResolvedValueOnce({
      name: "fal",
      apiKey: null,
      isByok: false,
      configured: false,
    });
    await expect(createWithPortrait(user, "adult", vi.fn())).rejects.toThrow(
      "not configured"
    );
    vi.mocked(tryConsumePeriodMeter).mockResolvedValueOnce({
      allowed: false,
      count: 1,
      limit: 1,
    });
    await expect(createWithPortrait(user, "adult", vi.fn())).rejects.toThrow(
      "limit reached"
    );
    expect(generateProviderImage).not.toHaveBeenCalled();
    expect(refundPeriodMeter).not.toHaveBeenCalled();
  });
  it("refunds the original monthly period when generation or saving fails", async () => {
    vi.mocked(getTierLimits).mockResolvedValue({
      limits: { dailySelfies: null, monthlySelfies: 30 },
    } as any);
    vi.mocked(generateProviderImage).mockRejectedValueOnce(
      new Error("provider failed")
    );
    await expect(createWithPortrait(user, "adult", vi.fn())).rejects.toThrow(
      "provider failed"
    );
    expect(refundPeriodMeter).toHaveBeenLastCalledWith(
      user.id,
      "selfie",
      "2026-10"
    );
    await expect(
      createWithPortrait(
        user,
        "adult",
        vi.fn().mockRejectedValue(new Error("save failed"))
      )
    ).rejects.toThrow("save failed");
    expect(refundPeriodMeter).toHaveBeenCalledTimes(2);
  });
  it("rejects a non-image response without saving a character", async () => {
    const save = vi.fn();
    vi.mocked(generateProviderImage).mockResolvedValue(
      Buffer.from("not an image")
    );
    await expect(createWithPortrait(user, "adult", save)).rejects.toThrow(
      "Invalid generated portrait"
    );
    expect(save).not.toHaveBeenCalled();
    expect(refundPeriodMeter).toHaveBeenCalledOnce();
  });
  it("keeps BYOK and self-hosted generation outside operator quotas", async () => {
    vi.mocked(isBillingEnforced).mockReturnValue(false);
    await createWithPortrait(user, "adult", async () => 7);
    vi.mocked(isBillingEnforced).mockReturnValue(true);
    vi.mocked(resolveImageProvider).mockResolvedValue({
      name: "fal",
      apiKey: "test",
      isByok: true,
      configured: true,
    });
    await createWithPortrait(user, "adult", async () => 8);
    expect(tryConsumePeriodMeter).not.toHaveBeenCalled();
  });
});
