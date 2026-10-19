/** 最近会话列表，直接进入原有聊天页并保留历史消息。 */
import { useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Loader2, MessageCircle, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { formatRelativeTime } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** 展示会话预览，支持按角色、标题和最近一条消息筛选。 */
export default function Chats() {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const { data, isLoading, error, refetch } =
    trpc.conversation.listWithDetails.useQuery();
  const results = data?.filter(chat =>
    [chat.girlfriendName, chat.title, chat.lastMessage]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase())
  );
  return (
    <div className="hub-page">
      <div className="hub-heading">
        <span className="section-eyebrow">
          <MessageCircle size={14} />
          {t("explore:navChats")}
        </span>
        <h1>{t("explore:chatsTitle")}</h1>
        <p>{t("explore:chatsSubtitle")}</p>
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
      ) : error ? (
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
              <img
                src={chat.girlfriendImage || "/characters/yumei.jpg"}
                alt=""
              />
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
        </div>
      ) : (
        <div className="explore-empty">
          <MessageCircle size={34} />
          <h2>
            {search ? t("explore:emptyTitle") : t("home:noConversationsYet")}
          </h2>
          <p>
            {search
              ? t("explore:emptyDescription")
              : t("home:chooseACompanionToStartChatting")}
          </p>
          <Button asChild>
            <Link href="/">{t("explore:heroAction")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
