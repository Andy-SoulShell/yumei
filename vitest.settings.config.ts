/** 设置页分组、分区保存、自动保存与本设备通知回归，不访问数据库。 */
import base from "./vitest.config";
import { defineConfig } from "vitest/config";
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: [
      "client/src/features/settings/*.test.tsx",
      "client/src/hooks/useProviderKeyDrafts.test.tsx",
      "client/src/hooks/useSettingsDraft.test.tsx",
      "client/src/pages/Settings.test.tsx",
      "client/src/components/PushCard.test.tsx",
      "client/src/components/AppearanceSettings.test.tsx",
      "client/src/contexts/PreferencesContext.test.tsx",
    ],
  },
});
