import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Bell, Check, CheckCheck, MessageCircleHeart, Sun, Moon, Sparkles } from "lucide-react";
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
  miss_you: <MessageCircleHeart className="w-4 h-4 text-pink-400" />,
  good_morning: <Sun className="w-4 h-4 text-yellow-400" />,
  good_night: <Moon className="w-4 h-4 text-indigo-400" />,
  random: <Sparkles className="w-4 h-4 text-purple-400" />,
  mood: <MessageCircleHeart className="w-4 h-4 text-pink-400" />,
};

export function NotificationBell() {
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
    onSuccess: (data) => {
      if (data) {
        refetchCount();
        if (open) refetchList();
        // 尝试浏览器通知
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(data.title, {
            body: data.content,
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

  const formatTime = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin}分钟前`;
    if (diffHour < 24) return `${diffHour}小时前`;
    if (diffDay < 7) return `${diffDay}天前`;
    return date.toLocaleDateString();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 sm:h-10 sm:w-10"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-pink-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[320px] sm:w-[380px] p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg">通知</SheetTitle>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1" />
                全部已读
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-80px)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Bell className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">暂无通知</p>
              <p className="text-xs mt-1 opacity-60">女友们会主动来找你聊天哦~</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notif: any) => (
                <button
                  key={notif.id}
                  className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors ${
                    !notif.isRead ? "bg-pink-500/5" : ""
                  }`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {NOTIFICATION_ICONS[notif.type] || NOTIFICATION_ICONS.random}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium truncate ${
                            !notif.isRead ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {notif.title}
                        </span>
                        {!notif.isRead && (
                          <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notif.content}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {formatTime(notif.createdAt)}
                      </p>
                    </div>
                    {!notif.isRead && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          markRead.mutate({ id: notif.id });
                        }}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
