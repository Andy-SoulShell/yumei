import { useState } from "react";
import { CheckCircle2, FileText, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { discoveryPublicationReview } from "./officialEditor";
import { productPublicationReview } from "./productReview";
import { DiscoveryPublishReview } from "./DiscoveryPublishReview";
import { ProductPublishReview } from "./ProductPublishReview";
import type {
  DiscoveryDraft,
  ProductDraft,
  WorkspaceOperations,
} from "./types";
export function PublishingCenter({
  content,
  product,
  operations,
  onContentReload,
  onProductReload,
}: {
  content: DiscoveryDraft;
  product: ProductDraft;
  operations: WorkspaceOperations;
  onContentReload: () => Promise<unknown>;
  onProductReload: () => Promise<unknown>;
}) {
  const [review, setReview] = useState<"content" | "settings">(),
    [error, setError] = useState("");
  const contentReview = discoveryPublicationReview(
      content,
      product.published.characters
    ),
    settingsReview = productPublicationReview(
      product.config,
      product.published,
      content.published.characters
    );
  const publishContent = trpc.discovery.admin.publish.useMutation(),
    publishProduct = trpc.productConfig.admin.publish.useMutation(),
    utils = trpc.useUtils();
  const publish = async () => {
    try {
      if (review === "content") {
        await publishContent.mutateAsync({
          expectedRevision: content.revision,
        });
        await utils.discovery.get.invalidate();
        await onContentReload();
      } else {
        await publishProduct.mutateAsync({
          expectedRevision: product.revision,
        });
        await utils.productConfig.get.invalidate();
        await onProductReload();
      }
      setReview(undefined);
    } catch (error) {
      setError((error as Error).message);
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <p className="admin-eyebrow">准备好，再上线</p>
        <h1 className="admin-title">发布中心</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          这里汇总已保存的草稿。每组独立核对、独立发布，未保存的编辑需先回到编辑页保存。
        </p>
      </div>
      {!contentReview.changed && !settingsReview.changed && (
        <div className="flex items-start gap-4 rounded-2xl border bg-primary/5 p-5">
          <CheckCircle2 className="mt-1 size-6 shrink-0 text-primary" />
          <div>
            <h2 className="font-semibold">所有内容均已发布</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              当前草稿与公开版本一致，用户看到的就是最新内容。
            </p>
          </div>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        {[
          {
            kind: "content" as const,
            title: "官方角色与首页",
            description: "角色库、精选、轮播和常见问题一起生效。",
            icon: FileText,
            changed: contentReview.changed,
            errors: contentReview.errors,
            items: [
              ...contentReview.items.map(item => `${item.kind} · ${item.name}`),
              ...contentReview.home.map(item => `首页 · ${item.field}`),
            ],
            button: "核对官方内容变更",
          },
          {
            kind: "settings" as const,
            title: "品牌、业务与系统设置",
            description: "所有已保存设置一起生效，官方内容独立发布。",
            icon: Settings2,
            changed: settingsReview.changed,
            errors: settingsReview.errors,
            items: settingsReview.groups.map(
              item => `${item.name} · ${item.fields.length} 项变化`
            ),
            button: "核对设置变更",
          },
        ].map(item => (
          <section key={item.kind} className="admin-panel flex flex-col">
            <item.icon className="mb-4 size-6 text-primary" />
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <span className="text-xs text-muted-foreground">
                {item.changed ? "待发布" : "已同步"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {item.description}
            </p>
            <ul className="my-5 max-h-64 flex-1 space-y-2 overflow-y-auto text-sm">
              {item.items.map((text, index) => (
                <li key={index} className="rounded-lg bg-muted/40 px-3 py-2">
                  {text}
                </li>
              ))}
              {!item.items.length && (
                <li className="text-muted-foreground">暂无待发布变化</li>
              )}
            </ul>
            {item.errors.length > 0 && (
              <p className="mb-4 text-sm text-destructive">
                {item.errors.length} 项发布检查需要处理，打开核对可查看详情。
              </p>
            )}
            <Button
              variant={item.changed ? "default" : "outline"}
              disabled={operations.busy || !item.changed}
              onClick={() => {
                setError("");
                setReview(item.kind);
              }}
            >
              {item.button}
            </Button>
          </section>
        ))}
      </div>
      {review === "content" && (
        <DiscoveryPublishReview
          open
          onClose={() => setReview(undefined)}
          draft={content}
          rules={product.published.characters}
          busy={operations.busy}
          error={error}
          onPublish={() => void operations.run(publish)}
        />
      )}
      {review === "settings" && (
        <ProductPublishReview
          config={product.config}
          published={product.published}
          characters={content.published.characters}
          busy={operations.busy}
          error={error}
          onClose={() => setReview(undefined)}
          onPublish={() => void operations.run(publish)}
        />
      )}
    </div>
  );
}
