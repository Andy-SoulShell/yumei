/** 聊天中的视频生成入口，支持文字或角色、聊天图片作为首帧。 */
import { useRef, useState } from "react";
import { Video, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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

type Props = {
  conversationId: number;
  referenceImage: string;
  photos: { id: number; imageUrl: string }[];
  disabled?: boolean;
};
/** 仅在当前发布配置启用视频时展示入口。 */
export function VideoComposer(props: Props) {
  const policy = useProductConfig();
  if (!policy.raw?.models.video?.enabled) return null;
  return <VideoDialog {...props} rules={policy.raw.runtime.video} />;
}

function VideoDialog({
  conversationId,
  referenceImage,
  photos,
  disabled,
  rules,
}: Props & { rules: VideoRuntime }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"text" | "reference">("reference");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(rules.defaultDurationSeconds);
  const [reference, setReference] = useState("character");
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
  const submit = () => {
    const input = {
      conversationId,
      mode,
      prompt: prompt.trim(),
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          <Video />
          {t("video:create")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("video:create")}</DialogTitle>
          <DialogDescription>{t("video:description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="video-mode">{t("video:mode")}</Label>
            <Select
              value={mode}
              disabled={create.isPending}
              onValueChange={value => setMode(value as typeof mode)}
            >
              <SelectTrigger id="video-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reference">
                  {t("video:reference")}
                </SelectItem>
                <SelectItem value="text">{t("video:text")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "reference" && (
            <div className="space-y-2">
              <Label htmlFor="video-reference">{t("video:firstFrame")}</Label>
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
          <Button
            type="button"
            className="w-full"
            disabled={
              create.isPending ||
              !prompt.trim() ||
              duration < rules.minDurationSeconds ||
              duration > rules.maxDurationSeconds ||
              (mode === "reference" && !selectedImage)
            }
            onClick={submit}
          >
            {create.isPending && <Loader2 className="animate-spin" />}
            {t("video:submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
