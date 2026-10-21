/** 公开探索目录的搜索、画风与分页状态，统一保存在地址中。 */
import { useLocation, useSearch } from "wouter";
import type { CharacterPreset } from "@shared/discovery";
import { useI18n } from "@/lib/i18n";
import { useDiscovery } from "./useDiscovery";

/** 刷新或关闭角色详情后，继续展示原来的目录条件和已加载角色。 */
export function useExploreController() {
  const { t } = useI18n();
  const discovery = useDiscovery();
  const pageSize = discovery.data?.home.pageSize ?? 20;
  const [, navigate] = useLocation();
  const query = useSearch();
  const params = new URLSearchParams(query);
  const search = params.get("q") ?? "";
  const rawStyle = params.get("style");
  const style: "all" | CharacterPreset["style"] =
    rawStyle === "realistic" || rawStyle === "anime" ? rawStyle : "all";
  const keyword = search.trim().toLocaleLowerCase();
  const results = (discovery.data?.characters ?? []).filter(preset => {
    if (!preset.listed) return false;
    if (style !== "all" && preset.style !== style) return false;
    return [
      preset.name,
      preset.label,
      preset.tagline,
      preset.interests,
      t(preset.style === "anime" ? "explore:anime" : "explore:realistic"),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(keyword);
  });
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const rawPage = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(rawPage)
    ? Math.min(pageCount, Math.max(1, rawPage))
    : 1;
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    navigate("/explore" + (next.size ? "?" + next.toString() : ""), {
      replace: true,
    });
  };
  return {
    isLoading: discovery.isLoading,
    error: discovery.error,
    refetch: discovery.refetch,
    search,
    style,
    results,
    visible: results.slice(0, page * pageSize),
    hasFilters: !!keyword || style !== "all",
    hasMore: page < pageCount,
    setSearch: (value: string) => update({ q: value, page: null }),
    setStyle: (value: string) =>
      update({ style: value === "all" ? null : value, page: null }),
    reset: () => update({ q: null, style: null, page: null }),
    loadMore: () => update({ page: String(page + 1) }),
  };
}
