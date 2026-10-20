/** 站内图片预览，支持键盘、触摸翻页并在关闭后归还焦点。 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageError } from "@/components/PageError";

export type ViewerPhoto = {
  id: number;
  imageUrl: string;
  caption?: string | null;
};
export function PhotoViewer({
  photos,
  index,
  onIndexChange,
  returnFocus,
  onDownload,
}: {
  photos: ViewerPhoto[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  returnFocus: RefObject<HTMLElement | null>;
  onDownload?: (photo: ViewerPhoto) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const selected = index === null ? null : Math.min(index, photos.length - 1);
  const photo = selected === null ? undefined : photos[selected];
  useEffect(() => {
    if (index !== null && photos.length === 0) onIndexChange(null);
  }, [index, photos.length, onIndexChange]);
  const move = (delta: number) => {
    if (selected === null || photos.length < 2) return;
    onIndexChange((selected + delta + photos.length) % photos.length);
  };
  return (
    <Dialog
      open={!!photo}
      onOpenChange={open => {
        if (!open) onIndexChange(null);
      }}
    >
      <DialogContent
        className="photo-viewer gap-3 p-3 sm:p-5"
        onCloseAutoFocus={event => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
        onKeyDown={event => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            move(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        {photo && selected !== null && (
          <>
            <DialogHeader className="pr-12 text-left">
              <DialogTitle>
                {t("gallery:photoPosition", {
                  current: selected + 1,
                  total: photos.length,
                })}
              </DialogTitle>
              <DialogDescription
                className={
                  photo.caption ? "line-clamp-2 break-words" : "sr-only"
                }
              >
                {photo.caption || t("gallery:selfie")}
              </DialogDescription>
            </DialogHeader>
            <div
              className="photo-viewer-stage"
              onPointerDown={event => {
                if (
                  event.pointerType !== "touch" ||
                  !event.isPrimary ||
                  (event.target as Element).closest("button")
                )
                  return;
                touch.current = { x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                touch.current = null;
              }}
              onPointerUp={event => {
                const start = touch.current;
                touch.current = null;
                if (!start) return;
                const dx = event.clientX - start.x,
                  dy = event.clientY - start.y;
                if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2)
                  move(dx > 0 ? -1 : 1);
              }}
            >
              {failedImage === photo.imageUrl ? (
                <PageError onRetry={() => setFailedImage(null)} />
              ) : (
                <img
                  src={photo.imageUrl}
                  alt={photo.caption || t("gallery:selfie")}
                  onError={() => setFailedImage(photo.imageUrl)}
                  draggable={false}
                />
              )}
              {photos.length > 1 && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="photo-viewer-previous"
                    aria-label={t("gallery:previousPhoto")}
                    onClick={() => move(-1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="photo-viewer-next"
                    aria-label={t("gallery:nextPhoto")}
                    onClick={() => move(1)}
                  >
                    <ChevronRight />
                  </Button>
                </>
              )}
            </div>
            {onDownload && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={downloading}
                  onClick={async () => {
                    setDownloading(true);
                    try {
                      await onDownload(photo);
                    } finally {
                      setDownloading(false);
                    }
                  }}
                >
                  {downloading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {t("gallery:downloadPhoto")}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
