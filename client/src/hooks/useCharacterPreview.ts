/** 通过当前页面的查询参数打开角色详情，保留搜索、筛选和加载进度。 */
import { useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { getCharacterPreset } from "@shared/characterPresets";

/** 首页和探索页共用的角色预览及焦点恢复状态。 */
export function useCharacterPreview() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const selected = getCharacterPreset(params.get("character") ?? "");
  const returnFocus = useRef<HTMLElement | null>(null);
  const showCharacter = (id: string, trigger?: HTMLElement) => {
    // 触摸或部分浏览器的鼠标点击不会先聚焦按钮，直接记录真实触发入口。
    returnFocus.current = trigger ?? (document.activeElement as HTMLElement);
    const next = new URLSearchParams(search);
    next.set("character", id);
    navigate(location + "?" + next.toString(), { replace: true });
  };
  const closeCharacter = () => {
    const next = new URLSearchParams(search);
    next.delete("character");
    navigate(location + (next.size ? "?" + next.toString() : ""), {
      replace: true,
    });
  };
  return { selected, showCharacter, closeCharacter, returnFocus };
}
