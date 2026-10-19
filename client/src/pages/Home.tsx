/** 角色首页与管理入口，承载默认角色、回收站、搜索及通知。 */

import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { AgeGate } from "@/components/AgeGate";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  Heart,
  MessageCircle,
  Image,
  Settings,
  Loader2,
  Plus,
  Sun,
  Moon,
  Sparkles,
  Edit,
  Clock,
  Search,
  X,
  Trash2,
  CheckSquare,
  Square,
  Trash,
  Undo2,
  LogOut,
} from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Checkbox } from "@/components/ui/checkbox";
import { NotificationBell } from "@/components/NotificationBell";
import { usePullToRefresh } from "@/hooks/useGestures";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import {
  getLevelInfo,
  getLevelProgress,
  getLevelGradient,
  getPointsToNextLevel,
} from "../../../shared/intimacy";

// 心情配置
const MOOD_CONFIG: Record<
  string,
  { emoji: string; label: string; color: string; bgColor: string }
> = {
  excited: {
    emoji: "🥰",
    label: "超开心",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  happy: {
    emoji: "😊",
    label: "开心",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  content: {
    emoji: "🙂",
    label: "满足",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  neutral: {
    emoji: "😐",
    label: "平静",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  lonely: {
    emoji: "😢",
    label: "想你了",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  sad: {
    emoji: "😭",
    label: "伤心",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
};

/**
 * 加载当前用户角色并提供进入会话、创建、编辑与回收站操作。
 *
 * @remarks 首次无角色时请求默认初始化；未认证时展示登录入口。
 */
export default function Home() {
  const { t, locale } = useI18n();
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const defaultCreatedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    name: string;
    isActive: boolean;
  } | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

  // 下拉刷新（必须在所有 early return 之前声明）
  const { isPulling, pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      await refetch();
    },
    enabled: isAuthenticated,
  });

  // 退出登录
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  const {
    data: girlfriends,
    isLoading: girlfriendsLoading,
    refetch,
  } = trpc.girlfriend.list.useQuery(undefined, { enabled: isAuthenticated });

  // 回收站列表
  const { data: trashItems, refetch: refetchTrash } =
    trpc.girlfriend.trash.useQuery(undefined, {
      enabled: isAuthenticated && trashOpen,
    });

  // 历史对话列表
  const { data: conversationsWithDetails } =
    trpc.conversation.listWithDetails.useQuery(undefined, {
      enabled: isAuthenticated,
    });

  // 搜索对话
  const { data: searchResults, isLoading: searchLoading } =
    trpc.conversation.search.useQuery(
      { keyword: debouncedKeyword },
      { enabled: !!debouncedKeyword && debouncedKeyword.length > 0 }
    );

  // 获取所有女友心情
  const { data: allMoods } = trpc.mood.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // 亲密度信息缓存 map
  const [intimacyMap, setIntimacyMap] = useState<
    Record<
      number,
      {
        level: number;
        points: number;
        progress: number;
        pointsToNext: number | null;
      }
    >
  >({});

  // 心情 map：girlfriendId -> mood
  const moodMap = useMemo(() => {
    const map: Record<
      number,
      typeof allMoods extends (infer T)[] | undefined ? T : never
    > = {};
    if (allMoods) {
      for (const m of allMoods) {
        map[m.girlfriendId] = m;
      }
    }
    return map;
  }, [allMoods]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchKeyword.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // 计算亲密度信息（从女友数据中直接读取）
  useEffect(() => {
    if (girlfriends && girlfriends.length > 0) {
      const map: Record<
        number,
        {
          level: number;
          points: number;
          progress: number;
          pointsToNext: number | null;
        }
      > = {};
      for (const gf of girlfriends) {
        const level = gf.intimacyLevel || 1;
        const points = gf.intimacyPoints || 0;
        map[gf.id] = {
          level,
          points,
          progress: getLevelProgress(points),
          pointsToNext: getPointsToNextLevel(points),
        };
      }
      setIntimacyMap(map);
    }
  }, [girlfriends]);

  // 确保默认女友存在
  const { mutate: ensureDefault, isPending: isCreatingDefault } =
    trpc.girlfriend.ensureDefault.useMutation({
      onSuccess: () => {
        refetch();
      },
    });

  // 登录后自动创建默认女友
  useEffect(() => {
    if (
      isAuthenticated &&
      girlfriends &&
      girlfriends.length === 0 &&
      !defaultCreatedRef.current
    ) {
      defaultCreatedRef.current = true;
      ensureDefault();
    }
  }, [isAuthenticated, girlfriends, ensureDefault]);

  // 软删除（移入回收站）
  const deleteGirlfriend = trpc.girlfriend.delete.useMutation({
    onSuccess: () => {
      refetch();
      setDeleteTarget(null);
      toast.success(t("已移入回收站，7天内可恢复"));
    },
    onError: error => {
      toast.error(t("删除失败：{v0}", { v0: error.message }));
    },
  });

  // 批量软删除
  const batchDeleteGirlfriends = trpc.girlfriend.batchDelete.useMutation({
    onSuccess: data => {
      refetch();
      setBatchDeleteConfirm(false);
      setBatchMode(false);
      setSelectedIds(new Set());
      toast.success(t("已将 {v0} 位女友移入回收站", { v0: data.count }));
    },
    onError: error => {
      toast.error(t("批量删除失败：{v0}", { v0: error.message }));
    },
  });

  // 恢复女友
  const restoreGirlfriend = trpc.girlfriend.restore.useMutation({
    onSuccess: () => {
      refetch();
      refetchTrash();
      toast.success(t("已恢复"));
    },
    onError: error => {
      toast.error(t("恢复失败：{v0}", { v0: error.message }));
    },
  });

  // 永久删除
  const permanentDelete = trpc.girlfriend.permanentDelete.useMutation({
    onSuccess: () => {
      refetchTrash();
      toast.success(t("已永久删除"));
    },
    onError: error => {
      toast.error(t("删除失败：{v0}", { v0: error.message }));
    },
  });

  const updateGirlfriend = trpc.girlfriend.update.useMutation({
    onSuccess: () => {
      refetch();
      toast.success(t("已切换女友"));
    },
  });

  const resumeChat = trpc.conversation.resume.useMutation({
    onSuccess: data => setLocation(`/chat/${data.id}`),
    onError: error =>
      toast.error(t("打开对话失败：{v0}", { v0: error.message })),
  });

  const handleStartChat = (girlfriendId: number) => {
    updateGirlfriend.mutate(
      { id: girlfriendId, isActive: true },
      {
        onSuccess: () => {
          resumeChat.mutate({ girlfriendId });
        },
      }
    );
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!girlfriends) return;
    if (selectedIds.size === girlfriends.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(girlfriends.map(gf => gf.id)));
    }
  };

  // 检查批量删除中是否包含当前激活的女友
  const hasActiveInSelection = useMemo(() => {
    if (!girlfriends) return false;
    return girlfriends.some(gf => gf.isActive && selectedIds.has(gf.id));
  }, [girlfriends, selectedIds]);

  const formatTime = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("刚刚");
    if (diffMins < 60) return t("{v0}分钟前", { v0: diffMins });
    if (diffHours < 24) return t("{v0}小时前", { v0: diffHours });
    if (diffDays < 7) return t("{v0}天前", { v0: diffDays });
    return d.toLocaleDateString(locale);
  };

  const getRemainingDays = (deletedAt: Date | string | null) => {
    if (!deletedAt) return 7;
    const deleted = new Date(deletedAt);
    const expiry = new Date(deleted.getTime() + 7 * 24 * 60 * 60 * 1000);
    const remaining = Math.ceil(
      (expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    return Math.max(0, remaining);
  };

  // 侧边栏展示的对话列表（搜索结果或全部）
  const displayConversations = debouncedKeyword
    ? searchResults
    : conversationsWithDetails;
  const isSearchMode = !!debouncedKeyword;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // 未登录 - 展示欢迎页
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background app-surface">
        {/* 主题切换按钮 */}
        <div className="absolute top-4 right-4">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("切换显示模式")}
            onClick={toggleTheme}
          >
            {theme === "light" ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5" />
            )}
          </Button>
        </div>

        <div className="max-w-md w-full space-y-8 text-center">
          <div className="space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Heart className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-4xl font-bold text-foreground">YUMEI</h1>
            <p className="text-lg text-muted-foreground">
              {t("你的专属虚拟女友，随时陪伴聊天，分享生活点滴")}
            </p>
          </div>

          <div className="space-y-3">
            <Card className="text-left">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageCircle className="w-5 h-5 text-primary" />
                  {t("智能对话")}
                </CardTitle>
                <CardDescription>
                  {t("基于先进的 AI 技术，提供自然流畅的对话体验")}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-left">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Image className="w-5 h-5 text-primary" />
                  {t("场景化自拍")}
                </CardTitle>
                <CardDescription>
                  {t("根据对话内容自动生成相应场景的自拍照片")}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-left">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="w-5 h-5 text-primary" />
                  {t("语音对话")}
                </CardTitle>
                <CardDescription>
                  {t("AI 女友可以用甜美的声音和你说话")}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-left">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="w-5 h-5 text-primary" />
                  {t("个性化配置")}
                </CardTitle>
                <CardDescription>
                  {t("自定义性格、外貌和兴趣爱好，支持多个女友")}
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          <Button
            size="lg"
            className="w-full text-base"
            onClick={() => (window.location.href = "/login")}
          >
            <Heart className="w-5 h-5 mr-2" />
            {t("立即开始")}
          </Button>

          {/* 合规披露 */}
          <p className="text-xs text-muted-foreground">
            {t(
              "18+ only · Companions are AI-generated, not real people · 我们不会用你的聊天内容训练任何模型"
            )}
          </p>
        </div>
      </div>
    );
  }

  // 已登录 - 女友列表
  return (
    <div className="min-h-screen bg-background">
      {/* 一次性 18+ 年龄确认（服务端同样强制） */}
      <AgeGate />
      {/* 顶部导航栏 */}
      <header
        className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b bg-card sticky top-0 z-10"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          <h1 className="text-base sm:text-lg font-bold">YUMEI</h1>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setHistoryOpen(true)}
            title={t("历史对话")}
          >
            <Clock className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setTrashOpen(true);
              refetchTrash();
            }}
            title={t("回收站")}
            className="relative"
          >
            <Trash className="w-5 h-5" />
            {trashItems && trashItems.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center">
                {trashItems.length}
              </span>
            )}
          </Button>
          <NotificationBell />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("切换显示模式")}
            onClick={toggleTheme}
          >
            {theme === "light" ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/settings")}
          >
            <Settings className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout.mutate()}
            title={t("退出登录")}
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* 下拉刷新指示器 */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        isPulling={isPulling}
      />

      <div className="p-3 sm:p-4 max-w-2xl mx-auto space-y-4 sm:space-y-6 pb-8">
        {/* 欢迎信息 + 批量操作 */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold">
              {t("你好，")}
              {user?.name || t("朋友")} 👋
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              {t("选择一位女友开始聊天吧")}
            </p>
          </div>
          {girlfriends && girlfriends.length > 1 && (
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
                  {t("取消")}
                </>
              ) : (
                <>
                  <CheckSquare className="w-4 h-4 mr-1" />
                  {t("批量管理")}
                </>
              )}
            </Button>
          )}
        </div>

        {/* 批量操作工具栏 */}
        {batchMode && girlfriends && girlfriends.length > 0 && (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
            <Button variant="outline" size="sm" onClick={selectAll}>
              {selectedIds.size === girlfriends.length ? (
                <>
                  <CheckSquare className="w-4 h-4 mr-1" />
                  {t("取消全选")}
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 mr-1" />
                  {t("全选")}
                </>
              )}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t("已选")}
              {selectedIds.size} / {girlfriends.length}
            </span>
            <div className="flex-1" />
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={() => setBatchDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {t("删除选中")}
            </Button>
          </div>
        )}

        {/* 女友列表 */}
        {girlfriendsLoading || isCreatingDefault ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !girlfriends || girlfriends.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Plus className="w-8 h-8 text-primary" />
              </div>
              <CardTitle>{t("创建你的第一位女友")}</CardTitle>
              <CardDescription>
                {t("上传参考照片，设置性格特征和兴趣爱好")}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button onClick={() => setLocation("/setup")}>
                <Plus className="w-4 h-4 mr-2" />
                {t("开始创建")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {girlfriends.map(gf => {
              const mood = moodMap[gf.id];
              const moodInfo = mood ? MOOD_CONFIG[mood.mood] : null;
              const isSelected = selectedIds.has(gf.id);

              return (
                <Card
                  key={gf.id}
                  className={`transition-all hover:shadow-md ${
                    gf.isActive ? "ring-2 ring-primary" : ""
                  } ${isSelected ? "ring-2 ring-destructive bg-destructive/5" : ""}`}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center gap-3 sm:gap-4">
                      {/* 批量选择复选框 */}
                      {batchMode && (
                        <div className="flex-shrink-0">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(gf.id)}
                          />
                        </div>
                      )}

                      {/* 头像 */}
                      <div className="relative flex-shrink-0">
                        <Avatar className="w-12 h-12 sm:w-16 sm:h-16">
                          <AvatarImage
                            src={gf.avatarUrl || gf.referenceImageUrl}
                            alt={gf.name}
                          />
                          <AvatarFallback className="text-lg">
                            {gf.name[0]}
                          </AvatarFallback>
                        </Avatar>
                        {/* 心情气泡 */}
                        {moodInfo && (
                          <div
                            className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full ${moodInfo.bgColor} flex items-center justify-center border-2 border-background text-sm`}
                            title={t("{v0} ({v1}分)", {
                              v0: t(moodInfo.label),
                              v1: mood!.moodScore,
                            })}
                          >
                            {moodInfo.emoji}
                          </div>
                        )}
                      </div>

                      {/* 信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg truncate">
                            {gf.name}
                          </h3>
                          {gf.isActive && (
                            <Badge
                              variant="default"
                              className="text-xs flex-shrink-0"
                            >
                              {t("当前")}
                            </Badge>
                          )}
                          {/* 亲密度等级徽章 */}
                          {(() => {
                            const intimacy = intimacyMap[gf.id];
                            if (!intimacy) return null;
                            const levelInfo = getLevelInfo(intimacy.level);
                            return (
                              <span
                                className={`text-xs flex-shrink-0 flex items-center gap-0.5 ${levelInfo.color}`}
                                title={t("{v0} Lv.{v1} - {v2}经验值", {
                                  v0: t(levelInfo.name),
                                  v1: levelInfo.level,
                                  v2: intimacy.points,
                                })}
                              >
                                <span>{levelInfo.emoji}</span>
                                <span className="font-medium">
                                  {t("Lv.")}
                                  {levelInfo.level}
                                </span>
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {gf.personality}
                        </p>
                        {/* 亲密度进度条 */}
                        {(() => {
                          const intimacy = intimacyMap[gf.id];
                          if (!intimacy) return null;
                          const levelInfo = getLevelInfo(intimacy.level);
                          const gradient = getLevelGradient(intimacy.level);
                          return (
                            <div className="mt-1.5">
                              <div className="flex items-center justify-between mb-0.5">
                                <span
                                  className={`text-[10px] font-medium ${levelInfo.color}`}
                                >
                                  {t(levelInfo.name)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {intimacy.pointsToNext !== null
                                    ? t("还需 {v0} 升级", {
                                        v0: intimacy.pointsToNext,
                                      })
                                    : t("已满级 ✨")}
                                </span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`}
                                  style={{ width: `${intimacy.progress}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}
                        {/* 心情状态文字 */}
                        {moodInfo && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span
                              className={`text-xs font-medium ${moodInfo.color}`}
                            >
                              {t(moodInfo.label)}
                            </span>
                            {mood!.todayMessages > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {t("· 今日聊了")}
                                {mood!.todayMessages}
                                {t("条")}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 操作按钮 */}
                      {!batchMode && (
                        <div className="flex flex-col gap-1.5 sm:gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            disabled={
                              updateGirlfriend.isPending || resumeChat.isPending
                            }
                            onClick={() => handleStartChat(gf.id)}
                          >
                            <MessageCircle className="w-4 h-4 mr-1" />
                            {t("聊天")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/setup/${gf.id}`)}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            {t("编辑")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                            onClick={() =>
                              setDeleteTarget({
                                id: gf.id,
                                name: gf.name,
                                isActive: gf.isActive,
                              })
                            }
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            {t("删除")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* 添加新女友按钮 */}
        {girlfriends && girlfriends.length > 0 && !batchMode && (
          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={() => setLocation("/setup")}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t("选择角色 / 自定义创建")}
          </Button>
        )}

        {/* 快捷入口 */}
        {girlfriends && girlfriends.length > 0 && !batchMode && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Card
              className="cursor-pointer hover:shadow-md transition-all"
              onClick={() => setLocation("/gallery")}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Image className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{t("自拍画廊")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("查看所有照片")}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md transition-all"
              onClick={() => setLocation("/settings")}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Settings className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{t("API 设置")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("配置 API Key")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* 历史对话侧边栏（含搜索） */}
      <Sheet
        open={historyOpen}
        onOpenChange={open => {
          setHistoryOpen(open);
          if (!open) {
            setSearchKeyword("");
            setDebouncedKeyword("");
          }
        }}
      >
        <SheetContent side="left" className="w-[85vw] max-w-[360px] p-0">
          <SheetHeader className="p-4 pb-2 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              {t("历史对话")}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {t("搜索或浏览历史对话记录")}
            </SheetDescription>
            {/* 搜索框 */}
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder={t("搜索聊天记录...")}
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
                className="pl-9 pr-8 h-9"
              />
              {searchKeyword && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSearchKeyword("");
                    setDebouncedKeyword("");
                    searchInputRef.current?.focus();
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-160px)]">
            {searchLoading && isSearchMode && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
                <span className="text-sm text-muted-foreground">
                  {t("搜索中...")}
                </span>
              </div>
            )}

            {isSearchMode &&
              !searchLoading &&
              (!searchResults || searchResults.length === 0) && (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <Search className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {t('未找到包含 "')}
                    {debouncedKeyword}
                    {t('" 的对话')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("试试其他关键词")}
                  </p>
                </div>
              )}

            {!isSearchMode &&
              (!conversationsWithDetails ||
                conversationsWithDetails.length === 0) && (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <MessageCircle className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {t("还没有对话记录")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("选择一位女友开始聊天吧")}
                  </p>
                </div>
              )}

            {displayConversations && displayConversations.length > 0 && (
              <div>
                {isSearchMode && (
                  <div className="px-4 py-2 bg-muted/30 border-b">
                    <p className="text-xs text-muted-foreground">
                      {t("找到")}
                      {displayConversations.length} {t("个相关对话")}
                    </p>
                  </div>
                )}
                <div className="divide-y">
                  {displayConversations.map(convo => (
                    <button
                      key={convo.id}
                      className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors flex items-center gap-3"
                      onClick={() => {
                        setHistoryOpen(false);
                        setSearchKeyword("");
                        setDebouncedKeyword("");
                        setLocation(`/chat/${convo.id}`);
                      }}
                    >
                      <Avatar className="w-10 h-10 flex-shrink-0">
                        {convo.girlfriendImage ? (
                          <AvatarImage
                            src={convo.girlfriendImage}
                            alt={convo.girlfriendName || ""}
                          />
                        ) : null}
                        <AvatarFallback className="text-sm">
                          {convo.girlfriendName?.[0] || "?"}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate">
                            {convo.girlfriendName || convo.title || t("对话")}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {convo.lastMessageAt
                              ? formatTime(convo.lastMessageAt)
                              : formatTime(convo.updatedAt)}
                          </span>
                        </div>
                        {isSearchMode && (convo as any).matchedMessage ? (
                          <p className="text-xs text-primary/80 truncate mt-0.5">
                            🔍 {(convo as any).matchedMessage}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {convo.lastMessage
                              ? convo.lastMessage === "[自拍照片]"
                                ? t("📷 发送了一张照片")
                                : convo.lastMessage
                              : t("暂无消息")}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* 回收站侧边栏 */}
      <Sheet open={trashOpen} onOpenChange={setTrashOpen}>
        <SheetContent side="right" className="w-[85vw] max-w-[360px] p-0">
          <SheetHeader className="p-4 pb-3 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Trash className="w-5 h-5 text-destructive" />
              {t("回收站")}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {t("已删除的女友将保留 7 天，之后自动永久删除")}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-120px)]">
            {!trashItems || trashItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <Trash className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  {t("回收站是空的")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("删除的女友会在这里保留 7 天")}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {trashItems.map(gf => {
                  const remaining = getRemainingDays(gf.deletedAt);
                  return (
                    <div
                      key={gf.id}
                      className="px-4 py-3 flex items-center gap-3"
                    >
                      <Avatar className="w-12 h-12 flex-shrink-0 opacity-60">
                        <AvatarImage src={gf.referenceImageUrl} alt={gf.name} />
                        <AvatarFallback>{gf.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {gf.name}
                        </p>
                        <p className="text-xs text-destructive">
                          {remaining > 0
                            ? t("{v0} 天后永久删除", { v0: remaining })
                            : t("即将永久删除")}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            restoreGirlfriend.mutate({ id: gf.id })
                          }
                          disabled={restoreGirlfriend.isPending}
                        >
                          <Undo2 className="w-3 h-3 mr-1" />
                          {t("恢复")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive border-destructive/30"
                          onClick={() => permanentDelete.mutate({ id: gf.id })}
                          disabled={permanentDelete.isPending}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          {t("彻底删除")}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* 单个删除确认弹窗 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={open => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.isActive ? t("⚠️ 删除当前女友") : t("确认删除")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {deleteTarget?.isActive && (
                  <p className="text-amber-600 dark:text-amber-400 font-medium">
                    {t("你正在删除当前正在聊天的女友「")}
                    {deleteTarget.name}
                    {t("」，删除后需要重新选择一位女友才能继续聊天。")}
                  </p>
                )}
                <p>
                  {deleteTarget?.isActive ? (
                    t("确定要继续吗？")
                  ) : (
                    <>
                      {t("你确定要删除")}{" "}
                      <span className="font-semibold text-foreground">
                        {deleteTarget?.name}
                      </span>{" "}
                      {t("吗？")}
                    </>
                  )}
                  {t("她将被移入回收站，7 天内可以恢复。")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteTarget && deleteGirlfriend.mutate({ id: deleteTarget.id })
              }
              disabled={deleteGirlfriend.isPending}
            >
              {deleteGirlfriend.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  {t("删除中...")}
                </>
              ) : (
                t("移入回收站")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量删除确认弹窗 */}
      <AlertDialog
        open={batchDeleteConfirm}
        onOpenChange={setBatchDeleteConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasActiveInSelection
                ? t("⚠️ 批量删除包含当前女友")
                : t("确认批量删除")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {hasActiveInSelection && (
                  <p className="text-amber-600 dark:text-amber-400 font-medium">
                    {t(
                      "选中的女友中包含当前正在聊天的对象，删除后需要重新选择一位女友才能继续聊天。"
                    )}
                  </p>
                )}
                <p>
                  {t("你确定要删除选中的")}{" "}
                  <span className="font-semibold text-foreground">
                    {selectedIds.size}
                  </span>{" "}
                  {t("位女友吗？她们将被移入回收站，7 天内可以恢复。")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
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
                  {t("删除中...")}
                </>
              ) : (
                t("移入回收站 ({v0})", { v0: selectedIds.size })
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
