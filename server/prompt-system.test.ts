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
    expect(prompt).toContain("你是YUMEI，一位虚构的成年 AI 陪伴角色。");
    expect(prompt).toContain("【性格与表达】\n温柔体贴");
    expect(prompt).toContain("【外貌设定】\n长发");
    expect(prompt).toContain("【兴趣与日常】\n摄影");
    expect(prompt).toContain("请以YUMEI的身份与用户对话");
    expect(prompt).not.toMatch(/undefined|null|全局行为偏好|专属指令|虚拟女友/);
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
      "【全局行为偏好】\n回复简短",
      "【YUMEI专属指令】\n偶尔用日语词汇",
      "回复语言：日文。",
      "回复长度要求：50字以内。",
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
      /兴趣与日常|全局行为偏好|回复长度要求|专属指令|null/
    );
  });

  it("keeps a character instruction when no global preferences exist", () => {
    const prompt = buildChatSystemPrompt({
      ...character,
      customPrompt: "保持角色设定",
    });
    expect(prompt).toContain("【YUMEI专属指令】\n保持角色设定");
    expect(prompt).not.toContain("全局行为偏好");
  });

  it("keeps male identity intact, makes response constraints explicit and places safety after dynamic memories", () => {
    const prompt = buildChatSystemPrompt(
      {
        ...character,
        name: "艾瑞恩",
        appearance: "30 岁成年男性，动漫精灵",
        customPrompt: "保持内敛的表达",
      },
      { replyLanguage: "中文", replyLengthLimit: "50字以内" },
      "【相关记忆】\n用户喜欢绘图。"
    );
    expect(prompt).toContain("30 岁成年男性");
    expect(prompt).not.toMatch(/虚拟女友|左右/);
    expect(prompt).toContain("回复语言：中文。");
    expect(prompt.indexOf("【安全边界")).toBeGreaterThan(
      prompt.indexOf("用户喜欢绘图")
    );
    expect(prompt.indexOf("回复长度要求")).toBeGreaterThan(
      prompt.indexOf("专属指令")
    );
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
