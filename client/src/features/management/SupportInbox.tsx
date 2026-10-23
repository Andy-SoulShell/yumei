/** 独立管理会话下的客服收件箱，不以普通用户角色授权。 */
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
export function SupportInbox({ onLogout }: { onLogout: () => void }) {
  const [selected, setSelected] = useState<string | null>(null),
    [status, setStatus] = useState<"open" | "resolved">("open");
  const query = trpc.support.admin.list.useInfiniteQuery(
    { status },
    {
      getNextPageParam: page => page.nextCursor ?? undefined,
      refetchInterval: 30_000,
    }
  );
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">客服工单</h1>
        <Link href="/admin" className="text-primary underline">
          内容管理
        </Link>
        <Button variant="ghost" onClick={onLogout}>
          退出管理
        </Button>
      </header>
      {selected ? (
        <>
          <Button variant="outline" onClick={() => setSelected(null)}>
            返回列表
          </Button>
          <StaffThread key={selected} id={selected} />
        </>
      ) : (
        <>
          <Label htmlFor="support-status">工单状态</Label>
          <select
            id="support-status"
            className="rounded-lg border bg-background p-2"
            value={status}
            onChange={e => setStatus(e.target.value as typeof status)}
          >
            <option value="open">待跟进</option>
            <option value="resolved">已解决</option>
          </select>
          {query.error ? (
            <Button onClick={() => void query.refetch()}>加载失败，重试</Button>
          ) : (
            query.data?.pages
              .flatMap(page => page.items)
              .map(ticket => (
                <Button
                  variant="outline"
                  className="h-auto w-full justify-between gap-3 whitespace-normal text-left"
                  key={ticket.id}
                  onClick={() => setSelected(ticket.id)}
                >
                  <span className="min-w-0 break-words">{ticket.subject}</span>
                  <span>
                    {ticket.category} ·{" "}
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </span>
                </Button>
              ))
          )}
          {query.data && !query.data.pages.some(p => p.items.length) && (
            <p>暂无此类工单。</p>
          )}
          {query.hasNextPage && (
            <Button
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              加载更多
            </Button>
          )}
        </>
      )}
    </main>
  );
}
function StaffThread({ id }: { id: string }) {
  const query = trpc.support.admin.get.useQuery(
      { id },
      { refetchInterval: 30_000 }
    ),
    utils = trpc.useUtils();
  const [content, setContent] = useState(""),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const reply = trpc.support.admin.reply.useMutation({
    onSuccess: async () => {
      setContent("");
      setRequestId(crypto.randomUUID());
      await utils.support.admin.invalidate();
    },
  });
  if (query.error)
    return (
      <Button onClick={() => void query.refetch()}>工单不可用，重试</Button>
    );
  if (!query.data) return <p>正在加载…</p>;
  const data = query.data;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{data.ticket.subject}</h2>
      <p className="break-all text-sm">
        编号：{id}
        <br />
        账号：{data.owner?.email}
        <br />
        订单参考：{data.ticket.orderReference || "未填写"}
      </p>
      <p className="text-sm text-muted-foreground">
        仅展示最近 100
        条。不要索取密码、密钥或完整银行卡信息。回复后由用户回到帮助页查看；这里不会发送邮件。
      </p>
      {data.messages.map(message => (
        <div key={message.id} className="rounded-xl border p-3">
          <strong>{message.author === "staff" ? "客服" : "用户"}</strong>
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      ))}
      <Label htmlFor="staff-reply">客服回复</Label>
      <Textarea
        id="staff-reply"
        maxLength={4000}
        disabled={reply.isPending}
        value={content}
        onChange={e => setContent(e.target.value)}
      />
      {reply.isError && <p role="alert">回复未提交，内容已保留，请重试。</p>}
      <div className="flex flex-wrap gap-3">
        {(["open", "resolved"] as const).map(status => (
          <Button
            key={status}
            variant={status === "resolved" ? "default" : "outline"}
            disabled={reply.isPending || !content.trim()}
            onClick={() =>
              reply.mutate({ id: requestId, ticketId: id, content, status })
            }
          >
            {status === "resolved" ? "回复并标记解决" : "回复，继续跟进"}
          </Button>
        ))}
      </div>
    </section>
  );
}
