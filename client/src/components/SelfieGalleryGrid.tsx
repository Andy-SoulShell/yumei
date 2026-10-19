import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type GalleryPhoto = {
  id: number;
  imageUrl: string;
  userContext: string | null;
  mode: string;
  createdAt: Date | string;
};

export function SelfieGalleryGrid({ selfies, onDownload, onDelete, isDeleting = false }: {
  selfies: GalleryPhoto[];
  onDownload: (imageUrl: string, id: number) => void;
  onDelete: (id: number) => void;
  isDeleting?: boolean;
}) {
  return (
    <div className="columns-2 md:columns-3 gap-2 sm:gap-3" aria-label="自拍照片">
      {selfies.map((selfie, index) => (
        <Card key={selfie.id} className="mb-2 sm:mb-3 break-inside-avoid overflow-hidden gap-0 py-0">
          <button type="button" className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
            onClick={() => window.open(selfie.imageUrl, "_blank", "noopener,noreferrer")}
            aria-label={`查看第 ${index + 1} 张自拍原图`}>
            <img src={selfie.imageUrl} alt={selfie.userContext || "自拍照片"}
              loading="lazy" decoding="async" className="block w-full h-auto" />
          </button>
          <div className="p-2 sm:p-2.5 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1">
              <p className="truncate flex-1" title={selfie.userContext || undefined}>{selfie.userContext || "自拍照片"}</p>
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">
                {selfie.mode === "mirror" ? "镜子" : "直拍"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px]">{new Date(selfie.createdAt).toLocaleDateString()}</p>
              <div className="flex items-center gap-0.5">
                <Button type="button" variant="ghost" size="icon" className="size-7"
                  aria-label={`下载第 ${index + 1} 张自拍`} title="下载照片"
                  onClick={() => onDownload(selfie.imageUrl, selfie.id)}>
                  <Download className="size-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                      aria-label={`删除第 ${index + 1} 张自拍`} title="删除照片" disabled={isDeleting}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除</AlertDialogTitle>
                      <AlertDialogDescription>确定要删除这张自拍吗？此操作无法撤销。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction disabled={isDeleting} onClick={() => onDelete(selfie.id)}>删除</AlertDialogAction>
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
