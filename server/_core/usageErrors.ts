/** 额度、短期频率和并发使用不同的公开业务原因。 */
import { TRPCError } from "@trpc/server";
import type { BusinessErrorDetails } from "../../shared/errors";
import { BusinessRuleError } from "./businessError";
export function usageError(details: BusinessErrorDetails) {
  return new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: details.reason,
    cause: new BusinessRuleError(details),
  });
}
