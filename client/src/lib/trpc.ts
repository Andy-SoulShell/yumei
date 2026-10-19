/** 前端 tRPC React 入口，通过服务端路由类型约束查询和 mutation。 */

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

/** 与 AppRouter 共享输入输出类型的 React 查询与 mutation 工厂。 */
export const trpc = createTRPCReact<AppRouter>();
