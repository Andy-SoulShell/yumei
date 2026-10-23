/** 聊天前端回归不连接数据库；完整集成测试继续执行数据库保护检查。 */
import base from "./vitest.config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: [
      "client/src/features/chat/**/*.test.ts",
      "client/src/features/chat/**/*.test.tsx",
      "client/src/hooks/useChatInputDraft.test.tsx",
      "client/src/hooks/useChatScrollAnchor.test.tsx",
      "client/src/lib/chatStreamDrafts.test.ts",
      "client/src/lib/imageSubmissions.test.ts",
      "client/src/lib/copyText.test.ts",
    ],
  },
});
