import { Plus, Search, ArrowUpRight, Users } from "lucide-react";
import type { OfficialCharacter } from "@shared/discovery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  characterStatus,
  filterCharacters,
  type CharacterRow,
} from "./managementModel";
export function OfficialLibrary({
  rows,
  published,
  busy,
  onSelect,
  onNew,
  onPublish,
  state,
  onStateChange,
}: {
  rows: CharacterRow[];
  published: OfficialCharacter[];
  busy: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onPublish: () => void;
  state: { query: string; filter: string; sort: string };
  onStateChange: (state: {
    query: string;
    filter: string;
    sort: string;
  }) => void;
}) {
  const { query, filter, sort } = state;
  const setQuery = (query: string) => onStateChange({ ...state, query }),
    setFilter = (filter: string) => onStateChange({ ...state, filter }),
    setSort = (sort: string) => onStateChange({ ...state, sort });
  const filters = [
    { id: "all", label: "全部角色" },
    { id: "published", label: "已发布" },
    { id: "pending", label: "待发布" },
    { id: "unlisted", label: "未公开" },
    { id: "archived", label: "已归档" },
  ];
  const items = filterCharacters(rows, published, query, filter, sort),
    pending = rows.filter(row =>
      ["待发布", "待更新", "待下架"].includes(characterStatus(row, published))
    ).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="admin-eyebrow">内容管理</p>
          <h1 className="admin-title">官方角色</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            用鲜明的人设与故事，创造下一次相遇。
          </p>
        </div>
        <Button disabled={busy} onClick={onNew}>
          <Plus className="size-4" />
          新增角色
        </Button>
      </div>
      <p className="rounded-xl bg-muted/25 p-4 text-sm leading-6">
        <strong>角色内容 → 探索页或首页入口 → 用户创建自己的角色</strong>
        <span className="mt-1 block text-xs text-muted-foreground">
          公开控制探索页展示，首页精选需要单独编排。发布更新供后续创建使用，用户已创建的角色保留自己的资料与聊天。
        </span>
      </p>
      {pending > 0 && (
        <button
          disabled={busy}
          onClick={onPublish}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left text-sm"
        >
          <span>
            <strong>{pending} 个角色有待发布变化</strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              草稿已保存，核对后再展示给用户
            </span>
          </span>
          <ArrowUpRight className="size-4 shrink-0" />
        </button>
      )}
      <div className="admin-toolbar">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label="搜索官方角色"
            placeholder="搜索名字、身份或兴趣"
            value={query}
            disabled={busy}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        <select
          aria-label="角色排序"
          className="admin-select"
          disabled={busy}
          value={sort}
          onChange={event => setSort(event.target.value)}
        >
          <option value="order">按展示顺序</option>
          <option value="recent">最近编辑</option>
          <option value="name">按名字</option>
        </select>
      </div>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="角色状态筛选"
      >
        {filters.map(item => (
          <Button
            key={item.id}
            size="sm"
            variant={filter === item.id ? "secondary" : "ghost"}
            aria-pressed={filter === item.id}
            aria-label={item.label}
            disabled={busy}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
            <span className="text-xs text-muted-foreground">
              {filterCharacters(rows, published, "", item.id, "order").length}
            </span>
          </Button>
        ))}
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        找到 {items.length} 个角色
      </p>
      {items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map(row => (
            <button
              key={row.id}
              disabled={busy}
              onClick={() => onSelect(row.id)}
              className="admin-role-card group"
              aria-label={`编辑角色 ${row.data.name}`}
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-muted/25">
                <img
                  src={row.data.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
                <Badge
                  className="absolute left-3 top-3"
                  variant={
                    characterStatus(row, published).startsWith("待")
                      ? "default"
                      : "secondary"
                  }
                >
                  {characterStatus(row, published)}
                </Badge>
                <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
                  {row.data.style === "anime" ? "动漫" : "写实"} ·{" "}
                  {row.data.age} 岁
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="truncate font-semibold">{row.data.name}</h2>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="mt-1 truncate text-xs text-primary">
                  {row.data.label["zh-CN"]}
                </p>
                <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {row.data.tagline["zh-CN"]}
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="admin-empty">
          <Users className="mx-auto mb-3 size-8" />
          <h2 className="font-semibold">没有找到符合条件的角色</h2>
          <p className="mt-2 text-sm">换个关键词，或调整状态筛选。</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              onStateChange({ ...state, query: "", filter: "all" });
            }}
          >
            清除筛选
          </Button>
        </div>
      )}
    </div>
  );
}
