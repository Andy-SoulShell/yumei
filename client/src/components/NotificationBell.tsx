import { PageError } from "@/components/PageError";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/formatters";
import { renderNotification } from "@shared/notifications";
/** 站内通知入口，轮询未读数并定时请求生成主动通知。 */

import { useI18n } from "@/lib/i18n";
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Bell,
  Check,
  CheckCheck,
  MessageCircleHeart,
  Sun,
  Moon,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCompanionChat } from "@/hooks/useCompanionChat";

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  miss_you: <MessageCircleHeart className="w-4 h-4 text-primary" />,
  good_morning: <Sun className="w-4 h-4 text-yellow-400" />,
  good_night: <Moon className="w-4 h-4 text-indigo-400" />,
  random: <Sparkles className="w-4 h-4 text-purple-400" />,
  mood: <MessageCircleHeart className="w-4 h-4 text-primary" />,
};

/**
 * 显示通知列表、标记已读并跳转对应角色。
 *
 * @remarks 未读数每三十秒刷新；主动消息首次延迟一分钟，之后每五分钟检查。
 */
export function NotificationBell() {
  const { t, locale } = useI18n();
  const product = trpc.productConfig.get.useQuery(undefined, {
    staleTime: 15000,
    refetchInterval: 60000,
  });
  const rules = product.data?.proactive;
  const [open, setOpen] = useState(false);
  const { open: openChat, pending } = useCompanionChat();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [linkedFailure, setLinkedFailure] = useState<number | null>(null);
  const attemptedLink = useRef<number | null>(null);
  const linkedValues = new URLSearchParams(search).getAll("notification");
  const linkedId =
    linkedValues.length === 1 &&
    /^[1-9]\d*$/.test(linkedValues[0]) &&
    Number.isSafeInteger(Number(linkedValues[0]))
      ? Number(linkedValues[0])
      : null;

  // 获取未读数量
  const { data: unreadCount = 0, refetch: refetchCount } =
    trpc.notification.unreadCount.useQuery(undefined, {
      refetchInterval: rules?.client.unreadPollMs ?? false, // 每 30 秒刷新
    });

  // 获取通知列表
  const {
    data: notifications = [],
    isLoading: notificationsLoading,
    error: notificationsError,
    refetch: refetchList,
  } = trpc.notification.list.useQuery(undefined, {
    enabled: open,
  });

  // 定时检查主动通知（每 5 分钟）
  const checkProactive = trpc.notification.checkProactive.useMutation({
    onSuccess: data => {
      if (data) {
        refetchCount();
        if (open) refetchList();
      }
    },
  });
  const checkForProactive = checkProactive.mutate;

  // 定时触发主动通知检查
  useEffect(() => {
    if (!rules?.enabled) return;
    // 按发布配置调度
    const initialTimer = setTimeout(() => {
      checkForProactive();
    }, rules.client.initialCheckMs);

    // 之后每 5 分钟检查一次
    const interval = setInterval(() => {
      checkForProactive();
    }, rules.client.checkIntervalMs);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [checkForProactive, rules]);

  // 标记已读
  const markRead = trpc.notification.markRead.useMutation({
    onError: () => toast.error(t("auth:requestFailed")),
    onSuccess: () => {
      refetchCount();
      refetchList();
    },
  });

  const markAllRead = trpc.notification.markAllRead.useMutation({
    onError: () => toast.error(t("auth:requestFailed")),
    onSuccess: () => {
      refetchCount();
      refetchList();
    },
  });

  // 推送点击只确认本站归属的通知；成功后才移除 URL 参数，失败保留以便重试。
  const markLinkedRead = trpc.notification.markRead.useMutation({
    onSuccess: (_data, variables) => {
      void refetchCount();
      void refetchList();
      setLinkedFailure(current => (current === variables.id ? null : current));
      const current = new URL(window.location.href);
      const ids = current.searchParams.getAll("notification");
      if (
        ids.length !== 1 ||
        !/^[1-9]\d*$/.test(ids[0]) ||
        Number(ids[0]) !== variables.id
      )
        return;
      current.searchParams.delete("notification");
      const query = current.searchParams.toString();
      navigate(
        `${current.pathname}${query ? `?${query}` : ""}${current.hash}`,
        { replace: true }
      );
    },
    onError: (_error, variables) => {
      const ids = new URLSearchParams(window.location.search).getAll(
        "notification"
      );
      if (ids.length !== 1 || Number(ids[0]) !== variables.id) return;
      setLinkedFailure(variables.id);
      toast.error(t("notifications:clickFeedbackFailed"));
    },
  });
  const acknowledgeLink = markLinkedRead.mutate;
  useEffect(() => {
    if (linkedId === null) {
      attemptedLink.current = null;
      setLinkedFailure(null);
      return;
    }
    if (attemptedLink.current === linkedId) return;
    setLinkedFailure(current => (current === linkedId ? current : null));
    attemptedLink.current = linkedId;
    acknowledgeLink({ id: linkedId });
  }, [linkedId, acknowledgeLink]);

  const handleNotificationClick = useCallback(
    async (notif: { id: number; isRead: boolean; girlfriendId: number }) => {
      if (!(await openChat(notif.girlfriendId))) return;
      if (!notif.isRead) markRead.mutate({ id: notif.id });
      setOpen(false);
    },
    [markRead, openChat]
  );

  const formatTime = (date: string | Date) => formatRelativeTime(date, locale);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 sm:h-10 sm:w-10"
          aria-label={t("notifications:notifications")}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="notification-count absolute -top-0.5 -right-0.5 bg-primary text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[320px] sm:w-[380px] p-0"
        aria-describedby={undefined}
      >
        <SheetHeader className="pl-4 pr-16 pt-4 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SheetTitle className="text-lg">
              {t("notifications:notifications")}
            </SheetTitle>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1" />
                {t("notifications:markAllAsRead")}
              </Button>
            )}
          </div>
        </SheetHeader>

        {linkedFailure !== null && (
          <div
            role="alert"
            className="mx-4 mb-3 space-y-2 rounded-lg border border-destructive/40 p-3 text-sm"
          >
            <p>{t("notifications:clickFeedbackFailed")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={markLinkedRead.isPending}
              onClick={() => acknowledgeLink({ id: linkedFailure })}
            >
              {t("explore:retry")}
            </Button>
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1">
          {notificationsLoading ? (
            <div className="flex justify-center py-16">
              <Loader2
                className="size-6 animate-spin"
                aria-label={t("auth:working")}
              />
            </div>
          ) : notificationsError && !notifications.length ? (
            <PageError onRetry={() => void refetchList()} />
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Bell className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">{t("notifications:noNotificationsYet")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notif: any) => (
                <div
                  key={notif.id}
                  className="group flex items-start gap-1 pr-2"
                >
                  <Button
                    variant="plain"
                    size="none"
                    type="button"
                    className={`block min-w-0 flex-1 text-left px-4 py-3 hover:bg-accent/50 transition-colors ${
                      !notif.isRead ? "bg-primary/5" : ""
                    }`}
                    disabled={pending !== null}
                    onClick={() => void handleNotificationClick(notif)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {NOTIFICATION_ICONS[notif.type] ||
                          NOTIFICATION_ICONS.random}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium truncate ${
                              !notif.isRead
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {rules
                              ? renderNotification(rules, notif.title, locale)
                              : ""}
                          </span>
                          {!notif.isRead && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {rules
                            ? renderNotification(rules, notif.content, locale)
                            : ""}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {formatTime(notif.createdAt)}
                        </p>
                      </div>
                    </div>
                  </Button>
                  {!notif.isRead && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("notifications:markAsRead")}
                      title={t("notifications:markAsRead")}
                      disabled={markRead.isPending}
                      className="mt-3 h-7 w-7 shrink-0"
                      onClick={e => {
                        e.stopPropagation();
                        markRead.mutate({ id: notif.id });
                      }}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
