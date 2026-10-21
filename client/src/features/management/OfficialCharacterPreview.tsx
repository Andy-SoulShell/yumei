/** 实时渲染尚未保存的草稿，与前台共用角色卡和详情展示。 */
import { useState } from "react";
import {
  contentText,
  officialImageSchema,
  type OfficialCharacter,
} from "@shared/discovery";
import type { Locale } from "@shared/locales";
import { CharacterCard } from "@/components/CharacterCard";
import { CharacterDetailContent } from "@/components/CharacterDetailDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { officialFieldNames } from "./officialEditor";

export function OfficialCharacterPreview({
  value,
  archived,
}: {
  value: OfficialCharacter;
  archived?: boolean;
}) {
  const [locale, setLocale] = useState<Locale>("zh-CN"),
    [open, setOpen] = useState(false);
  const selected = {
    ...value,
    name: value.name || "角色名字",
    label: contentText(value.label, locale),
    tagline: contentText(value.tagline, locale),
  };
  return (
    <Card className="min-w-0 self-start py-0 xl:sticky xl:top-36">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">前台预览</h2>
          <select
            aria-label="预览语言"
            className="h-8 rounded-lg border bg-background px-2 text-xs"
            value={locale}
            onChange={event => setLocale(event.target.value as Locale)}
          >
            {(["zh-CN", "en", "ja", "ko"] as const).map(locale => (
              <option key={locale} value={locale}>
                {officialFieldNames[locale]}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          这是前台实际比例的裁切预览。点击卡片查看详情；完整原图可在封面编辑区放大查看。预览不会保存或创建角色。
        </p>
        {officialImageSchema.safeParse(value.imageUrl).success ? (
          <div className="mx-auto w-full max-w-72">
            <CharacterCard
              name={selected.name}
              image={selected.imageUrl}
              label={selected.label}
              description={selected.tagline}
              age={selected.age}
              styleLabel={selected.style === "anime" ? "动漫" : "写实"}
              onClick={() => setOpen(true)}
              priority
            />
          </div>
        ) : (
          <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
            请选择有效的封面图片
          </p>
        )}
        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          {archived
            ? "该角色已归档，恢复并发布后才能新建。"
            : !value.listed
              ? "当前不在探索页展示；仍可通过有效的首页引用使用。"
              : "发布后将在探索页展示，并可用于新建角色。"}
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="character-detail">
            <CharacterDetailContent selected={selected}>
              <p className="detail-disclosure">
                草稿预览 · 不会创建角色或开始聊天
              </p>
              <Button variant="outline" onClick={() => setOpen(false)}>
                返回编辑
              </Button>
            </CharacterDetailContent>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
