/** 相册瀑布流展示与下载、删除确认操作入口。 */

import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** 相册展示所需的最小照片元数据，时间兼容序列化前后的形式。 */
type GalleryPhoto = {
  id: number;
  imageUrl: string;
  userContext: string | null;
  mode: string;
  createdAt: Date | string;
};

/** 展示图片网格，通过回调委托父组件执行下载与删除。 */
export function SelfieGalleryGrid({
  selfies,
  onDownload,
  onDelete,
  isDeleting = false,
}: {
  selfies: GalleryPhoto[];
  /** 用户确认下载后触发，接收图片地址和相册记录编号。 */
  onDownload: (imageUrl: string, id: number) => void;
  /** 用户在确认框同意删除后触发，父组件负责接口调用。 */
  onDelete: (id: number) => void;
  isDeleting?: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <div
      className="columns-2 md:columns-3 gap-2 sm:gap-3"
      aria-label={t("gallery:selfie")}
    >
      {selfies.map((selfie, index) => (
        <Card
          key={selfie.id}
          className="mb-2 sm:mb-3 break-inside-avoid overflow-hidden gap-0 py-0"
        >
          <Button
            variant="plain"
            size="none"
            type="button"
            className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
            onClick={() =>
              window.open(selfie.imageUrl, "_blank", "noopener,noreferrer")
            }
            aria-label={t("gallery:viewSelfieAtFullSize", { count: index + 1 })}
          >
            <img
              src={selfie.imageUrl}
              alt={selfie.userContext || t("gallery:selfie")}
              loading="lazy"
              decoding="async"
              className="block w-full h-auto"
            />
          </Button>
          <div className="p-2 sm:p-2.5 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1">
              <p
                className="truncate flex-1"
                title={selfie.userContext || undefined}
              >
                {selfie.userContext || t("gallery:selfie")}
              </p>
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">
                {selfie.mode === "mirror"
                  ? t("gallery:mirror")
                  : t("gallery:direct")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px]">
                {new Date(selfie.createdAt).toLocaleDateString(locale)}
              </p>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={t("gallery:downloadSelfie", { count: index + 1 })}
                  title={t("gallery:downloadPhoto")}
                  onClick={() => onDownload(selfie.imageUrl, selfie.id)}
                >
                  <Download className="size-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      aria-label={t("gallery:deleteSelfie", {
                        count: index + 1,
                      })}
                      title={t("gallery:deletePhoto")}
                      disabled={isDeleting}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t("common:confirmDeletion")}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("gallery:deleteThisSelfieThisActionCannotBeUndone")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t("common:cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        disabled={isDeleting}
                        onClick={() => onDelete(selfie.id)}
                      >
                        {t("common:delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
