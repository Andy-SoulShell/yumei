import { stubProductConfig } from "./testProductConfig";
/** 运营方可配置兼容网关，但用户 BYOK 不得被转发到运营方自定义地址。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveChatProvider } from "./_core/chatProvider";
import { keyProvider } from "./_core/keyProvider";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("operator gateway isolation", () => {
  it.each(["openrouter", "deepseek"])(
    "uses the explicit operator gateway only with operator %s credentials",
    async provider => {
      stubProductConfig("models.chat.provider", provider);
      stubProductConfig(
        "models.chat.operatorBaseUrl",
        "http://127.0.0.1:3199/v1/"
      );
      vi.stubEnv("OPERATOR_OPENROUTER_KEY", "qa-operator-router");
      vi.stubEnv("OPERATOR_DEEPSEEK_KEY", "qa-operator-deepseek");
      vi.spyOn(keyProvider, "resolve").mockResolvedValue({
        source: "operator",
        value: "qa-operator-router",
      });
      expect(await resolveChatProvider("qa")).toMatchObject({
        name: provider,
        baseUrl: "http://127.0.0.1:3199/v1",
        isByok: false,
        apiKey:
          provider === "deepseek"
            ? "qa-operator-deepseek"
            : "qa-operator-router",
      });
    }
  );
  it("always sends a user OpenRouter key to the official API despite operator gateway configuration", async () => {
    stubProductConfig("models.chat.provider", "deepseek");
    stubProductConfig(
      "models.chat.operatorBaseUrl",
      "https://operator.example.test/v1"
    );
    vi.spyOn(keyProvider, "resolve").mockResolvedValue({
      source: "user",
      value: "qa-user-key",
    });
    expect(await resolveChatProvider("qa")).toMatchObject({
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "qa-user-key",
      isByok: true,
    });
  });
});
