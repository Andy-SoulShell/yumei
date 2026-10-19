/** 与同源 Better-Auth 接口通信的邮箱链接登录客户端。 */

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

/** 启用 magic-link 插件的共享认证客户端。 */
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
