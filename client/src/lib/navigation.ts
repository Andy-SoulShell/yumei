/** 限制登录回跳到应用内部页面，保留用户选择的角色和操作。 */
export function safeReturnTo(value: string | null | undefined) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.includes("\\") ||
    Array.from(value).some(character => character.charCodeAt(0) <= 32)
  )
    return "/";
  if (value.startsWith("//")) return "/";
  const path = value.split(/[?#]/)[0];
  return /^\/(?:explore|privacy|help|characters|chats|generate|gallery|settings|setup(?:\/\d+)?|chat(?:\/\d+)?|memories\/\d+)?$/.test(
    path
  )
    ? value
    : "/";
}

/** 为受保护的页面生成带内部回跳地址的登录入口。 */
export function loginUrl(returnTo: string) {
  return `/login?next=${encodeURIComponent(safeReturnTo(returnTo))}`;
}
