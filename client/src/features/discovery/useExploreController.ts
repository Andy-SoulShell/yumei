/** 公开探索目录的搜索、画风与分页状态，统一保存在地址中。 */
import { useLocation, useSearch } from "wouter";
import type { CharacterPreset } from "@shared/discovery";
import { useI18n } from "@/lib/i18n";
import { useDiscovery } from "./useDiscovery";
import {
  AGE_FILTERS,
  CATALOGUE_SORTS,
  CATALOGUE_TAGS,
  matchesAge,
  matchesTag,
} from "./catalogueFilters";
import { useCharacterCollection } from "./CharacterCollection";

/** 刷新或关闭角色详情后，继续展示原来的目录条件和已加载角色。 */
export function useExploreController() {
  const { t } = useI18n();
  const discovery = useDiscovery();
  const collection = useCharacterCollection();
  const pageSize = discovery.data?.home.pageSize ?? 20;
  const [location, navigate] = useLocation();
  const query = useSearch();
  const params = new URLSearchParams(query);
  const search = params.get("q") ?? "";
  const rawStyle = params.get("style");
  const tag =
    CATALOGUE_TAGS.find(value => value === params.get("tag")) ?? "all";
  const sort =
    CATALOGUE_SORTS.find(value => value === params.get("sort")) ??
    "recommended";
  const age = AGE_FILTERS.find(value => value === params.get("age")) ?? "all";
  const savedOnly = params.get("saved") === "1";
  const style: "all" | CharacterPreset["style"] =
    rawStyle === "realistic" || rawStyle === "anime" ? rawStyle : "all";
  const keyword = search.trim().toLocaleLowerCase();
  const results = (discovery.data?.characters ?? []).filter(preset => {
    if (!preset.listed) return false;
    if (style !== "all" && preset.style !== style) return false;
    if (!matchesAge(preset, age) || !matchesTag(preset, tag)) return false;
    if (savedOnly && !collection.ids.includes(preset.id)) return false;
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
  const featuredIds = discovery.data?.home.featuredIds ?? [];
  results.sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "age"
        ? a.age - b.age
        : sort === "newest"
          ? b.sortOrder - a.sortOrder
          : (featuredIds.includes(b.id) ? 1 : 0) -
              (featuredIds.includes(a.id) ? 1 : 0) || a.sortOrder - b.sortOrder
  );
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
    navigate(
      (location === "/" ? "/" : "/explore") +
        (next.size ? "?" + next.toString() : ""),
      {
        replace: true,
      }
    );
  };
  return {
    isLoading: discovery.isLoading,
    error: discovery.error,
    refetch: discovery.refetch,
    search,
    style,
    age,
    tag,
    sort,
    savedOnly,
    collection,
    results,
    visible: results.slice(0, page * pageSize),
    hasFilters:
      !!keyword ||
      style !== "all" ||
      age !== "all" ||
      tag !== "all" ||
      savedOnly,
    hasMore: page < pageCount,
    setSearch: (value: string) => update({ q: value, page: null }),
    setStyle: (value: string) =>
      update({ style: value === "all" ? null : value, page: null }),
    setAge: (age: string) =>
      update({ age: age === "all" ? null : age, page: null }),
    setTag: (tag: string) =>
      update({ tag: tag === "all" ? null : tag, page: null }),
    setSort: (sort: string) =>
      update({ sort: sort === "recommended" ? null : sort, page: null }),
    setSavedOnly: (saved: boolean) =>
      update({ saved: saved ? "1" : null, page: null }),
    reset: () =>
      update({
        q: null,
        style: null,
        age: null,
        tag: null,
        saved: null,
        page: null,
      }),
    loadMore: () => update({ page: String(page + 1) }),
  };
}
