import { formatRelativeTime } from "@/lib/formatters";
import { renderMessage } from "@shared/i18n";
/** 站内通知入口，轮询未读数并定时请求生成主动通知。 */

import { useI18n } from "@/lib/i18n";
import { useState, useEffect, useCallback } from "react";
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
import { useLocation } from "wouter";

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
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  // 获取未读数量
  const { data: unreadCount = 0, refetch: refetchCount } =
    trpc.notification.unreadCount.useQuery(undefined, {
      refetchInterval: 30000, // 每 30 秒刷新
    });

  // 获取通知列表
  const { data: notifications = [], refetch: refetchList } =
    trpc.notification.list.useQuery(undefined, {
      enabled: open,
    });

  // 定时检查主动通知（每 5 分钟）
  const checkProactive = trpc.notification.checkProactive.useMutation({
    onSuccess: data => {
      if (data) {
        refetchCount();
        if (open) refetchList();
        // 尝试浏览器通知
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(renderMessage(data.title, locale), {
            body: renderMessage(data.content, locale),
            icon: "/icon-192x192.png",
            tag: `notification-${data.id}`,
          });
        }
      }
    },
  });

  // 定时触发主动通知检查
  useEffect(() => {
    // 首次延迟 60 秒后检查
    const initialTimer = setTimeout(() => {
      checkProactive.mutate();
    }, 60000);

    // 之后每 5 分钟检查一次
    const interval = setInterval(() => {
      checkProactive.mutate();
    }, 300000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 请求浏览器通知权限
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // 标记已读
  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      refetchCount();
      refetchList();
    },
  });

  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      refetchCount();
      refetchList();
    },
  });

  const handleNotificationClick = useCallback(
    (notif: { id: number; isRead: boolean; girlfriendId: number }) => {
      if (!notif.isRead) {
        markRead.mutate({ id: notif.id });
      }
      setOpen(false);
      // 导航到对应女友的聊天
      navigate(`/chat/${notif.girlfriendId}`);
    },
    [markRead, navigate]
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
      <SheetContent side="right" className="w-[320px] sm:w-[380px] p-0">
        <SheetHeader className="pl-4 pr-16 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
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

        <ScrollArea className="min-h-0 flex-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Bell className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">{t("notifications:noNotificationsYet")}</p>
              <p className="text-xs mt-1 opacity-60">
                {t("notifications:yourCompanionsWillReachOutToYouHere")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
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
                    onClick={() => handleNotificationClick(notif)}
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
                            {renderMessage(notif.title, locale)}
                          </span>
                          {!notif.isRead && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {renderMessage(notif.content, locale)}
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
