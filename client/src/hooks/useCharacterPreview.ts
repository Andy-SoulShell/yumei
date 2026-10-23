/** 通过当前页面的查询参数打开角色详情，保留搜索、筛选和加载进度。 */
import { useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useDiscovery } from "@/features/discovery/useDiscovery";

const PREVIEW_ENTRY = "yumei:character-preview";

/** 首页和探索页共用的角色预览及焦点恢复状态。 */
export function useCharacterPreview() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const { data } = useDiscovery();
  const selected = data?.characters.find(
    item => item.id === params.get("character")
  );
  const returnFocus = useRef<HTMLElement | null>(null);
  const urlFor = (query: URLSearchParams) =>
    location + (query.size ? "?" + query.toString() : "");
  const baseParams = new URLSearchParams(search);
  baseParams.delete("character");
  const baseUrl = urlFor(baseParams);
  const currentUrl = urlFor(params);
  const entry = window.history.state?.[PREVIEW_ENTRY];
  const hasPreviewEntry =
    entry?.baseUrl === baseUrl && entry?.detailUrl === currentUrl;

  const showCharacter = (id: string, trigger?: HTMLElement) => {
    const alreadyOpen = params.has("character");
    // 切换详情不增加层级，也不把焦点恢复位置改成即将卸载的弹窗按钮。
    if (!alreadyOpen)
      returnFocus.current = trigger ?? (document.activeElement as HTMLElement);
    const next = new URLSearchParams(search);
    next.set("character", id);
    const detailUrl = urlFor(next);
    navigate(detailUrl, {
      replace: alreadyOpen,
      ...(!alreadyOpen || hasPreviewEntry
        ? { state: { [PREVIEW_ENTRY]: { baseUrl, detailUrl } } }
        : {}),
    });
  };
  const closeCharacter = () => {
    if (hasPreviewEntry && window.history.length > 1) window.history.back();
    // 直接访问的分享链接没有目录历史，关闭时保留筛选并留在站内。
    else navigate(baseUrl, { replace: true });
  };
  return { selected, showCharacter, closeCharacter, returnFocus };
}
