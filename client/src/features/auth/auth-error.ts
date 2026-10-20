/** 将认证错误码转换为界面文案，避免泄漏账号是否存在或直接展示服务端错误。 */
import type { Translator } from "@shared/i18n";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@shared/auth";

export type AuthFailure = { code?: string; status?: number };

/** 登录、密码修改和邮件请求共用的认证错误反馈。 */
export function authErrorMessage(error: AuthFailure, t: Translator) {
  if (error.status === 429 || error.code === "TOO_MANY_REQUESTS")
    return t("auth:tooManyRequests");
  switch (error.code) {
    case "EMAIL_NOT_VERIFIED":
      return t("auth:emailNotVerified");
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
      return t("auth:invalidCredentials");
    case "PASSWORD_TOO_SHORT":
    case "PASSWORD_TOO_LONG":
      return t("auth:passwordRules", {
        min: PASSWORD_MIN_LENGTH,
        max: PASSWORD_MAX_LENGTH,
      });
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return t("auth:invalidLink");
    default:
      return t("auth:requestFailed");
  }
}
