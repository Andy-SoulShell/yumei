import { useProductConfig } from "@/features/product/useProductConfig";
/** 最近会话列表，直接进入原有聊天页并保留历史消息。 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Loader2, MessageCircle, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { formatRelativeTime } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** 展示会话预览，支持按角色、标题和完整聊天记录筛选。 */
export default function Chats() {
  const product = useProductConfig();
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const query = trpc.conversation.listWithDetails.useInfiniteQuery(
    {
      limit: product.raw?.experience.pagination.conversations,
      search: keyword || undefined,
    },
    {
      placeholderData: previous => previous,
      getNextPageParam: page =>
        page.length === product.raw?.experience.pagination.conversations
          ? {
              updatedAt: page[page.length - 1].updatedAt,
              id: page[page.length - 1].id,
            }
          : undefined,
    }
  );
  const { isLoading, error, refetch } = query;
  const results = query.data?.pages.flat();
  return (
    <div className="hub-page">
      <div className="hub-heading">
        <h1>{t("explore:chatsTitle")}</h1>
      </div>
      <div className="hub-search">
        <Search size={18} />
        <Input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t("home:searchConversations")}
          aria-label={t("home:searchConversations")}
        />
      </div>
      {isLoading ? (
        <Loader2
          className="mx-auto my-16 animate-spin"
          aria-label={t("home:searching")}
        />
      ) : error && !results?.length ? (
        <div className="explore-empty">
          <p>{t("auth:networkErrorPleaseTryAgain")}</p>
          <Button onClick={() => void refetch()}>{t("explore:retry")}</Button>
        </div>
      ) : results?.length ? (
        <div className="conversation-list">
          {results.map(chat => (
            <Link
              key={chat.id}
              href={`/chat/${chat.id}`}
              className="conversation-card"
            >
              {chat.girlfriendImage ? (
                <img src={chat.girlfriendImage} alt="" />
              ) : (
                <span
                  className="conversation-avatar flex items-center justify-center bg-primary/10 text-primary"
                  aria-hidden="true"
                >
                  {chat.girlfriendName?.[0]}
                </span>
              )}
              <span className="conversation-preview">
                <span className="conversation-name">
                  {chat.girlfriendName || chat.title || t("home:conversation")}
                  <time>
                    {formatRelativeTime(
                      chat.lastMessageAt || chat.updatedAt,
                      locale
                    )}
                  </time>
                </span>
                <span className="conversation-message">
                  {chat.lastMessage === "[自拍照片]"
                    ? t("home:sentAPhoto")
                    : chat.lastMessage || t("home:noMessagesYet")}
                </span>
              </span>
              <ArrowUpRight size={18} />
            </Link>
          ))}
          {error && (
            <div role="alert" className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {t("auth:networkErrorPleaseTryAgain")}
              </p>
              <Button
                variant="outline"
                disabled={query.isFetching}
                onClick={() =>
                  void (query.isFetchNextPageError
                    ? query.fetchNextPage()
                    : refetch())
                }
              >
                {t("explore:retry")}
              </Button>
            </div>
          )}
          {query.hasNextPage && !error && (
            <Button
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t("common:loadMore")}
            </Button>
          )}
        </div>
      ) : (
        <div className="explore-empty">
          <MessageCircle size={34} />
          <h2>
            {keyword
              ? t("home:searchEmpty", { query: keyword })
              : t("home:noConversationsYet")}
          </h2>
          <Button asChild>
            <Link href="/explore">{t("explore:heroAction")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
