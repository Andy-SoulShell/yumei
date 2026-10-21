/** 管理后台独立密码会话，仅暴露登录状态与登录、退出操作。 */
import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import {
  loginManagement,
  logoutManagement,
  managementConfigured,
} from "../managementAuth";
export const managementRouter = router({
  status: publicProcedure.query(({ ctx }) => {
    ctx.res.setHeader("Cache-Control", "no-store");
    return {
      configured: managementConfigured(),
      authenticated: !!ctx.administrator,
    };
  }),
  login: publicProcedure
    .input(z.object({ password: z.string().min(1).max(512) }).strict())
    .mutation(({ ctx, input }) =>
      loginManagement(ctx.req, ctx.res, input.password)
    ),
  logout: publicProcedure.mutation(({ ctx }) =>
    logoutManagement(ctx.req, ctx.res)
  ),
});
