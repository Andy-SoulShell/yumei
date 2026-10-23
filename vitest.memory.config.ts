/** 记忆管理与聊天衔接回归，不连接数据库。 */
import base from "./vitest.config";
import { defineConfig } from "vitest/config";
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: [
      "client/src/pages/Memories.test.tsx",
      "client/src/features/memory/*.test.tsx",
    ],
  },
});
