/** 为 tRPC 请求解析会话，并读取应用用户资料。 */

import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getSessionUser } from "./auth";
import { getUserById } from "../db";

/** 业务请求上下文；user 为 null 表示未认证或会话对应用户不可用。 */
export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** 认证并查库成功的应用用户，未登录或已删除时为 null。 */
  user: User | null;
};

/** 解析 Better-Auth 会话并查找应用用户，失败时以未登录上下文继续。 */
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const sessionUser = await getSessionUser(opts.req);
    if (sessionUser?.id) {
      const dbUser = await getUserById(sessionUser.id);
      user = dbUser ?? null;
    }
  } catch {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
