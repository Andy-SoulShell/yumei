/** 配置 tRPC 序列化与公共、登录用户和管理员三类访问入口。 */

import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { BusinessRuleError } from "./businessError";
import { log, providerErrorSummary } from "./log";
import { normalizeMediaResponse } from "./mediaUrls";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error, ctx }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        requestId: ctx?.requestId ?? null,
        business:
          error.cause instanceof BusinessRuleError ? error.cause.details : null,
      },
    };
  },
});

/** 创建业务路由树的 tRPC 工厂。 */
export const router = t.router;
/** 不要求用户会话的过程基类，输入与业务安全检查由具体过程负责。 */
const observed = t.middleware(async opts => {
  const started = Date.now();
  const result = await opts.next();
  if (!result.ok)
    log.warn("[request] procedure failed", {
      requestId: opts.ctx?.requestId ?? null,
      path: opts.path,
      type: opts.type,
      durationMs: Date.now() - started,
      trpcCode: result.error.code,
      ...providerErrorSummary(result.error.cause),
    });
  return result.ok
    ? { ...result, data: normalizeMediaResponse(result.data) }
    : result;
});
export const publicProcedure = t.procedure.use(observed);

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
export const protectedProcedure = publicProcedure.use(requireUser);

/** 要求独立单密码管理会话的过程基类。 */
export const adminProcedure = publicProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    ctx.res.setHeader?.("Cache-Control", "no-store");

    if (!ctx.administrator) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        administrator: ctx.administrator,
      },
    });
  })
);
