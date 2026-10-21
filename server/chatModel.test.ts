import { expect, it } from "vitest";
import { resolveChatModel } from "./_core/chatProvider";
import { productFixture } from "./testProductConfig";
import { configured } from "./testConfiguredProduct";

it("uses the published default, entitlement lock and BYOK rules for the active model", () => {
  const policy = structuredClone(productFixture);
  policy.billing.defaultChatModel = "qa/published-default";
  policy.billing.mode = "free";
  const provider = {
    name: "openrouter",
    model: "unused",
    isByok: false,
  } as const;
  expect(resolveChatModel(provider, "qa/user-choice", policy, true)).toBe(
    "qa/published-default"
  );
  expect(resolveChatModel(provider, "qa/user-choice", policy, false)).toBe(
    "qa/user-choice"
  );
  expect(
    resolveChatModel(
      { ...provider, isByok: true },
      "qa/user-choice",
      policy,
      true
    )
  ).toBe("qa/user-choice");
  expect(resolveChatModel(provider, null, policy, false)).toBe(
    "qa/published-default"
  );
  expect(
    resolveChatModel(
      { ...provider, name: "deepseek", model: "deepseek-test" },
      "qa/user-choice",
      policy,
      true
    )
  ).toBe("deepseek-test");
  policy.billing.mode = "none";
  expect(resolveChatModel(provider, "qa/user-choice", policy, true)).toBe(
    "qa/user-choice"
  );
});

it("reports the execution model through the settings API as preferences and published rules change", () =>
  configured(async ({ admin, publish }) => {
    const policy = structuredClone(productFixture);
    policy.models.chat.provider = "openrouter";
    policy.billing.mode = "free";
    policy.billing.defaultChatModel = "qa/first-default";
    await publish(policy);
    await admin.apiConfig.updatePreferences({ llmModel: "qa/user-choice" });
    expect((await admin.apiConfig.get()).chatProvider.model).toBe(
      "qa/first-default"
    );
    policy.billing.mode = "none";
    await publish(policy);
    expect((await admin.apiConfig.get()).chatProvider.model).toBe(
      "qa/user-choice"
    );
    await admin.apiConfig.updatePreferences({ llmModel: "" });
    expect((await admin.apiConfig.get()).chatProvider.model).toBe(
      "qa/first-default"
    );
    policy.billing.defaultChatModel = "qa/second-default";
    await publish(policy);
    expect((await admin.apiConfig.get()).chatProvider.model).toBe(
      "qa/second-default"
    );
  }));
