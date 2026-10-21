/** 发布全部官方内容前，明确展示基于同一版本快照的变更和影响。 */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  discoveryPublicationReview,
  type OfficialDraft,
  type CharacterRules,
  type FieldChange,
} from "./officialEditor";

function Changes({ fields }: { fields: FieldChange[] }) {
  return (
    <dl className="mt-3 space-y-3">
      {fields.map((change, index) => (
        <div key={index} className="rounded-lg bg-muted/40 p-3 text-xs">
          <dt className="mb-2 font-medium">{change.field}</dt>
          <dd className="grid gap-2 sm:grid-cols-2">
            <div className="min-w-0">
              <span className="text-muted-foreground">发布前</span>
              <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                {change.before}
              </p>
            </div>
            <div className="min-w-0">
              <span className="text-muted-foreground">发布后</span>
              <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                {change.after}
              </p>
            </div>
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function DiscoveryPublishReview({
  open,
  onClose,
  draft,
  rules,
  busy,
  onPublish,
  error,
}: {
  open: boolean;
  onClose: () => void;
  draft: OfficialDraft;
  rules: CharacterRules;
  busy: boolean;
  onPublish: () => void;
  error: string;
}) {
  const review = useMemo(
    () => discoveryPublicationReview(draft, rules),
    [draft, rules]
  );
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-3xl"
        showCloseButton={!busy}
        onEscapeKeyDown={event => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={event => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>确认本次发布</DialogTitle>
          <DialogDescription>
            将发布所有已保存的官方角色及首页草稿，包括其他角色的待发布修改。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-xl border bg-primary/5 p-4 text-sm">
          <p className="font-medium">
            本次变更：{review.items.length} 个角色 ·{" "}
            {review.home.length
              ? `${review.home.length} 项首页设置`
              : "首页设置无变更"}
          </p>
          <p className="text-xs text-muted-foreground">
            公开角色库、首页展示和之后新建的用户角色将使用新版本。已经创建的用户角色保留原有资料。业务与运行配置不在本次发布范围。
          </p>
          {review.homeReferences.length > 0 && (
            <p className="text-xs">
              涉及首页默认或精选角色：{review.homeReferences.join("、")}
            </p>
          )}
        </div>
        <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
          {review.items.map(item => (
            <details
              key={item.id}
              open={item.kind === "修改"}
              className="admin-config-group rounded-xl border p-4"
            >
              <summary className="cursor-pointer gap-2 text-sm">
                <span>{item.name}</span>
                <Badge variant="outline">{item.kind}</Badge>
              </summary>
              {item.kind === "下架" ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  发布后不再提供该官方预设，新用户无法从该预设创建角色；已有用户角色保留。
                </p>
              ) : (
                <Changes fields={item.fields} />
              )}
            </details>
          ))}
          {review.home.length > 0 && (
            <details open className="admin-config-group rounded-xl border p-4">
              <summary className="cursor-pointer text-sm">首页设置</summary>
              <Changes fields={review.home} />
            </details>
          )}
          {!review.changed && (
            <p className="text-sm text-muted-foreground">
              内容与当前发布版本一致，没有需要发布的变更。
            </p>
          )}
        </div>
        {review.errors.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
          >
            <p className="font-medium">以下问题解决后才能发布</p>
            <ul className="mt-2 list-inside list-disc">
              {review.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={acknowledged}
            disabled={busy}
            onChange={event => setAcknowledged(event.target.checked)}
          />
          我已核对以上全部变更和影响范围
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            返回编辑
          </Button>
          <Button
            disabled={
              busy ||
              !acknowledged ||
              !review.changed ||
              review.errors.length > 0
            }
            onClick={onPublish}
          >
            {busy ? "正在发布…" : "确认发布全部变更"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
