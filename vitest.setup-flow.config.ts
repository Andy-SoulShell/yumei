/** 角色创建、渐进定制与聊天交接回归，不访问数据库。 */
import base from "./vitest.config";
import { defineConfig } from "vitest/config";
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: [
      "client/src/features/setup/*.test.tsx",
      "client/src/pages/Setup.test.tsx",
      "client/src/features/discovery/CharacterChatActions.test.tsx",
    ],
  },
});
