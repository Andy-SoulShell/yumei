/** 为 tRPC 请求解析会话，并读取应用用户资料。 */

import { readAdministrator, type Administrator } from "../managementAuth";
import { TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserById } from "../repositories/users";
import { getSessionUser } from "./auth";
import { log, providerErrorSummary } from "./log";

/** 业务请求上下文；user 为 null 表示未认证或会话对应用户不可用。 */
export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** 认证并查库成功的应用用户，未登录或已删除时为 null。 */
  user: User | null;
  administrator?: Administrator | null;
  /** 与响应头和服务日志关联的请求标识。 */
  requestId?: string;
};

/** 解析会话并查找用户；基础设施异常明确报错，避免被误判为退出登录。 */
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  const requestId = crypto.randomUUID();
  opts.res.setHeader("X-Request-ID", requestId);

  try {
    const sessionUser = await getSessionUser(opts.req);
    if (sessionUser?.id) {
      const dbUser = await getUserById(sessionUser.id);
      user = dbUser ?? null;
    }
  } catch (error) {
    log.error("[request] context unavailable", {
      requestId,
      ...providerErrorSummary(error),
    });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Service temporarily unavailable",
    });
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    administrator: await readAdministrator(opts.req),
    requestId,
  };
}
