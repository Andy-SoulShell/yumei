/** 注册、登录和邮件令牌共用的认证规则。 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const AUTH_LINK_EXPIRES_SECONDS = 15 * 60;

/** 校验密码长度，前后端使用同一规则，不对密码做裁剪或大小写转换。 */
export function isValidPasswordLength(password: string) {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  );
}
