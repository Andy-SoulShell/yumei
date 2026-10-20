/** 验证实际人设接口的认证、生成契约、计量与失败回退，不调用真实 AI。 */
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { girlfriendRouter } from "./routers/girlfriend";
import { resolveChatProvider } from "./_core/chatProvider";
import {
  checkRateLimit,
  refundPeriodMeter,
  tryConsumePeriodMeter,
} from "./_core/quota";
import { getTierLimits, isBillingEnforced } from "./billing";
import { getUserApiConfig } from "./repositories/apiConfig";
import type { GenerateProfileInput } from "../shared/creatorProfile";

vi.mock("axios", async importOriginal => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: vi.fn() } };
});
vi.mock("./_core/chatProvider", () => ({ resolveChatProvider: vi.fn() }));
vi.mock("./_core/quota", () => ({
  checkRateLimit: vi.fn(),
  tryConsumePeriodMeter: vi.fn(),
  refundPeriodMeter: vi.fn(),
  todayUTC: () => "2026-10-20",
}));
vi.mock("./billing", () => ({
  getTierLimits: vi.fn(),
  isBillingEnforced: vi.fn(),
}));
vi.mock("./repositories/apiConfig", () => ({ getUserApiConfig: vi.fn() }));

const user = { id: "profile-owner", birthDate: "1999-01-01" };
const caller = girlfriendRouter.createCaller({
  user,
  req: {},
  res: {},
} as never);
const input: GenerateProfileInput = {
  mode: "random",
  gender: "male",
  style: "anime",
  age: 28,
  locale: "zh-CN",
  name: "原名",
  personality: "冷静但体贴",
  interests: "地图",
  appearance: "动漫，28 岁成年男性，银发绿眼，森林长衣",
};
const result = {
  name: "新名字",
  personality: "沉静好奇，喜欢分享绘图见闻。",
  interests: "绘制地图、木工、植物观察",
};
const reply = (value: unknown) => ({
  data: {
    choices: [
      {
        message: {
          content: typeof value === "string" ? value : JSON.stringify(value),
        },
      },
    ],
  },
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveChatProvider).mockResolvedValue({
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    apiKey: "test-provider-key",
    isByok: false,
  });
  vi.mocked(getTierLimits).mockResolvedValue({
    limits: { dailyMessages: 30, modelLocked: true },
  } as never);
  vi.mocked(isBillingEnforced).mockReturnValue(true);
  vi.mocked(tryConsumePeriodMeter).mockResolvedValue({
    allowed: true,
    count: 1,
    limit: 30,
  });
  vi.mocked(refundPeriodMeter).mockResolvedValue();
  vi.mocked(axios.post).mockResolvedValue(reply(result));
});

describe("AI character profile API", () => {
  it("passes fixed appearance and locale to the existing provider and returns only editable profile fields", async () => {
    expect(await caller.generateProfile(input)).toEqual(result);
    const [url, rawBody] = vi.mocked(axios.post).mock.calls[0];
    const body = rawBody as {
      messages: { content: string }[];
      response_format: unknown;
    };
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const brief = JSON.parse(body.messages[1].content);
    expect(brief.fixed).toEqual({
      gender: "male",
      style: "anime",
      age: 28,
      appearance: input.appearance,
    });
    expect(brief.outputLanguage).toBe("zh-CN");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(checkRateLimit).toHaveBeenCalledWith(user.id, "profile");
    expect(tryConsumePeriodMeter).toHaveBeenCalledWith(
      user.id,
      "chat",
      30,
      "2026-10-20"
    );
    expect(refundPeriodMeter).not.toHaveBeenCalled();
  });
  it("preserves a custom name when polishing even if the model changes it", async () => {
    expect(await caller.generateProfile({ ...input, mode: "polish" })).toEqual({
      ...result,
      name: input.name,
    });
  });
  it.each([
    null,
    "",
    "not JSON",
    { name: "", personality: "text", interests: "books" },
    { name: "A", personality: [], interests: "books" },
  ])("rejects malformed output and refunds quota (%j)", async value => {
    vi.mocked(axios.post).mockResolvedValueOnce(reply(value));
    await expect(caller.generateProfile(input)).rejects.toMatchObject({
      code: "BAD_GATEWAY",
    });
    expect(refundPeriodMeter).toHaveBeenCalledWith(
      user.id,
      "chat",
      "2026-10-20"
    );
  });
  it("refunds an upstream timeout without returning provider details", async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(
      new Error("upstream timeout private detail")
    );
    await expect(caller.generateProfile(input)).rejects.toThrow("原草稿已保留");
    expect(refundPeriodMeter).toHaveBeenCalledOnce();
  });
  it("rejects unauthenticated, unconfirmed and invalid age inputs before generation", async () => {
    const unauthenticated = girlfriendRouter.createCaller({
      user: null,
      req: {},
      res: {},
    } as never);
    await expect(unauthenticated.generateProfile(input)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const unconfirmed = girlfriendRouter.createCaller({
      user: { ...user, birthDate: null },
      req: {},
      res: {},
    } as never);
    await expect(unconfirmed.generateProfile(input)).rejects.toThrow(
      "AGE_CONFIRMATION_REQUIRED"
    );
    await expect(
      caller.generateProfile({ ...input, age: 17 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.generateProfile({ ...input, personality: "a".repeat(2001) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(axios.post).not.toHaveBeenCalled();
    expect(tryConsumePeriodMeter).not.toHaveBeenCalled();
  });
  it("checks configuration and quota before requesting the model", async () => {
    vi.mocked(resolveChatProvider).mockResolvedValueOnce({
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-flash",
      apiKey: null,
      isByok: false,
    });
    await expect(caller.generateProfile(input)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(tryConsumePeriodMeter).not.toHaveBeenCalled();
    vi.mocked(tryConsumePeriodMeter).mockResolvedValueOnce({
      allowed: false,
      count: 30,
      limit: 30,
    });
    await expect(caller.generateProfile(input)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(axios.post).not.toHaveBeenCalled();
  });
  it("keeps DeepSeek credentials paired with its endpoint and ignores an OpenRouter model preference", async () => {
    vi.mocked(resolveChatProvider).mockResolvedValueOnce({
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-flash",
      apiKey: "test-deepseek",
      isByok: false,
    });
    vi.mocked(getUserApiConfig).mockResolvedValueOnce({
      llmModel: "other/provider",
    } as never);
    await caller.generateProfile(input);
    expect(axios.post).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        model: "deepseek-flash",
        thinking: { type: "disabled" },
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-deepseek",
        }),
      })
    );
  });
  it("exempts BYOK and unmetered self-hosting from operator allowances", async () => {
    vi.mocked(resolveChatProvider).mockResolvedValueOnce({
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "custom/model",
      apiKey: "test-byok",
      isByok: true,
    });
    await caller.generateProfile(input);
    vi.mocked(isBillingEnforced).mockReturnValue(false);
    await caller.generateProfile(input);
    expect(tryConsumePeriodMeter).not.toHaveBeenCalled();
  });
});
