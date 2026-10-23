import { useState } from "react";
import { Link, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useSettingsDraft } from "@/hooks/useSettingsDraft";
import { formDraftKey } from "@/lib/formDrafts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageError } from "@/components/PageError";
const blank = {
  subject: "",
  orderReference: "",
  content: "",
  category: "technical",
};
export default function Help() {
  const { t } = useI18n(),
    { user } = useAuth();
  return (
    <article className="mx-auto max-w-2xl space-y-6 p-5 pb-24">
      <h1 className="text-2xl font-semibold">{t("help:title")}</h1>
      <p>{t("help:intro")}</p>
      {(
        [
          ["paymentTitle", "paymentBody"],
          ["dataTitle", "dataBody"],
        ] as const
      ).map(([title, body]) => (
        <section key={title} className="space-y-2">
          <h2 className="text-lg font-medium">{t(`help:${title}`)}</h2>
          <p className="leading-relaxed text-muted-foreground">
            {t(`help:${body}`)}
          </p>
        </section>
      ))}
      <div className="flex gap-4">
        <Link href="/settings" className="text-primary underline">
          {t("billing:planUsage")}
        </Link>
        <Link href="/privacy" className="text-primary underline">
          {t("help:privacy")}
        </Link>
      </div>
      {user ? (
        <SupportDesk key={user.id} userId={user.id} />
      ) : (
        <Button asChild>
          <Link href="/login?next=%2Fhelp">{t("help:signIn")}</Link>
        </Button>
      )}
    </article>
  );
}
function SupportDesk({ userId }: { userId: string }) {
  const { t } = useI18n(),
    utils = trpc.useUtils(),
    search = useSearch();
  const [selected, setSelected] = useState<string | null>(null),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const draft = useSettingsDraft(
    {
      ...blank,
      category:
        new URLSearchParams(search).get("category") === "billing"
          ? "billing"
          : "technical",
    },
    undefined,
    formDraftKey(userId, "support-new")
  );
  const [subject, setSubject] = draft.field("subject"),
    [orderReference, setOrder] = draft.field("orderReference"),
    [content, setContent] = draft.field("content"),
    [category, setCategory] = draft.field("category");
  const list = trpc.support.list.useInfiniteQuery(
    {},
    {
      getNextPageParam: page => page.nextCursor ?? undefined,
      refetchInterval: 30_000,
    }
  );
  const create = trpc.support.create.useMutation({
    onSuccess: async ticket => {
      setSubject("");
      setOrder("");
      setContent("");
      draft.acknowledge(["subject", "content", "orderReference", "category"], {
        ...blank,
        category,
      });
      setRequestId(crypto.randomUUID());
      setSelected(ticket.id);
      await utils.support.list.invalidate();
    },
    onError: () => void utils.support.list.invalidate(),
  });
  if (selected)
    return (
      <>
        <Button variant="ghost" onClick={() => setSelected(null)}>
          {t("help:back")}
        </Button>
        <SupportThread id={selected} userId={userId} />
      </>
    );
  return (
    <section className="space-y-5">
      <h2 className="text-lg font-semibold">{t("help:ticketsTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("help:ticketNotice")}</p>
      {list.error ? (
        <PageError onRetry={() => void list.refetch()} />
      ) : (
        list.data?.pages
          .flatMap(p => p.items)
          .map(ticket => (
            <Button
              key={ticket.id}
              variant="outline"
              className="h-auto w-full justify-between gap-3 whitespace-normal text-left"
              onClick={() => setSelected(ticket.id)}
            >
              <span className="min-w-0 break-words">{ticket.subject}</span>
              <span className="shrink-0 text-xs">
                {t(`help:${ticket.status}`)}
              </span>
            </Button>
          ))
      )}
      {list.data && !list.data.pages.some(p => p.items.length) && (
        <p>{t("help:empty")}</p>
      )}
      {list.hasNextPage && (
        <Button
          variant="outline"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {t("common:loadMore")}
        </Button>
      )}
      <h3 className="font-medium">{t("help:newTicket")}</h3>
      <form
        className="space-y-3"
        onSubmit={event => {
          event.preventDefault();
          create.mutate({
            id: requestId,
            category: category as "billing" | "account" | "technical",
            subject,
            orderReference: orderReference || undefined,
            content,
          });
        }}
      >
        <fieldset disabled={create.isPending} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="support-category">{t("help:category")}</Label>
            <select
              id="support-category"
              className="w-full rounded-lg border bg-background p-2"
              value={category}
              onChange={e => setCategory(e.target.value as typeof category)}
            >
              {(["billing", "account", "technical"] as const).map(value => (
                <option key={value} value={value}>
                  {t(`help:${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="support-subject">{t("help:subject")}</Label>
            <Input
              id="support-subject"
              required
              maxLength={120}
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="support-order">{t("help:orderReference")}</Label>
            <Input
              id="support-order"
              maxLength={200}
              value={orderReference}
              onChange={e => setOrder(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="support-content">{t("help:message")}</Label>
            <Textarea
              id="support-content"
              required
              maxLength={4000}
              rows={5}
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>
          {create.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("help:failed")}
            </p>
          )}
          <Button type="submit">{t("help:submit")}</Button>
        </fieldset>
      </form>
    </section>
  );
}
function SupportThread({ id, userId }: { id: string; userId: string }) {
  const { t } = useI18n(),
    utils = trpc.useUtils();
  const query = trpc.support.get.useQuery({ id }, { refetchInterval: 30_000 });
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const draft = useSettingsDraft(
    { content: "" },
    undefined,
    formDraftKey(userId, `support-reply:${id}`)
  );
  const [content, setContent] = draft.field("content");
  const reply = trpc.support.reply.useMutation({
    onSuccess: async () => {
      setContent("");
      draft.acknowledge(["content"], { content: "" });
      setRequestId(crypto.randomUUID());
      await utils.support.invalidate();
    },
  });
  if (query.error) return <PageError onRetry={() => void query.refetch()} />;
  if (!query.data) return <p role="status">{t("auth:working")}</p>;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold break-words">
        {query.data.ticket.subject}
      </h2>
      <p className="text-xs break-all">
        {t("help:ticketId")}：{id} · {t(`help:${query.data.ticket.status}`)}
      </p>
      <p role="status" className="text-sm">
        {t("help:sent")}
      </p>
      <div className="space-y-3">
        {query.data.messages.map(message => (
          <div key={message.id} className="rounded-xl border p-3">
            <strong className="text-sm">
              {t(message.author === "staff" ? "help:staff" : "help:you")}
            </strong>
            <p className="whitespace-pre-wrap break-words text-sm">
              {message.content}
            </p>
          </div>
        ))}
      </div>
      <form
        className="space-y-3"
        onSubmit={e => {
          e.preventDefault();
          reply.mutate({ id: requestId, ticketId: id, content });
        }}
      >
        <Label htmlFor="support-reply">{t("help:reply")}</Label>
        <Textarea
          id="support-reply"
          required
          maxLength={4000}
          value={content}
          disabled={reply.isPending}
          onChange={e => setContent(e.target.value)}
          placeholder={t("help:replyPlaceholder")}
        />
        {reply.isError && <p role="alert">{t("help:failed")}</p>}
        <Button disabled={reply.isPending} type="submit">
          {t("help:reply")}
        </Button>
      </form>
    </section>
  );
}
