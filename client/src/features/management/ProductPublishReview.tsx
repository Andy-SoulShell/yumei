import { useState } from "react";
import type { ProductConfig } from "@shared/productConfig";
import type { OfficialCharacter } from "@shared/discovery";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { productPublicationReview } from "./productReview";
import { Changes } from "./DiscoveryPublishReview";
import { settingsJourneys } from "./settingsRelations";
export function ProductPublishReview({
  config,
  published,
  characters,
  busy,
  error,
  onClose,
  onPublish,
}: {
  config: ProductConfig;
  published: ProductConfig;
  characters: OfficialCharacter[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onPublish: () => void;
}) {
  const review = productPublicationReview(config, published, characters),
    [checked, setChecked] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
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
          <DialogTitle>确认设置发布</DialogTitle>
          <DialogDescription>
            本次会一起发布以下所有设置草稿，请核对每一处分区变化。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border bg-primary/5 p-4 text-sm">
          <p className="font-medium">{review.groups.length} 个设置分区待发布</p>
          <p className="mt-2 text-xs text-muted-foreground">
            新的业务规则将用于后续请求与新任务，已执行的任务保留原快照。官方角色和首页草稿不在本次发布范围。
          </p>
        </div>
        <div className="max-h-[45vh] space-y-3 overflow-y-auto">
          {review.groups.map(group => (
            <details
              key={group.id}
              open
              className="admin-config-group rounded-xl border p-4"
            >
              <summary className="cursor-pointer text-sm">
                {group.name} · {group.fields.length} 项变化
              </summary>
              <Changes fields={group.fields} />
              {group.id in settingsJourneys && (
                <p className="mt-3 rounded-lg bg-muted/30 p-3 text-xs leading-6 text-muted-foreground">
                  {
                    settingsJourneys[group.id as keyof typeof settingsJourneys]
                      .scope
                  }
                </p>
              )}
            </details>
          ))}
          {!review.changed && (
            <p className="text-sm text-muted-foreground">
              当前设置与发布版本一致，无需发布。
            </p>
          )}
        </div>
        {(error || review.errors.length > 0) && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive"
          >
            {review.errors.map((item, index) => (
              <p key={index}>{item}</p>
            ))}
            {error && <p>{error}</p>}
          </div>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={checked}
            disabled={busy}
            onChange={event => setChecked(event.target.checked)}
          />
          我已核对全部设置变更及影响范围
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            返回编辑
          </Button>
          <Button
            disabled={
              busy || !checked || !review.changed || review.errors.length > 0
            }
            onClick={onPublish}
          >
            {busy ? "正在发布…" : "确认发布设置"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
