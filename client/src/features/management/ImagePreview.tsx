/** 管理素材始终完整展示，放大查看沿用同一张原图。 */
import { useState } from "react";
import { Maximize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ImagePreview({
  src,
  alt,
  className,
  disabled = false,
}: {
  src: string;
  alt: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={`查看完整图片：${alt}`}
        onClick={() => setOpen(true)}
        className={cn(
          "group relative block shrink-0 overflow-hidden rounded-xl border bg-muted/25 focus-visible:outline-2 focus-visible:outline-primary",
          className
        )}
      >
        <img src={src} alt={alt} className="h-full w-full object-contain" />
        <span className="absolute bottom-2 right-2 rounded-md bg-background/90 p-1.5 shadow-sm">
          <Maximize2 className="size-3.5" />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{alt}</DialogTitle>
            <DialogDescription>
              完整原图 · 保持图片比例，可滚动查看。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[75dvh] overflow-auto rounded-xl bg-muted/20">
            <img
              src={src}
              alt={`${alt}完整原图`}
              className="mx-auto h-auto max-h-[72dvh] max-w-full object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
