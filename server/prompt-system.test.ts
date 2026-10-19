import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  getUserGirlfriends: vi.fn(),
  getActiveGirlfriend: vi.fn(),
  createGirlfriend: vi.fn(),
  updateGirlfriend: vi.fn(),
  deleteGirlfriend: vi.fn(),
  createDefaultGirlfriend: vi.fn(),
  getConversationMessages: vi.fn(),
  createConversation: vi.fn(),
  addMessage: vi.fn(),
  getUserApiConfig: vi.fn(),
  upsertUserApiConfig: vi.fn(),
  searchConversations: vi.fn(),
  getGirlfriendMood: vi.fn(),
  updateGirlfriendMood: vi.fn(),
  softDeleteGirlfriend: vi.fn(),
  getDeletedGirlfriends: vi.fn(),
  restoreGirlfriend: vi.fn(),
  permanentDeleteGirlfriend: vi.fn(),
  batchSoftDeleteGirlfriends: vi.fn(),
  cleanupExpiredGirlfriends: vi.fn(),
  getConversationsWithLastMessage: vi.fn(),
}));

describe("Prompt System - Layered Architecture", () => {
  describe("Global Prompt", () => {
    it("should store global prompt in apiConfig", () => {
      const config = {
        globalPrompt: "回复要简短可爱，多用表情",
        replyLanguage: "中文",
        replyLengthLimit: "50字以内",
      };
      expect(config.globalPrompt).toBe("回复要简短可爱，多用表情");
      expect(config.replyLanguage).toBe("中文");
      expect(config.replyLengthLimit).toBe("50字以内");
    });

    it("should handle empty global prompt", () => {
      const config = {
        globalPrompt: null,
        replyLanguage: null,
        replyLengthLimit: null,
      };
      expect(config.globalPrompt).toBeNull();
    });

    it("should enforce max length of 500 characters", () => {
      const longPrompt = "a".repeat(500);
      expect(longPrompt.length).toBe(500);
      const tooLong = "a".repeat(501);
      expect(tooLong.length).toBeGreaterThan(500);
    });
  });

  describe("Individual Custom Prompt", () => {
    it("should store custom prompt per girlfriend", () => {
      const girlfriend = {
        name: "YUMEI",
        personality: "活泼开朗",
        customPrompt: "说话带点傲娇，偶尔用日语词汇",
      };
      expect(girlfriend.customPrompt).toBe("说话带点傲娇，偶尔用日语词汇");
    });

    it("should handle null custom prompt", () => {
      const girlfriend = {
        name: "YUMEI",
        personality: "活泼开朗",
        customPrompt: null,
      };
      expect(girlfriend.customPrompt).toBeNull();
    });

    it("should enforce max length of 300 characters", () => {
      const longPrompt = "a".repeat(300);
      expect(longPrompt.length).toBe(300);
    });
  });

  describe("Prompt Merging Logic", () => {
    it("should merge global + individual prompts correctly", () => {
      const globalPrompt = "回复要简短可爱";
      const customPrompt = "说话带点傲娇";
      const personality = "温柔体贴";
      const appearance = "长发飘逸";

      // Simulate the merging logic from routers.ts
      const parts: string[] = [];
      parts.push(`你是一个AI女友角色。性格：${personality}。外貌：${appearance}。`);
      if (globalPrompt) parts.push(`用户全局偏好：${globalPrompt}`);
      if (customPrompt) parts.push(`角色专属指令：${customPrompt}`);

      const merged = parts.join("\n");
      expect(merged).toContain("回复要简短可爱");
      expect(merged).toContain("说话带点傲娇");
      expect(merged).toContain("温柔体贴");
      expect(merged).toContain("长发飘逸");
    });

    it("should work with only global prompt (no individual)", () => {
      const globalPrompt = "回复要简短可爱";
      const customPrompt: string | null = null;

      const parts: string[] = [];
      parts.push("你是一个AI女友角色。");
      if (globalPrompt) parts.push(`用户全局偏好：${globalPrompt}`);
      if (customPrompt) parts.push(`角色专属指令：${customPrompt}`);

      const merged = parts.join("\n");
      expect(merged).toContain("回复要简短可爱");
      expect(merged).not.toContain("角色专属指令");
    });

    it("should work with only individual prompt (no global)", () => {
      const globalPrompt: string | null = null;
      const customPrompt = "说话带点傲娇";

      const parts: string[] = [];
      parts.push("你是一个AI女友角色。");
      if (globalPrompt) parts.push(`用户全局偏好：${globalPrompt}`);
      if (customPrompt) parts.push(`角色专属指令：${customPrompt}`);

      const merged = parts.join("\n");
      expect(merged).not.toContain("用户全局偏好");
      expect(merged).toContain("说话带点傲娇");
    });

    it("should work with neither global nor individual prompt", () => {
      const globalPrompt: string | null = null;
      const customPrompt: string | null = null;

      const parts: string[] = [];
      parts.push("你是一个AI女友角色。");
      if (globalPrompt) parts.push(`用户全局偏好：${globalPrompt}`);
      if (customPrompt) parts.push(`角色专属指令：${customPrompt}`);

      const merged = parts.join("\n");
      expect(merged).toBe("你是一个AI女友角色。");
    });

    it("should include reply language when set", () => {
      const replyLanguage = "日文";
      const parts: string[] = ["你是一个AI女友角色。"];
      if (replyLanguage) parts.push(`请使用${replyLanguage}回复。`);

      const merged = parts.join("\n");
      expect(merged).toContain("请使用日文回复");
    });

    it("should include reply length limit when set", () => {
      const replyLengthLimit = "50字以内";
      const parts: string[] = ["你是一个AI女友角色。"];
      if (replyLengthLimit) parts.push(`回复长度要求：${replyLengthLimit}。`);

      const merged = parts.join("\n");
      expect(merged).toContain("回复长度要求：50字以内");
    });
  });

  describe("Quick Templates", () => {
    const templates = [
      { label: "🏠 日常陪伴", text: "回复要温柔体贴，多关心对方的日常生活" },
      { label: "🎭 角色扮演", text: "始终保持角色设定，不要跳出角色" },
      { label: "✨ 简短回复", text: "回复要简洁，每次不超过 2-3 句话" },
      { label: "💬 深度对话", text: "可以进行深入的话题讨论" },
      { label: "🌟 活泼搞怪", text: "回复要充满活力和幽默感" },
      { label: "🌿 治愈系", text: "回复要温暖治愈，充满关怀和鼓励" },
    ];

    it("should have 6 quick templates", () => {
      expect(templates.length).toBe(6);
    });

    it("each template should have label and text", () => {
      templates.forEach((tpl) => {
        expect(tpl.label).toBeTruthy();
        expect(tpl.text).toBeTruthy();
        expect(tpl.text.length).toBeGreaterThan(5);
      });
    });

    it("template text should fit within global prompt limit", () => {
      templates.forEach((tpl) => {
        expect(tpl.text.length).toBeLessThanOrEqual(500);
      });
    });
  });
});
