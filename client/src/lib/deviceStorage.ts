/** 设备偏好不可用时保留会话内交互，不让隐私设置或存储配额中断页面。 */
export function readDeviceValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeDeviceValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 偏好已在组件状态中更新，本次会话继续生效。 */
  }
}
