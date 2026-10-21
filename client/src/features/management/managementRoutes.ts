/** 管理页面拥有独立地址；就地编辑使用可恢复的编辑地址。 */
import { useLocation, useSearch } from "wouter";
import { useEffect, useRef } from "react";
import { sections, type Pane } from "./managementModel";

/** 从管理地址恢复模块及官方角色，未知模块回到工作台。 */
export function managementRoute(location: string): {
  pane: Pane;
  characterId: string;
} {
  const [value, entity = ""] = location.replace(/^\/admin\/?/, "").split("/");
  const valid = [
    "overview",
    "official",
    "home",
    "publish",
    ...sections.map(section => section.id),
  ].includes(value);
  let characterId = "";
  try {
    characterId = value === "official" ? decodeURIComponent(entity) : "";
  } catch {
    /* 无效地址回到角色库。 */
  }
  return { pane: valid ? (value as Pane) : "overview", characterId };
}

/** 生成独立页面地址，角色编辑可通过地址直接返回。 */
export function managementPath(pane: Pane, characterId = "") {
  return `/admin/${pane}${pane === "official" && characterId ? `/${encodeURIComponent(characterId)}` : ""}`;
}

/** 编辑器可刷新、分享和后退关闭；当前草稿仍由所属页面管理。 */
export function useExperienceRoute(busy = false) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const settled = useRef({ location, search });
  const protectedSearch =
    busy &&
    location === settled.current.location &&
    search !== settled.current.search;
  const params = new URLSearchParams(
    protectedSearch ? settled.current.search : search
  );
  useEffect(() => {
    if (protectedSearch) {
      navigate(
        `${location}${settled.current.search ? `?${settled.current.search}` : ""}`,
        { replace: true }
      );
    } else if (!busy) settled.current = { location, search };
  }, [busy, protectedSearch, location, search, navigate]);
  const openedHere = useRef(false);
  return {
    editing: params.get("edit") || undefined,
    item: params.get("item") || undefined,
    open: (task: string, item?: string) => {
      const next = new URLSearchParams(search);
      next.set("edit", task);
      if (item) next.set("item", item);
      else next.delete("item");
      openedHere.current = true;
      navigate(`${location}?${next}`);
    },
    close: () => {
      if (openedHere.current) {
        openedHere.current = false;
        window.history.back();
      } else {
        const next = new URLSearchParams(search);
        next.delete("edit");
        next.delete("item");
        navigate(`${location}${next.size ? `?${next}` : ""}`, {
          replace: true,
        });
      }
    },
  };
}
