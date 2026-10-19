/** 轻量 tRPC 健康接口，数据库就绪状态由独立 HTTP 探针提供。 */

import { z } from "zod";
import { publicProcedure, router } from "./trpc";

/** 返回基本存活状态的公共路由，不代表数据库或外部 AI 服务可用。 */
export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),
});
