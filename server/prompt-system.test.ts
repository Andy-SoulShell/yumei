/** 验证聊天实际使用的提示词生成器和路由输入边界。 */
import { describe, expect, it } from "vitest";
import { buildChatSystemPrompt } from "./chatPrompt";
import { appRouter } from "./routers";

const character = {
  name: "YUMEI",
  personality: "温柔体贴",
  appearance: "长发",
  interests: "摄影",
  customPrompt: null,
};

describe("chat system prompt", () => {
  it("includes the real character profile and role identity", () => {
    const prompt = buildChatSystemPrompt(character);
    expect(prompt).toContain("虚拟 AI 陪伴角色");
    expect(prompt).toContain('"name":"YUMEI"');
    expect(prompt).toContain('"personality":"温柔体贴"');
    expect(prompt).toContain('"appearance":"长发"');
    expect(prompt).toContain('"interests":"摄影"');
    expect(prompt).not.toMatch(/undefined|null|全局行为规范|专属指令/);
  });

  it("orders global preferences, language, length, and character instructions", () => {
    const prompt = buildChatSystemPrompt(
      { ...character, customPrompt: "偶尔用日语词汇" },
      {
        globalPrompt: "回复简短",
        replyLanguage: "日文",
        replyLengthLimit: "50字以内",
      }
    );
    const expected = [
      '"customPrompt":"偶尔用日语词汇"',
      '"globalPrompt":"回复简短"',
      '请使用"日文"回复。',
      '【回复长度】"50字以内"',
    ];
    for (const text of expected) expect(prompt).toContain(text);
    for (let i = 1; i < expected.length; i++) {
      expect(prompt.indexOf(expected[i])).toBeGreaterThan(
        prompt.indexOf(expected[i - 1])
      );
    }
  });

  it("omits empty optional profile and configuration fields", () => {
    const prompt = buildChatSystemPrompt(
      { ...character, interests: null },
      { globalPrompt: null, replyLanguage: "中文", replyLengthLimit: null }
    );
    expect(prompt).not.toMatch(
      /兴趣爱好|全局行为规范|请使用中文|回复长度|专属指令|null/
    );
  });

  it("makes a changed language preference apply despite older replies or a differently worded input", () => {
    const configured = buildChatSystemPrompt(character, {
      replyLanguage: "English",
      globalPrompt: null,
      replyLengthLimit: null,
    });
    expect(configured).toContain('Response language for this turn: "English"');
    expect(configured).toContain(
      "conversation history or the latest user message"
    );
    expect(configured).toContain(
      "Past assistant replies are history, not a language instruction"
    );
    expect(buildChatSystemPrompt(character)).toContain(
      "跟随用户当前使用的语言"
    );
    expect(buildChatSystemPrompt(character)).not.toContain(
      "Response language for this turn"
    );
  });

  it("keeps a character instruction when no global preferences exist", () => {
    const prompt = buildChatSystemPrompt({
      ...character,
      customPrompt: "保持角色设定",
    });
    expect(prompt).toContain('"customPrompt":"保持角色设定"');
    expect(prompt).not.toContain("全局行为规范");
  });

  it("rejects oversized preferences through actual route validation before a write", async () => {
    const caller = appRouter.createCaller({
      user: { id: "validation-test" },
      req: {},
      res: {},
    } as never);
    await expect(
      caller.apiConfig.updatePreferences({ globalPrompt: "a".repeat(501) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.girlfriend.update({ id: 1, customPrompt: "a".repeat(301) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
