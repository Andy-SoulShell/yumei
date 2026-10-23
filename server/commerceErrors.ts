import { TRPCError } from "@trpc/server";
import { BusinessRuleError } from "./_core/businessError";
import type { CommerceRejection } from "../shared/errors";
export function commerceError(
  code: CommerceRejection,
  trpcCode:
    | "PRECONDITION_FAILED"
    | "CONFLICT"
    | "BAD_REQUEST"
    | "NOT_FOUND" = "PRECONDITION_FAILED"
) {
  return new TRPCError({
    code: trpcCode,
    message: code,
    cause: new BusinessRuleError({ reason: "COMMERCE_REJECTED", code }),
  });
}
