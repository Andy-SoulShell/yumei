/** 聊天中的视频生成入口，支持文字或角色、聊天图片作为首帧。 */
import { useRef, useState } from "react";
import { Video, Loader2, Lock, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useProductConfig } from "@/features/product/useProductConfig";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { apiErrorMessage } from "@/lib/errors";
import { createUuid } from "@/lib/uuid";
import type { VideoRuntime } from "@shared/video";
import { getLevelByPoints } from "@shared/intimacy";

type Props = {
  conversationId: number;
  referenceImage: string;
  photos: { id: number; imageUrl: string }[];
  /** 当前聊天框的正文，打开弹窗时作为本次视频描述。 */
  draft?: string;
  /** 从当前角色积分计算解锁，避免沿用过时的等级字段。 */
  intimacyPoints: number;
  disabled?: boolean;
};
type Preset = { id: string; label: string; emoji: string; minLevel: number };
/** 仅在当前发布配置启用视频时展示入口。 */
export function VideoComposer(props: Props) {
  const policy = useProductConfig();
  if (!policy.raw?.models.video?.enabled || !policy.data) return null;
  return (
    <VideoDialog
      {...props}
      rules={policy.raw.runtime.video}
      presets={policy.data.videos.presets}
      intimacyLevel={
        getLevelByPoints(props.intimacyPoints, policy.raw.intimacy.levels).level
      }
    />
  );
}

function VideoDialog({
  conversationId,
  referenceImage,
  photos,
  draft = "",
  disabled,
  rules,
  presets,
  intimacyLevel,
}: Props & { rules: VideoRuntime; presets: Preset[]; intimacyLevel: number }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"text" | "reference">("reference");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(rules.defaultDurationSeconds);
  const [reference, setReference] = useState("character");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const create = trpc.video.create.useMutation({
    onSuccess: () => {
      void utils.conversation.getMessages.invalidate({ conversationId });
      void utils.conversation.listWithDetails.invalidate();
      request.current = null;
      setOpen(false);
      setPrompt("");
      toast.success(t("video:accepted"));
    },
    onError: error => {
      void utils.conversation.getMessages.invalidate({ conversationId });
      toast.error(apiErrorMessage(error, t));
    },
  });
  const selectedImage =
    reference === "character"
      ? referenceImage
      : photos.find(photo => String(photo.id) === reference)?.imageUrl;
  const valid =
    !create.isPending &&
    Number.isFinite(duration) &&
    prompt.trim().length <= rules.maxPromptChars &&
    duration >= rules.minDurationSeconds &&
    duration <= rules.maxDurationSeconds &&
    (mode === "text" || !!selectedImage);
  const submit = (presetId?: string) => {
    if (!valid || (!prompt.trim() && !presetId)) return;
    const input = {
      conversationId,
      mode,
      prompt: prompt.trim(),
      ...(presetId ? { presetId } : {}),
      durationSeconds: duration,
      referenceMessageId:
        mode === "reference" && reference !== "character"
          ? Number(reference)
          : null,
    };
    const fingerprint = JSON.stringify(input);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, id: createUuid() };
    create.mutate({ ...input, clientRequestId: request.current.id });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        if (value) setPrompt(draft.trim());
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          <Video />
          {t("video:create")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("video:create")}</DialogTitle>
          <DialogDescription>{t("video:presetDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <RadioGroup
              aria-label={t("video:mode")}
              className="grid grid-cols-2 gap-2"
              value={mode}
              disabled={create.isPending}
              onValueChange={value => setMode(value as typeof mode)}
            >
              <RadioGroupChoice variant="segment" value="reference">
                {t("video:reference")}
              </RadioGroupChoice>
              <RadioGroupChoice variant="segment" value="text">
                {t("video:text")}
              </RadioGroupChoice>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {t(
                mode === "reference" ? "video:referenceHint" : "video:textHint"
              )}
            </p>
          </div>
          {prompt.trim() && (
            <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {t("video:currentDescription", { text: prompt.trim() })}
            </p>
          )}
          <div
            className="grid grid-cols-3 gap-2"
            role="group"
            aria-label={t("video:presets")}
          >
            {presets.map(preset => {
              const locked = preset.minLevel > intimacyLevel;
              return (
                <Button
                  key={preset.id}
                  type="button"
                  variant="plain"
                  size="none"
                  disabled={locked || !valid}
                  title={
                    locked
                      ? t("selfie:unlocksAtIntimacyLv", {
                          level: preset.minLevel,
                        })
                      : preset.label
                  }
                  className={`flex min-h-24 min-w-0 flex-col items-center gap-1 rounded-2xl bg-muted/40 p-3 text-sm transition-colors ${locked ? "cursor-not-allowed opacity-45" : "hover:bg-primary/10"}`}
                  onClick={() => submit(preset.id)}
                >
                  <span className="text-2xl leading-none">{preset.emoji}</span>
                  <span className="w-full truncate text-center">
                    {preset.label}
                  </span>
                  {locked ? (
                    <Badge
                      variant="secondary"
                      className="gap-0.5 px-1.5 py-0 text-[10px]"
                    >
                      <Lock className="size-2.5" />
                      {t("common:lv")}
                      {preset.minLevel}
                    </Badge>
                  ) : (
                    <span className="select-none text-[10px] text-transparent">
                      ·
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
          {!valid &&
            !create.isPending &&
            mode === "reference" &&
            !selectedImage && (
              <p role="status" className="text-sm text-muted-foreground">
                {t("video:chooseReferenceHint")}
              </p>
            )}
          <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={create.isPending}
              >
                {t("video:settings")}
                <ChevronDown className="size-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              {mode === "reference" && (
                <div className="space-y-2">
                  <Label htmlFor="video-reference">
                    {t("video:firstFrame")}
                  </Label>
                  <Select
                    value={reference}
                    disabled={create.isPending}
                    onValueChange={setReference}
                  >
                    <SelectTrigger id="video-reference">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="character">
                        {t("video:characterImage")}
                      </SelectItem>
                      {photos.map((photo, index) => (
                        <SelectItem key={photo.id} value={String(photo.id)}>
                          {t("video:chatImage", { count: index + 1 })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedImage && (
                    <img
                      src={selectedImage}
                      alt={t("video:firstFrame")}
                      className="max-h-40 rounded-lg object-contain"
                    />
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="video-prompt">{t("video:prompt")}</Label>
                <Textarea
                  id="video-prompt"
                  value={prompt}
                  maxLength={rules.maxPromptChars}
                  disabled={create.isPending}
                  placeholder={t("video:placeholder")}
                  onChange={event => setPrompt(event.target.value)}
                  className="min-h-28"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="video-duration">{t("video:duration")}</Label>
                <Input
                  id="video-duration"
                  type="number"
                  min={rules.minDurationSeconds}
                  max={rules.maxDurationSeconds}
                  step="1"
                  value={duration}
                  disabled={create.isPending}
                  onChange={event => setDuration(Number(event.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  {t("video:durationHint", {
                    min: rules.minDurationSeconds,
                    max: rules.maxDurationSeconds,
                  })}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
          <Button
            type="button"
            className="w-full"
            disabled={!valid || !prompt.trim()}
            onClick={() => submit()}
          >
            {create.isPending && <Loader2 className="animate-spin" />}
            {t("video:submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
