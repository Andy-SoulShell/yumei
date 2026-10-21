import {
  Plus,
  ArrowUpRight,
  LayoutTemplate,
  Send,
  Users,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { characterStatus, type Pane } from "./managementModel";
import { discoveryPublicationReview } from "./officialEditor";
import { productPublicationReview } from "./productReview";
import type { DiscoveryDraft, ProductDraft } from "./types";
export function ContentOverview({
  content,
  product,
  busy,
  onNavigate,
  onEdit,
  onNew,
}: {
  content: DiscoveryDraft;
  product: ProductDraft;
  busy: boolean;
  onNavigate: (pane: Pane) => void;
  onEdit: (id: string) => void;
  onNew: () => void;
}) {
  const review = discoveryPublicationReview(
      content,
      product.published.characters
    ),
    settings = productPublicationReview(
      product.config,
      product.published,
      content.published.characters
    ),
    pending =
      review.items.length +
      Number(review.home.length > 0) +
      settings.groups.length;
  const recent = [...content.characters]
    .filter(row => !row.archived)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, 4);
  return (
    <div className="space-y-7">
      <section className="admin-welcome">
        <div className="relative z-[1] max-w-2xl">
          <p className="admin-eyebrow">YUMEI 内容工作台</p>
          <h1 className="admin-title">今天，想带来怎样的相遇？</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            打磨一个角色，更新一组推荐，或为首页添上新的故事。保存为草稿，准备好了再发布。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button disabled={busy} onClick={onNew}>
              <Plus className="size-4" />
              创建官方角色
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => onNavigate("home")}
            >
              <LayoutTemplate className="size-4" />
              编排首页
            </Button>
          </div>
        </div>
        <Sparkles className="admin-welcome-art" aria-hidden="true" />
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "角色内容",
            value: content.characters.filter(row => !row.archived).length,
            icon: Users,
            to: "official",
          },
          {
            label: "首页精选",
            value: content.home.featuredIds.length,
            icon: Sparkles,
            to: "home",
          },
          {
            label: "轮播与问答",
            value: content.home.slides.length + content.home.faqs.length,
            icon: LayoutTemplate,
            to: "home",
          },
          {
            label: "待发布内容与设置",
            value: pending,
            icon: Send,
            to: "publish",
          },
        ].map(item => (
          <button
            key={item.label}
            disabled={busy}
            className="admin-stat"
            onClick={() => onNavigate(item.to as Pane)}
          >
            <item.icon className="size-4 text-muted-foreground" />
            <span className="mt-4 block text-3xl font-semibold tracking-tight">
              {item.value}
            </span>
            <span className="mt-2 block text-xs text-muted-foreground">
              {item.label}
            </span>
          </button>
        ))}
      </div>
      <section className="admin-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">发布前，再看一眼</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {pending
                ? `${review.items.length} 个角色变化、${review.home.length} 项首页变化、${settings.groups.length} 个设置分区等待核对。`
                : "所有已保存内容已同步发布，可以安心开始下一次编辑。"}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onNavigate("publish")}
          >
            进入发布中心
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
      </section>
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">最近编辑的角色</h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onNavigate("official")}
          >
            查看全部
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {recent.map(row => (
            <button
              key={row.id}
              disabled={busy}
              className="flex min-w-0 items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/40"
              onClick={() => onEdit(row.id)}
            >
              <img
                src={row.data.imageUrl}
                alt=""
                className="h-20 w-16 rounded-xl object-contain"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {row.data.name}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {row.data.label["zh-CN"]}
                </span>
                <span className="mt-3 block text-xs text-primary">
                  {characterStatus(row, content.published.characters)}
                </span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
