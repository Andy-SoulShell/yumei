/** 角色创建的接口与生成回归均使用替身，不连接应用数据库。 */
import base from "./vitest.config";
import { defineConfig } from "vitest/config";
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: [
      "server/characterPortrait.test.ts",
      "server/characterCreation.test.ts",
      "server/creatorProfile.test.ts",
      "server/prompt-system.test.ts",
      "server/promptTemplates.test.ts",
      "client/src/features/setup/creatorTemplates.test.ts",
      "client/src/features/setup/CharacterCreator.test.tsx",
      "server/_core/portraitProvider.test.ts",
      "server/_core/comfyui.test.ts",
    ],
  },
});
