import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Clock, Loader2, MessageCircle, Search, X } from "lucide-react";
import type { HomeController } from "./useHomeController";
type Props = Pick<
  HomeController,
  | "historyOpen"
  | "setHistoryOpen"
  | "setSearchKeyword"
  | "setDebouncedKeyword"
  | "t"
  | "searchInputRef"
  | "searchKeyword"
  | "searchLoading"
  | "isSearchMode"
  | "searchResults"
  | "debouncedKeyword"
  | "conversationsWithDetails"
  | "displayConversations"
  | "setLocation"
  | "formatTime"
  | "searchQuery"
  | "conversationsQuery"
>;

/** 展示按日期分组的会话历史和分页搜索结果。 */
export function ConversationHistory({
  historyOpen,
  setHistoryOpen,
  setSearchKeyword,
  setDebouncedKeyword,
  t,
  searchInputRef,
  searchKeyword,
  searchLoading,
  isSearchMode,
  searchResults,
  debouncedKeyword,
  conversationsWithDetails,
  displayConversations,
  setLocation,
  formatTime,
  searchQuery,
  conversationsQuery,
}: Props) {
  return (
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
            {t("home:chatHistory")}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("home:searchOrBrowseYourConversations")}
          </SheetDescription>
          {/* 搜索框 */}
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder={t("home:searchConversations")}
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              className="pl-9 pr-8 h-9"
            />
            {searchKeyword && (
              <Button
                variant="plain"
                size="none"
                type="button"
                aria-label={t("home:clearSearch")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSearchKeyword("");
                  setDebouncedKeyword("");
                  searchInputRef.current?.focus();
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-160px)]">
          {searchLoading && isSearchMode && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">
                {t("home:searching")}
              </span>
            </div>
          )}

          {isSearchMode &&
            !searchLoading &&
            (!searchResults || searchResults.length === 0) && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <Search className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  {t("home:searchEmpty", { query: debouncedKeyword })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("home:tryAnotherKeyword")}
                </p>
              </div>
            )}

          {!isSearchMode &&
            (!conversationsWithDetails ||
              conversationsWithDetails.length === 0) && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <MessageCircle className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  {t("home:noConversationsYet")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("home:chooseACompanionToStartChatting")}
                </p>
              </div>
            )}

          {displayConversations && displayConversations.length > 0 && (
            <div>
              {isSearchMode && (
                <div className="px-4 py-2 bg-muted/30 border-b">
                  <p className="text-xs text-muted-foreground">
                    {t("home:searchCount", {
                      count: displayConversations.length,
                    })}
                  </p>
                </div>
              )}
              <div className="divide-y">
                {displayConversations.map(convo => (
                  <Button
                    variant="plain"
                    size="none"
                    type="button"
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
                          {convo.girlfriendName ||
                            convo.title ||
                            t("home:conversation")}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {convo.lastMessageAt
                            ? formatTime(convo.lastMessageAt)
                            : formatTime(convo.updatedAt)}
                        </span>
                      </div>
                      {isSearchMode && convo.matchedMessage ? (
                        <p className="text-xs text-primary/80 truncate mt-0.5">
                          🔍 {convo.matchedMessage}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {convo.lastMessage
                            ? convo.lastMessage === "[自拍照片]"
                              ? t("home:sentAPhoto")
                              : convo.lastMessage
                            : t("home:noMessagesYet")}
                        </p>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}
          {(isSearchMode
            ? searchQuery.hasNextPage
            : conversationsQuery.hasNextPage) && (
            <Button
              variant="outline"
              disabled={
                isSearchMode
                  ? searchQuery.isFetchingNextPage
                  : conversationsQuery.isFetchingNextPage
              }
              onClick={() =>
                void (isSearchMode
                  ? searchQuery.fetchNextPage()
                  : conversationsQuery.fetchNextPage())
              }
            >
              {t("common:loadMore")}
            </Button>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
