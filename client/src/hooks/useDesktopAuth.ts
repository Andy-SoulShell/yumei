/** 认证弹框与手机独立页面使用和主导航一致的断点。 */
import { useSyncExternalStore } from "react";

const query = "(min-width: 901px)";
function subscribe(listener: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}

/** 同步监听宽度变化，服务端渲染使用手机页面作为回退。 */
export function useDesktopAuth() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? window.innerWidth > 900,
    () => false
  );
}
