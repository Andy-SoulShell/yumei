/** 本地化回归不访问数据库；完整测试继续使用原有数据库保护检查。 */
import base from "./vitest.config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: [
      "client/src/lib/i18n.test.ts",
      "client/src/lib/speech.test.ts",
      "client/src/contexts/PreferencesContext.test.tsx",
      "server/_core/email.test.ts",
      "server/businessError.test.ts",
    ],
  },
});
