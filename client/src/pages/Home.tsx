import { Link } from "wouter";
import { PageError } from "@/components/PageError";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterGrid } from "@/features/home/CharacterGrid";
import { CharacterTrash } from "@/features/home/CharacterTrash";
import { ConversationHistory } from "@/features/home/ConversationHistory";
import { DeleteCharacterDialog } from "@/features/home/DeleteCharacterDialog";
import { useHomeController } from "@/features/home/useHomeController";
import {
  CheckSquare,
  Clock,
  Image,
  Loader2,
  Plus,
  Settings,
  Square,
  Trash,
  Trash2,
  X,
} from "lucide-react";
export default function MyCharacters() {
  const state = useHomeController();
  const {
    loading,
    t,
    setHistoryOpen,
    setTrashOpen,
    refetchTrash,
    setLocation,
    pullDistance,
    isRefreshing,
    isPulling,
    girlfriends,
    batchMode,
    setBatchMode,
    setSelectedIds,
    selectAll,
    selectedIds,
    setBatchDeleteConfirm,
    girlfriendsLoading,
    girlfriendsError,
    refetch,
    batchDeleteConfirm,
    hasActiveInSelection,
    batchDeleteGirlfriends,
  } = state;

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // 已登录 - 女友列表
  return (
    <div className="min-h-full bg-background">
      <header className="characters-toolbar page-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <h1 className="min-w-0 flex-1 text-lg font-semibold">
          {t("explore:navCharacters")}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setHistoryOpen(true)}
            aria-label={t("home:chatHistory")}
          >
            <Clock />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setTrashOpen(true);
              void refetchTrash();
            }}
            aria-label={t("home:trash")}
          >
            <Trash />
          </Button>
          <Button onClick={() => setLocation("/setup")}>
            <Plus />
            {t("explore:navCreate")}
          </Button>
        </div>
      </header>

      {/* 下拉刷新指示器 */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        isPulling={isPulling}
      />

      <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-4 sm:space-y-6 pb-8">
        {/* 批量管理 */}
        {girlfriends && girlfriends.length > 1 && (
          <div className="flex justify-end">
            <Button
              variant={batchMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setBatchMode(!batchMode);
                setSelectedIds(new Set());
              }}
            >
              {batchMode ? (
                <>
                  <X className="w-4 h-4 mr-1" />
                  {t("common:cancel")}
                </>
              ) : (
                <>
                  <CheckSquare className="w-4 h-4 mr-1" />
                  {t("home:manageSelection")}
                </>
              )}
            </Button>
          </div>
        )}

        {/* 批量操作工具栏 */}
        {batchMode && girlfriends && girlfriends.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/50 rounded-lg border">
            <Button variant="outline" size="sm" onClick={selectAll}>
              {selectedIds.size === girlfriends.length ? (
                <>
                  <CheckSquare className="w-4 h-4 mr-1" />
                  {t("home:deselectAll")}
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 mr-1" />
                  {t("home:selectAll")}
                </>
              )}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t("home:selectedCount", { count: selectedIds.size })} /{" "}
              {girlfriends.length}
            </span>
            <div className="flex-1" />
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={() => setBatchDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {t("home:deleteSelected")}
            </Button>
          </div>
        )}

        {/* 女友列表 */}
        {girlfriendsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : girlfriendsError && !girlfriends ? (
          <PageError onRetry={() => void refetch()} />
        ) : !girlfriends || girlfriends.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Plus className="w-8 h-8 text-primary" />
              </div>
              <CardTitle>{t("home:createYourFirstCompanion")}</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <Button onClick={() => setLocation("/setup")}>
                <Plus className="w-4 h-4 mr-2" />
                {t("home:createACompanion")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <CharacterGrid {...state} girlfriends={girlfriends} />
        )}

        {/* 添加新女友按钮 */}
        {girlfriends && girlfriends.length > 0 && !batchMode && (
          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={() => setLocation("/setup")}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t("home:chooseOrCreateACompanion")}
          </Button>
        )}

        {/* 快捷入口 */}
        {girlfriends && girlfriends.length > 0 && !batchMode && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Link href="/gallery" className="surface-card quick-entry">
              <span className="quick-entry-icon">
                <Image className="size-5" />
              </span>
              <span>{t("common:photoGallery")}</span>
            </Link>
            <Link href="/settings" className="surface-card quick-entry">
              <span className="quick-entry-icon">
                <Settings className="size-5" />
              </span>
              <span>{t("home:apiSettings")}</span>
            </Link>
          </div>
        )}
      </div>

      {/* 历史对话侧边栏（含搜索） */}
      <ConversationHistory {...state} />

      {/* 回收站侧边栏 */}
      <CharacterTrash {...state} />

      {/* 单个删除确认弹窗 */}
      <DeleteCharacterDialog {...state} />

      {/* 批量删除确认弹窗 */}
      <AlertDialog
        open={batchDeleteConfirm}
        onOpenChange={setBatchDeleteConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasActiveInSelection
                ? t("home:selectionIncludesYourActiveCompanion")
                : t("home:deleteSelectedCompanions")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {hasActiveInSelection && (
                  <p className="text-amber-600 dark:text-amber-400 font-medium">
                    {t("home:yourActiveCompanionIsSelectedAfterDeletionChoose")}
                  </p>
                )}
                <p>
                  {t("home:batchDeleteConfirm", { count: selectedIds.size })}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                batchDeleteGirlfriends.mutate({ ids: Array.from(selectedIds) })
              }
              disabled={batchDeleteGirlfriends.isPending}
            >
              {batchDeleteGirlfriends.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  {t("common:deleting")}
                </>
              ) : (
                t("home:moveToTrash", { count: selectedIds.size })
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
