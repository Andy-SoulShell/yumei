import { describe, expect, it } from "vitest";
import { detectMode, buildSmartPrompt } from "./promptTemplates";

describe("detectMode", () => {
  it("should detect mirror mode for clothing keywords", () => {
    expect(detectMode("wearing a red dress")).toBe("mirror");
    expect(detectMode("showing my new outfit")).toBe("mirror");
    expect(detectMode("full-body photo")).toBe("mirror");
  });

  it("should detect direct mode for location keywords", () => {
    expect(detectMode("at a cozy cafe")).toBe("direct");
    expect(detectMode("on the beach")).toBe("direct");
    expect(detectMode("close-up portrait")).toBe("direct");
  });

  it("should default to mirror mode for ambiguous input", () => {
    expect(detectMode("just chilling")).toBe("mirror");
    expect(detectMode("having fun")).toBe("mirror");
  });
});

describe("buildSmartPrompt", () => {
  it("should build mirror prompt correctly", () => {
    const result = buildSmartPrompt({
      userContext: "wearing a red dress",
    });

    expect(result.mode).toBe("mirror");
    expect(result.prompt).toContain("mirror selfie");
    expect(result.prompt).toContain("wearing a red dress");
    expect(result.userContext).toBe("wearing a red dress");
  });

  it("should build direct prompt correctly", () => {
    const result = buildSmartPrompt({
      userContext: "at a cozy cafe",
    });

    expect(result.mode).toBe("direct");
    expect(result.prompt).toContain("selfie");
    expect(result.prompt).toContain("at a cozy cafe");
    expect(result.prompt).toContain("phone held at arm's length");
  });

  it("should allow manual mode override", () => {
    const result = buildSmartPrompt({
      userContext: "at a cafe",
      mode: "mirror", // 强制使用 mirror 模式
    });

    expect(result.mode).toBe("mirror");
    expect(result.prompt).toContain("mirror selfie");
  });

  it("should handle empty user context", () => {
    const result = buildSmartPrompt({
      userContext: "",
    });

    expect(result.mode).toBe("mirror");
    expect(result.prompt).toBeDefined();
    expect(result.userContext).toBe("");
  });

  it("should generate different prompts for different contexts", () => {
    const result1 = buildSmartPrompt({ userContext: "wearing a blue dress" });
    const result2 = buildSmartPrompt({ userContext: "at the beach" });

    expect(result1.prompt).not.toBe(result2.prompt);
    expect(result1.mode).not.toBe(result2.mode);
  });
});
