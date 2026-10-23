/** 六条核心旅程的多语言与手机交互回归；数据库集成仍走完整保护入口。 */
import base from "./vitest.config";
import { defineConfig } from "vitest/config";
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: [
      "client/src/lib/i18n.test.ts",
      "client/src/lib/{speech,imageSubmissions}.test.ts",
      "client/src/contexts/PreferencesContext.test.tsx",
      "client/src/pages/{Landing,Explore,CreateCharacter,Setup,Settings,Memories}.test.tsx",
      "client/src/features/{discovery,setup,chat,settings,memory}/*.test.tsx",
      "client/src/hooks/{useCompanionChat,useProviderKeyDrafts,useSettingsDraft,useChatInputDraft,useChatScrollAnchor,useKeyboardViewport}.test.tsx",
      "server/selfieRequest.test.ts",
      "server/_core/email.test.ts",
      "server/businessError.test.ts",
    ],
  },
});
