/** 复制聊天文字，兼容没有 Clipboard API 的局域网 HTTP。 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 浏览器可能拒绝 Clipboard API，继续尝试当前点击手势中的复制。
    }
  }
  const previous = document.activeElement;
  const selection = document.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) =>
        selection.getRangeAt(i).cloneRange()
      )
    : [];
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.cssText = "position:fixed;top:0;left:-9999px;font-size:16px";
  document.body.append(field);
  try {
    field.select();
    if (!document.execCommand?.("copy")) throw new Error("Copy unavailable");
  } finally {
    field.remove();
    if (previous instanceof HTMLElement && previous.isConnected)
      previous.focus({ preventScroll: true });
    selection?.removeAllRanges();
    ranges.forEach(range => selection?.addRange(range));
  }
}
