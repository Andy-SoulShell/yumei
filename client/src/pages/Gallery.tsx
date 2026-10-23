import { downloadImage } from "@/lib/downloadImage";
import { usePageBack } from "@/hooks/usePageBack";
/** 用户相册页面，支持角色筛选、图片下载与记录删除。 */

import { PageError } from "@/components/PageError";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { SelfieGalleryGrid } from "@/components/SelfieGalleryGrid";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Loader2,
  Image as ImageIcon,
  Sun,
  Moon,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

/** 读取当前用户自拍并展示相册网格，将下载与删除反馈同步到查询缓存。 */
export default function Gallery({
  embedded = false,
  onGenerate,
}: { embedded?: boolean; onGenerate?: () => void } = {}) {
  const goBack = usePageBack("/generate");
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const {
    data: selfies,
    isLoading,
    error,
    refetch,
  } = trpc.selfie.list.useQuery();
  const deleteSelfie = trpc.selfie.delete.useMutation({
    onSuccess: () => {
      toast.success(t("gallery:deleted"));
      refetch();
    },
    onError: error => {
      toast.error(t("common:couldNotDelete", { error: error.message }));
    },
  });

  const handleDownload = async (imageUrl: string, id: number) => {
    try {
      await downloadImage(imageUrl, id);
      toast.success(t("gallery:downloaded"));
    } catch (error) {
      toast.error(t("gallery:downloadFailed"));
    }
  };

  return (
    <div className="gallery-page min-h-full bg-background">
      {/* 顶部导航栏 */}
      {!embedded && (
        <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 page-toolbar sticky top-0 z-10">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("setup:back")}
            onClick={goBack}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold flex-1">
            {t("common:photoGallery")}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("common:toggleDisplayMode")}
            onClick={toggleTheme}
          >
            {theme === "light" ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5" />
            )}
          </Button>
        </header>
      )}

      {/* 画廊内容 */}
      <div className="p-2 sm:p-4 max-w-4xl mx-auto pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error && !selfies ? (
          <PageError onRetry={() => void refetch()} />
        ) : !selfies || selfies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ImageIcon className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {t("gallery:noSelfiesYet")}
            </h2>
            <Button
              onClick={() =>
                onGenerate ? onGenerate() : setLocation("/generate?view=create")
              }
            >
              {t("explore:generateAction")}
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {t("gallery:photoCount", { count: selfies.length })}
            </p>
            <SelfieGalleryGrid
              selfies={selfies}
              onDownload={handleDownload}
              onDelete={id => deleteSelfie.mutate({ id })}
              isDeleting={deleteSelfie.isPending}
            />
          </>
        )}
      </div>
    </div>
  );
}
