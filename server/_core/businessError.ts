/** 业务拒绝原因独立于显示文案，由 tRPC 作为结构化字段传给客户端。 */
import type { BusinessErrorDetails } from "../../shared/errors";

export class BusinessRuleError extends Error {
  constructor(readonly details: BusinessErrorDetails) {
    super(details.reason);
    this.name = "BusinessRuleError";
  }
}
