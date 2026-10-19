/** 用户相册页面，支持角色筛选、图片下载与记录删除。 */

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
export default function Gallery() {
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { data: selfies, isLoading, refetch } = trpc.selfie.list.useQuery();
  const deleteSelfie = trpc.selfie.delete.useMutation({
    onSuccess: () => {
      toast.success("删除成功");
      refetch();
    },
    onError: error => {
      toast.error(`删除失败：${error.message}`);
    },
  });

  const handleDownload = async (imageUrl: string, id: number) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `selfie-${id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("下载成功");
    } catch (error) {
      toast.error("下载失败");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航栏 */}
      <header
        className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 border-b bg-card sticky top-0 z-10"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold flex-1">自拍画廊</h1>
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === "light" ? (
            <Moon className="w-5 h-5" />
          ) : (
            <Sun className="w-5 h-5" />
          )}
        </Button>
      </header>

      {/* 画廊内容 */}
      <div className="p-2 sm:p-4 max-w-4xl mx-auto pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !selfies || selfies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ImageIcon className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">还没有自拍照片</h2>
            <p className="text-muted-foreground mb-4">
              在聊天中说「发张自拍」，或点击相机选择场景和姿势
            </p>
            <Button onClick={() => setLocation("/chat")}>去聊天</Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              共 {selfies.length} 张照片
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
