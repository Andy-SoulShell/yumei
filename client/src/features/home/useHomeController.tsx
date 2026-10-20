import { useAuth } from "@/_core/hooks/useAuth";
import { usePullToRefresh } from "@/hooks/useGestures";
import { apiErrorMessage } from "@/lib/errors";
import { formatRelativeTime } from "@/lib/formatters";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  getLevelProgress,
  getPointsToNextLevel,
} from "../../../../shared/intimacy";
/** 页面查询、草稿与操作流程；展示组件只消费此状态。 */
export function useHomeController() {
  const { t, locale } = useI18n();

  const { user, loading, isAuthenticated } = useAuth();

  const [, setLocation] = useLocation();

  const [historyOpen, setHistoryOpen] = useState(false);

  const [trashOpen, setTrashOpen] = useState(false);

  const [searchKeyword, setSearchKeyword] = useState("");

  const [debouncedKeyword, setDebouncedKeyword] = useState("");

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

  const {
    data: girlfriends,
    isLoading: girlfriendsLoading,
    error: girlfriendsError,
    refetch,
  } = trpc.girlfriend.list.useQuery(undefined, { enabled: isAuthenticated });

  // 回收站列表
  const {
    data: trashItems,
    isLoading: trashLoading,
    error: trashError,
    refetch: refetchTrash,
  } = trpc.girlfriend.trash.useQuery(undefined, {
    enabled: isAuthenticated && trashOpen,
  });

  const conversationsQuery = trpc.conversation.listWithDetails.useInfiniteQuery(
    { limit: 50 },
    {
      enabled: isAuthenticated,
      getNextPageParam: page =>
        page.length === 50
          ? {
              updatedAt: page[page.length - 1].updatedAt,
              id: page[page.length - 1].id,
            }
          : undefined,
    }
  );

  const conversationsWithDetails = conversationsQuery.data?.pages.flat();

  const searchQuery = trpc.conversation.search.useInfiniteQuery(
    { keyword: debouncedKeyword, limit: 50 },
    {
      enabled: isAuthenticated && !!debouncedKeyword,
      getNextPageParam: page =>
        page.length === 50 ? page[page.length - 1].matchedMessageId : undefined,
    }
  );

  const searchResults = searchQuery.data?.pages.flat();

  const searchLoading = searchQuery.isLoading;

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

  // 软删除（移入回收站）
  const deleteGirlfriend = trpc.girlfriend.delete.useMutation({
    onSuccess: () => {
      refetch();
      setDeleteTarget(null);
      toast.success(t("common:movedToTrashYouCanRestoreItWithin"));
    },
    onError: error => {
      toast.error(
        t("common:couldNotDelete", { error: apiErrorMessage(error, t) })
      );
    },
  });

  // 批量软删除
  const batchDeleteGirlfriends = trpc.girlfriend.batchDelete.useMutation({
    onSuccess: data => {
      refetch();
      setBatchDeleteConfirm(false);
      setBatchMode(false);
      setSelectedIds(new Set());
      toast.success(t("home:movedCompanionsToTrash", { count: data.count }));
    },
    onError: error => {
      toast.error(
        t("home:couldNotDeleteSelectedCompanions", {
          error: apiErrorMessage(error, t),
        })
      );
    },
  });

  // 恢复女友
  const restoreGirlfriend = trpc.girlfriend.restore.useMutation({
    onSuccess: () => {
      refetch();
      refetchTrash();
      toast.success(t("home:restored"));
    },
    onError: error => {
      toast.error(
        t("home:couldNotRestore", { error: apiErrorMessage(error, t) })
      );
    },
  });

  // 永久删除
  const permanentDelete = trpc.girlfriend.permanentDelete.useMutation({
    onSuccess: () => {
      refetchTrash();
      toast.success(t("home:permanentlyDeleted"));
    },
    onError: error => {
      toast.error(
        t("common:couldNotDelete", { error: apiErrorMessage(error, t) })
      );
    },
  });

  const updateGirlfriend = trpc.girlfriend.update.useMutation({
    onSuccess: () => {
      refetch();
      toast.success(t("home:companionSwitched"));
    },
  });

  const resumeChat = trpc.conversation.resume.useMutation({
    onSuccess: data => setLocation(`/chat/${data.id}`),
    onError: error =>
      toast.error(
        t("common:couldNotOpenTheConversation", {
          error: apiErrorMessage(error, t),
        })
      ),
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

  const formatTime = (date: Date | string) => formatRelativeTime(date, locale);

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
  return {
    loading,
    t,
    setHistoryOpen,
    setTrashOpen,
    refetchTrash,
    setLocation,
    pullDistance,
    isRefreshing,
    isPulling,
    user,
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
    trashLoading,
    trashError,
    moodMap,
    toggleSelect,
    intimacyMap,
    updateGirlfriend,
    resumeChat,
    handleStartChat,
    setDeleteTarget,
    historyOpen,
    setSearchKeyword,
    setDebouncedKeyword,
    searchInputRef,
    searchKeyword,
    searchLoading,
    isSearchMode,
    searchResults,
    debouncedKeyword,
    conversationsWithDetails,
    displayConversations,
    formatTime,
    searchQuery,
    conversationsQuery,
    trashOpen,
    trashItems,
    getRemainingDays,
    restoreGirlfriend,
    permanentDelete,
    deleteTarget,
    deleteGirlfriend,
    batchDeleteConfirm,
    hasActiveInSelection,
    batchDeleteGirlfriends,
  };
}
export type HomeController = ReturnType<typeof useHomeController>;
