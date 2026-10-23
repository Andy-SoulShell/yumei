/** 探索界面回归独立于数据库，接口流程使用测试替身。 */
import base from "./vitest.config";
import { defineConfig } from "vitest/config";
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: [
      "client/src/components/AppShell.test.tsx",
      "client/src/lib/navigation.test.ts",
      "client/src/lib/serviceWorker.test.ts",
      "client/src/hooks/useCompanionChat.test.tsx",
      "client/src/hooks/useCharacterPreview.test.tsx",
      "client/src/pages/Explore.test.tsx",
      "client/src/pages/Landing.test.tsx",
      "client/src/features/discovery/catalogue.test.ts",
      "client/src/features/discovery/CharacterChatActions.test.tsx",
    ],
  },
});
