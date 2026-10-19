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
    expect(prompt).toContain("你是YUMEI，一个虚拟女友。");
    expect(prompt).toContain("性格特征：\n温柔体贴");
    expect(prompt).toContain("外貌特征：\n长发");
    expect(prompt).toContain("兴趣爱好：\n摄影");
    expect(prompt).toContain("请以YUMEI的身份与用户对话");
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
      "【全局行为规范】\n回复简短",
      "请使用日文回复。",
      "回复长度控制在50字以内左右。",
      "【YUMEI专属指令】\n偶尔用日语词汇",
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

  it("keeps a character instruction when no global preferences exist", () => {
    const prompt = buildChatSystemPrompt({
      ...character,
      customPrompt: "保持角色设定",
    });
    expect(prompt).toContain("【YUMEI专属指令】\n保持角色设定");
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
