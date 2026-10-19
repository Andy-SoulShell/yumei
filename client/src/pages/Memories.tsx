import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  MEMORY_CATEGORY_LABELS,
  memoryCapacity,
  type MemoryCategory,
} from "../../../shared/memory";
import { ArrowLeft, BookHeart, Loader2, Pin, PinOff, Trash2 } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

/**
 * 「她记得你的事」(M2-3)。
 *
 * Memory transparency page: everything the companion has learned about
 * the user, grouped by category — deletable and pinnable. This doubles
 * as the privacy surface: users can see and control exactly what's
 * stored about them.
 */
export default function Memories() {
  const params = useParams<{ id: string }>();
  const girlfriendId = Number(params.id);
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: "/login",
  });

  const utils = trpc.useUtils();
  const { data: girlfriends } = trpc.girlfriend.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const girlfriend = girlfriends?.find(g => g.id === girlfriendId);

  const { data: memories, isLoading } = trpc.memory.list.useQuery(
    { girlfriendId },
    { enabled: isAuthenticated && Number.isFinite(girlfriendId) }
  );

  const deleteMemory = trpc.memory.delete.useMutation({
    onSuccess: () => {
      utils.memory.list.invalidate({ girlfriendId });
      toast.success("已删除这条记忆");
    },
    onError: e => toast.error(`删除失败：${e.message}`),
  });

  const setPinned = trpc.memory.setPinned.useMutation({
    onSuccess: () => utils.memory.list.invalidate({ girlfriendId }),
    onError: e => toast.error(`操作失败：${e.message}`),
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const categories = Object.keys(MEMORY_CATEGORY_LABELS) as MemoryCategory[];
  const grouped = categories
    .map(category => ({
      category,
      items: (memories ?? []).filter(m => m.category === category),
    }))
    .filter(g => g.items.length > 0);

  const capacity = memoryCapacity(girlfriend?.intimacyLevel || 1);

  return (
    <div className="min-h-screen bg-background">
      <header
        className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 sm:py-3 border-b bg-card sticky top-0 z-10"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <Button variant="ghost" size="icon" onClick={() => history.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <BookHeart className="w-5 h-5 text-primary" />
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm sm:text-base truncate">
            {girlfriend ? `${girlfriend.name} 记得你的事` : "她记得你的事"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {memories?.length ?? 0} / {capacity} 条 · 亲密度越高，记得越多
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-3 sm:p-4 space-y-6 pb-10">
        {!memories || memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BookHeart className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">她还没有记住你的事</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs">
              多聊聊你自己——工作、喜好、最近发生的事。每聊几轮，她会自动记下重要的内容。
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => setLocation(`/chat/${girlfriendId}`)}
            >
              去聊天
            </Button>
          </div>
        ) : (
          grouped.map(group => (
            <section key={group.category}>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                {MEMORY_CATEGORY_LABELS[group.category]}
                <span className="ml-2 opacity-60">{group.items.length}</span>
              </h2>
              <div className="space-y-2">
                {group.items.map(memory => (
                  <Card key={memory.id} className="py-0">
                    <CardContent className="flex items-start gap-2 p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed break-words">
                          {memory.content}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {memory.pinned && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              已置顶
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(memory.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 shrink-0 text-muted-foreground hover:text-primary"
                        title={memory.pinned ? "取消置顶" : "置顶（不会被自动遗忘）"}
                        onClick={() =>
                          setPinned.mutate({ id: memory.id, pinned: !memory.pinned })
                        }
                      >
                        {memory.pinned ? (
                          <PinOff className="w-4 h-4" />
                        ) : (
                          <Pin className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 shrink-0 text-muted-foreground hover:text-destructive"
                        title="删除这条记忆"
                        onClick={() => deleteMemory.mutate({ id: memory.id })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
