/** 用量拒绝显示准确原因和本地恢复时间，而非统一解释为请求频繁。 */
import { afterEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { quotaResetAt } from "@shared/quotas";
import { apiErrorMessage, usageLimitMessage } from "./errors";

afterEach(() => vi.unstubAllEnvs());
const t = i18n.getFixedT("zh-CN") as Translator;
it("keeps UTC daily and monthly boundaries exact across leap years and year changes", () => {
  expect(quotaResetAt("day", new Date("2024-02-28T23:59:59Z"))).toBe(
    "2024-02-29T00:00:00.000Z"
  );
  expect(quotaResetAt("month", new Date("2026-12-31T23:59:59Z"))).toBe(
    "2027-01-01T00:00:00.000Z"
  );
});
it("explains exhausted quota at the user's local reset time", () => {
  vi.stubEnv("TZ", "Asia/Shanghai");
  const text = apiErrorMessage(
    {
      message: "TOO_MANY_REQUESTS",
      data: {
        business: {
          reason: "QUOTA_EXCEEDED",
          meter: "chat",
          period: "day",
          limit: 30,
          resetAt: "2026-10-24T00:00:00Z",
        },
      },
    },
    t
  );
  expect(text).toContain("今日聊天额度已用完");
  expect(text).toContain("08:00");
  expect(text).toContain("10月24日");
  expect(text).not.toContain("Oct");
  expect(text).not.toContain("频繁");
});
it("distinguishes frequency, disabled service, concurrency and follow-up limits", () => {
  expect(
    usageLimitMessage(
      {
        reason: "RATE_LIMITED",
        retryAt: new Date(Date.now() + 25000).toISOString(),
      },
      t
    )
  ).toContain("25 秒");
  expect(usageLimitMessage({ reason: "RATE_LIMITED", retryAt: null }, t)).toBe(
    "此操作暂未开放。"
  );
  expect(usageLimitMessage({ reason: "CONCURRENCY_LIMIT" }, t)).toContain(
    "已有任务"
  );
  expect(usageLimitMessage({ reason: "FOLLOWUP_LIMIT" }, t)).toContain(
    "补充消息"
  );
});
