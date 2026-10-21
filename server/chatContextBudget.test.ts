import { afterEach, expect, it, vi } from "vitest";
import { chatContextLimits, planChatContext } from "./testAiConfig";

afterEach(() => vi.unstubAllEnvs());

it("budgets a separate turn system rule inside the same platform reserve and total", () => {
  vi.stubEnv("CHAT_CONTEXT_CHAR_LIMIT", "64000");
  const input = {
    platform: "P".repeat(13000),
    additionalSystemPrompt: "L".repeat(1000),
    memory: "M".repeat(6000),
    summary: "",
    followups: [{ role: "user" as const, content: "U".repeat(48000) }],
    previous: [{ role: "assistant" as const, content: "H".repeat(6000) }],
  };
  const result = planChatContext(input);
  expect(
    result.systemPrompt.length +
      input.additionalSystemPrompt.length +
      result.history.reduce((n, item) => n + item.content.length, 0)
  ).toBeLessThanOrEqual(64000);
  expect(() =>
    planChatContext({ ...input, additionalSystemPrompt: "L".repeat(1001) })
  ).toThrow("reserve");
});

it("keeps accepted supplementary messages and complete priority blocks within the common budget", () => {
  vi.stubEnv("CHAT_CONTEXT_CHAR_LIMIT", "64000");
  const followups = Array.from({ length: 6 }, () => ({
    role: "user" as const,
    content: "🙂".repeat(4000),
  }));
  const platform = "P".repeat(14000),
    memory = '<facts>{"name":"test"}</facts>';
  const result = planChatContext({
    platform,
    memory,
    summary: "",
    followups,
    previous: [{ role: "assistant", content: "H".repeat(4000) }],
  });
  expect(result.history).toEqual(followups);
  expect(result.systemPrompt).toBe(platform + memory);
  expect(
    result.systemPrompt.length +
      result.history.reduce((n, item) => n + item.content.length, 0)
  ).toBeLessThanOrEqual(chatContextLimits().total);
});
it("rejects an invalid reserve or excessive accepted context instead of trimming input or JSON", () => {
  expect(() =>
    planChatContext({
      platform: "P".repeat(14001),
      memory: "",
      summary: "",
      previous: [],
      followups: [],
    })
  ).toThrow("reserve");
  expect(() =>
    planChatContext({
      platform: "P",
      memory: "",
      summary: "",
      previous: [],
      followups: [{ role: "user", content: "U".repeat(48001) }],
    })
  ).toThrow("follow-up");
});
