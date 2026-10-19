/** 配置 tRPC 序列化与公共、登录用户和管理员三类访问入口。 */

import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

/** 创建业务路由树的 tRPC 工厂。 */
export const router = t.router;
/** 不要求用户会话的过程基类，输入与业务安全检查由具体过程负责。 */
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/** 要求上下文存在认证用户的过程基类，不自动验证具体资源归属。 */
export const protectedProcedure = t.procedure.use(requireUser);

/** 要求当前用户具有 admin 角色的过程基类。 */
export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);
