/** 单元与数据库集成测试的文件范围、路径别名及环境初始化。 */

import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      // 客户端测试通过文件首行的 Vitest 环境指令按需启用 jsdom。
      "client/**/*.test.ts",
      "client/**/*.test.tsx",
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
