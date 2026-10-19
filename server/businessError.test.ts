import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { BusinessRuleError } from "./_core/businessError";
import { publicProcedure, router } from "./_core/trpc";

describe("business error transport", () => {
  it("exposes level requirements separately from the error message", async () => {
    const app = router({
      denied: publicProcedure.query(() => {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "LEVEL_LOCKED",
          cause: new BusinessRuleError({
            reason: "LEVEL_LOCKED",
            requiredLevel: 5,
            currentLevel: 2,
          }),
        });
      }),
    });
    const response = await app
      .createCaller({} as never)
      .denied()
      .catch(error => error);
    const shape = app._def._config.errorFormatter({
      error: response,
      shape: {
        message: response.message,
        code: -32003,
        data: { code: "FORBIDDEN", httpStatus: 403 },
      },
      type: "query",
      path: "denied",
      input: undefined,
      ctx: undefined,
    });
    expect(shape.data.business).toEqual({
      reason: "LEVEL_LOCKED",
      requiredLevel: 5,
      currentLevel: 2,
    });
  });
});
