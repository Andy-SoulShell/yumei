/** 认证页面和邮件模板回归不连接数据库；真实认证事务走完整测试入口。 */
import base from "./vitest.config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: [
      "client/src/features/auth/*.test.tsx",
      "client/src/features/settings/PasswordSettings.test.tsx",
      "client/src/lib/auth-navigation.test.ts",
      "client/src/lib/serviceWorker.test.ts",
      "server/_core/email.test.ts",
    ],
  },
});
